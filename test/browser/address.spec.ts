import { expect, test, type Page } from '@playwright/test';
import type { HouseBridge } from '@agentshouse/app-bridge';
import type { HouseBridgeTestHost } from '@agentshouse/app-bridge/test-host';
import type { RuntimeShell } from '@agentshouse/mdruntime';
import type { MdRuntimeClient } from '@agentshouse/mdruntime/client';
import type { MdRuntimeHost } from '@agentshouse/mdruntime/host';
import type { MemoryAdapter } from '@agentshouse/mdruntime/memory';

declare global {
  interface Window {
    houseBridgeComplete?: (port: unknown) => void;
    addressFixture: {
      runtime: MdRuntimeClient;
      runtimeHost: MdRuntimeHost;
      adapter: MemoryAdapter;
      host: HouseBridgeTestHost;
      bridge: HouseBridge;
      shell: RuntimeShell;
      stop: () => void;
      unbind: () => void;
      seen: unknown[];
    };
  }
}

const noteType =
  '---\ntype: definition\nfields:\n  title:\n    kind: string\n    required: true\nsections:\n  Body:\n    kind: text\n---\n';

const studio = {
  name: 'Studio',
  locator: 'studio',
  roomVersion: 'v1',
  writeGrants: ['notes'],
  providerOwnedPaths: [],
  documents: {
    'types/note.md': noteType,
    'notes/hello.md': '---\ntype: note\ntitle: Hello\n---\n## Body\nalpha unique phrase\n',
    'notes/other.md': '---\ntype: note\ntitle: Other\n---\n## Body\nbeta unique phrase\n',
  },
};

async function start(
  page: Page,
  options: { address?: string; rooms?: unknown[]; app?: string } = {},
) {
  await page.goto('/');
  await page.evaluate(
    async ({ address, rooms, app }) => {
      const { createHouseBridgeTestHost } = await import('@agentshouse/app-bridge/test-host');
      const { connectHouseBridge } = await import('@agentshouse/app-bridge');
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestRuntime, waitForRooms } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (runtime: MdRuntimeClient, bridge: HouseBridge) => Promise<() => void>;
      };
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) as never });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        discoveryIntervalMs: 60_000,
        app,
      });
      const host = createHouseBridgeTestHost({ address });
      const bridge = connectHouseBridge(host.port);
      const unbind = await bindApp(opened.runtime, bridge);
      window.addressFixture = {
        runtime: opened.runtime,
        runtimeHost: opened.host,
        adapter,
        host,
        bridge,
        shell: opened.shell,
        stop: opened.stop,
        unbind,
        seen: [],
      };
      await waitForRooms(
        opened.runtime,
        (visible: readonly { roomVersion: string | null }[]) =>
          visible.length === rooms.length && visible.every((room) => room.roomVersion !== null),
      );
    },
    {
      address: options.address ?? '/',
      rooms: options.rooms ?? [studio],
      app: options.app ?? 'mdui',
    },
  );
}

test.afterEach(async ({ page }) => {
  await page.evaluate(() => window.addressFixture?.stop());
});

test('a delivered address naming a Room and a Document opens File and keeps query and fragment', async ({
  page,
}) => {
  await start(page, { address: '/file/studio/notes/hello.md?keep=1#Body' });
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await expect(page.locator('md-document-view')).toContainText('alpha unique phrase');
  expect(
    await page.evaluate(() => ({
      address: window.addressFixture.host.address(),
      navigations: window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    })),
  ).toEqual({
    address: '/file/studio/notes/hello.md?keep=1#Body',
    navigations: [],
  });
});

test('an address naming a Room or a Document the Runtime does not hold names it on Rooms', async ({
  page,
}) => {
  await start(page, { address: '/file/missing/notes/hello.md' });
  await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Unresolved address' })).toHaveText(
    '/file/missing/notes/hello.md',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
  await page.evaluate(() => window.addressFixture.host.open('/file/studio/notes/absent.md'));
  await expect(page.getByRole('status', { name: 'Unresolved address' })).toHaveText(
    '/file/studio/notes/absent.md',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
});

test('opening a file and moving between screens push, and a delivered address lands', async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Search' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    ),
  ).toEqual([
    { mode: 'push', address: '/file/studio/notes/hello.md' },
    { mode: 'push', address: '/search' },
  ]);
  await page.evaluate(() => window.addressFixture.host.open('/file/studio/notes/other.md'));
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Other');
  await expect(page.locator('md-document-view')).toContainText('beta unique phrase');
});

async function remount(page: Page, address: string) {
  await page.evaluate(async (address) => {
    const { adapter, runtimeHost, shell, stop, unbind } = window.addressFixture;
    unbind();
    const { createHouseBridgeTestHost } = await import('@agentshouse/app-bridge/test-host');
    const { connectHouseBridge } = await import('@agentshouse/app-bridge');
    const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
    const helper = '/src/testing.js';
    const { waitForRooms } = await import(helper);
    const specifier = '/src/app.js';
    const { bindApp } = (await import(specifier)) as {
      bindApp: (runtime: MdRuntimeClient, bridge: HouseBridge) => Promise<() => void>;
    };
    const channel = new MessageChannel();
    const detach = runtimeHost.attach(channel.port1, 'mdui');
    const runtime = connectMdRuntime(channel.port2);
    const host = createHouseBridgeTestHost({ address });
    const bridge = connectHouseBridge(host.port);
    const next = await bindApp(runtime, bridge);
    window.addressFixture = {
      runtime,
      runtimeHost,
      adapter,
      host,
      bridge,
      shell,
      stop: () => {
        next();
        detach();
        stop();
      },
      unbind: next,
      seen: [],
    };
    await waitForRooms(
      runtime,
      (visible: readonly { roomVersion: string | null }[]) =>
        visible.length === 1 && visible.every((room) => room.roomVersion !== null),
    );
  }, address);
}

test('Presentation State is observed, restored without an address, and yields to one', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const channel = new MessageChannel();
    window.addressFixture.runtimeHost.attach(channel.port1, 'mdui');
    const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
    const other = connectMdRuntime(channel.port2);
    const seen: unknown[] = [];
    window.addressFixture.seen = seen;
    await other.observe('presentation', (value) => {
      seen.push(value);
    });
  });
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.addressFixture.seen.at(-1)))
    .toEqual({ screen: 'file', room: 'studio', path: 'notes/hello.md' });
  await remount(page, '/');
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  expect(
    await page.evaluate(() =>
      window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    ),
  ).toEqual([{ mode: 'replace', address: '/file/studio/notes/hello.md' }]);
  await remount(page, '/file/studio/notes/other.md');
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Other');
  await expect(page.locator('md-document-view')).toContainText('beta unique phrase');
});

test('main composes addresses only under the App path and never pushes Refusal or Storage', async ({
  page,
}) => {
  await start(page, { address: '/apps/mdui/' });
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Refusal' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Refusal' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Storage' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Search' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    ),
  ).toEqual([
    { mode: 'push', address: '/apps/mdui/file/studio/notes/hello.md' },
    { mode: 'push', address: '/apps/mdui/search' },
  ]);
});

test('connectApp opens a delivered File address over the bridge client', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(
    async (rooms) => {
      const { createHouseBridgeTestHost } = await import('@agentshouse/app-bridge/test-host');
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const { serveMdRuntime } = await import('@agentshouse/mdruntime/host');
      const helper = '/src/testing.js';
      const { fixtureRoom, fixtureShell, runtimeOptions } = await import(helper);
      const house = createHouseBridgeTestHost({
        address: '/file/studio/notes/hello.md',
      });
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) as never });
      const controller = new AbortController();
      const host = serveMdRuntime(
        runtimeOptions({
          adapter,
          requiredGuarantees: [],
          discoveryIntervalMs: 60_000,
          signal: controller.signal,
          shell: fixtureShell(),
        }),
      );
      const channel = new MessageChannel();
      host.attach(channel.port1, 'mdui');
      house.attachRuntime(channel.port2);
      window.houseBridgeComplete?.(await house.port);
      window.addressFixture = {
        stop: () => {
          controller.abort();
          channel.port1.close();
          channel.port2.close();
        },
      } as Window['addressFixture'];
    },
    [studio],
  );
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
});
