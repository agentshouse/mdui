import { expect, test, type Page } from '@playwright/test';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

type DocumentViewElement = HTMLElement & {
  bind: (runtime: MdRuntimeClient, room: string, path: string) => void;
  create: (runtime: MdRuntimeClient, room: string, path: string, type: string) => Promise<void>;
};

declare global {
  interface Window {
    viewEditingFixture: {
      runtime: MdRuntimeClient;
      adapter: MemoryAdapter;
      stop: () => void;
    };
    releaseViewCollision?: () => void;
  }
}

const noteType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  owner:\n    kind: reference\n    to: person\n  tags:\n    kind: list\n    of: string\nsections:\n  Body:\n    kind: text\n---\n';
const personType =
  '---\ntype: definition\nfields:\n  name:\n    kind: string\n    required: true\n---\n';
const note =
  '---\ntype: note\ntitle: Original\nowner: ../people/ada.md\ntags: [one, two]\n---\nOpening.\n\n## Body\nOriginal body.\n';
const plain = '# Plain\n\nOriginal whole text.\n';

const studio = {
  name: 'Studio',
  locator: 'studio',
  roomVersion: 'v1',
  writeGrants: ['notes', 'work', 'people'],
  providerOwnedPaths: [],
  documents: {
    'types/note.md': noteType,
    'types/person.md': personType,
    'notes/one.md': note,
    'notes/plain.md': plain,
    'people/ada.md': '---\ntype: person\nname: Ada\n---\n',
    'people/bob.md': '---\ntype: person\nname: Bob\n---\n',
  },
  revisions: {
    'types/note.md': 'rev-type',
    'types/person.md': 'rev-person-type',
    'notes/one.md': 'rev-one',
    'notes/plain.md': 'rev-plain',
    'people/ada.md': 'rev-ada',
    'people/bob.md': 'rev-bob',
  },
};

async function start(page: Page, discoveryIntervalMs = 60_000): Promise<void> {
  await page.goto('/');
  await page.evaluate(
    async ({ room, discoveryIntervalMs }) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
      const adapter = createMemoryAdapter({ rooms: [fixtureRoom(room)] });
      adapter.script('mutate', { kind: 'transport-uncertainty' });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        discoveryIntervalMs,
      });
      window.viewEditingFixture = { runtime: opened.runtime, adapter, stop: opened.stop };
      await waitForRooms(opened.runtime, (rooms: readonly { roomVersion: string | null }[]) =>
        rooms.some(({ roomVersion }) => roomVersion !== null),
      );
    },
    { room: studio, discoveryIntervalMs },
  );
}

async function mount(page: Page, path: string): Promise<void> {
  await page.evaluate((path) => {
    const view = document.createElement('md-document-view') as DocumentViewElement;
    view.bind(window.viewEditingFixture.runtime, 'studio', path);
    document.body.replaceChildren(view);
  }, path);
}

async function draftParts(page: Page, path: string): Promise<unknown> {
  return page.evaluate(
    async (path) =>
      (await window.viewEditingFixture.runtime.roomDraft.read('studio', path))?.parts ?? null,
    path,
  );
}

async function queueEntries(page: Page): Promise<unknown[]> {
  return page.evaluate(async () => {
    const handle = await window.viewEditingFixture.runtime.observe('queue', 'studio');
    const entries = [...handle.current()];
    handle.close();
    return entries;
  });
}

function documentSave(page: Page) {
  return page
    .getByRole('region', { name: 'Document' })
    .getByRole('button', { name: 'Save', exact: true });
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.viewEditingFixture?.stop());
});

test('field editing writes a Room Draft with the visible Query value as its base', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/one.md');
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await expect(title).toHaveValue('Original');
  await title.fill('App Creator title');
  await title.press('Tab');
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      fields: {
        title: { value: 'App Creator title', base: { value: 'Original' } },
      },
    });
  await expect(title).toHaveValue('App Creator title');
});

test('a stale Room Draft write shows the current draft and never retries over it', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const runtime = window.viewEditingFixture.runtime;
    let collide = true;
    const collision = new Promise<void>((resolve) => {
      window.releaseViewCollision = resolve;
    });
    const proxy = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property === 'roomDraft') {
          return new Proxy(target.roomDraft, {
            get(surface, name, surfaceReceiver) {
              if (name === 'write') {
                return async (
                  room: string,
                  path: string,
                  revision: string | null,
                  parts: unknown,
                ) => {
                  if (collide) {
                    collide = false;
                    await target.roomDraft.write(room, path, revision, {
                      fields: { title: { value: 'Other tab', base: { value: 'Original' } } },
                    });
                    await collision;
                  }
                  return target.roomDraft.write(room, path, revision, parts as never);
                };
              }
              const value = Reflect.get(surface, name, surfaceReceiver);
              return typeof value === 'function' ? value.bind(surface) : value;
            },
          });
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const view = document.createElement('md-document-view') as DocumentViewElement;
    view.bind(proxy, 'studio', 'notes/one.md');
    document.body.replaceChildren(view);
  });
  await page.getByRole('textbox', { name: 'title', exact: true }).fill('This tab');
  await documentSave(page).click();
  await page.evaluate(() => {
    window.releaseViewCollision?.();
    delete window.releaseViewCollision;
  });
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      fields: { title: { value: 'Other tab', base: { value: 'Original' } } },
    });
  await expect.poll(() => queueEntries(page)).toEqual([]);
  await expect(page.getByRole('region', { name: 'Document' }).getByText('stale')).toBeVisible();
  await documentSave(page).click();
  await expect.poll(() => draftParts(page, 'notes/one.md')).toBeNull();
  await expect
    .poll(() => queueEntries(page))
    .toMatchObject([
      {
        batch: {
          changes: [{ kind: 'field', path: 'notes/one.md', name: 'title', value: 'Other tab' }],
        },
      },
    ]);
});

test('Remove stops when its Room Draft write is stale', async ({ page }) => {
  await start(page);
  await page.evaluate(() => {
    const runtime = window.viewEditingFixture.runtime;
    let collide = true;
    const proxy = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property === 'roomDraft') {
          return new Proxy(target.roomDraft, {
            get(surface, name, surfaceReceiver) {
              if (name === 'write') {
                return async (
                  room: string,
                  path: string,
                  revision: string | null,
                  parts: unknown,
                ) => {
                  if (collide) {
                    collide = false;
                    await target.roomDraft.write(room, path, revision, {
                      fields: { title: { value: 'Other tab', base: { value: 'Original' } } },
                    });
                  }
                  return target.roomDraft.write(room, path, revision, parts as never);
                };
              }
              const value = Reflect.get(surface, name, surfaceReceiver);
              return typeof value === 'function' ? value.bind(surface) : value;
            },
          });
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const view = document.createElement('md-document-view') as DocumentViewElement;
    view.bind(proxy, 'studio', 'notes/one.md');
    document.body.replaceChildren(view);
  });
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      fields: { title: { value: 'Other tab', base: { value: 'Original' } } },
    });
  await expect.poll(() => queueEntries(page)).toEqual([]);
  await expect(page.getByRole('region', { name: 'Document' }).getByText('stale')).toBeVisible();
});

test('a stale Room Draft discard keeps the other tab draft', async ({ page }) => {
  await start(page);
  await mount(page, 'notes/one.md');
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('First tab');
  await title.press('Tab');
  await expect.poll(() => draftParts(page, 'notes/one.md')).not.toBeNull();
  await page.evaluate(() => {
    const runtime = window.viewEditingFixture.runtime;
    let collide = true;
    const proxy = new Proxy(runtime, {
      get(target, property, receiver) {
        if (property === 'roomDraft') {
          return new Proxy(target.roomDraft, {
            get(surface, name, surfaceReceiver) {
              if (name === 'discard') {
                return async (room: string, path: string, revision: string) => {
                  if (collide) {
                    collide = false;
                    const current = await target.roomDraft.read(room, path);
                    if (current === null) throw new Error('Room Draft missing');
                    await target.roomDraft.write(room, path, current.revision, {
                      fields: { title: { value: 'Other tab', base: { value: 'Original' } } },
                    });
                  }
                  return target.roomDraft.discard(room, path, revision);
                };
              }
              const value = Reflect.get(surface, name, surfaceReceiver);
              return typeof value === 'function' ? value.bind(surface) : value;
            },
          });
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    const view = document.createElement('md-document-view') as DocumentViewElement;
    view.bind(proxy, 'studio', 'notes/one.md');
    document.body.replaceChildren(view);
  });
  await page.getByRole('button', { name: 'Discard', exact: true }).click();
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      fields: { title: { value: 'Other tab', base: { value: 'Original' } } },
    });
  await expect(page.getByRole('region', { name: 'Document' }).getByText('stale')).toBeVisible();
});

test('section input persists through Room Drafts and Cancel discards a newly opened edit', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/one.md');
  await page.getByRole('button', { name: 'Edit Body' }).click();
  const body = page.getByRole('textbox', { name: 'Body', exact: true });
  await body.fill('Draft body from the App Creator.');
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      sections: {
        Body: { value: 'Draft body from the App Creator.', base: 'Original body.\n' },
      },
    });
  await page.getByRole('button', { name: 'Cancel Body' }).click();
  await expect.poll(() => draftParts(page, 'notes/one.md')).toBeNull();
  await expect(page.getByRole('region', { name: 'Body' })).toContainText('Original body.');
});

test('whole-text editing uses the Room Draft markdown part without changing line endings', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/plain.md');
  await page.getByRole('button', { name: 'Edit Document' }).click();
  const whole = page.getByRole('textbox', { name: 'Document', exact: true });
  await whole.fill('# Plain\n\nEdited whole text.\n');
  await page.getByRole('button', { name: 'Save Document' }).click();
  await expect
    .poll(() => draftParts(page, 'notes/plain.md'))
    .toEqual({
      markdown: {
        value: '# Plain\n\nEdited whole text.\n',
        base: plain,
      },
    });
});

test('Save consumes the selected Room Draft and exposes its Change Batch in the Room queue', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/one.md');
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('Queued title');
  await title.press('Tab');
  await expect.poll(() => draftParts(page, 'notes/one.md')).not.toBeNull();
  await documentSave(page).click();
  await expect.poll(() => draftParts(page, 'notes/one.md')).toBeNull();
  const queue = await page.evaluate(async () => {
    const handle = await window.viewEditingFixture.runtime.observe('queue', 'studio');
    const entries = handle.current();
    handle.close();
    return entries;
  });
  expect(queue).toHaveLength(1);
  expect(queue[0]).toMatchObject({
    state: 'submitted',
    batch: {
      changes: [{ kind: 'field', path: 'notes/one.md', name: 'title', value: 'Queued title' }],
    },
  });
});

test('creating a typed Path writes one creation Room Draft that the editor extends', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const view = document.createElement('md-document-view') as DocumentViewElement;
    document.body.replaceChildren(view);
    await view.create(window.viewEditingFixture.runtime, 'studio', 'work/new.md', 'note');
  });
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('New note');
  await title.press('Tab');
  await expect
    .poll(() => draftParts(page, 'work/new.md'))
    .toMatchObject({
      creation: {
        type: 'note',
        fields: { title: 'New note' },
        sections: {},
      },
    });
});

test('Save follows a renamed Document to its new Path', async ({ page }) => {
  await start(page);
  await mount(page, 'notes/plain.md');
  const rename = page.getByRole('textbox', { name: 'Rename', exact: true });
  await rename.fill('notes/moved.md');
  await rename.press('Tab');
  await expect
    .poll(() => draftParts(page, 'notes/plain.md'))
    .toMatchObject({
      move: { to: 'notes/moved.md', base: plain },
    });
  await documentSave(page).click();
  await expect(page.getByRole('heading', { level: 1, name: 'notes/moved.md' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Rename', exact: true })).toHaveValue(
    'notes/moved.md',
  );
});

test('a refused removal is cleared before a later field Save', async ({ page }) => {
  await start(page);
  await mount(page, 'people/ada.md');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText('referenced-missing-file', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('navigation', { name: 'Referring locations' })
      .getByRole('button', { name: 'notes/one.md', exact: true }),
  ).toBeVisible();
  await expect.poll(() => draftParts(page, 'people/ada.md')).toBeNull();
  const name = page.getByRole('textbox', { name: 'name', exact: true });
  await name.fill('Ada Lovelace');
  await name.press('Tab');
  await documentSave(page).click();
  await expect.poll(() => queueEntries(page)).toHaveLength(1);
  expect(await queueEntries(page)).toMatchObject([
    { batch: { changes: [{ kind: 'field', path: 'people/ada.md', name: 'name' }] } },
  ]);
});

test('list and reference edits become one Room Draft with a relative reference base', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/one.md');
  await page.getByRole('textbox', { name: 'tags 2', exact: true }).fill('edited');
  await page.getByRole('textbox', { name: 'tags 2', exact: true }).press('Tab');
  await page.getByRole('combobox', { name: 'owner', exact: true }).selectOption('people/bob.md');
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      fields: {
        tags: { value: ['one', 'edited'], base: { value: ['one', 'two'] } },
        owner: { value: '../people/bob.md', base: { value: '../people/ada.md' } },
      },
    });
});

test('a validation refusal is shown at the edited part and keeps the Room Draft', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/one.md');
  await page.getByRole('button', { name: 'Edit Body' }).click();
  await page.getByRole('textbox', { name: 'Body', exact: true }).fill('See [gone](missing.md).\n');
  await page.getByRole('button', { name: 'Save Body' }).click();
  await documentSave(page).click();
  await expect(
    page.getByRole('region', { name: 'Body' }).getByText('unresolved-link', { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => draftParts(page, 'notes/one.md'))
    .toMatchObject({
      sections: { Body: { value: 'See [gone](missing.md).\n', base: 'Original body.\n' } },
    });
});

test('a Room Draft marks a field that changed underneath with its current value', async ({
  page,
}) => {
  await start(page, 25);
  await mount(page, 'notes/one.md');
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('App Creator title');
  await title.press('Tab');
  await expect.poll(() => draftParts(page, 'notes/one.md')).not.toBeNull();
  await page.evaluate(
    async (room) => {
      const helper = '/src/testing.js';
      const { fixtureRoom } = await import(helper);
      window.viewEditingFixture.adapter.setRooms([fixtureRoom(room) as never]);
    },
    {
      ...studio,
      roomVersion: 'v2',
      documents: {
        ...studio.documents,
        'notes/one.md': note.replace('title: Original', 'title: Provider title'),
      },
      revisions: { ...studio.revisions, 'notes/one.md': 'rev-two' },
    },
  );
  await expect(title).toHaveValue('App Creator title');
  await expect(
    page.getByRole('region', { name: 'Fields' }).getByText('Current value: Provider title'),
  ).toBeVisible();
});

test('an unchanged Room notification keeps a focused field and its live value', async ({
  page,
}) => {
  await start(page);
  await mount(page, 'notes/one.md');
  const title = page.getByRole('textbox', { name: 'title', exact: true });
  await title.fill('Typing stays');
  await expect.poll(() => draftParts(page, 'notes/one.md')).not.toBeNull();
  await title.focus();
  await page.evaluate(async (room) => {
    const helper = '/src/testing.js';
    const { fixtureRoom } = await import(helper);
    window.viewEditingFixture.adapter.setRooms([fixtureRoom(room) as never]);
  }, studio);
  await expect(title).toBeFocused();
  await expect(title).toHaveValue('Typing stays');
});

test('revoking the write grant while an editor is open removes editing controls', async ({
  page,
}) => {
  await start(page, 25);
  await mount(page, 'notes/one.md');
  await page.getByRole('button', { name: 'Edit Body' }).click();
  await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toBeVisible();
  await page.evaluate(
    async (room) => {
      const helper = '/src/testing.js';
      const { fixtureRoom } = await import(helper);
      window.viewEditingFixture.adapter.setRooms([fixtureRoom(room) as never]);
      await window.viewEditingFixture.runtime.reauthorize();
    },
    { ...studio, writeGrants: ['people'] },
  );
  await expect(page.getByText('This Path has no write grant.', { exact: true })).toBeVisible();
  await expect(documentSave(page)).toHaveCount(0);
  await expect(page.getByRole('button', { name: /^Edit/ })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Body', exact: true })).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toBeDisabled();
});
