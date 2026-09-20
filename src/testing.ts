import { connectHouseBridge, type HouseBridge } from '@agentshouse/app-bridge';
import {
  createHouseBridgeTestHost,
  type HouseBridgeTestHost,
} from '@agentshouse/app-bridge/test-host';
import { parse, validate } from '@agentshouse/mdmodel';
import { query } from '@agentshouse/query';
import type {
  AttachedModelBinding,
  MdRuntimeOptions,
  MdType,
  ModelResult,
  QueryBinding,
  RuntimeShell,
} from '@agentshouse/mdruntime';
import {
  connectMdRuntime,
  type MdRuntimeClient,
  type RuntimePort,
} from '@agentshouse/mdruntime/client';
import { serveMdRuntime, type MdRuntimeHost } from '@agentshouse/mdruntime/host';
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

export function fixtureShell(reported: { persistentStorage?: boolean } = {}): RuntimeShell & {
  generation: string | null;
} {
  const kept = {
    persistentStorage: reported.persistentStorage ?? true,
    generation: null as string | null,
    keepGeneration(value: string) {
      kept.generation = value;
    },
    dropGeneration() {
      kept.generation = null;
    },
  };
  return kept;
}

export function runtimeOptions(
  options: Omit<MdRuntimeOptions, 'modelBinding' | 'queryBinding'>,
): MdRuntimeOptions {
  return { ...options, modelBinding: fixtureBinding, queryBinding: fixtureQuery };
}

export function openTestBridge(address = '/'): {
  host: HouseBridgeTestHost;
  bridge: HouseBridge;
} {
  const host = createHouseBridgeTestHost({ address });
  return { host, bridge: connectHouseBridge(host.port) };
}

export async function waitForRooms(
  runtime: MdRuntimeClient,
  matches: (rooms: Awaited<ReturnType<MdRuntimeClient['rooms']>>) => boolean,
): Promise<void> {
  let stop: (() => void) | undefined;
  let done = false;
  await new Promise<void>((resolve, reject) => {
    void runtime
      .observe('rooms', (rooms) => {
        if (done || !matches(rooms)) return;
        done = true;
        stop?.();
        resolve();
      })
      .then((end) => {
        stop = end;
        if (done) end();
      }, reject);
  });
}

function trackedPort(port: MessagePort): { port: RuntimePort; live: () => number } {
  let live = 0;
  return {
    port: {
      postMessage(message: unknown) {
        const body = (message as { message?: { kind?: string } }).message;
        if (body?.kind === 'observe') live += 1;
        if (body?.kind === 'stop') live -= 1;
        port.postMessage(message);
      },
      addEventListener(type: 'message' | 'close', listener: (event: { data?: unknown }) => void) {
        port.addEventListener(type, listener as EventListener);
      },
      start() {
        port.start();
      },
    },
    live: () => live,
  };
}

export async function openTestRuntime(
  adapter: MemoryAdapter,
  options: Partial<
    Omit<MdRuntimeOptions, 'adapter' | 'modelBinding' | 'queryBinding' | 'shell'>
  > & {
    shell?: RuntimeShell;
    app?: string;
  } = {},
): Promise<{
  runtime: MdRuntimeClient;
  host: MdRuntimeHost;
  stop: () => void;
  liveObservations: () => number;
  shell: RuntimeShell;
}> {
  const owned = options.signal === undefined ? new AbortController() : undefined;
  const shell = options.shell ?? fixtureShell();
  const host = serveMdRuntime(
    runtimeOptions({
      adapter,
      requiredGuarantees: options.requiredGuarantees ?? [],
      discoveryIntervalMs: options.discoveryIntervalMs,
      signal: options.signal ?? owned!.signal,
      shell,
    }),
  );
  const channel = new MessageChannel();
  const tracked = trackedPort(channel.port2);
  const detach = host.attach(channel.port1, options.app ?? 'mdui');
  return {
    runtime: connectMdRuntime(tracked.port),
    host,
    liveObservations: tracked.live,
    shell,
    stop() {
      detach();
      channel.port1.close();
      channel.port2.close();
      owned?.abort();
    },
  };
}
