import { expect, test } from '@playwright/test';

test('loads the App source and reads Types and Query through the published in-memory Adapter', async ({
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
    const { createMdRuntime } = await import('@agentshouse/mdruntime');
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const controller = new AbortController();
    try {
      const runtime = createMdRuntime({
        adapter: createMemoryAdapter({
          rooms: [
            {
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
            },
          ],
        }),
        requiredGuarantees: [],
        signal: controller.signal,
      });
      await new Promise<void>((resolve) => {
        runtime.observe('rooms', (visible) => {
          if (visible.some((room) => room.roomVersion === 'v1')) resolve();
        });
      });
      return {
        types: runtime.types('fixture'),
        query: runtime.query({ selector: { room: 'fixture', type: 'note' } }),
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
