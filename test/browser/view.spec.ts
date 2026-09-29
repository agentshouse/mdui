import { expect, test, type Page } from '@playwright/test';
import type { HistoryResult, MutationRequest, QueryDocument } from '@agentshouse/mdruntime';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

type DocumentViewElement = HTMLElement & {
  bind: (runtime: MdRuntimeClient, room: string, path: string) => void;
};

type HistoryRequest = {
  locator: string;
  path: string;
  revision?: string;
  pageToken?: string;
};

type PendingHistory = {
  request: HistoryRequest;
  resolve: (result: HistoryResult) => void;
};

declare global {
  interface Window {
    viewFixture: {
      runtime: MdRuntimeClient;
      adapter: MemoryAdapter;
      history: HistoryRequest[];
      pendingHistory: PendingHistory[];
      historyFails: boolean;
      submissions?: MutationRequest[];
      stop: () => void;
    };
  }
}

const personType =
  '---\ntype: definition\nfields:\n  name:\n    kind: string\n    required: true\n---\n';
const projectType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  amount:\n    kind: number\n  due:\n    kind: date\n  stage:\n    kind: enum\n    values: [Draft, Ready]\n  owner:\n    kind: reference\n    to: person\n  tags:\n    kind: list\n    of: string\nsections:\n  Summary:\n    kind: text\n  Steps:\n    kind: list\n    of: text\n---\n';
const ada = '---\ntype: person\nname: Ada\n---\n';
const alpha = `---
type: project
title: Alpha
amount: 12.5
due: 2026-09-09
stage: Ready
owner: ../people/ada.md
tags: [core, ui]
---

Opening words before any heading.

## Extra

An additional existing section.

## Summary

The declared summary.

## Steps

- first
- second
`;
const owned = `---
type: project
title: Owned
---

## Summary

Provider maintains this Path.
`;
const plain = '# Whole text\n\nNo type and no sections.\n';

const studio = {
  name: 'Studio',
  locator: 'studio',
  roomVersion: 'v1',
  writeGrants: ['./work'],
  providerOwnedPaths: ['./work/owned.md'],
  documents: {
    'types/person.md': personType,
    'types/project.md': projectType,
    'people/ada.md': ada,
    'work/alpha.md': alpha,
    'work/owned.md': owned,
    'notes/plain.md': plain,
    'notes/gone.md': '# Gone\n',
  },
};

async function start(page: Page, rooms: unknown[], options: { history?: boolean } = {}) {
  await page.goto('/');
  await page.evaluate(
    async ({ rooms, options }) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) as never });
      const history: HistoryRequest[] = [];
      if (options.history) {
        adapter.script('history', (request: HistoryRequest) => {
          history.push(structuredClone(request));
          if (request.path === 'notes/gone.md') return { kind: 'no-history' };
          if (request.revision === 'rev-past') {
            return { kind: 'revision', content: '# Past revision\n\nEarlier words.\n' };
          }
          return {
            kind: 'history',
            revisions: [
              { revision: 'rev-past', author: 'ada', time: '2026-09-01T00:00:00.000Z' },
              { revision: 'rev-now', author: 'lin', time: '2026-09-08T12:00:00.000Z' },
            ],
          };
        });
      }
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        discoveryIntervalMs: 60_000,
      });
      window.viewFixture = {
        runtime: opened.runtime,
        adapter,
        history,
        pendingHistory: [],
        historyFails: false,
        stop: opened.stop,
      };
      await waitForRooms(opened.runtime, (visible: readonly { roomVersion: string | null }[]) =>
        visible.some((room) => room.roomVersion !== null),
      );
    },
    { rooms, options },
  );
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.viewFixture?.stop());
});

async function mount(page: Page, path: string, room = 'studio') {
  await page.evaluate(
    ({ room, path }) => {
      const view = document.createElement('md-document-view') as DocumentViewElement;
      view.bind(window.viewFixture.runtime, room, path);
      document.body.replaceChildren(view);
    },
    { room, path },
  );
}

async function queried(page: Page, path: string): Promise<QueryDocument> {
  return page.evaluate(
    async (path) =>
      (await window.viewFixture.runtime.query({ rooms: ['studio'], select: 'all' })).documents.find(
        (document) => document.path === path,
      )!,
    path,
  );
}

async function deferHistory(page: Page) {
  await page.evaluate(() => {
    window.viewFixture.pendingHistory = [];
    window.viewFixture.adapter.script('history', (request: HistoryRequest) => {
      window.viewFixture.history.push(structuredClone(request));
      return new Promise<HistoryResult>((resolve) => {
        window.viewFixture.pendingHistory.push({ request: structuredClone(request), resolve });
      });
    });
  });
}

async function answerHistory(page: Page, match: Partial<HistoryRequest>, result: HistoryResult) {
  await expect
    .poll(async () =>
      page.evaluate(
        (match) =>
          window.viewFixture.pendingHistory.findIndex(
            (entry) =>
              (match.path === undefined || entry.request.path === match.path) &&
              (!('revision' in match) || entry.request.revision === match.revision) &&
              (!('pageToken' in match) || entry.request.pageToken === match.pageToken),
          ),
        match,
      ),
    )
    .not.toBe(-1);
  await page.evaluate(
    ({ match, result }) => {
      const index = window.viewFixture.pendingHistory.findIndex(
        (entry) =>
          (match.path === undefined || entry.request.path === match.path) &&
          (!('revision' in match) || entry.request.revision === match.revision) &&
          (!('pageToken' in match) || entry.request.pageToken === match.pageToken),
      );
      const [pending] = window.viewFixture.pendingHistory.splice(index, 1);
      pending.resolve(result);
    },
    { match, result },
  );
}

test('renders typed fields, preamble, declared extra and structured sections from Query', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const document = await queried(page, 'work/alpha.md');
  expect(document.preamble).toContain('Opening words before any heading.');
  expect(Object.keys(document.sections ?? {})).toEqual(['Extra', 'Summary', 'Steps']);
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Alpha');
  await expect(page.getByRole('spinbutton', { name: 'amount', exact: true })).toHaveValue('12.5');
  await expect(page.getByLabel('due', { exact: true })).toHaveValue('2026-09-09');
  await expect(page.getByRole('combobox', { name: 'stage', exact: true })).toHaveValue('Ready');
  await expect(page.getByRole('combobox', { name: 'owner', exact: true })).toHaveValue(
    'people/ada.md',
  );
  await expect(page.getByRole('textbox', { name: 'tags 1', exact: true })).toHaveValue('core');
  await expect(page.getByRole('textbox', { name: 'tags 2', exact: true })).toHaveValue('ui');
  for (const input of await page
    .locator('md-document-view')
    .getByRole('region', { name: 'Fields' })
    .locator('input, textarea, select')
    .all())
    await expect(input).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Add item', exact: true })).toBeEnabled();
  await expect(page.getByRole('region', { name: 'Preamble' })).toContainText(
    'Opening words before any heading.',
  );
  await expect(page.getByRole('region', { name: 'Summary' })).toContainText(
    'The declared summary.',
  );
  await expect(page.getByRole('region', { name: 'Extra' })).toContainText(
    'An additional existing section.',
  );
  await expect(page.getByRole('region', { name: 'Steps' }).getByRole('listitem')).toHaveText([
    'first',
    'second',
  ]);
  expect(await page.getByRole('heading', { level: 2 }).allTextContents()).toEqual([
    'Preamble',
    'Summary',
    'Steps',
    'Extra',
    'Backlinks',
  ]);
  expect(document.sections?.Summary).toContain('The declared summary.');
  expect(document.sections?.Extra).toContain('An additional existing section.');
  expect(document.sections?.Steps).toContain('- first');
});

test('renders an untyped file as its whole Query text', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'notes/plain.md');
  const document = await queried(page, 'notes/plain.md');
  expect(document.type).toBe('any');
  expect(document.sections).toEqual({});
  await expect(page.locator('md-document-view')).toContainText('Whole text');
  await expect(page.locator('md-document-view')).toContainText('No type and no sections.');
  await expect(page.locator('md-string-field')).toHaveCount(0);
  expect(document.preamble).toContain('Whole text');
});

test('lists Room-local backlinks and navigates to the referring Document', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'people/ada.md');
  const document = await queried(page, 'people/ada.md');
  expect(document.backlinks).toEqual([{ path: 'work/alpha.md', type: 'project', field: 'owner' }]);
  await expect(page.getByRole('button', { name: 'work/alpha.md', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'work/alpha.md', exact: true }).press('Enter');
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Alpha');
});

test('transfers no History until the panel opens, then shows author, time, content, or absence', async ({
  page,
}) => {
  await start(page, [studio], { history: true });
  await mount(page, 'work/alpha.md');
  expect(await page.evaluate(() => window.viewFixture.history)).toEqual([]);
  await page.getByText('History', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /ada/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /lin/ })).toBeVisible();
  expect(await page.evaluate(() => window.viewFixture.history)).toEqual([
    { locator: 'studio', path: 'work/alpha.md' },
  ]);
  await page.getByRole('button', { name: /ada/ }).press('Enter');
  await expect(page.locator('md-document-view')).toContainText('Earlier words.');
  expect(await page.evaluate(() => window.viewFixture.history)).toEqual([
    { locator: 'studio', path: 'work/alpha.md' },
    { locator: 'studio', path: 'work/alpha.md', revision: 'rev-past' },
  ]);
  await mount(page, 'notes/gone.md');
  expect(
    await page.evaluate(() =>
      window.viewFixture.history.filter(
        (entry) => (entry as { path: string }).path === 'notes/gone.md',
      ),
    ),
  ).toEqual([]);
  await page.getByText('History', { exact: true }).press('Enter');
  await expect(page.getByText('No history', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.viewFixture.history.at(-1))).toEqual({
    locator: 'studio',
    path: 'notes/gone.md',
  });
});

test.describe('Browser locale that is not a valid language tag', () => {
  test.use({ locale: 'en-US@posix', timezoneId: 'UTC' });
  test('labels History revisions with times in the runtime default locale', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await start(page, [studio], { history: true });
    await mount(page, 'work/alpha.md');
    await page.getByText('History', { exact: true }).press('Enter');
    await expect(
      page.getByRole('button', { name: /^ada · Sep 1, 2026, 12:00\sAM$/ }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^lin · Sep 8, 2026, 12:00\sPM$/ }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test('disables controls and shows the reason for a missing write grant', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'people/ada.md');
  await expect(page.getByText('This Path has no write grant.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'name', exact: true })).toBeDisabled();
});

test('disables controls and shows the reason for a Provider-owned Path', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'work/owned.md');
  await expect(page.getByText('This Path is Provider-owned.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toBeDisabled();
});

test('is labelled, keyboard-operable, themed, and lays out at 360 pixels', async ({
  page,
}, testInfo) => {
  await start(page, [studio], { history: true });
  await mount(page, 'work/alpha.md');
  await page.screenshot({ path: testInfo.outputPath('document-view-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.keyboard.press('Tab');
  const history = page.getByText('History', { exact: true });
  await history.focus();
  await expect(history).toBeFocused();
  expect(await history.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  await page.screenshot({
    path: testInfo.outputPath('document-view-360-focus.png'),
    fullPage: true,
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(
      await page
        .locator('md-document-view')
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 24, 32)');
    await page.screenshot({
      path: testInfo.outputPath(`document-view-360-${theme}.png`),
      fullPage: true,
    });
  }
  await page.evaluate(() => {
    document.body.style.setProperty('--md-background', '#eef2ff');
    document.body.style.setProperty('--md-text', '#152a43');
    document.body.style.setProperty('--md-focus', '#713baf');
  });
  expect(
    await page
      .locator('md-document-view')
      .evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(238, 242, 255)');
  await history.focus();
  expect(await history.evaluate((element) => getComputedStyle(element).outlineColor)).toBe(
    'rgb(113, 59, 175)',
  );
});

test('ignores reversed deferred History list responses after navigation', async ({ page }) => {
  await start(page, [studio], { history: true });
  await deferHistory(page);
  await mount(page, 'people/ada.md');
  await page.getByText('History', { exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.viewFixture.pendingHistory.map((entry) => entry.request.path)),
    )
    .toContain('people/ada.md');
  await page.getByRole('button', { name: 'work/alpha.md', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Alpha');
  await page.getByText('History', { exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(() => window.viewFixture.pendingHistory.map((entry) => entry.request.path)),
    )
    .toContain('work/alpha.md');
  await answerHistory(
    page,
    { path: 'work/alpha.md', revision: undefined },
    {
      kind: 'history',
      revisions: [
        { revision: 'rev-alpha', author: 'alpha-history', time: '2026-09-08T12:00:00.000Z' },
      ],
    },
  );
  await answerHistory(
    page,
    { path: 'people/ada.md', revision: undefined },
    {
      kind: 'history',
      revisions: [{ revision: 'rev-ada', author: 'ada-history', time: '2026-09-01T00:00:00.000Z' }],
    },
  );
  await expect(page.getByRole('button', { name: /alpha-history/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /ada-history/ })).toHaveCount(0);
});

test('ignores reversed deferred History revision content after a later selection', async ({
  page,
}) => {
  await start(page, [studio], { history: true });
  await deferHistory(page);
  await mount(page, 'work/alpha.md');
  await page.getByText('History', { exact: true }).press('Enter');
  await answerHistory(
    page,
    { path: 'work/alpha.md', revision: undefined },
    {
      kind: 'history',
      revisions: [
        { revision: 'rev-past', author: 'ada', time: '2026-09-01T00:00:00.000Z' },
        { revision: 'rev-now', author: 'lin', time: '2026-09-08T12:00:00.000Z' },
      ],
    },
  );
  await page.getByRole('button', { name: /ada/ }).press('Enter');
  await page.getByRole('button', { name: /lin/ }).press('Enter');
  await answerHistory(
    page,
    { path: 'work/alpha.md', revision: 'rev-now' },
    { kind: 'revision', content: '# Current revision\n\nLater words.\n' },
  );
  await answerHistory(
    page,
    { path: 'work/alpha.md', revision: 'rev-past' },
    { kind: 'revision', content: '# Past revision\n\nEarlier words.\n' },
  );
  await expect(page.locator('md-document-view')).toContainText('Later words.');
  await expect(page.locator('md-document-view')).not.toContainText('Earlier words.');
});

test('loads a later History page on demand', async ({ page }, testInfo) => {
  await start(page, [studio], { history: true });
  await page.evaluate(() => {
    window.viewFixture.adapter.script('history', (request: HistoryRequest) => {
      window.viewFixture.history.push(structuredClone(request));
      if (request.revision === 'rev-two') {
        return { kind: 'revision', content: '# Second page\n\nLater retained words.\n' };
      }
      if (request.pageToken === 'page-2') {
        return {
          kind: 'history',
          revisions: [{ revision: 'rev-two', author: 'lin', time: '2026-09-08T12:00:00.000Z' }],
        };
      }
      return {
        kind: 'history',
        revisions: [{ revision: 'rev-one', author: 'ada', time: '2026-09-01T00:00:00.000Z' }],
        pageToken: 'page-2',
      };
    });
  });
  await mount(page, 'work/alpha.md');
  await page.getByText('History', { exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /ada/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /lin/ })).toHaveCount(0);
  expect(await page.evaluate(() => window.viewFixture.history)).toEqual([
    { locator: 'studio', path: 'work/alpha.md' },
  ]);
  await page.getByRole('button', { name: 'Continue', exact: true }).press('Enter');
  await expect(page.getByRole('button', { name: /lin/ })).toBeVisible();
  expect(await page.evaluate(() => window.viewFixture.history)).toEqual([
    { locator: 'studio', path: 'work/alpha.md' },
    { locator: 'studio', path: 'work/alpha.md', pageToken: 'page-2' },
  ]);
  await page.getByRole('button', { name: /lin/ }).press('Enter');
  await expect(page.locator('md-document-view')).toContainText('Later retained words.');
  await page.screenshot({
    path: testInfo.outputPath('document-view-history-continue.png'),
    fullPage: true,
  });
});

test('retries History after a temporary transport-uncertainty', async ({ page }) => {
  await start(page, [studio], { history: true });
  await page.evaluate(() => {
    window.viewFixture.historyFails = true;
    window.viewFixture.adapter.script('history', (request: HistoryRequest) => {
      window.viewFixture.history.push(structuredClone(request));
      if (window.viewFixture.historyFails) return { kind: 'transport-uncertainty' };
      return {
        kind: 'history',
        revisions: [{ revision: 'rev-now', author: 'lin', time: '2026-09-08T12:00:00.000Z' }],
      };
    });
  });
  await mount(page, 'work/alpha.md');
  await page.getByText('History', { exact: true }).click();
  await expect(page.getByText('transport-uncertainty', { exact: true })).toBeVisible();
  await expect(page.getByText('No history', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /lin/ })).toHaveCount(0);
  await page.getByText('History', { exact: true }).click();
  await page.evaluate(() => {
    window.viewFixture.historyFails = false;
  });
  await page.getByText('History', { exact: true }).click();
  await expect(page.getByRole('button', { name: /lin/ })).toBeVisible();
  await expect(page.getByText('transport-uncertainty', { exact: true })).toHaveCount(0);
});

test('permits a normalized write-grant prefix and refuses Path escape', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await expect(page.getByText('This Path has no write grant.', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'owner', exact: true })).toHaveValue(
    'people/ada.md',
  );
  await mount(page, 'work/owned.md');
  await expect(page.getByText('This Path is Provider-owned.', { exact: true })).toBeVisible();
  await page.evaluate(() => window.viewFixture.stop());
  await start(page, [
    {
      ...studio,
      writeGrants: ['../work'],
      providerOwnedPaths: ['../owned.md'],
    },
  ]);
  await mount(page, 'work/alpha.md');
  await expect(page.getByText('This Path has no write grant.', { exact: true })).toBeVisible();
  await mount(page, 'work/owned.md');
  await expect(page.getByText('This Path is Provider-owned.', { exact: true })).toHaveCount(0);
});
