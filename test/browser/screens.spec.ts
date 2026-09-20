import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

declare global {
  interface Window {
    screensFixture: {
      runtime: MdRuntimeClient;
      adapter: MemoryAdapter;
      stop: () => void;
      liveObservations: () => number;
      shell: import('@agentshouse/mdruntime').RuntimeShell;
      unbind: () => void;
    };
  }
}

const noteType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  tag:\n    kind: string\n  count:\n    kind: number\nsections:\n  Body:\n    kind: text\n---\n';
const projectType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\n  stage:\n    kind: enum\n    values: [Draft, Ready]\nsections:\n  Summary:\n    kind: text\n---\n';

const studio = {
  name: 'Studio',
  locator: 'studio',
  roomVersion: 'v1',
  writeGrants: ['notes', 'work'],
  providerOwnedPaths: [],
  documents: {
    'types/note.md': noteType,
    'types/project.md': projectType,
    'notes/hello.md': '---\ntype: note\ntitle: Hello\n---\n## Body\nalpha unique phrase\n',
    'notes/other.md': '---\ntype: note\ntitle: Other\n---\n## Body\nbeta unique phrase\n',
    'notes/counted.md': '---\ntype: note\ntitle: Counted\ncount: 42\n---\n## Body\nnumeric body\n',
    'notes/tagged.md': '---\ntype: note\ntitle: Tagged\ntag: ""\n---\n## Body\nempty tag body\n',
    'notes/folded.md':
      '---\ntype: note\ntitle: "decoded \\"folded\\" value"\n---\n## Body\nfolded body\n',
    'work/ready.md':
      '---\ntype: project\ntitle: Ready item\nstage: Ready\n---\n## Summary\nReady work.\n',
  },
};

const archive = {
  name: 'Archive',
  locator: 'archive',
  roomVersion: 'v2',
  writeGrants: ['notes'],
  providerOwnedPaths: [],
  documents: {
    'types/note.md': noteType,
    'notes/hello.md': '---\ntype: note\ntitle: Hello\n---\n## Body\ngamma unique phrase\n',
  },
};

async function start(
  page: Page,
  rooms: unknown[] = [studio, archive],
  options: { requiredGuarantees?: string[]; discoveryIntervalMs?: number } = {},
) {
  await page.goto('/');
  await page.evaluate(
    async ({ rooms, options }) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (
          runtime: import('@agentshouse/mdruntime/client').MdRuntimeClient,
        ) => Promise<() => void>;
      };
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) as never });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: options.requiredGuarantees ?? [],
        discoveryIntervalMs: options.discoveryIntervalMs ?? 60_000,
      });
      const unbind = await bindApp(opened.runtime);
      window.screensFixture = {
        runtime: opened.runtime,
        adapter,
        stop: opened.stop,
        liveObservations: opened.liveObservations,
        shell: opened.shell,
        unbind,
      };
      if ((options.requiredGuarantees ?? []).length > 0) return;
      await waitForRooms(
        opened.runtime,
        (visible: readonly { roomVersion: string | null }[]) =>
          visible.length === rooms.length && visible.every((room) => room.roomVersion !== null),
      );
    },
    { rooms, options },
  );
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.screensFixture?.stop());
});

async function outlineStyle(page: Page): Promise<string> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return '';
    return getComputedStyle(active).outlineStyle;
  });
}

async function tabTo(
  page: Page,
  target: ReturnType<Page['getByRole']>,
  limit = 120,
): Promise<void> {
  for (let step = 0; step < limit; step += 1) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      await expect(target).toBeFocused();
      expect(await outlineStyle(page)).not.toBe('none');
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('keyboard focus did not reach the labelled control');
}

async function activateScreen(page: Page, name: string): Promise<void> {
  const button = page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name, exact: true });
  await tabTo(page, button);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
}

test('shows the seven screens, Sync Status on each, and Rooms with MD Types and file tree', async ({
  page,
}) => {
  await start(page);
  const screens = ['Rooms', 'Search', 'File', 'Work', 'Refusal', 'Storage', 'Log'];
  for (const screen of screens) {
    await page
      .getByRole('navigation', { name: 'Screens' })
      .getByRole('button', { name: screen })
      .click();
    await expect(page.getByRole('heading', { level: 1, name: screen })).toBeVisible();
    await expect(page.getByRole('status', { name: 'Sync Status' })).toBeVisible();
  }
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Rooms' })
    .click();
  await expect(page.getByRole('heading', { name: 'Studio' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Archive' })).toBeVisible();
  const studioTypes = page.getByRole('article', { name: 'Studio' }).getByRole('list', {
    name: 'MD Types',
  });
  await expect(studioTypes.getByText('note', { exact: true })).toBeVisible();
  await expect(studioTypes.getByText('project', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Studio' }).getByRole('button', { name: 'notes/hello.md' }),
  ).toBeVisible();
  await expect(
    page.getByRole('article', { name: 'Archive' }).getByRole('button', { name: 'notes/hello.md' }),
  ).toBeVisible();
});

test('opens a Rooms file in Document View on the File screen', async ({ page }) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await expect(page.locator('md-document-view')).toContainText('alpha unique phrase');
});

test('Search finds files through Local Search narrowed by Room, MD Type, and one field value', async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Search' })
    .click();
  await page.getByLabel('Find').fill('unique phrase');
  await page.getByRole('button', { name: 'Find files' }).click();
  const results = page.getByRole('list', { name: 'Search results' });
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio notes/other.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'archive notes/hello.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio work/ready.md' })).toHaveCount(0);

  const search = page.getByRole('form', { name: 'Local Search' });
  await search.getByRole('combobox', { name: 'Room' }).selectOption({ value: 'studio' });
  await page.getByRole('button', { name: 'Find files' }).click();
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio notes/other.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'archive notes/hello.md' })).toHaveCount(0);

  await search.getByRole('combobox', { name: 'MD Type' }).selectOption({ value: 'note' });
  await page.getByRole('button', { name: 'Find files' }).click();
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio work/ready.md' })).toHaveCount(0);

  await search.getByRole('combobox', { name: 'Field' }).selectOption({ value: 'title' });
  await search.getByRole('textbox', { name: 'Value' }).fill('Hello');
  await page.getByRole('button', { name: 'Find files' }).click();
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio notes/other.md' })).toHaveCount(0);

  await search.getByRole('combobox', { name: 'Room' }).selectOption({ value: '' });
  await search.getByRole('combobox', { name: 'MD Type' }).selectOption({ value: '' });
  await search.getByLabel('Find').fill('');
  await search.getByRole('combobox', { name: 'Field' }).selectOption({ value: 'count' });
  await search.getByRole('textbox', { name: 'Value' }).fill('42');
  await page.getByRole('button', { name: 'Find files' }).click();
  await expect(results.getByRole('button', { name: 'studio notes/counted.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toHaveCount(0);

  await search.getByRole('combobox', { name: 'Field' }).selectOption({ value: 'tag' });
  await search.getByRole('textbox', { name: 'Value' }).fill('');
  await page.getByRole('button', { name: 'Find files' }).click();
  await expect(results.getByRole('button', { name: 'studio notes/tagged.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toHaveCount(0);

  await search.getByRole('combobox', { name: 'Field' }).selectOption({ value: '' });
  await search.getByLabel('Find').fill('decoded "folded" value');
  await page.getByRole('button', { name: 'Find files' }).click();
  await expect(results.getByRole('button', { name: 'studio notes/folded.md' })).toBeVisible();
  await expect(results.getByRole('button', { name: 'studio notes/hello.md' })).toHaveCount(0);

  await results.getByRole('button', { name: 'studio notes/folded.md' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.locator('md-document-view')).toContainText('folded body');
});

test('Work lists Drafts across Rooms and Pending Change queues with Provider text', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async (other) => {
    const { runtime, adapter } = window.screensFixture;
    await runtime.draft.replace('studio', 'notes/hello.md', { fields: { title: 'Draft Hello' } });
    await runtime.draft.replace('archive', 'notes/hello.md', {
      fields: { title: 'Archived draft' },
    });
    adapter.script('mutate', {
      kind: 'conflicted',
      roomVersion: 'v3',
      affected: { 'notes/other.md': other },
      code: 'title_conflict',
      fields: { detail: 'title was changed on the Provider' },
    });
    const result = await runtime.save('studio', [
      { kind: 'field', path: 'notes/other.md', name: 'title', value: 'Changed' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  }, studio.documents['notes/other.md']);
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Work' })
    .click();
  const drafts = page.getByRole('list', { name: 'Drafts' });
  await expect(drafts.getByText('studio notes/hello.md', { exact: true })).toBeVisible();
  await expect(drafts.getByText('archive notes/hello.md', { exact: true })).toBeVisible();
  await expect(page.getByRole('article', { name: 'Studio Pending Changes' })).toContainText(
    'title_conflict',
  );
  await expect(page.getByRole('article', { name: 'Studio Pending Changes' })).toContainText(
    'title was changed on the Provider',
  );
});

test('Rooms file tree follows a local structural Save while discovery is idle', async ({
  page,
}) => {
  await start(page);
  await expect(
    page.getByRole('article', { name: 'Studio' }).getByRole('button', { name: 'notes/other.md' }),
  ).toBeVisible();
  await page.evaluate(async () => {
    const { runtime, adapter } = window.screensFixture;
    adapter.script('mutate', { kind: 'transport-uncertainty' });
    adapter.script('discover', { kind: 'transport-uncertainty' });
    adapter.script('refresh', { kind: 'transport-uncertainty' });
    const result = await runtime.save('studio', [{ kind: 'remove', path: 'notes/other.md' }]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
  await expect(
    page.getByRole('article', { name: 'Studio' }).getByRole('button', { name: 'notes/other.md' }),
  ).toHaveCount(0);
});

test('Refusal shows a revoked Connection Refusal and re-authorization restores the connection', async ({
  page,
}) => {
  await start(page, [studio, archive]);
  await page.evaluate(async () => {
    const { runtime, adapter } = window.screensFixture;
    adapter.script('discover', { kind: 'revoked-authorization' });
    const result = await runtime.save('studio', [
      { kind: 'field', path: 'notes/hello.md', name: 'title', value: 'Trigger discovery' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Refusal' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Connection Refusal' })).toContainText(
    'Authorization was revoked',
  );
  await page.evaluate(() => {
    window.screensFixture.adapter.script('discover', undefined);
  });
  await page.getByRole('button', { name: 'Re-authorize' }).click();
  await expect(page.getByRole('status', { name: 'Connection Refusal' })).toContainText(
    'No Connection Refusal',
  );
});

test('Storage shows the Runtime storage-loss statement after durable state is evicted', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(
    async (rooms) => {
      await window.screensFixture.runtime.draft.replace('studio', 'notes/hello.md', {
        fields: { title: 'Unsaved' },
      });
      window.screensFixture.stop();
      const names = (await indexedDB.databases())
        .map((database) => database.name)
        .filter((name): name is string => typeof name === 'string' && name.length > 0);
      await Promise.all(
        names.map(
          (name) =>
            new Promise<void>((resolve, reject) => {
              const request = indexedDB.deleteDatabase(name);
              request.onsuccess = () => resolve();
              request.onerror = () => reject(request.error);
              request.onblocked = () => resolve();
            }),
        ),
      );
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (
          runtime: import('@agentshouse/mdruntime/client').MdRuntimeClient,
        ) => Promise<() => void>;
      };
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) as never });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        shell: window.screensFixture.shell,
      });
      const unbind = await bindApp(opened.runtime);
      window.screensFixture = {
        runtime: opened.runtime,
        adapter,
        stop: opened.stop,
        liveObservations: opened.liveObservations,
        shell: opened.shell,
        unbind,
      };
      await waitForRooms(
        opened.runtime,
        (visible: readonly { roomVersion: string | null }[]) =>
          visible.length === 2 && visible.every((room) => room.roomVersion !== null),
      );
    },
    [studio, archive],
  );
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Storage' })
    .click();
  await expect(page.getByRole('status', { name: 'Storage' })).toHaveText(
    'Unsynchronized Drafts and Pending Changes were lost. true',
  );
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Work', exact: true })
    .click();
  await expect(
    page.getByRole('list', { name: 'Drafts', exact: true }).getByRole('listitem'),
  ).toHaveCount(0);
  await expect(page.getByRole('status', { name: 'Draft inventory', exact: true })).toHaveText(
    'No Drafts.',
  );
});

test('Log shows and exports the Runtime synchronization log as text', async ({ page }) => {
  await start(page);
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Log' })
    .click();
  const shown = await page.evaluate(async () => {
    const text = await window.screensFixture.runtime.log();
    const region = document.querySelector('[data-part="log"]');
    if (region?.textContent !== text) throw new Error('the Log screen did not show runtime.log()');
    return text;
  });
  expect(shown.length).toBeGreaterThan(0);
  expect(shown).toContain('connection authorize');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export the synchronization log' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('synchronization-log.txt');
  const exported = await readFile((await download.path())!, 'utf8');
  const afterExport = await page.evaluate(
    () => document.querySelector('[data-part="log"]')?.textContent ?? '',
  );
  expect(exported).toBe(afterExport);
  expect(exported).toContain('connection authorize');
});

test('every screen is labelled, keyboard-focusable, 360px, desktop, and light and dark', async ({
  page,
}, testInfo) => {
  await start(page);
  await expect(page.getByRole('status', { name: 'Sync Status' })).toContainText('Synced');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('navigation', { name: 'Screens' }).getByRole('button', { name: 'Rooms' }),
  ).toBeFocused();
  expect(await outlineStyle(page)).not.toBe('none');

  const file = page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' });
  await tabTo(page, file);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');

  await activateScreen(page, 'Search');
  await tabTo(page, page.getByLabel('Find'));
  await page.keyboard.type('unique phrase');
  await tabTo(page, page.getByRole('button', { name: 'Find files' }));
  await page.keyboard.press('Enter');
  await expect(
    page.getByRole('list', { name: 'Search results' }).getByRole('button', {
      name: 'studio notes/hello.md',
    }),
  ).toBeVisible();

  await activateScreen(page, 'Work');
  await expect(page.getByRole('heading', { name: 'Drafts' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending Changes' })).toBeVisible();

  await activateScreen(page, 'Refusal');
  await expect(page.getByRole('status', { name: 'Connection Refusal' })).toBeVisible();

  await activateScreen(page, 'Storage');
  await expect(page.getByRole('status', { name: 'Storage' })).toBeVisible();

  await activateScreen(page, 'Log');
  await tabTo(page, page.getByRole('button', { name: 'Export the synchronization log' }));

  await activateScreen(page, 'File');
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');

  await page.setViewportSize({ width: 360, height: 900 });
  const screens = ['Rooms', 'Search', 'File', 'Work', 'Refusal', 'Storage', 'Log'];
  for (const screen of screens) {
    await activateScreen(page, screen);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  }
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Rooms' })
    .click();
  for (const theme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: theme });
    expect(
      await page.locator('#app').evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe(theme === 'light' ? 'rgb(255, 255, 255)' : 'rgb(18, 24, 32)');
    await page.screenshot({
      path: testInfo.outputPath(`screens-360-${theme}.png`),
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: testInfo.outputPath('screens-desktop.png'), fullPage: true });
  await page.evaluate(() =>
    document.getElementById('app')?.style.setProperty('--md-background', '#eef2ff'),
  );
  expect(
    await page.locator('#app').evaluate((element) => getComputedStyle(element).backgroundColor),
  ).toBe('rgb(238, 242, 255)');
});

test('Refusal shows the client/host protocol mismatch as a Connection Refusal', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
    const specifier = '/src/app.js';
    const { bindApp } = (await import(specifier)) as {
      bindApp: (
        runtime: import('@agentshouse/mdruntime/client').MdRuntimeClient,
      ) => Promise<() => void>;
    };
    const channel = new MessageChannel();
    channel.port1.addEventListener('message', () => {
      channel.port1.postMessage({ mdRuntime: 0, message: { kind: 'result', id: 0, value: null } });
    });
    channel.port1.start();
    await bindApp(connectMdRuntime(channel.port2));
  });
  await expect(page.getByRole('status', { name: 'Connection Refusal' })).toContainText(
    'client-host-protocol-mismatch',
  );
});

test('opening files and unbinding leaves no live host observation', async ({ page }) => {
  await start(page);
  await page.evaluate(async () => {
    const view = document.querySelector('md-document-view') as HTMLElement & {
      bind: (
        runtime: import('@agentshouse/mdruntime/client').MdRuntimeClient,
        room: string,
        path: string,
      ) => void;
    };
    const runtime = window.screensFixture.runtime;
    view.bind(runtime, 'studio', 'notes/hello.md');
    view.bind(runtime, 'studio', 'notes/other.md');
    view.bind(runtime, 'studio', 'notes/counted.md');
    window.screensFixture.unbind();
  });
  await expect.poll(() => page.evaluate(() => window.screensFixture.liveObservations())).toBe(0);
});
