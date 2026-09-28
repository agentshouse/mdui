import { expect, test, type Page } from '@playwright/test';
import type { SyncStatus } from '@agentshouse/mdruntime';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

type StatusElement = HTMLElement & { bind: (runtime: MdRuntimeClient) => void };

declare global {
  interface Window {
    statusFixture: {
      runtime: MdRuntimeClient;
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
    const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
    const helper = '/src/testing.js';
    const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
    const adapter = createMemoryAdapter({ rooms: [fixtureRoom(room)] });
    const opened = await openTestRuntime(adapter, {
      requiredGuarantees: [],
      discoveryIntervalMs: 250,
    });
    const seen: SyncStatus[] = [];
    const status = await opened.runtime.observe('sync-status');
    seen.push(structuredClone(status.current()));
    status.subscribe((value: SyncStatus) => seen.push(structuredClone(value)));
    window.statusFixture = {
      runtime: opened.runtime,
      adapter,
      seen,
      note: room.documents['notes/one.md'],
      stop: opened.stop,
    };
    const indicator = document.createElement('md-sync-status') as StatusElement;
    indicator.bind(opened.runtime);
    document.body.replaceChildren(indicator);
    await waitForRooms(opened.runtime, (visible: readonly { roomVersion: string | null }[]) =>
      visible.some((entry) => entry.roomVersion !== null),
    );
  }, writable);
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.statusFixture?.stop());
});

async function saveTitle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const runtime = window.statusFixture.runtime;
    const written = await runtime.roomDraft.write('studio', 'notes/one.md', null, {
      fields: { title: { value: 'Next', base: { value: 'One' } } },
    });
    if (written.outcome !== 'written' || written.roomDraft === null)
      throw new Error(JSON.stringify(written));
    const result = await runtime.save('studio', [
      { path: written.roomDraft.path, revision: written.roomDraft.revision },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
}

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
  });
  await saveTitle(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Pending');
  expect(
    await page.evaluate(async () => (await window.statusFixture.runtime.syncStatus()).state),
  ).toBe('pending');
});

test('shows attention from Observe when a head Change Batch is Conflicted', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', {
      kind: 'conflicted',
      roomVersion: 'v2',
      affected: { 'notes/one.md': window.statusFixture.note },
      code: 'title_conflict',
      fields: { detail: 'title was changed on the Provider' },
    });
  });
  await saveTitle(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Conflicted');
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('title_conflict');
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText(
    'title was changed on the Provider',
  );
  expect(
    await page.evaluate(
      async () => (await window.statusFixture.runtime.syncStatus()).attentionRequired,
    ),
  ).toMatchObject([
    {
      room: 'studio',
      path: 'notes/one.md',
      returned: {
        kind: 'conflicted',
        code: 'title_conflict',
        fields: { detail: 'title was changed on the Provider' },
      },
    },
  ]);
});

test('shows Expired on an attention-required entry with no ProviderRefusal', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', { kind: 'expired' });
  });
  await saveTitle(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Expired');
  expect(
    await page.evaluate(
      async () => (await window.statusFixture.runtime.syncStatus()).attentionRequired,
    ),
  ).toMatchObject([
    {
      room: 'studio',
      path: 'notes/one.md',
      returned: { kind: 'expired' },
    },
  ]);
});

test('shows Pending with the Provider reset for a retryable refusal', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', {
      kind: 'retryable-refusal',
      code: 'rate_limited',
      fields: { retry_at: '2099-01-01T00:00:00.000Z' },
      reset: '2099-01-01T00:00:00.000Z',
    });
  });
  await saveTitle(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Pending');
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText(
    '2099-01-01T00:00:00.000Z',
  );
});

test('keeps changes Pending while the Provider is unreachable', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.evaluate(async () => {
    window.statusFixture.adapter.script('mutate', { kind: 'transport-uncertainty' });
    window.statusFixture.adapter.script('discover', { kind: 'transport-uncertainty' });
    window.statusFixture.adapter.script('refresh', { kind: 'transport-uncertainty' });
  });
  await saveTitle(page);
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
