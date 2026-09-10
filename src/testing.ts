import { parse, validate } from '@agentshouse/mdmodel';
import { query } from '@agentshouse/query';
import type {
  AttachedModelBinding,
  MdRuntime,
  MdRuntimeOptions,
  MdType,
  ModelResult,
  QueryBinding,
} from '@agentshouse/mdruntime';
import type { MemoryAdapter, MemoryRoom } from '@agentshouse/mdruntime/memory';

type FixtureRoom = {
  name: string;
  locator: string;
  roomVersion: string;
  writeGrants?: readonly string[];
  providerOwnedPaths?: readonly string[];
  documents: Readonly<Record<string, string>>;
  revisions?: Readonly<Record<string, string>>;
  binaryTargets?: readonly string[];
};

export function fixtureModel(
  identity: string,
  definitions: Readonly<Record<string, string>>,
  version = 'model-1',
): ModelResult {
  return { kind: 'model', snapshot: { identity, version, definitions } };
}

export const fixtureBinding: AttachedModelBinding = {
  verify(snapshot) {
    const verdict = validate(snapshot.definitions);
    if (verdict.verdict === 'refuse') return { kind: 'invalid' };
    const types: MdType[] = [];
    for (const [path, content] of Object.entries(snapshot.definitions).sort(([left], [right]) =>
      left.localeCompare(right),
    )) {
      const parsed = parse(content, path);
      if (!parsed.ok) return { kind: 'invalid' };
      types.push({
        name: path.slice(path.lastIndexOf('/') + 1, -3),
        path,
        fields: (parsed.document.fields.fields ?? {}) as MdType['fields'],
        sections: (parsed.document.fields.sections ?? {}) as MdType['sections'],
      });
    }
    return { kind: 'verified', types };
  },
  validate({ model, documents, binaryTargets }) {
    const verdict = validate({ ...documents, ...model.definitions }, { binaryTargets });
    return verdict.verdict === 'accept'
      ? verdict
      : {
          ...verdict,
          source: Object.hasOwn(model.definitions, verdict.file) ? 'model' : 'content',
        };
  },
};

export const fixtureQuery: QueryBinding = (rooms, options) => {
  const definitions = new Set<string>();
  const projected = rooms.map((room) => {
    const documents = { ...room.documents };
    if (room.model.status !== 'unavailable') {
      for (const type of room.model.types) definitions.add(type.path);
    }
    return { ...room, documents };
  });
  return query(projected, {
    ...options,
    selector: { $and: [options.selector ?? {}, { path: { $nin: [...definitions] } }] },
  });
};

export function fixtureRoom(room: FixtureRoom): MemoryRoom {
  const definitions = Object.fromEntries(
    Object.entries(room.documents).filter(
      ([path]) => path.startsWith('types/') && path.endsWith('.md'),
    ),
  );
  const model = Object.keys(definitions).length === 0 ? null : `${room.locator}-models`;
  const write = room.writeGrants ?? [];
  return {
    name: room.name,
    locator: room.locator,
    roomVersion: room.roomVersion,
    collectionRoot: '',
    operations: { read: [''], sync: [''], write, delete: write },
    replica: { selection: 'fixture-selection', admission: 'admitted' },
    attachedModel: model === null ? null : { identity: model, version: 'model-1' },
    providerOwnedPaths: room.providerOwnedPaths ?? [],
    documents: room.documents,
    revisions: room.revisions,
    binaryTargets: room.binaryTargets,
    ...(model === null ? {} : { model: fixtureModel(model, definitions) }),
  };
}

export function runtimeOptions(
  options: Omit<MdRuntimeOptions, 'modelBinding' | 'queryBinding'>,
): MdRuntimeOptions {
  return { ...options, modelBinding: fixtureBinding, queryBinding: fixtureQuery };
}

export async function waitForRooms(
  runtime: MdRuntime,
  matches: (rooms: ReturnType<MdRuntime['rooms']>) => boolean,
): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = runtime.observe('rooms', (rooms) => {
      if (!matches(rooms)) return;
      stop();
      resolve();
    });
  });
}

export function createFixtureRuntime(
  adapter: MemoryAdapter,
  options: Omit<MdRuntimeOptions, 'adapter' | 'modelBinding' | 'queryBinding'>,
): Promise<MdRuntime> {
  return import('@agentshouse/mdruntime').then(({ createMdRuntime }) =>
    createMdRuntime(runtimeOptions({ ...options, adapter })),
  );
}
