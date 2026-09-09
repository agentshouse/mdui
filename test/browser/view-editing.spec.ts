import { expect, test, type Page } from '@playwright/test';
import type {
  Change,
  ChangeBatch,
  HistoryResult,
  MdRuntime,
  QueryDocument,
  QueueEntry,
} from '@agentshouse/mdruntime';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

type DocumentViewElement = HTMLElement & {
  bind: (runtime: MdRuntime, room: string, path: string) => void;
  create: (runtime: MdRuntime, room: string, path: string, type: string) => Promise<void>;
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
      runtime: MdRuntime;
      adapter: MemoryAdapter;
      history: HistoryRequest[];
      pendingHistory: PendingHistory[];
      historyFails: boolean;
      stop: () => void;
    };
  }
}

const personType =
  '---\ntype: definition\nfields:\n  name:\n    kind: string\n    required: true\n---\n';
const projectType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  amount:\n    kind: number\n  due:\n    kind: date\n  stage:\n    kind: enum\n    values: [Draft, Ready]\n  owner:\n    kind: reference\n    to: person\n  tags:\n    kind: list\n    of: string\nsections:\n  Summary:\n    kind: text\n  Steps:\n    kind: list\n---\n';
const itemType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\nsections:\n  Body:\n    kind: text\n    required: true\n---\n';
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
const providerAlpha = `---
type: project
title: Provider title
amount: 12.5
due: 2026-09-09
stage: Ready
owner: ../people/ada.md
tags: [core, ui]
---

Provider preamble.

## Extra

An additional existing section.

## Summary

Provider summary.

## Steps

- first
- second
`;

const studio = {
  name: 'Studio',
  locator: 'studio',
  roomVersion: 'v1',
  writeGrants: ['./work', './people'],
  providerOwnedPaths: ['./work/owned.md'],
  documents: {
    'types/person.md': personType,
    'types/project.md': projectType,
    'types/item.md': itemType,
    'people/ada.md': ada,
    'work/alpha.md': alpha,
    'work/owned.md': owned,
    'notes/plain.md': plain,
  },
  revisions: {
    'types/person.md': 'rev-person-type',
    'types/project.md': 'rev-project-type',
    'types/item.md': 'rev-item-type',
    'people/ada.md': 'rev-ada',
    'work/alpha.md': 'rev-alpha',
    'work/owned.md': 'rev-owned',
    'notes/plain.md': 'rev-plain',
  },
};

const refusalText = 'UNIQUE_PROVIDER_REFUSAL_TEXT';

async function start(page: Page, rooms: unknown[], options: { discoveryIntervalMs?: number } = {}) {
  await page.goto('/');
  await page.evaluate(
    async ({ rooms, options }) => {
      const { createMdRuntime } = await import('@agentshouse/mdruntime');
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const controller = new AbortController();
      const adapter = createMemoryAdapter({ rooms: rooms as never });
      adapter.script('mutate', { kind: 'transport-uncertainty' });
      const runtime = createMdRuntime({
        adapter,
        requiredGuarantees: [],
        signal: controller.signal,
        discoveryIntervalMs: options.discoveryIntervalMs ?? 60_000,
      });
      window.viewFixture = {
        runtime,
        adapter,
        history: [],
        pendingHistory: [],
        historyFails: false,
        stop: () => controller.abort(),
      };
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

async function draftOf(page: Page, path: string): Promise<unknown> {
  return page.evaluate((path) => window.viewFixture.runtime.draft.read('studio', path), path);
}

async function queueOf(
  page: Page,
): Promise<
  { id: string; changes: Change[]; preconditions: ChangeBatch['preconditions']; kind: string }[]
> {
  return page.evaluate(() => {
    let entries: QueueEntry[] = [];
    const stop = window.viewFixture.runtime.observe('queue', 'studio', (value) => {
      entries = [...value];
    });
    stop();
    return entries.map((entry) => ({
      id: entry.batch.id,
      changes: [...entry.batch.changes],
      preconditions: [...entry.batch.preconditions],
      kind: entry.outcome.kind,
    }));
  });
}

function documentSave(page: Page) {
  return page
    .getByRole('region', { name: 'Document' })
    .getByRole('button', { name: 'Save', exact: true });
}

test('field edits write the Runtime Draft and Save one set-field change with the Query prior', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const before = await queried(page, 'work/alpha.md');
  expect(before.fields.title).toBe('Alpha');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Edited title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ fields: { title: 'Edited title' } });
  expect(await queueOf(page)).toEqual([]);
  expect((await queried(page, 'work/alpha.md')).fields.title).toBe('Alpha');
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const [batch] = await queueOf(page);
  expect(batch.changes).toEqual([
    { kind: 'field', path: 'work/alpha.md', name: 'title', value: 'Edited title' },
  ]);
  expect(batch.preconditions).toEqual([
    { kind: 'field', path: 'work/alpha.md', name: 'title', value: 'Alpha' },
  ]);
  expect(await draftOf(page, 'work/alpha.md')).toBeNull();
  expect((await queried(page, 'work/alpha.md')).fields.title).toBe('Edited title');
});

test('section and preamble editors Save into the Draft, cancel restores opened whitespace, and no Change Batch is created', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const before = await queried(page, 'work/alpha.md');
  const extra = before.sections.Extra;
  const preamble = before.preamble;
  expect(extra).toContain('An additional existing section.');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Kept title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  const extraEditor = page
    .getByRole('region', { name: 'Extra' })
    .getByRole('textbox', { name: 'Extra' });
  await expect(extraEditor).toHaveValue(extra!);
  await extraEditor.fill(`${extra}  \n`);
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Cancel Extra' })
    .click();
  expect(await queueOf(page)).toEqual([]);
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ fields: { title: 'Kept title' } });
  const draft = (await draftOf(page, 'work/alpha.md')) as { sections?: Record<string, string> };
  expect(draft.sections?.Extra).toBeUndefined();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Extra' }).getByRole('textbox', { name: 'Extra' }),
  ).toHaveValue(extra!);
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Cancel Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('button', { name: 'Edit Preamble' })
    .click();
  const preambleEditor = page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('textbox', { name: 'Preamble' });
  await expect(preambleEditor).toHaveValue(preamble);
  await preambleEditor.fill(`${preamble} trailing`);
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('button', { name: 'Save Preamble' })
    .click();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('textbox', { name: 'Extra' })
    .fill('Edited extra body');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Save Extra' })
    .click();
  expect(await queueOf(page)).toEqual([]);
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({
      fields: { title: 'Kept title' },
      preamble: `${preamble} trailing`,
      sections: { Extra: 'Edited extra body' },
    });
});

test('Save of an undeclared section and the preamble carries exact Query prior text', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const before = await queried(page, 'work/alpha.md');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('textbox', { name: 'Extra' })
    .fill('Replacement extra');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Save Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('button', { name: 'Edit Preamble' })
    .click();
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('textbox', { name: 'Preamble' })
    .fill('Replacement preamble');
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('button', { name: 'Save Preamble' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const [batch] = await queueOf(page);
  expect(batch.changes).toEqual([
    { kind: 'section', path: 'work/alpha.md', name: 'Extra', value: 'Replacement extra' },
    { kind: 'preamble', path: 'work/alpha.md', value: 'Replacement preamble' },
  ]);
  expect(batch.preconditions).toEqual([
    { kind: 'section', path: 'work/alpha.md', name: 'Extra', value: before.sections.Extra },
    { kind: 'preamble', path: 'work/alpha.md', value: before.preamble },
  ]);
});

test('reloading the view restores the Draft and a successful Save consumes it', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Durable title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ fields: { title: 'Durable title' } });
  await mount(page, 'people/ada.md');
  await page.getByRole('button', { name: 'work/alpha.md', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue(
    'Durable title',
  );
  await page.evaluate(() => window.viewFixture.stop());
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue(
    'Durable title',
  );
  expect(await draftOf(page, 'work/alpha.md')).toMatchObject({
    fields: { title: 'Durable title' },
  });
  await documentSave(page).click();
  await expect.poll(async () => draftOf(page, 'work/alpha.md')).toBeNull();
});

test('whole-text Save is one replace guarded by the file revision', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const replacement = `---
type: project
title: Rewritten
---

Whole file body.
`;
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await page.getByRole('region', { name: 'Whole text' }).getByRole('textbox').fill(replacement);
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Save Whole text' })
    .click();
  expect(await queueOf(page)).toEqual([]);
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const [batch] = await queueOf(page);
  expect(batch.changes).toEqual([{ kind: 'replace', path: 'work/alpha.md', content: replacement }]);
  expect(batch.preconditions).toEqual([
    { kind: 'revision', path: 'work/alpha.md', revision: 'rev-alpha' },
  ]);
});

test('a local validation failure names the rule at the control and keeps the Draft', async ({
  page,
}, testInfo) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const before = await queried(page, 'work/alpha.md');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('textbox', { name: 'Extra' })
    .fill('See [gone](../notes/missing.md).\n');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Save Extra' })
    .click();
  await documentSave(page).click();
  await expect(
    page.getByRole('region', { name: 'Extra' }).getByText('unresolved-link', { exact: true }),
  ).toBeVisible();
  expect(await queueOf(page)).toEqual([]);
  expect(await draftOf(page, 'work/alpha.md')).toMatchObject({
    sections: { Extra: 'See [gone](../notes/missing.md).\n' },
  });
  expect((await queried(page, 'work/alpha.md')).sections.Extra).toBe(before.sections.Extra);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('validation-360.png'), fullPage: true });
});

test('creating a typed file with empty required parts then a valid Save uses create', async ({
  page,
}) => {
  await start(page, [studio]);
  await page.evaluate(async () => {
    const view = document.createElement('md-document-view') as DocumentViewElement;
    await view.create(window.viewFixture.runtime, 'studio', 'work/created.md', 'item');
    document.body.replaceChildren(view);
  });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('');
  await documentSave(page).click();
  await expect(page.getByText(/required-field|required-section/)).toBeVisible();
  expect(await queueOf(page)).toEqual([]);
  expect(await draftOf(page, 'work/created.md')).toMatchObject({ create: { type: 'item' } });
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Created');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await page
    .getByRole('region', { name: 'Body' })
    .getByRole('button', { name: 'Edit Body' })
    .click();
  await page
    .getByRole('region', { name: 'Body' })
    .getByRole('textbox', { name: 'Body' })
    .fill('Body text');
  await page
    .getByRole('region', { name: 'Body' })
    .getByRole('button', { name: 'Save Body' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const [batch] = await queueOf(page);
  expect(batch.changes[0]).toMatchObject({
    kind: 'create',
    path: 'work/created.md',
    fields: expect.objectContaining({ type: 'item', title: 'Created' }),
  });
  expect((batch.changes[0] as { sections: Record<string, string> }).sections.Body).toBe(
    'Body text',
  );
  expect(batch.preconditions).toEqual([{ kind: 'absent', path: 'work/created.md' }]);
  expect(await draftOf(page, 'work/created.md')).toBeNull();
});

test('rename, move, and refused removal list every referring location as a link', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'Rename', exact: true }).fill('work/moved/alpha.md');
  await page.getByRole('textbox', { name: 'Rename', exact: true }).blur();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const [moved] = await queueOf(page);
  expect(
    moved.changes.some((change) => change.kind === 'move' && change.to === 'work/moved/alpha.md'),
  ).toBe(true);
  await mount(page, 'people/ada.md');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('referenced-missing-file', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('navigation', { name: 'Referring locations' }).getByRole('button', {
      name: 'work/moved/alpha.md',
      exact: true,
    }),
  ).toBeVisible();
  expect(
    (await queueOf(page)).some((entry) => entry.changes.some((change) => change.kind === 'move')),
  ).toBe(true);
  expect(
    (await queueOf(page)).some((entry) => entry.changes.some((change) => change.kind === 'remove')),
  ).toBe(false);
  await page
    .getByRole('navigation', { name: 'Referring locations' })
    .getByRole('button', { name: 'work/moved/alpha.md', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Alpha');
});

test('Conflicted head restores App Creator values, marks Provider current parts, Save replaces, discard removes', async ({
  page,
}, testInfo) => {
  await start(page, [studio], { discoveryIntervalMs: 80 });
  await page.evaluate(
    ({ text, content }) => {
      let first = true;
      window.viewFixture.adapter.script('mutate', () => {
        if (first) {
          first = false;
          return {
            kind: 'conflicted' as const,
            roomVersion: 'v2',
            affected: { 'work/alpha.md': content },
            text,
          };
        }
        return { kind: 'transport-uncertainty' as const };
      });
    },
    { text: refusalText, content: providerAlpha },
  );
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('App Creator title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('button', { name: 'Edit Preamble' })
    .click();
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('textbox', { name: 'Preamble' })
    .fill('App Creator preamble');
  await page
    .getByRole('region', { name: 'Preamble' })
    .getByRole('button', { name: 'Save Preamble' })
    .click();
  await page
    .getByRole('region', { name: 'Summary' })
    .getByRole('button', { name: 'Edit Summary' })
    .click();
  await page
    .getByRole('region', { name: 'Summary' })
    .getByRole('textbox', { name: 'Summary' })
    .fill('App Creator summary');
  await page
    .getByRole('region', { name: 'Summary' })
    .getByRole('button', { name: 'Save Summary' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page))[0]?.kind).toBe('conflicted');
  await page.evaluate(
    (room) => {
      window.viewFixture.adapter.setRooms([room as never]);
    },
    {
      ...studio,
      roomVersion: 'v2',
      documents: { ...studio.documents, 'work/alpha.md': providerAlpha },
    },
  );
  await expect
    .poll(async () => (await queried(page, 'work/alpha.md')).fields.title)
    .toBe('Provider title');
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue(
    'App Creator title',
  );
  const visible = await queried(page, 'work/alpha.md');
  expect(visible.fields.title).toBe('Provider title');
  await expect(page.getByText(`Current value: ${visible.fields.title}`)).toBeVisible();
  await expect(page.getByText(`Current value: ${visible.sections.Summary}`)).toBeVisible();
  await expect(page.getByText(`Current value: ${visible.preamble}`)).toBeVisible();
  await expect(page.getByText(refusalText, { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 900 });
  await page.screenshot({ path: testInfo.outputPath('conflict-360.png'), fullPage: true });
  const head = (await queueOf(page))[0].id;
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page))[0]?.id !== head).toBe(true);
  expect((await queueOf(page))[0].kind).toBe('pending');
  await page.evaluate(
    ({ text, content }) => {
      window.viewFixture.adapter.script('mutate', {
        kind: 'rejected',
        affected: { 'work/alpha.md': content },
        text,
      });
    },
    { text: refusalText, content: providerAlpha },
  );
  await expect.poll(async () => (await queueOf(page))[0]?.kind).toBe('rejected');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(0);
});

test('a file without a write grant and a Provider-owned Path show no editing control', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'notes/plain.md');
  await expect(page.getByText('This Path has no write grant.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await mount(page, 'work/owned.md');
  await expect(page.getByText('This Path is Provider-owned.', { exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit title' })).toHaveCount(0);
});

test('list fields Save as one value and editing stays keyboard operable at 360 pixels', async ({
  page,
}, testInfo) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'tags 1', exact: true }).fill('core');
  await page.getByRole('textbox', { name: 'tags 2', exact: true }).fill('edited');
  await page.getByRole('textbox', { name: 'tags 2', exact: true }).blur();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  expect((await queueOf(page))[0].changes).toEqual([
    { kind: 'field', path: 'work/alpha.md', name: 'tags', value: ['core', 'edited'] },
  ]);
  await page.setViewportSize({ width: 360, height: 900 });
  await page.keyboard.press('Tab');
  const save = documentSave(page);
  await save.focus();
  await expect(save).toBeFocused();
  expect(await save.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('solid');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.screenshot({ path: testInfo.outputPath('editing-360-light.png'), fullPage: true });
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.screenshot({ path: testInfo.outputPath('editing-360-dark.png'), fullPage: true });
});
