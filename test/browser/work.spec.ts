import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { DraftEntry, QueueEntry } from '@agentshouse/mdruntime';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MdRuntimeHost } from '@agentshouse/mdruntime/host';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

declare global {
  interface Window {
    workFixture: {
      runtime: MdRuntimeClient;
      host?: MdRuntimeHost;
      adapter?: MemoryAdapter;
      drafts: readonly DraftEntry[];
      queues: Record<string, readonly QueueEntry[]>;
      roomNotifications: number;
      stop: () => void;
    };
    workOther?: Window | null;
    workRuntimePort?: Promise<MessagePort>;
    workFaults: { read: boolean; write: boolean; operations: string[] };
  }
}

const definition =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\nsections:\n  Body:\n    kind: text\n---\n';
const content = '---\ntype: note\ntitle: Original\n---\n## Body\nOriginal body.\n';
const rooms = ['alpha', 'beta'].map((locator) => ({
  name: 'Notes',
  locator,
  roomVersion: 'v1',
  writeGrants: ['notes'],
  providerOwnedPaths: [],
  documents: { 'types/note.md': definition, 'notes/existing.md': content },
}));

async function mount(
  page: Page,
  options: { pending?: boolean; discoveryIntervalMs?: number } = {},
): Promise<void> {
  await page.evaluate(
    async ({ rooms, options }) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (runtime: MdRuntimeClient) => Promise<() => void>;
      };
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) });
      if (options.pending) adapter.script('mutate', { kind: 'transport-uncertainty' });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        discoveryIntervalMs: options.discoveryIntervalMs ?? 60_000,
      });
      const runtime = opened.runtime;
      const unbind = await bindApp(runtime);
      const stops: Array<() => void> = [];
      window.workFixture = {
        runtime,
        host: opened.host,
        adapter,
        drafts: [],
        queues: {},
        roomNotifications: 0,
        stop: () => {
          for (const stop of stops) stop();
          unbind();
          opened.stop();
        },
      };
      stops.push(
        await runtime.observe('drafts', (drafts: typeof window.workFixture.drafts) => {
          window.workFixture.drafts = drafts;
        }),
      );
      stops.push(
        await runtime.observe('rooms', () => {
          window.workFixture.roomNotifications += 1;
        }),
      );
      for (const room of rooms) {
        stops.push(
          await runtime.observe('queue', room.locator, (entries: readonly QueueEntry[]) => {
            window.workFixture.queues[room.locator] = entries;
          }),
        );
      }
      await waitForRooms(
        runtime,
        (visible: readonly { roomVersion: string | null }[]) =>
          visible.length === 2 && visible.every((room) => room.roomVersion !== null),
      );
    },
    { rooms, options },
  );
}

async function attachTab(page: Page, other: Page): Promise<void> {
  await other.evaluate(() => {
    window.workRuntimePort = new Promise<MessagePort>((resolve) => {
      window.addEventListener(
        'message',
        (event) => {
          const port = event.ports[0];
          if (port !== undefined) resolve(port);
        },
        { once: true },
      );
    });
  });
  await page.evaluate(() => {
    const channel = new MessageChannel();
    window.workFixture.host!.attach(channel.port1, 'mdui');
    window.workOther?.postMessage({ runtime: true }, '*', [channel.port2]);
  });
  await other.evaluate(async () => {
    const port = await window.workRuntimePort!;
    const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
    const specifier = '/src/app.js';
    const { bindApp } = (await import(specifier)) as {
      bindApp: (runtime: MdRuntimeClient) => Promise<() => void>;
    };
    const runtime = connectMdRuntime(port);
    const unbind = await bindApp(runtime);
    const stops: Array<() => void> = [];
    window.workFixture = {
      runtime,
      drafts: [],
      queues: {},
      roomNotifications: 0,
      stop: () => {
        for (const stop of stops) stop();
        unbind();
      },
    };
    stops.push(
      await runtime.observe('drafts', (drafts: typeof window.workFixture.drafts) => {
        window.workFixture.drafts = drafts;
      }),
    );
    stops.push(
      await runtime.observe('rooms', () => {
        window.workFixture.roomNotifications += 1;
      }),
    );
    for (const locator of ['alpha', 'beta']) {
      stops.push(
        await runtime.observe('queue', locator, (entries: readonly QueueEntry[]) => {
          window.workFixture.queues[locator] = entries;
        }),
      );
    }
  });
}

async function screen(page: Page, name: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name, exact: true })
    .click();
}

const inventory = (page: Page) =>
  page.getByRole('list', { name: 'Drafts', exact: true }).getByRole('listitem');
const pageErrors = new WeakMap<BrowserContext, string[]>();

test('a durable Save refusal stays visible in File and leaves its Draft in Work without a queued batch', async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page
    .getByRole('article', { name: 'Notes', exact: true })
    .first()
    .getByRole('button', { name: 'notes/existing.md', exact: true })
    .click();
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('Durable words');
  await title.press('Tab');
  await expect
    .poll(() =>
      page.evaluate(() => window.workFixture.runtime.draft.read('alpha', 'notes/existing.md')),
    )
    .toEqual({ fields: { title: 'Durable words' } });
  await page.evaluate(() => {
    window.workFaults.write = true;
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Fields', exact: true })
      .getByRole('status')
      .filter({ hasText: 'durable-write' }),
  ).toBeVisible();
  await expect(title).toHaveValue('Durable words');
  await page.screenshot({
    path: testInfo.outputPath('file-durable-save-refusal.png'),
    fullPage: true,
  });
  await page.evaluate(() => {
    window.workFaults.write = false;
  });
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(['alpha notes/existing.md']);
  await expect(
    page.getByRole('article', { name: 'Notes Pending Changes', exact: true }).getByRole('listitem'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      async () =>
        (
          await window.workFixture.runtime.query({
            selector: { room: 'alpha', path: 'notes/existing.md' },
          })
        ).documents[0]?.fields.title,
    ),
  ).toBe('Original');
  expect(await page.evaluate(() => window.workFixture.runtime.storageLoss())).toBeNull();
  await page.screenshot({
    path: testInfo.outputPath('work-after-durable-save-refusal.png'),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test.beforeEach(async ({ page, context }) => {
  const errors: string[] = [];
  pageErrors.set(context, errors);
  const watchErrors = (tab: Page) => tab.on('pageerror', (error) => errors.push(error.message));
  watchErrors(page);
  context.on('page', watchErrors);
  await context.addInitScript(() => {
    window.workFaults = { read: false, write: false, operations: [] };
    for (const method of ['get', 'getAll', 'openCursor', 'put', 'delete'] as const) {
      const original = IDBObjectStore.prototype[method];
      Object.defineProperty(IDBObjectStore.prototype, method, {
        configurable: true,
        writable: true,
        value: function (...args: unknown[]) {
          const write = method === 'put' || method === 'delete';
          if (window.workFaults[write ? 'write' : 'read']) {
            window.workFaults.operations.push(method);
            throw new DOMException(
              `Injected durable ${write ? 'write' : 'read'} failure`,
              write ? 'QuotaExceededError' : 'UnknownError',
            );
          }
          return Reflect.apply(original, this, args);
        },
      });
    }
  });
  await page.goto('/');
  await mount(page);
});

test('Work reports a failed durable read without false empty or storage loss and recovers on retry and observation', async ({
  page,
}, testInfo) => {
  await page.evaluate(() =>
    window.workFixture.runtime.draft.replace('alpha', 'notes/new.md', {
      fields: { title: 'Retained' },
    }),
  );
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(['alpha notes/new.md']);
  await screen(page, 'Rooms');
  await page.evaluate(() => {
    window.workFaults.read = true;
  });
  await screen(page, 'Work');
  const state = page.getByRole('status', { name: 'Draft inventory', exact: true });
  await expect(state).toContainText('Injected durable read failure');
  await expect(inventory(page)).toHaveText(['alpha notes/new.md']);
  await expect(page.getByRole('button', { name: 'Retry Drafts', exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.workFixture.runtime.storageLoss())).toBeNull();
  await page.screenshot({ path: testInfo.outputPath('work-read-failure.png'), fullPage: true });
  await page.evaluate(() => {
    window.workFaults.read = false;
  });
  const retry = page.getByRole('button', { name: 'Retry Drafts', exact: true });
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Work', exact: true })
    .focus();
  for (let step = 0; step < 20; step += 1) {
    if (await retry.evaluate((element) => element === document.activeElement)) break;
    await page.keyboard.press('Tab');
  }
  await expect(retry).toBeFocused();
  expect(await retry.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe(
    'none',
  );
  await page.keyboard.press('Enter');
  await expect(state).toBeEmpty();
  await expect(inventory(page)).toHaveText(['alpha notes/new.md']);
  await page.evaluate(async () => {
    window.workFaults.read = true;
    const specifier = '/src/app.js';
    const { bindApp } = await import(specifier);
    await bindApp(window.workFixture.runtime);
  });
  await screen(page, 'Work');
  await expect(state).toContainText('Injected durable read failure');
  await expect(state).not.toContainText('No Drafts');
  await expect(inventory(page)).toHaveCount(0);
  await page.evaluate(async () => {
    window.workFaults.read = false;
    await window.workFixture.runtime.draft.replace('beta', 'notes/new.md', {
      fields: { title: 'Another' },
    });
  });
  await expect(inventory(page)).toHaveText(['alpha notes/new.md', 'beta notes/new.md']);
  await expect(state).toBeEmpty();
  await expect(page.getByRole('button', { name: 'Retry Drafts', exact: true })).toBeHidden();
  expect(await page.evaluate(() => window.workFixture.runtime.storageLoss())).toBeNull();
});

test.afterEach(async ({ context }, testInfo) => {
  try {
    const snapshots = await Promise.all(
      context.pages().map((page) =>
        page.evaluate(async () => {
          const fixture = window.workFixture;
          if (!fixture) return null;
          return {
            drafts: fixture.drafts,
            queues: fixture.queues,
            rooms: await fixture.runtime.rooms(),
            query: await fixture.runtime.query(),
            storageLoss: await fixture.runtime.storageLoss(),
            faults: window.workFaults,
          };
        }),
      ),
    );
    await testInfo.attach('public-observations', {
      body: JSON.stringify({ snapshots, pageErrors: pageErrors.get(context) }, null, 2),
      contentType: 'application/json',
    });
    expect(pageErrors.get(context)).toEqual([]);
  } finally {
    for (const page of context.pages()) await page.evaluate(() => window.workFixture?.stop());
  }
});

test('Work keeps every absent-Path Draft distinct through navigation and literal reload', async ({
  page,
}, testInfo) => {
  await page.evaluate(async () => {
    const { runtime } = window.workFixture;
    await runtime.draft.replace('alpha', 'notes/new.md', {
      create: { type: 'note' },
      fields: { title: 'New alpha' },
    });
    await runtime.draft.replace('beta', 'notes/new.md', {
      create: { type: 'note' },
      fields: { title: 'New beta' },
    });
    await runtime.draft.replace('unavailable', 'notes/orphan.md', {
      fields: { title: 'Retained' },
    });
    if ((await runtime.query({ selector: { path: 'notes/new.md' } })).documents.length !== 0)
      throw Error('New Paths already belong to Query');
  });
  await screen(page, 'Work');
  const expected = ['alpha notes/new.md', 'beta notes/new.md', 'unavailable notes/orphan.md'];
  await expect(inventory(page)).toHaveText(expected);
  await screen(page, 'Search');
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(expected);
  await page.reload();
  await mount(page);
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(expected);
  expect(
    await page.evaluate(async () =>
      (await window.workFixture.runtime.draft.list()).map(
        ({ locator, path }) => `${locator} ${path}`,
      ),
    ),
  ).toEqual(expected);
  await page.screenshot({
    path: testInfo.outputPath('work-reloaded-inventory.png'),
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 900 });
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
    await page.screenshot({
      path: testInfo.outputPath(`work-360-${colorScheme}.png`),
      fullPage: true,
    });
  }
});

test('Work converges across tabs for creation, replacement, failed writes, Save consumption and discard', async ({
  page,
  context,
}, testInfo) => {
  const popup = context.waitForEvent('page');
  await page.evaluate(() => {
    window.workOther = window.open('/', '_blank');
  });
  const other = await popup;
  await other.waitForLoadState('domcontentloaded');
  await attachTab(page, other);
  await page.evaluate(() => {
    window.workFixture.adapter!.script('mutate', { kind: 'transport-uncertainty' });
  });
  for (const tab of [page, other]) {
    await screen(tab, 'Work');
    await expect(inventory(tab)).toHaveCount(0);
  }
  await page.evaluate(async () => {
    const { runtime } = window.workFixture;
    const view = document.querySelector('md-document-view') as HTMLElement & {
      create: (runtime: MdRuntimeClient, room: string, path: string, type: string) => Promise<void>;
    };
    await view.create(runtime, 'alpha', 'notes/new.md', 'note');
  });
  for (const tab of [page, other]) await expect(inventory(tab)).toHaveText(['alpha notes/new.md']);
  await other.evaluate(async () => {
    await window.workFixture.runtime.draft.replace('alpha', 'notes/new.md', {
      create: { type: 'note' },
      fields: { title: 'Changed in another tab' },
    });
    await window.workFixture.runtime.draft.replace('beta', 'notes/existing.md', {
      fields: { title: 'Save me' },
    });
  });
  const expected = [
    {
      locator: 'alpha',
      path: 'notes/new.md',
      content: { create: { type: 'note' }, fields: { title: 'Changed in another tab' } },
    },
    { locator: 'beta', path: 'notes/existing.md', content: { fields: { title: 'Save me' } } },
  ];
  for (const tab of [page, other]) {
    await expect(inventory(tab)).toHaveText(['alpha notes/new.md', 'beta notes/existing.md']);
    await expect.poll(() => tab.evaluate(() => window.workFixture.drafts)).toEqual(expected);
  }
  for (const operation of ['replace', 'discard'] as const) {
    const failure = await page.evaluate(async (operation) => {
      window.workFaults.write = true;
      try {
        const { runtime } = window.workFixture;
        if (operation === 'replace')
          await runtime.draft.replace('beta', 'notes/existing.md', {
            fields: { title: 'Must not commit' },
          });
        else await runtime.draft.discard('beta', 'notes/existing.md');
        return 'unexpected success';
      } catch (error) {
        return (error as Error).message;
      } finally {
        window.workFaults.write = false;
      }
    }, operation);
    expect(failure).toBe('Injected durable write failure');
    for (const tab of [page, other]) {
      expect(await tab.evaluate(() => window.workFixture.runtime.draft.list())).toEqual(expected);
      await expect(inventory(tab)).toHaveText(['alpha notes/new.md', 'beta notes/existing.md']);
    }
  }
  const refused = await page.evaluate(() =>
    window.workFixture.runtime.save('beta', [
      { kind: 'section', path: 'notes/existing.md', name: 'Missing section', value: 'Invalid' },
    ]),
  );
  expect(refused).toEqual({
    outcome: 'refused',
    rule: 'required-section',
    file: 'notes/existing.md',
    location: 'Missing section',
  });
  const result = await other.evaluate(() =>
    window.workFixture.runtime.save('beta', [
      { kind: 'field', path: 'notes/existing.md', name: 'title', value: 'Save me' },
    ]),
  );
  expect(result.outcome).toBe('saved');
  if (result.outcome !== 'saved') throw Error('Save refused');
  for (const tab of [page, other]) {
    await expect(inventory(tab)).toHaveText(['alpha notes/new.md']);
    await expect
      .poll(() =>
        tab.evaluate(() =>
          window.workFixture.queues.beta?.map((entry) => ({
            id: entry.batch.id,
            changes: entry.batch.changes,
            outcome: entry.outcome,
          })),
        ),
      )
      .toEqual([
        {
          id: result.id,
          changes: [{ kind: 'field', path: 'notes/existing.md', name: 'title', value: 'Save me' }],
          outcome: { kind: 'pending' },
        },
      ]);
    await expect(
      tab
        .getByRole('article', { name: 'Notes Pending Changes', exact: true })
        .getByRole('listitem'),
    ).toHaveText(['Pending']);
  }
  await page.evaluate(() => window.workFixture.runtime.draft.discard('alpha', 'notes/new.md'));
  for (const tab of [page, other]) {
    await expect(inventory(tab)).toHaveCount(0);
    await expect(tab.getByRole('status', { name: 'Draft inventory', exact: true })).toHaveText(
      'No Drafts.',
    );
    await expect(
      tab
        .getByRole('article', { name: 'Notes Pending Changes', exact: true })
        .getByRole('listitem'),
    ).toHaveText(['Pending']);
  }
  await other.reload();
  await other.waitForLoadState('domcontentloaded');
  await attachTab(page, other);
  await page.evaluate(() => {
    window.workFixture.adapter!.script('mutate', { kind: 'transport-uncertainty' });
  });
  await screen(other, 'Work');
  await expect(inventory(other)).toHaveCount(0);
  await expect(
    other
      .getByRole('article', { name: 'Notes Pending Changes', exact: true })
      .getByRole('listitem'),
  ).toHaveText(['Pending']);
  expect(
    await other.evaluate(() => window.workFixture.queues.beta?.map((entry) => entry.batch.id)),
  ).toEqual([result.id]);
  await other.screenshot({
    path: testInfo.outputPath('work-other-tab-pending-without-drafts.png'),
    fullPage: true,
  });
  await testInfo.attach('cross-tab-public-state', {
    body: JSON.stringify(
      await Promise.all(
        [page, other].map((tab) =>
          tab.evaluate(async () => ({
            drafts: await window.workFixture.runtime.draft.list(),
            observed: window.workFixture.drafts,
            queues: window.workFixture.queues,
            storageLoss: await window.workFixture.runtime.storageLoss(),
          })),
        ),
      ),
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('Work keeps Drafts after remote removal and Room access loss without a Connection Refusal', async ({
  page,
}, testInfo) => {
  await page.evaluate(() => window.workFixture.stop());
  await mount(page, { discoveryIntervalMs: 25 });
  await page.evaluate(async () => {
    await window.workFixture.runtime.draft.replace('alpha', 'notes/existing.md', {
      fields: { title: 'Remote removal must retain this' },
    });
    await window.workFixture.runtime.draft.replace('beta', 'notes/new.md', {
      create: { type: 'note' },
    });
  });
  await screen(page, 'Work');
  const expected = ['alpha notes/existing.md', 'beta notes/new.md'];
  await expect(inventory(page)).toHaveText(expected);
  await page.evaluate(async (rooms) => {
    const { runtime, adapter } = window.workFixture;
    const helper = '/src/testing.js';
    const { fixtureRoom } = await import(helper);
    adapter!.setRooms(
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
    await runtime.reauthorize();
  }, rooms);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (
            await window.workFixture.runtime.query({
              selector: { room: 'alpha', path: 'notes/existing.md' },
            })
          ).documents,
      ),
    )
    .toEqual([]);
  await expect(inventory(page)).toHaveText(expected);
  await page.evaluate(async () => {
    window.workFixture.adapter!.setRooms([]);
    await window.workFixture.runtime.reauthorize();
  });
  await expect
    .poll(() =>
      page.evaluate(async () =>
        (await window.workFixture.runtime.rooms()).filter((room) => room.synchronizationAvailable),
      ),
    )
    .toEqual([]);
  await expect(inventory(page)).toHaveText(expected);
  await screen(page, 'Refusal');
  await expect(page.getByRole('status', { name: 'Connection Refusal', exact: true })).toHaveText(
    'No Connection Refusal',
  );
  await screen(page, 'Storage');
  await expect(page.getByRole('status', { name: 'Storage', exact: true })).toHaveText(
    'No storage loss. true',
  );
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(expected);
  await page.screenshot({
    path: testInfo.outputPath('work-after-room-access-loss.png'),
    fullPage: true,
  });
});

for (const kind of ['conflicted', 'rejected'] as const) {
  test(`Work keeps a ${kind} submitted batch distinct from its reopened Draft and shows Provider text verbatim`, async ({
    page,
  }, testInfo) => {
    const code = kind === 'conflicted' ? 'title_conflict' : 'invalid_library';
    const detail = 'Provider refused: <keep these words> & decide again.';
    await page.evaluate(
      async ({ kind, code, detail, content }) => {
        const { runtime, adapter } = window.workFixture;
        await runtime.draft.replace('alpha', 'notes/existing.md', {
          fields: { title: 'My words' },
        });
        adapter!.script('mutate', {
          kind,
          roomVersion: 'v2',
          affected: { 'notes/existing.md': content },
          code,
          fields: { detail },
        });
        const saved = await runtime.save('alpha', [
          { kind: 'field', path: 'notes/existing.md', name: 'title', value: 'My words' },
        ]);
        if (saved.outcome !== 'saved') throw Error(JSON.stringify(saved));
      },
      { kind, code, detail, content },
    );
    await screen(page, 'Work');
    const batches = page
      .getByRole('article', { name: 'Notes Pending Changes', exact: true })
      .getByRole('listitem');
    await expect(batches).toHaveCount(1);
    await expect(batches).toContainText(code);
    await expect(batches.getByText(detail, { exact: true })).toBeVisible();
    await expect(inventory(page)).toHaveCount(0);
    await screen(page, 'Rooms');
    await page
      .getByRole('article', { name: 'Notes', exact: true })
      .first()
      .getByRole('button', { name: 'notes/existing.md', exact: true })
      .click();
    await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('My words');
    await screen(page, 'Work');
    await expect(inventory(page)).toHaveText(['alpha notes/existing.md']);
    await expect(batches).toHaveCount(1);
    await expect(batches.getByText(detail, { exact: true })).toBeVisible();
    expect(await page.evaluate(() => window.workFixture.runtime.storageLoss())).toBeNull();
    await page.screenshot({
      path: testInfo.outputPath(`work-${kind}-and-draft.png`),
      fullPage: true,
    });
  });
}

test('Work shows a retryable refusal as Pending with its reset', async ({ page }) => {
  await page.evaluate(async () => {
    const { runtime, adapter } = window.workFixture;
    adapter!.script('mutate', {
      kind: 'retryable-refusal',
      code: 'rate_limited',
      fields: { retry_at: '2099-01-01T00:00:00.000Z' },
      reset: '2099-01-01T00:00:00.000Z',
    });
    const saved = await runtime.save('alpha', [
      { kind: 'field', path: 'notes/existing.md', name: 'title', value: 'Later' },
    ]);
    if (saved.outcome !== 'saved') throw Error(JSON.stringify(saved));
  });
  await screen(page, 'Work');
  const batches = page
    .getByRole('article', { name: 'Notes Pending Changes', exact: true })
    .getByRole('listitem');
  await expect(batches).toContainText('Pending');
  await expect(batches).toContainText('2099-01-01T00:00:00.000Z');
  await expect(batches).toContainText('rate_limited');
});

test('Work removes an Accepted batch from Pending Changes without inventing a Draft', async ({
  page,
}, testInfo) => {
  await page.evaluate(async () => {
    await window.workFixture.runtime.draft.replace('alpha', 'notes/existing.md', {
      fields: { title: 'Accepted words' },
    });
    await window.workFixture.runtime.draft.replace('beta', 'notes/new.md', {
      create: { type: 'note' },
    });
    window.workFixture.adapter!.script('mutate', {
      kind: 'accepted',
      roomVersion: 'v2',
      documents: {
        'notes/existing.md':
          '---\ntype: note\ntitle: Accepted words\n---\n## Body\nOriginal body.\n',
      },
      revisions: { 'notes/existing.md': 'accepted-revision' },
      removals: [],
      author: 'Memory Provider',
      time: '2026-09-10T00:00:00Z',
    });
  });
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(['alpha notes/existing.md', 'beta notes/new.md']);
  const result = await page.evaluate(() =>
    window.workFixture.runtime.save('alpha', [
      { kind: 'field', path: 'notes/existing.md', name: 'title', value: 'Accepted words' },
    ]),
  );
  expect(result.outcome).toBe('saved');
  if (result.outcome !== 'saved') throw Error('Save refused');
  await expect
    .poll(() =>
      page.evaluate(async (id) => (await window.workFixture.runtime.outcome(id))?.kind, result.id),
    )
    .toBe('accepted');
  await expect(inventory(page)).toHaveText(['beta notes/new.md']);
  await expect(
    page.getByRole('article', { name: 'Notes Pending Changes', exact: true }).getByRole('listitem'),
  ).toHaveCount(0);
  await testInfo.attach('accepted-public-state', {
    body: JSON.stringify(
      await page.evaluate(
        async (id) => ({
          outcome: await window.workFixture.runtime.outcome(id),
          drafts: window.workFixture.drafts,
          queues: window.workFixture.queues,
        }),
        result.id,
      ),
      null,
      2,
    ),
    contentType: 'application/json',
  });
});

test('an unchanged Room notification preserves live File typing and keyboard focus before blur', async ({
  page,
}) => {
  await page.evaluate(() => window.workFixture.stop());
  await mount(page, { discoveryIntervalMs: 25 });
  await page
    .getByRole('article', { name: 'Notes', exact: true })
    .first()
    .getByRole('button', { name: 'notes/existing.md', exact: true })
    .click();
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('Words still being typed');
  const before = await page.evaluate(() => window.workFixture.roomNotifications);
  await expect
    .poll(() => page.evaluate(() => window.workFixture.roomNotifications))
    .toBeGreaterThan(before);
  await expect(title).toHaveValue('Words still being typed');
  await expect(title).toBeFocused();
  await title.blur();
  await expect
    .poll(() =>
      page.evaluate(() => window.workFixture.runtime.draft.read('alpha', 'notes/existing.md')),
    )
    .toEqual({ fields: { title: 'Words still being typed' } });
  await screen(page, 'Work');
  await expect(inventory(page)).toHaveText(['alpha notes/existing.md']);
});
