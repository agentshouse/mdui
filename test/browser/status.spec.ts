import { expect, test, type Page } from '@playwright/test';
import type { MdRuntime, SyncStatus } from '@agentshouse/mdruntime';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

type StatusElement = HTMLElement & { bind: (runtime: MdRuntime) => void };

declare global {
  interface Window {
    statusFixture: {
      runtime: MdRuntime;
      adapter: MemoryAdapter;
      seen: SyncStatus[];
      note: string;
      stop: () => void;
    };
  }
}

const noteType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\nsections:\n  Body:\n    kind: text\n---\n';
const note = '---\ntype: note\ntitle: One\n---\n## Body\nHello.\n';

const writable = {
  name: 'Studio',
  locator: 'studio',
  roomVersion: 'v1',
  writeGrants: ['notes'],
  providerOwnedPaths: [],
  documents: {
    'types/note.md': noteType,
    'notes/one.md': note,
  },
};

async function start(page: Page) {
  await page.goto('/');
  await page.evaluate(async (room) => {
    const { createMdRuntime } = await import('@agentshouse/mdruntime');
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const helper = '/src/testing.js';
    const { fixtureRoom, runtimeOptions, waitForRooms } = await import(helper);
    const controller = new AbortController();
    const adapter = createMemoryAdapter({ rooms: [fixtureRoom(room)] });
    const runtime = createMdRuntime(
      runtimeOptions({
        adapter,
        requiredGuarantees: [],
        signal: controller.signal,
        discoveryIntervalMs: 250,
      }),
    );
    const seen: SyncStatus[] = [];
    runtime.observe('sync-status', (status) => seen.push(structuredClone(status)));
    window.statusFixture = {
      runtime,
      adapter,
      seen,
      note: room.documents['notes/one.md'],
      stop: () => controller.abort(),
    };
    const indicator = document.createElement('md-sync-status') as StatusElement;
    indicator.bind(runtime);
    document.body.replaceChildren(indicator);
    await waitForRooms(runtime, (visible: ReturnType<typeof runtime.rooms>) =>
      visible.some((entry) => entry.roomVersion !== null),
    );
  }, writable);
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.statusFixture?.stop());
});

test('shows Syncing then Synced with the last completed time from Observe', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  const status = await page.evaluate(() => window.statusFixture.runtime.syncStatus());
  expect(status.state).toBe('synced');
  expect(status.lastCompleted).not.toBeNull();
  await expect(page.locator('time')).toHaveAttribute('datetime', status.lastCompleted!);
  const seen = await page.evaluate(() => window.statusFixture.seen.map((entry) => entry.state));
  expect(seen[0]).toBe('syncing');
  expect(seen.at(-1)).toBe('synced');
});

test('shows Pending from Observe after a local Save', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', { kind: 'transport-uncertainty' });
    const result = await window.statusFixture.runtime.save('studio', [
      { kind: 'field', path: 'notes/one.md', name: 'title', value: 'Next' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Pending');
  expect(await page.evaluate(() => window.statusFixture.runtime.syncStatus().state)).toBe(
    'pending',
  );
});

test('shows attention from Observe when a head Change Batch is Conflicted', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', {
      kind: 'conflicted',
      roomVersion: 'v2',
      affected: { 'notes/one.md': window.statusFixture.note },
      text: 'title was changed on the Provider',
    });
    const result = await window.statusFixture.runtime.save('studio', [
      { kind: 'field', path: 'notes/one.md', name: 'title', value: 'Next' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText(
    'Attention required',
  );
  expect(
    await page.evaluate(() => window.statusFixture.runtime.syncStatus().attentionRequired),
  ).toBe(true);
});

test('keeps changes Pending while the Provider is unreachable', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', { kind: 'transport-uncertainty' });
    const result = await window.statusFixture.runtime.save('studio', [
      { kind: 'field', path: 'notes/one.md', name: 'title', value: 'Next' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
    window.statusFixture.adapter.script('discover', { kind: 'transport-uncertainty' });
    window.statusFixture.adapter.script('refresh', { kind: 'transport-uncertainty' });
  });
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Pending');
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText(
    'Changes remain Pending',
  );
});

test('is labelled, themed through CSS custom properties, and lays out at 360 pixels', async ({
  page,
}, testInfo) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.setViewportSize({ width: 360, height: 900 });
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(
      await page
        .locator('md-sync-status')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 24, 32)');
    await page.screenshot({
      path: testInfo.outputPath(`sync-status-360-${theme}.png`),
      fullPage: true,
    });
  }
  await page.evaluate(() => document.body.style.setProperty('--md-background', '#eef2ff'));
  expect(
    await page
      .locator('md-sync-status')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(238, 242, 255)');
});
