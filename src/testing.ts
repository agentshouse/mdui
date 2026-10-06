import {
  connectHouseBridge,
  type HouseBridge,
  type HouseBridgeEvent,
  type HouseMessagePort,
} from '@agentshouse/app-bridge';
import {
  createHouseBridgeTestHost,
  type HouseBridgeNavigation,
  type HouseBridgeTestHost,
} from '@agentshouse/app-bridge/test-host';
import type { MdRuntimeOptions, ModelResult, RuntimeShell } from '@agentshouse/mdruntime';
import {
  connectMdRuntime,
  type MdRuntimeClient,
  type Observation,
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

export function fixtureRoom(room: FixtureRoom): MemoryRoom {
  const definitions = Object.fromEntries(
    Object.entries(room.documents).filter(
      ([path]) => path.startsWith('types/') && path.endsWith('.md'),
    ),
  );
  const documents = Object.fromEntries(
    Object.entries(room.documents).filter(([path]) => !Object.hasOwn(definitions, path)),
  );
  const revisions =
    room.revisions === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(room.revisions).filter(([path]) => !Object.hasOwn(definitions, path)),
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
    documents,
    revisions,
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

export type TestBridgeHost = Pick<HouseBridgeTestHost, 'port' | 'navigations' | 'address' | 'open'>;

export function openTestBridge(
  address = '/',
  options: { verbatim?: boolean } = {},
): {
  host: TestBridgeHost;
  bridge: HouseBridge;
} {
  if (options.verbatim !== true) {
    const host = createHouseBridgeTestHost({ address });
    return { host, bridge: connectHouseBridge(host.port) };
  }
  return createCore2076DeliveryHost(address);
}

function createCore2076DeliveryHost(address: string): {
  host: TestBridgeHost;
  bridge: HouseBridge;
} {
  const navigations: HouseBridgeNavigation[] = [];
  const listeners = new Set<(event: HouseBridgeEvent) => void>();
  const queued: HouseBridgeEvent[] = [];
  let started = false;
  let current = address;
  function deliver(data: unknown): void {
    const event = { data, ports: [] as const };
    if (!started) {
      queued.push(event);
      return;
    }
    queueMicrotask(() => {
      for (const listener of listeners) listener(event);
    });
  }
  function arrive(target: string, navigated: boolean): void {
    current = target;
    deliver({ house: 'address', address: current, navigated });
  }
  const port: HouseMessagePort = {
    postMessage(message) {
      const data = message as { house?: unknown; mode?: unknown; address?: unknown } | null;
      if (data === null || typeof data !== 'object' || data.house !== 'navigate') return;
      if (typeof data.address !== 'string') return;
      navigations.push({
        mode: data.mode === 'replace' ? 'replace' : 'push',
        address: data.address,
      });
      arrive(data.address, true);
    },
    addEventListener(_type, listener) {
      listeners.add(listener);
    },
    start() {
      started = true;
      const held = queued.splice(0);
      queueMicrotask(() => {
        for (const event of held) {
          for (const listener of listeners) listener(event);
        }
      });
    },
  };
  deliver({ house: 'address', address: current, navigated: false });
  const host: TestBridgeHost = {
    port: Promise.resolve(port),
    navigations,
    address() {
      return current;
    },
    open(asked) {
      arrive(asked, false);
    },
  };
  return { host, bridge: connectHouseBridge(host.port) };
}

export async function waitForRooms(
  runtime: MdRuntimeClient,
  matches: (rooms: Awaited<ReturnType<MdRuntimeClient['rooms']>>) => boolean,
): Promise<void> {
  const handle = await runtime.observe('rooms');
  if (matches(handle.current())) {
    handle.close();
    return;
  }
  await new Promise<void>((resolve) => {
    const unsubscribe = handle.subscribe((rooms) => {
      if (!matches(rooms)) return;
      unsubscribe();
      handle.close();
      resolve();
    });
  });
}

function trackedRuntime(runtime: MdRuntimeClient): {
  runtime: MdRuntimeClient;
  live: () => number;
} {
  let live = 0;
  const observe = (...input: unknown[]) => {
    live += 1;
    return (runtime.observe as (...input: unknown[]) => Promise<Observation<unknown>>)(
      ...input,
    ).then(
      (observation) => {
        let open = true;
        return {
          ...observation,
          close() {
            if (open) live -= 1;
            open = false;
            observation.close();
          },
        };
      },
      (error: unknown) => {
        live -= 1;
        throw error;
      },
    );
  };
  return {
    runtime: { ...runtime, observe: observe as MdRuntimeClient['observe'] },
    live: () => live,
  };
}

export async function openTestRuntime(
  adapter: MemoryAdapter,
  options: Partial<Omit<MdRuntimeOptions, 'adapter' | 'shell'>> & {
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
  const host = serveMdRuntime({
    adapter,
    requiredGuarantees: options.requiredGuarantees ?? [],
    discoveryIntervalMs: options.discoveryIntervalMs,
    signal: options.signal ?? owned!.signal,
    shell,
  });
  const channel = new MessageChannel();
  const detach = host.attach(channel.port1, options.app ?? 'mdui');
  const tracked = trackedRuntime(connectMdRuntime(channel.port2));
  return {
    runtime: tracked.runtime,
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
