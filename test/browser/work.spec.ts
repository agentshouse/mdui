import { expect, test, type Page } from '@playwright/test';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

declare global {
  interface Window {
    workFixture: {
      runtime: MdRuntimeClient;
      adapter: MemoryAdapter;
      stop: () => void;
      unbind: () => void;
    };
    workDurableWrites: boolean;
  }
}

const definition =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\nsections:\n  Body:\n    kind: text\n---\n';
const content = '---\ntype: note\ntitle: Original\n---\n## Body\nOriginal body.\n';
const rooms = ['alpha', 'beta'].map((locator) => ({
  name: locator === 'alpha' ? 'Alpha Notes' : 'Beta Notes',
  locator,
  roomVersion: 'v1',
  writeGrants: ['notes'],
  providerOwnedPaths: [],
  documents: { 'types/note.md': definition, 'notes/existing.md': content },
  revisions: { 'types/note.md': `rev-${locator}-type`, 'notes/existing.md': `rev-${locator}` },
}));

async function start(page: Page, discoveryIntervalMs = 60_000): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ rooms, discoveryIntervalMs }) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestBridge, openTestRuntime, waitForRooms } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (
          runtime: MdRuntimeClient,
          bridge: import('@agentshouse/app-bridge').HouseBridge,
        ) => Promise<() => void>;
      };
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) });
      adapter.script('mutate', { kind: 'transport-uncertainty' });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        discoveryIntervalMs,
      });
      const unbind = await bindApp(opened.runtime, openTestBridge().bridge);
      window.workFixture = {
        runtime: opened.runtime,
        adapter,
        stop: opened.stop,
        unbind,
      };
      await waitForRooms(
        opened.runtime,
        (visible: readonly { roomVersion: string | null }[]) =>
          visible.length === rooms.length &&
          visible.every(({ roomVersion }) => roomVersion !== null),
      );
    },
    { rooms, discoveryIntervalMs },
  );
}

async function openWork(page: Page): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Work', exact: true })
    .click();
}

async function writeTitle(page: Page, room: string, title: string): Promise<void> {
  await page.evaluate(
    async ({ room, title }) => {
      const result = await window.workFixture.runtime.roomDraft.write(
        room,
        'notes/existing.md',
        null,
        { fields: { title: { value: title, base: { value: 'Original' } } } },
      );
      if (result.outcome !== 'written') throw new Error(JSON.stringify(result));
    },
    { room, title },
  );
}

async function saveTitle(page: Page, room: string, title: string): Promise<void> {
  await page.evaluate(
    async ({ room, title }) => {
      const runtime = window.workFixture.runtime;
      const written = await runtime.roomDraft.write(room, 'notes/existing.md', null, {
        fields: { title: { value: title, base: { value: 'Original' } } },
      });
      if (written.outcome !== 'written' || written.roomDraft === null)
        throw new Error(JSON.stringify(written));
      const result = await runtime.save(room, [
        { path: written.roomDraft.path, revision: written.roomDraft.revision },
      ]);
      if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
    },
    { room, title },
  );
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => {
    window.workFixture?.unbind();
    window.workFixture?.stop();
  });
});

test('Work reacts to Room Drafts from every visible Room', async ({ page }) => {
  await start(page);
  await openWork(page);
  await expect(page.getByText('No Drafts.', { exact: true })).toBeVisible();
  await writeTitle(page, 'alpha', 'Alpha draft');
  await writeTitle(page, 'beta', 'Beta draft');
  const drafts = page.getByRole('list', { name: 'Drafts', exact: true });
  await expect(drafts.getByText('alpha notes/existing.md', { exact: true })).toBeVisible();
  await expect(drafts.getByText('beta notes/existing.md', { exact: true })).toBeVisible();
});

test('a durable Save refusal leaves its Room Draft in Work without a queued batch', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.workDurableWrites = false;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function putWithFailure(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (window.workDurableWrites) {
        throw new DOMException(
          'The current transaction exceeded its quota limitations.',
          'QuotaExceededError',
        );
      }
      return key === undefined ? put.call(this, value) : put.call(this, value, key);
    };
  });
  await start(page);
  await page
    .getByRole('article', { name: 'Alpha Notes' })
    .getByRole('button', { name: 'notes/existing.md' })
    .click();
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('Durable words');
  await title.press('Tab');
  await expect
    .poll(() => page.evaluate(() => window.workFixture.runtime.roomDraft.list()))
    .toHaveLength(1);
  await page.evaluate(() => {
    window.workDurableWrites = true;
  });
  await page
    .getByRole('region', { name: 'Document' })
    .getByRole('button', { name: 'Save', exact: true })
    .click();
  await expect(
    page.getByRole('region', { name: 'Fields' }).getByText('durable-write', { exact: true }),
  ).toBeVisible();
  await page.evaluate(() => {
    window.workDurableWrites = false;
  });
  await openWork(page);
  await expect(
    page.getByRole('list', { name: 'Drafts', exact: true }).getByRole('listitem'),
  ).toHaveText(['alpha notes/existing.md']);
  await expect(
    page.getByRole('article', { name: 'Alpha Notes Pending Changes' }),
  ).not.toContainText('Submitted');
});

test('Work keeps a Room Draft after remote Document removal while Discovery still lists the Room', async ({
  page,
}) => {
  await start(page, 25);
  await writeTitle(page, 'alpha', 'Remote removal keeps this draft');
  await openWork(page);
  const inventory = page.getByRole('list', { name: 'Drafts', exact: true }).getByRole('listitem');
  await expect(inventory).toContainText('alpha notes/existing.md');
  await page.evaluate(async (rooms) => {
    const helper = '/src/testing.js';
    const { fixtureRoom } = await import(helper);
    window.workFixture.adapter.setRooms(
      rooms.map((room) =>
        room.locator === 'alpha'
          ? fixtureRoom({
              ...room,
              roomVersion: 'v2',
              documents: { 'types/note.md': room.documents['types/note.md'] },
            })
          : fixtureRoom(room),
      ),
    );
    await window.workFixture.runtime.reauthorize();
  }, rooms);
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const result = await window.workFixture.runtime.query({
          rooms: ['alpha'],
          select: {},
        });
        return result.documents.some((document) => document.path === 'notes/existing.md');
      }),
    )
    .toBe(false);
  await expect(inventory).toContainText('alpha notes/existing.md');
});

test('Work shows a submitted Change Batch after Save consumes its Room Draft', async ({ page }) => {
  await start(page);
  await saveTitle(page, 'alpha', 'Queued title');
  await openWork(page);
  await expect(
    page.getByRole('list', { name: 'Drafts', exact: true }).getByRole('listitem'),
  ).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'Alpha Notes Pending Changes' })).toContainText(
    'Submitted',
  );
  await expect(page.getByRole('article', { name: 'Beta Notes Pending Changes' })).not.toContainText(
    'Submitted',
  );
});

test('Work shows a Provider-returned Room Draft with its reason and fields', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    window.workFixture.adapter.script('mutate', {
      kind: 'conflicted',
      roomVersion: 'v2',
      affected: { 'notes/existing.md': 'Provider version' },
      code: 'title_conflict',
      fields: { detail: 'Provider title changed' },
    });
  });
  await saveTitle(page, 'alpha', 'Returned title');
  await openWork(page);
  const draft = page
    .getByRole('list', { name: 'Drafts', exact: true })
    .getByRole('listitem')
    .filter({ hasText: 'alpha notes/existing.md' });
  await expect(draft).toContainText('Conflicted');
  await expect(draft).toContainText('title_conflict');
  await expect(draft).toContainText('Provider title changed');
});

test('Discard in File removes the Room Draft from Work', async ({ page }) => {
  await start(page);
  await writeTitle(page, 'alpha', 'Disposable');
  await page
    .getByRole('article', { name: 'Alpha Notes' })
    .getByRole('button', { name: 'notes/existing.md' })
    .click();
  await page
    .getByRole('region', { name: 'Document' })
    .getByRole('button', { name: 'Discard', exact: true })
    .click();
  await openWork(page);
  await expect(page.getByText('No Drafts.', { exact: true })).toBeVisible();
});
