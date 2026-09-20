import { expect, test } from '@playwright/test';

declare global {
  interface Window {
    houseBridge?: Promise<unknown>;
  }
}

test('loads the App source and reads Types and Query through the remote client', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const entry = page.waitForResponse(
    (response) => new URL(response.url()).pathname === '/src/index.js',
  );
  await page.goto('/');
  expect((await entry).status()).toBe(200);
  await expect(page).toHaveTitle('MD UI');

  const visible = await page.evaluate(async () => {
    const { createHouseBridgeTestHost } = await import('@agentshouse/app-bridge/test-host');
    const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
    const { serveMdRuntime } = await import('@agentshouse/mdruntime/host');
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const helper = '/src/testing.js';
    const { fixtureRoom, fixtureShell, runtimeOptions, waitForRooms } = await import(helper);
    const entry = '/src/index.js';
    const { connectApp } = (await import(entry)) as {
      connectApp: () => Promise<() => void>;
    };
    const controller = new AbortController();
    try {
      const house = createHouseBridgeTestHost();
      window.houseBridge = house.port;
      const adapter = createMemoryAdapter({
        rooms: [
          fixtureRoom({
            name: 'Fixture',
            locator: 'fixture',
            roomVersion: 'v1',
            writeGrants: [],
            providerOwnedPaths: [],
            documents: {
              'types/note.md':
                '---\ntype: definition\nfields:\n  title:\n    kind: string\nsections:\n  Body:\n    kind: text\n---\n',
              'notes/hello.md':
                '---\ntype: note\ntitle: Hello\n---\n## Body\nPublished packages.\n',
            },
          }),
        ],
      });
      const host = serveMdRuntime(
        runtimeOptions({
          adapter,
          requiredGuarantees: [],
          signal: controller.signal,
          shell: fixtureShell(),
        }),
      );
      const appChannel = new MessageChannel();
      const probeChannel = new MessageChannel();
      host.attach(appChannel.port1, 'mdui');
      host.attach(probeChannel.port1, 'mdui');
      house.attachRuntime(appChannel.port2);
      await connectApp();
      const runtime = connectMdRuntime(probeChannel.port2);
      await waitForRooms(runtime, (rooms: readonly { roomVersion: string | null }[]) =>
        rooms.some((room) => room.roomVersion === 'v1'),
      );
      const types = await runtime.types('fixture');
      return {
        types: types.collection.status === 'unavailable' ? [] : types.collection.types,
        query: await runtime.query({ selector: { room: 'fixture', type: 'note' } }),
      };
    } finally {
      controller.abort();
    }
  });
  expect(visible.types).toEqual([
    {
      name: 'note',
      path: 'types/note.md',
      fields: { title: { kind: 'string' } },
      sections: { Body: { kind: 'text' } },
    },
  ]);
  expect(visible.query.documents).toEqual([
    {
      room: 'fixture',
      path: 'notes/hello.md',
      type: 'note',
      content: '---\ntype: note\ntitle: Hello\n---\n## Body\nPublished packages.\n',
      fields: { type: 'note', title: 'Hello' },
      sections: { Body: 'Published packages.\n' },
      preamble: '',
      backlinks: [],
    },
  ]);
  expect(visible.query.roomVersions).toEqual({ fixture: 'v1' });
  expect(errors).toEqual([]);
});
