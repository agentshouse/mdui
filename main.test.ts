import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { houseBridge, type HouseStatus } from '@agentshouse/app-bridge';
import { createHouseBridgeTestHost } from '@agentshouse/app-bridge/test-host';
import { connectMdRuntime } from '@agentshouse/mdruntime/client';
import { serveMdRuntime } from '@agentshouse/mdruntime/host';
import { createMemoryAdapter, type MemoryRoom } from '@agentshouse/mdruntime/memory';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, expect, onTestFinished, test, vi } from 'vitest';

function room(
  locator: string,
  name: string,
  roomVersion: string,
  documents: Record<string, string>,
): MemoryRoom {
  return {
    name,
    locator,
    handle: locator,
    roomVersion,
    operations: { read: [''], sync: [''], write: [], delete: [] },
    replica: { selection: locator, admission: 'admitted' },
    providerOwnedPaths: [],
    model: {
      kind: 'model',
      snapshot: { identity: locator, version: '1', schema: null, revision: null },
    },
    documents,
  };
}

function listed(): string[] {
  return [...document.querySelectorAll('section')].map(
    (section) =>
      `${section.querySelector('h1')?.textContent}: ${[...section.querySelectorAll('li')]
        .map((item) => item.textContent)
        .join(', ')}`,
  );
}

const preferences = '.settings/apps/mdui.md';

function rooms(notesVersion: string, notes: Record<string, string>): MemoryRoom[] {
  return [
    room('notes', 'Notes', notesVersion, notes),
    room('private', 'Private', 'private-1', {
      [preferences]: '# Preferences\n',
      'diary.md': '# Diary\n',
    }),
  ];
}

beforeAll(() => {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
});

function alerted(): string | undefined {
  return document.querySelector('main [role="alert"]')?.textContent ?? undefined;
}

function offered(): string[] {
  return [...document.querySelectorAll('main > button')].map((button) => button.textContent ?? '');
}

function reloads(): ReturnType<typeof vi.fn> {
  const reload = vi.spyOn(location, 'reload').mockImplementation(() => {});
  onTestFinished(() => reload.mockRestore());
  return reload;
}

function served(
  adapter: ReturnType<typeof createMemoryAdapter>,
  store: IDBFactory = new IDBFactory(),
): ReturnType<typeof serveMdRuntime> {
  globalThis.indexedDB = store;
  const stopped = new AbortController();
  onTestFinished(() => stopped.abort());
  return serveMdRuntime({
    adapter,
    signal: stopped.signal,
    shell: {
      persistence: 'granted',
      generation: null,
      keepGeneration() {},
      dropGeneration() {},
    },
  });
}

function status(credential: HouseStatus['credential']['state']): HouseStatus {
  return {
    app: 'a_52.r',
    preferences: null,
    runtime: 'runtime-1',
    credential: { state: credential, expiresAt: null },
    sync: null,
    refusal: null,
    loss: null,
    database: null,
    analytics: { measures: false, choice: null },
    serviceMode: 'open',
    offline: false,
  };
}

async function opened(
  runtime: ReturnType<typeof serveMdRuntime>,
  bound: string[] = ['notes'],
  shown: HouseStatus = status('held'),
): Promise<ReturnType<typeof createHouseBridgeTestHost>> {
  const channel = new MessageChannel();
  runtime.attach(channel.port1, 'mdui', undefined, {
    rooms: bound,
    documents: [{ room: 'private', path: preferences }],
    conversations: false,
  });
  const house = createHouseBridgeTestHost({ status: shown });
  house.attachRuntime(connectMdRuntime(channel.port2));
  const entry = new DOMParser().parseFromString(
    readFileSync('dist/index.html', 'utf8'),
    'text/html',
  );
  document.body.innerHTML = entry.body.innerHTML;
  vi.resetModules();
  await import(pathToFileURL('dist/main.js').href);
  return house;
}

test('the built App lists the bound Room alone and shows a document written after it opened', async () => {
  const written = { 'ideas/first.md': '# First\n', 'todo.md': '# Todo\n' };
  const adapter = createMemoryAdapter({ rooms: rooms('notes-1', written) });
  await opened(served(adapter));

  await vi.waitFor(() => expect(listed()).toEqual(['Notes: ideas/first.md, todo.md']));
  adapter.setRooms(rooms('notes-2', { ...written, 'ideas/second.md': '# Second\n' }));
  adapter.notifyRoomVersion({ locator: 'notes', roomVersion: 'notes-2' });
  await vi.waitFor(() =>
    expect(listed()).toEqual(['Notes: ideas/first.md, ideas/second.md, todo.md']),
  );
});

test.each([{ retryable: true }, { retryable: false }])(
  'a refused connection shows the refusal in place of the list, offers no Try again the runtime would not attempt, House retryable or not ($retryable)',
  async ({ retryable }) => {
    const adapter = createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) });
    adapter.script('discover', {
      kind: 'contract-unavailable',
      code: 'future-contract-refusal',
      fields: { contract: 'future' },
      retryable,
    });
    await opened(served(adapter));

    await vi.waitFor(() =>
      expect(alerted()).toBe(
        'House refused the connection (missing-required-guarantee: future-contract-refusal).',
      ),
    );
    expect(listed()).toEqual([]);
    expect(offered()).toEqual([]);
  },
);

test('a refusal that arrives while the list shows replaces the list', async () => {
  const adapter = createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) });
  await opened(served(adapter));
  await vi.waitFor(() => expect(listed()).toEqual(['Notes: todo.md']));

  adapter.script('discover', {
    kind: 'contract-unavailable',
    code: 'future-contract-refusal',
    fields: {},
    retryable: true,
  });
  adapter.close();
  adapter.open();

  await vi.waitFor(() =>
    expect(alerted()).toBe(
      'House refused the connection (missing-required-guarantee: future-contract-refusal).',
    ),
  );
  expect(listed()).toEqual([]);
});

test.each([
  {
    store: 'a store the browser denies',
    open() {
      throw new DOMException('The user denied storage', 'SecurityError');
    },
    code: 'runtime-failure',
    offers: [],
  },
  {
    store: 'a store failing with a code mdui does not know',
    open() {
      throw Object.assign(new Error('the store is busy'), {
        code: 'future-store-failure',
        retryable: true,
      });
    },
    code: 'future-store-failure',
    offers: ['Try again'],
  },
])(
  'a runtime that fails to start over $store shows the failure, offers Try again only when it may pass',
  async ({ open, code, offers }) => {
    const reload = reloads();
    await opened(
      served(createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) }), {
        open,
      } as unknown as IDBFactory),
    );

    await vi.waitFor(() => expect(alerted()).toBe(`mdui could not start (${code}).`));
    expect(listed()).toEqual([]);
    expect(offered()).toEqual(offers);

    document.querySelector<HTMLButtonElement>('main > button')?.click();
    expect(reload).toHaveBeenCalledTimes(offers.length);
  },
);

test('Try again after a start-up failure that may pass opens the App again over the same runtime, which lists the Room', async () => {
  const kept = new IDBFactory();
  let busy = true;
  const store = new Proxy(kept, {
    get(target, key) {
      if (key === 'open' && busy) {
        return () => {
          throw Object.assign(new Error('the store is busy'), {
            code: 'future-store-failure',
            retryable: true,
          });
        };
      }
      const held = Reflect.get(target, key);
      return typeof held === 'function' ? held.bind(target) : held;
    },
  });
  const reload = reloads();
  const adapter = createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) });
  const runtime = served(adapter, store);
  await opened(runtime);
  await vi.waitFor(() => expect(alerted()).toBe('mdui could not start (future-store-failure).'));

  busy = false;
  adapter.open();
  document.querySelector<HTMLButtonElement>('main > button')?.click();
  expect(reload).toHaveBeenCalledOnce();
  await opened(runtime);
  await vi.waitFor(() => expect(listed()).toEqual(['Notes: todo.md']));
});

test('an App whose slot binds no Room says so and opens the choice of its Rooms at that slot', async () => {
  const unbound = await opened(
    served(createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) })),
    [],
  );

  await vi.waitFor(() => expect(offered()).toEqual(['Choose Rooms']));
  expect(document.querySelector('main > p')?.textContent).toBe('No Room is chosen yet.');
  expect(listed()).toEqual([]);

  document.querySelector<HTMLButtonElement>('main > button')?.click();
  expect(unbound.ceremonies).toEqual(['/bind/a_52.r?slot=room']);
});

test('a page whose slot binds no Room offers no choice of Rooms without a signed-in User, as at a Site', async () => {
  const visited = await opened(
    served(createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) })),
    [],
    status('none'),
  );

  await vi.waitFor(() =>
    expect(document.querySelector('main > p')?.textContent).toBe('No Room is chosen yet.'),
  );
  expect(offered()).toEqual([]);

  visited.publish(status('held'));
  await vi.waitFor(() => expect(offered()).toEqual(['Choose Rooms']));
});

test("a refused choice of Rooms shows House's code in its place", async () => {
  await opened(
    served(createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) })),
    [],
  );
  await vi.waitFor(() => expect(offered()).toEqual(['Choose Rooms']));
  const ceremony = vi
    .spyOn(houseBridge(), 'ceremony')
    .mockRejectedValue(Object.assign(new Error('refused'), { code: 'house_ceremony_refused' }));
  onTestFinished(() => ceremony.mockRestore());

  document.querySelector<HTMLButtonElement>('main > button')?.click();
  await vi.waitFor(() =>
    expect(alerted()).toBe('House did not open the choice of Rooms (house_ceremony_refused).'),
  );
  expect(offered()).toEqual([]);
});
