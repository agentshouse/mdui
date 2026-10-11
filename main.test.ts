import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createHouseBridgeTestHost } from '@agentshouse/app-bridge/test-host';
import { connectMdRuntime } from '@agentshouse/mdruntime/client';
import { serveMdRuntime } from '@agentshouse/mdruntime/host';
import { createMemoryAdapter, type MemoryRoom } from '@agentshouse/mdruntime/memory';
import { IDBFactory } from 'fake-indexeddb';
import { expect, onTestFinished, test, vi } from 'vitest';

function notes(roomVersion: string, documents: Record<string, string>): MemoryRoom {
  return {
    name: 'Notes',
    locator: 'notes',
    roomVersion,
    operations: { read: [''], sync: [''], write: [], delete: [] },
    replica: { selection: 'notes', admission: 'admitted' },
    providerOwnedPaths: [],
    model: { kind: 'model', snapshot: { identity: 'notes', version: '1', schema: null } },
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

test('the built App lists the bound Room and shows a document written after it opened', async () => {
  execFileSync('npm', ['run', 'build'], { stdio: 'inherit' });
  globalThis.indexedDB = new IDBFactory();
  const written = { 'ideas/first.md': '# First\n', 'todo.md': '# Todo\n' };
  const adapter = createMemoryAdapter({ rooms: [notes('notes-1', written)] });
  const stopped = new AbortController();
  onTestFinished(() => stopped.abort());
  const runtime = serveMdRuntime({
    adapter,
    signal: stopped.signal,
    shell: {
      persistentStorage: true,
      generation: null,
      keepGeneration() {},
      dropGeneration() {},
    },
  });
  const channel = new MessageChannel();
  runtime.attach(channel.port1, 'mdui');
  const house = createHouseBridgeTestHost();
  house.attachRuntime(connectMdRuntime(channel.port2));
  Object.assign(globalThis, { houseBridge: house.port, houseRuntime: house.runtime });
  const entry = new DOMParser().parseFromString(
    readFileSync('dist/index.html', 'utf8'),
    'text/html',
  );
  document.body.innerHTML = entry.body.innerHTML;

  await import(pathToFileURL('dist/main.js').href);

  await vi.waitFor(() => expect(listed()).toEqual(['Notes: ideas/first.md, todo.md']));
  adapter.setRooms([notes('notes-2', { ...written, 'ideas/second.md': '# Second\n' })]);
  adapter.notifyRoomVersion({ locator: 'notes', roomVersion: 'notes-2' });
  await vi.waitFor(() =>
    expect(listed()).toEqual(['Notes: ideas/first.md, ideas/second.md, todo.md']),
  );
});
