import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
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

function selected(): string[] {
  return [...document.querySelectorAll('li [aria-current="true"]')].map(
    (button) => button.textContent ?? '',
  );
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

function served(
  adapter: ReturnType<typeof createMemoryAdapter>,
): ReturnType<typeof serveMdRuntime> {
  globalThis.indexedDB = new IDBFactory();
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

async function opened(
  runtime: ReturnType<typeof serveMdRuntime>,
): Promise<ReturnType<typeof createHouseBridgeTestHost>> {
  const channel = new MessageChannel();
  runtime.attach(channel.port1, 'mdui', undefined, {
    rooms: ['notes'],
    documents: [{ room: 'private', path: preferences }],
    conversations: false,
  });
  const house = createHouseBridgeTestHost();
  house.attachRuntime(connectMdRuntime(channel.port2));
  const entry = new DOMParser().parseFromString(
    readFileSync('dist/index.html', 'utf8'),
    'text/html',
  );
  document.body.innerHTML = entry.body.innerHTML;
  window.scrollTo({ top: 0 });
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

test('a newer release opens on the document the User selected, with the list scrolled where they left it', async () => {
  const notes = Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [
      `notes/${String(index).padStart(2, '0')}.md`,
      '# Note\n',
    ]),
  );
  const runtime = served(createMemoryAdapter({ rooms: rooms('notes-1', notes) }));
  const running = await opened(runtime);
  await vi.waitFor(() => expect(document.querySelectorAll('li button')).toHaveLength(40));
  const chosen = [...document.querySelectorAll('li button')].find(
    (button) => button.textContent === 'notes/31.md',
  ) as HTMLButtonElement;
  chosen.click();
  expect(selected()).toEqual(['notes/31.md']);
  window.scrollTo({ top: 640 });

  const task = await running.checkpoint();
  const newer = await opened(runtime);
  expect(selected()).toEqual([]);
  expect(window.scrollY).toBe(0);

  expect(await newer.restore(task)).toBe(true);
  expect(selected()).toEqual(['notes/31.md']);
  expect(window.scrollY).toBe(640);
  newer.settle('committed');
});

test('a release opened without a task starts at the top with nothing selected and declines a task it did not capture', async () => {
  const runtime = served(
    createMemoryAdapter({ rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }) }),
  );

  const fresh = await opened(runtime);
  expect(await fresh.restore(null)).toBe(true);
  expect(listed()).toEqual(['Notes: todo.md']);
  expect(selected()).toEqual([]);
  expect(window.scrollY).toBe(0);

  const foreign = await opened(runtime);
  await expect(foreign.restore({ open: 'todo.md' })).rejects.toThrow();
});

test('a checkpoint asked while a task is still being restored answers the restored task', async () => {
  const adapter = createMemoryAdapter({
    rooms: rooms('notes-1', { 'todo.md': '# Todo\n' }),
    unopened: true,
  });
  const reopened = await opened(served(adapter));
  const task = { selected: { room: 'notes', path: 'todo.md' }, top: 120 };

  const restoring = reopened.restore(task);
  const checkpointed = reopened.checkpoint();
  expect(listed()).toEqual([]);
  adapter.open();

  expect(await restoring).toBe(true);
  expect(await checkpointed).toEqual(task);
});
