import { expect, test, type Page } from '@playwright/test';
import type {
  Change,
  ChangeBatch,
  HistoryResult,
  MdRuntime,
  MutationRequest,
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
      submissions?: MutationRequest[];
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
const completeMarkdown = `---
type:   project
title:  Alpha
amount: 12.5
due: 2026-09-09
stage: Ready
owner: ../people/ada.md
tags: [core, ui]
---

Opening words before any heading.\t${'  '}
café — 漢字

## Extra

An additional existing section.

## Summary

The declared summary.

## Steps

- first
- second
`;
const crlfMarkdown = completeMarkdown.replaceAll('\n', '\r\n');
const crlfNoNewline = crlfMarkdown.endsWith('\r\n') ? crlfMarkdown.slice(0, -2) : crlfMarkdown;
const untypedMany = `# One

First body with a blank line.

## Two

Second body.
`;
const userWhole = `---
type: project
title: App Creator whole
---

App Creator complete Markdown.

## Extra

Kept extra.

## Summary

App Creator summary.

## Steps

- first
- second
`;
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
    'people/bob.md': '---\ntype: person\nname: Bob\n---\n',
    'work/alpha.md': alpha,
    'work/owned.md': owned,
    'notes/plain.md': plain,
  },
  revisions: {
    'types/person.md': 'rev-person-type',
    'types/project.md': 'rev-project-type',
    'types/item.md': 'rev-item-type',
    'people/ada.md': 'rev-ada',
    'people/bob.md': 'rev-bob',
    'work/alpha.md': 'rev-alpha',
    'work/owned.md': 'rev-owned',
    'notes/plain.md': 'rev-plain',
  },
};

const refusalText = 'UNIQUE_PROVIDER_REFUSAL_TEXT';

async function start(
  page: Page,
  rooms: unknown[],
  options: {
    discoveryIntervalMs?: number;
    providerLimits?: { name: string; value?: number }[];
  } = {},
) {
  await page.goto('/');
  await page.evaluate(
    async ({ rooms, options }) => {
      const { createMdRuntime } = await import('@agentshouse/mdruntime');
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const controller = new AbortController();
      const adapter = createMemoryAdapter({
        rooms: rooms as never,
        ...(options.providerLimits === undefined
          ? {}
          : { providerLimits: options.providerLimits as never }),
      });
      const submissions: MutationRequest[] = [];
      adapter.script('mutate', (request: MutationRequest) => {
        submissions.push(request);
        return { kind: 'transport-uncertainty' };
      });
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
        submissions,
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

async function submittedBatches(page: Page): Promise<ChangeBatch[]> {
  return page.evaluate(() =>
    (window.viewFixture.submissions ?? []).map((entry) => entry.changeBatch),
  );
}

function documentSave(page: Page) {
  return page
    .getByRole('region', { name: 'Document' })
    .getByRole('button', { name: 'Save', exact: true });
}

function roomWith(
  documents: Record<string, string>,
  revisions: Record<string, string>,
  writeGrants = studio.writeGrants,
) {
  return {
    ...studio,
    writeGrants,
    documents: { ...studio.documents, ...documents },
    revisions: { ...studio.revisions, ...revisions },
  };
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

test('unsaved section textarea persists in the Runtime Draft across remount', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('textbox', { name: 'Extra' })
    .fill('Unsaved extra body');
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ sections: { Extra: 'Unsaved extra body' } });
  expect(await queueOf(page)).toEqual([]);
  await mount(page, 'work/alpha.md');
  await expect(page.getByRole('region', { name: 'Extra' })).toContainText('Unsaved extra body');
  expect(await draftOf(page, 'work/alpha.md')).toMatchObject({
    sections: { Extra: 'Unsaved extra body' },
  });
});

test('switching section editors keeps each part and does not copy the previous textarea', async ({
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
    .fill('Extra in progress');
  await page
    .getByRole('region', { name: 'Summary' })
    .getByRole('button', { name: 'Edit Summary' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Summary' }).getByRole('textbox', { name: 'Summary' }),
  ).toHaveValue(before.sections.Summary);
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ sections: { Extra: 'Extra in progress' } });
  const draft = (await draftOf(page, 'work/alpha.md')) as { sections?: Record<string, string> };
  expect(draft.sections?.Summary).toBeUndefined();
});

test('a reference field Save stores the Path relative to the file', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page.getByRole('combobox', { name: 'owner', exact: true }).selectOption('people/bob.md');
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  expect((await queueOf(page))[0].changes).toEqual([
    { kind: 'field', path: 'work/alpha.md', name: 'owner', value: '../people/bob.md' },
  ]);
});

test('Conflicted marks only Provider-changed parts including ones the App Creator did not edit', async ({
  page,
}) => {
  await start(page, [studio], { discoveryIntervalMs: 80 });
  await page.evaluate(
    ({ text, content }) => {
      window.viewFixture.adapter.script('mutate', {
        kind: 'conflicted' as const,
        roomVersion: 'v2',
        affected: { 'work/alpha.md': content },
        text,
      });
    },
    { text: refusalText, content: providerAlpha },
  );
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('App Creator title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
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
  await expect(
    page.getByRole('region', { name: 'Fields' }).getByText('Current value: Provider title'),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Summary' }).getByText('Current value:', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Preamble' }).getByText('Current value:', { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Extra' }).getByText('Current value:', { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('region', { name: 'Steps' }).getByText('Current value:', { exact: false }),
  ).toHaveCount(0);
});

test('revoking the write grant while a section editor is open removes editing controls', async ({
  page,
}) => {
  await start(page, [studio], { discoveryIntervalMs: 80 });
  await mount(page, 'work/alpha.md');
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await expect(
    page.getByRole('region', { name: 'Extra' }).getByRole('textbox', { name: 'Extra' }),
  ).toBeVisible();
  await page.evaluate(
    (room) => {
      window.viewFixture.adapter.setRooms([room as never]);
    },
    { ...studio, writeGrants: ['./people'] },
  );
  await expect
    .poll(async () => page.getByText('This Path has no write grant.', { exact: true }).count())
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Extra' })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toBeDisabled();
});

test('whole-text Save includes a pending rename as a move', async ({ page }) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  const replacement = `---
type: project
title: Rewritten
---

Whole file body.
`;
  await page.getByRole('textbox', { name: 'Rename', exact: true }).fill('work/rewritten.md');
  await page.getByRole('textbox', { name: 'Rename', exact: true }).blur();
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await page.getByRole('region', { name: 'Whole text' }).getByRole('textbox').fill(replacement);
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Save Whole text' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  expect((await queueOf(page))[0].changes).toEqual([
    { kind: 'replace', path: 'work/alpha.md', content: replacement },
    { kind: 'move', path: 'work/alpha.md', to: 'work/rewritten.md' },
  ]);
});

test('a section named Preamble Saves as replace-section not preamble', async ({ page }) => {
  const named = `---
type: project
title: Named
---

Document preamble text.

## Preamble

This is a section named Preamble.
`;
  await start(page, [
    {
      ...studio,
      documents: { ...studio.documents, 'work/named.md': named },
      revisions: { ...studio.revisions, 'work/named.md': 'rev-named' },
    },
  ]);
  await mount(page, 'work/named.md');
  const before = await queried(page, 'work/named.md');
  expect(before.preamble).toContain('Document preamble text.');
  expect(before.sections.Preamble).toContain('This is a section named Preamble.');
  await page
    .getByRole('region', { name: 'Preamble' })
    .nth(1)
    .getByRole('button', { name: 'Edit Preamble' })
    .click();
  const sectionEditor = page
    .getByRole('region', { name: 'Preamble' })
    .nth(1)
    .getByRole('textbox', { name: 'Preamble' });
  await expect(sectionEditor).toHaveValue(before.sections.Preamble);
  await sectionEditor.fill('Replacement section named Preamble');
  await page
    .getByRole('region', { name: 'Preamble' })
    .nth(1)
    .getByRole('button', { name: 'Save Preamble' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const [batch] = await queueOf(page);
  expect(batch.changes).toEqual([
    {
      kind: 'section',
      path: 'work/named.md',
      name: 'Preamble',
      value: 'Replacement section named Preamble',
    },
  ]);
  expect(batch.preconditions).toEqual([
    { kind: 'section', path: 'work/named.md', name: 'Preamble', value: before.sections.Preamble },
  ]);
});

test('a document-size Provider limit names the rule on the Document when no part matches', async ({
  page,
}) => {
  await start(page, [studio], { providerLimits: [{ name: 'document-size', value: 1 }] });
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Too large');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await documentSave(page).click();
  await expect(
    page.getByRole('region', { name: 'Document' }).getByText('provider-limit', { exact: true }),
  ).toBeVisible();
  expect(await queueOf(page)).toEqual([]);
  expect(await draftOf(page, 'work/alpha.md')).toMatchObject({ fields: { title: 'Too large' } });
});

test('a newer Draft keeps its values and restores refused parts it does not already carry', async ({
  page,
}) => {
  await start(page, [studio], { discoveryIntervalMs: 80 });
  await page.evaluate(
    ({ text, content }) => {
      window.viewFixture.adapter.script('mutate', {
        kind: 'conflicted' as const,
        roomVersion: 'v2',
        affected: { 'work/alpha.md': content },
        text,
      });
    },
    { text: refusalText, content: providerAlpha },
  );
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Refused title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page))[0]?.kind).toBe('conflicted');
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ fields: { title: 'Refused title' } });
  await page.evaluate(async () => {
    await window.viewFixture.runtime.draft.replace('studio', 'work/alpha.md', {
      sections: { Extra: 'Newer extra' },
    });
  });
  await mount(page, 'work/alpha.md');
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue(
    'Refused title',
  );
  await expect(page.getByRole('region', { name: 'Extra' })).toContainText('Newer extra');
  expect(await draftOf(page, 'work/alpha.md')).toMatchObject({
    fields: { title: 'Refused title' },
    sections: { Extra: 'Newer extra' },
  });
});

test('an untyped whole-text Draft is restored instead of the current preamble', async ({
  page,
}) => {
  await start(page, [{ ...studio, writeGrants: ['./work', './people', './notes'] }]);
  await mount(page, 'notes/plain.md');
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('button', { name: 'Edit Document' })
    .click();
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('textbox', { name: 'Document' })
    .fill('Rewritten untyped whole');
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('button', { name: 'Save Document' })
    .click();
  await expect
    .poll(async () => draftOf(page, 'notes/plain.md'))
    .toMatchObject({ whole: 'Rewritten untyped whole' });
  await mount(page, 'notes/plain.md');
  await expect(page.getByRole('region', { name: 'Document' }).nth(1)).toContainText(
    'Rewritten untyped whole',
  );
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('button', { name: 'Edit Document' })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Document' })
      .nth(1)
      .getByRole('textbox', { name: 'Document' }),
  ).toHaveValue('Rewritten untyped whole');
});

test('a refused removal does not keep remove in the Draft over a later field Save', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'people/ada.md');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('referenced-missing-file', { exact: true })).toBeVisible();
  await page.getByRole('textbox', { name: 'name', exact: true }).fill('Ada Lovelace');
  await page.getByRole('textbox', { name: 'name', exact: true }).blur();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  expect((await queueOf(page))[0].changes).toEqual([
    { kind: 'field', path: 'people/ada.md', name: 'name', value: 'Ada Lovelace' },
  ]);
});

test('whole-text editor opens the complete Markdown from Query', async ({ page }, testInfo) => {
  await start(page, [
    roomWith({ 'work/complete.md': completeMarkdown }, { 'work/complete.md': 'rev-complete' }),
  ]);
  await mount(page, 'work/complete.md');
  expect((await queried(page, 'work/complete.md')).content).toBe(completeMarkdown);
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Whole text' }).getByRole('textbox');
  await expect(editor).toHaveValue(completeMarkdown);
  await page.screenshot({
    path: testInfo.outputPath('whole-text-before-fill.png'),
    fullPage: true,
  });
  expect(await editor.inputValue()).toBe(completeMarkdown);
  expect(await queueOf(page)).toEqual([]);
});

test('untyped whole-text is complete and restores a Draft including empty text without editor Save', async ({
  page,
}) => {
  const room = roomWith({ 'notes/many.md': untypedMany }, { 'notes/many.md': 'rev-many' }, [
    './work',
    './people',
    './notes',
  ]);
  await start(page, [room]);
  await mount(page, 'notes/many.md');
  expect((await queried(page, 'notes/many.md')).content).toBe(untypedMany);
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('button', { name: 'Edit Document' })
    .click();
  const editor = page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('textbox', { name: 'Document' });
  await expect(editor).toHaveValue(untypedMany);
  await editor.fill('typed whole draft');
  await expect
    .poll(async () => draftOf(page, 'notes/many.md'))
    .toMatchObject({ whole: 'typed whole draft' });
  expect(await queueOf(page)).toEqual([]);
  expect((await queried(page, 'notes/many.md')).content).toBe(untypedMany);
  await mount(page, 'work/alpha.md');
  await mount(page, 'notes/many.md');
  await expect(page.getByRole('region', { name: 'Document' }).nth(1)).toContainText(
    'typed whole draft',
  );
  await page.evaluate(() => window.viewFixture.stop());
  await start(page, [room]);
  await mount(page, 'notes/many.md');
  await expect(page.getByRole('region', { name: 'Document' }).nth(1)).toContainText(
    'typed whole draft',
  );
  expect(await draftOf(page, 'notes/many.md')).toMatchObject({ whole: 'typed whole draft' });
  expect((await queried(page, 'notes/many.md')).content).toBe(untypedMany);
  expect(await queueOf(page)).toEqual([]);
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('button', { name: 'Edit Document' })
    .click();
  const restored = page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('textbox', { name: 'Document' });
  await expect(restored).toHaveValue('typed whole draft');
  await restored.fill('');
  await expect.poll(async () => draftOf(page, 'notes/many.md')).toEqual({ whole: '' });
  await mount(page, 'notes/many.md');
  await page
    .getByRole('region', { name: 'Document' })
    .nth(1)
    .getByRole('button', { name: 'Edit Document' })
    .click();
  await expect(
    page
      .getByRole('region', { name: 'Document' })
      .nth(1)
      .getByRole('textbox', { name: 'Document' }),
  ).toHaveValue('');
  expect((await queried(page, 'notes/many.md')).content).toBe(untypedMany);
  expect(await queueOf(page)).toEqual([]);
});

test('whole-text cancel restores opened Draft presence and does not manufacture a replacement', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('Kept title');
  await page.getByRole('textbox', { name: 'title', exact: true }).blur();
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Whole text' }).getByRole('textbox');
  await expect(editor).toHaveValue(alpha);
  await editor.fill('accidental whole');
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Cancel Whole text' })
    .click();
  expect(await queueOf(page)).toEqual([]);
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ fields: { title: 'Kept title' } });
  const afterCancel = (await draftOf(page, 'work/alpha.md')) as { whole?: string };
  expect(afterCancel.whole).toBeUndefined();
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Whole text' }).getByRole('textbox')).toHaveValue(
    alpha,
  );
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Cancel Whole text' })
    .click();
  expect(await draftOf(page, 'work/alpha.md')).toMatchObject({ fields: { title: 'Kept title' } });
  expect(((await draftOf(page, 'work/alpha.md')) as { whole?: string }).whole).toBeUndefined();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  expect((await queueOf(page))[0].changes.some((change) => change.kind === 'replace')).toBe(false);
  expect((await queueOf(page))[0].changes).toEqual([
    { kind: 'field', path: 'work/alpha.md', name: 'title', value: 'Kept title' },
  ]);
});

test('whole-text cancel restores an explicit empty Draft and switching does not copy another editor', async ({
  page,
}) => {
  await start(page, [studio]);
  await mount(page, 'work/alpha.md');
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  const whole = page.getByRole('region', { name: 'Whole text' }).getByRole('textbox');
  await whole.fill('');
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Save Whole text' })
    .click();
  await expect.poll(async () => draftOf(page, 'work/alpha.md')).toEqual({ whole: '' });
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Whole text' }).getByRole('textbox')).toHaveValue(
    '',
  );
  await page.getByRole('region', { name: 'Whole text' }).getByRole('textbox').fill('not empty');
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Cancel Whole text' })
    .click();
  await expect.poll(async () => draftOf(page, 'work/alpha.md')).toEqual({ whole: '' });
  expect(await queueOf(page)).toEqual([]);
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('button', { name: 'Edit Extra' })
    .click();
  await page
    .getByRole('region', { name: 'Extra' })
    .getByRole('textbox', { name: 'Extra' })
    .fill('Extra in progress');
  await expect
    .poll(async () => draftOf(page, 'work/alpha.md'))
    .toMatchObject({ whole: '', sections: { Extra: 'Extra in progress' } });
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Whole text' }).getByRole('textbox')).toHaveValue(
    '',
  );
  const switched = (await draftOf(page, 'work/alpha.md')) as {
    whole?: string;
    sections?: Record<string, string>;
  };
  expect(switched.whole).toBe('');
  expect(switched.sections?.Extra).toBe('Extra in progress');
});

test('bounded whole-text edit Saves the exact replacement at queue and Adapter with Query overlay', async ({
  page,
}) => {
  await start(page, [
    roomWith({ 'work/complete.md': completeMarkdown }, { 'work/complete.md': 'rev-complete' }),
  ]);
  await mount(page, 'work/complete.md');
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Whole text' }).getByRole('textbox');
  await expect(editor).toHaveValue(completeMarkdown);
  const displayed = await editor.inputValue();
  const edited = displayed.replace('The declared summary.', 'Edited summary.');
  expect(edited).not.toBe(displayed);
  await editor.fill(edited);
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Save Whole text' })
    .click();
  expect(await queueOf(page)).toEqual([]);
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const expected = completeMarkdown.replace('The declared summary.', 'Edited summary.');
  const [batch] = await queueOf(page);
  expect(batch.changes).toEqual([{ kind: 'replace', path: 'work/complete.md', content: expected }]);
  expect(batch.preconditions).toEqual([
    { kind: 'revision', path: 'work/complete.md', revision: 'rev-complete' },
  ]);
  const submitted = await submittedBatches(page);
  expect(submitted.at(-1)?.changes).toEqual(batch.changes);
  expect(submitted.at(-1)?.preconditions).toEqual(batch.preconditions);
  expect((await queried(page, 'work/complete.md')).content).toBe(expected);
  expect(await draftOf(page, 'work/complete.md')).toBeNull();
});

test('whole-text preserves CRLF and a missing final newline through cancel and Save', async ({
  page,
}) => {
  await start(page, [roomWith({ 'work/crlf.md': crlfNoNewline }, { 'work/crlf.md': 'rev-crlf' })]);
  await mount(page, 'work/crlf.md');
  expect((await queried(page, 'work/crlf.md')).content).toBe(crlfNoNewline);
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Whole text' }).getByRole('textbox');
  await expect(editor).toHaveValue(crlfNoNewline.replaceAll('\r\n', '\n'));
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Cancel Whole text' })
    .click();
  expect(await draftOf(page, 'work/crlf.md')).toBeNull();
  expect((await queried(page, 'work/crlf.md')).content).toBe(crlfNoNewline);
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  const displayed = await editor.inputValue();
  const edited = displayed.replace('The declared summary.', 'Edited summary.');
  await editor.fill(edited);
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Save Whole text' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(1);
  const expected = crlfNoNewline.replace('The declared summary.', 'Edited summary.');
  expect(expected.includes('\r\n')).toBe(true);
  expect(expected.endsWith('\n')).toBe(false);
  const [batch] = await queueOf(page);
  expect(batch.changes).toEqual([{ kind: 'replace', path: 'work/crlf.md', content: expected }]);
  expect(batch.preconditions).toEqual([
    { kind: 'revision', path: 'work/crlf.md', revision: 'rev-crlf' },
  ]);
  expect((await submittedBatches(page)).at(-1)?.changes).toEqual(batch.changes);
  expect((await queried(page, 'work/crlf.md')).content).toBe(expected);
});

test('Conflicted whole replacement restores exact Markdown and shows affected Provider text', async ({
  page,
}) => {
  await start(page, [studio], { discoveryIntervalMs: 80 });
  await page.evaluate(
    ({ text, content }) => {
      let first = true;
      window.viewFixture.adapter.script('mutate', (request: MutationRequest) => {
        window.viewFixture.submissions?.push(request);
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
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Whole text' }).getByRole('textbox')).toHaveValue(
    alpha,
  );
  await page.getByRole('region', { name: 'Whole text' }).getByRole('textbox').fill(userWhole);
  await page
    .getByRole('region', { name: 'Whole text' })
    .getByRole('button', { name: 'Save Whole text' })
    .click();
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page))[0]?.kind).toBe('conflicted');
  await expect.poll(async () => draftOf(page, 'work/alpha.md')).toEqual({ whole: userWhole });
  await expect(page.getByText(refusalText, { exact: true })).toBeVisible();
  await expect(page.getByText(providerAlpha, { exact: true })).toBeVisible();
  expect((await queried(page, 'work/alpha.md')).content).not.toBe(providerAlpha);
  const submitted = (await submittedBatches(page)).at(-1);
  expect(submitted?.changes).toEqual([
    { kind: 'replace', path: 'work/alpha.md', content: userWhole },
  ]);
  const head = (await queueOf(page))[0].id;
  await documentSave(page).click();
  await expect.poll(async () => (await queueOf(page))[0]?.id !== head).toBe(true);
  expect((await queueOf(page))[0].kind).toBe('pending');
  await page.evaluate(
    ({ text, content }) => {
      window.viewFixture.adapter.script('mutate', (request: MutationRequest) => {
        window.viewFixture.submissions?.push(request);
        return {
          kind: 'rejected' as const,
          affected: { 'work/alpha.md': content },
          text,
        };
      });
    },
    { text: refusalText, content: providerAlpha },
  );
  await expect.poll(async () => (await queueOf(page))[0]?.kind).toBe('rejected');
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect.poll(async () => (await queueOf(page)).length).toBe(0);
  expect(await draftOf(page, 'work/alpha.md')).toBeNull();
});

test('revoking the write grant while whole-text editor is open removes editing controls', async ({
  page,
}) => {
  await start(page, [studio], { discoveryIntervalMs: 80 });
  await mount(page, 'work/alpha.md');
  await page.getByRole('button', { name: 'Edit whole text', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Whole text' }).getByRole('textbox')).toBeVisible();
  await page.evaluate(
    (room) => {
      window.viewFixture.adapter.setRooms([room as never]);
    },
    { ...studio, writeGrants: ['./people'] },
  );
  await expect
    .poll(async () => page.getByText('This Path has no write grant.', { exact: true }).count())
    .toBe(1);
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Whole text' }).getByRole('textbox')).toHaveCount(
    0,
  );
});
