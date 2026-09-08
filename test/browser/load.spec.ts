import { expect, test } from '@playwright/test';

test('loads the App source and connects the published MD Runtime through its in-memory Adapter', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const entry = page.waitForResponse((response) => new URL(response.url()).pathname === '/src/index.js');
  await page.goto('/');
  expect((await entry).status()).toBe(200);
  await expect(page).toHaveTitle('MD UI');

  const rooms = await page.evaluate(async () => {
    const { createMdRuntime } = await import('@agentshouse/mdruntime');
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const mdModel = { identity: 'fixture', version: '1.0.0' };
    const controller = new AbortController();
    try {
      const runtime = createMdRuntime({
        adapter: createMemoryAdapter({
          mdModel,
          rooms: [{
            name: 'Fixture',
            locator: 'fixture',
            roomVersion: 'v1',
            writeGrants: [],
            providerOwnedPaths: [],
          }],
        }),
        mdModel,
        requiredGuarantees: [],
        signal: controller.signal,
      });
      return await new Promise<string[]>((resolve) => {
        runtime.observe('rooms', (visible) => {
          if (visible.length > 0) resolve(visible.map((room) => room.name));
        });
      });
    } finally {
      controller.abort();
    }
  });
  expect(rooms).toEqual(['Fixture']);
  expect(errors).toEqual([]);
});
