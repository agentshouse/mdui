import { expect, test, type Page } from '@playwright/test';
import type { MdRuntime, QueryDocument, SyncStatus } from '@agentshouse/mdruntime';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

type DocumentViewElement = HTMLElement & {
  bind: (runtime: MdRuntime, room: string, path: string) => void;
};

declare global {
  interface Window {
    viewFixture: {
      runtime: MdRuntime;
      adapter: MemoryAdapter;
      history: unknown[];
      seen: SyncStatus[];
      stop: () => void;
    };
  }
}

const personType =
  '---\ntype: definition\nfields:\n  name:\n    kind: string\n    required: true\n---\n';
const projectType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  amount:\n    kind: number\n  due:\n    kind: date\n  stage:\n    kind: enum\n    values: [Draft, Ready]\n  owner:\n    kind: reference\n    to: person\n  tags:\n    kind: list\n    of: string\nsections:\n  Summary:\n    kind: text\n  Steps:\n    kind: list\n---\n';
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
  writeGrants: ['work'],
  providerOwnedPaths: ['work/owned.md'],
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

async function start(
  page: Page,
  rooms: unknown[],
  options: { history?: boolean; interval?: number } = {},
) {
  await page.goto('/');
  await page.evaluate(
    async ({ rooms, options }) => {
      const { createMdRuntime } = await import('@agentshouse/mdruntime');
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const controller = new AbortController();
      const adapter = createMemoryAdapter({ rooms: rooms as never });
      const history: unknown[] = [];
      if (options.history) {
        adapter.script(
          'history',
          (request: { locator: string; path: string; revision?: string }) => {
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
          },
        );
      }
      const runtime = createMdRuntime({
        adapter,
        requiredGuarantees: [],
        signal: controller.signal,
        discoveryIntervalMs: options.interval ?? 60_000,
      });
      window.viewFixture = {
        runtime,
        adapter,
        history,
        seen: [],
        stop: () => controller.abort(),
      };
      runtime.observe('sync-status', (status) => window.viewFixture.seen.push(status));
      await new Promise<void>((resolve) => {
        runtime.observe('rooms', (visible) => {
          if (visible.some((room) => room.roomVersion !== null)) resolve();
        });
      });
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
    (path) => window.viewFixture.runtime.query({ selector: { room: 'studio', path } }).documents[0],
    path,
  );
}

test('renders typed fields, preamble, declared extra and structured sections from Query', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const document = await queried(page, 'work/alpha.md');
  expect(document.preamble).toContain('Opening words before any heading.');
  expect(Object.keys(document.sections)).toEqual(['Extra', 'Summary', 'Steps']);
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
    .locator('input, textarea, select')
    .all())
    await expect(input).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Add item', exact: true })).toBeDisabled();
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
  expect(document.sections.Summary).toContain('The declared summary.');
  expect(document.sections.Extra).toContain('An additional existing section.');
  expect(document.sections.Steps).toContain('- first');
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
