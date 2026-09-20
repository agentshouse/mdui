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
    addressOther?: Window | null;
    addressRuntimePort?: Promise<MessagePort>;
    releasePresentationRead?: () => void;
    addressFixture: {
      runtime: MdRuntimeClient;
      runtimeHost?: MdRuntimeHost;
      adapter?: MemoryAdapter;
      host: HouseBridgeTestHost;
      bridge: HouseBridge;
      shell?: RuntimeShell;
      stop: () => void;
      unbind: () => void;
      seen: unknown[];
      openAt?: number;
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
    'notes/hello world.md': '---\ntype: note\ntitle: Spaced\n---\n## Body\nspaced unique phrase\n',
    'notes/hash#name.md': '---\ntype: note\ntitle: Hashed\n---\n## Body\nhash unique phrase\n',
  },
};

async function start(
  page: Page,
  options: { address?: string; rooms?: unknown[]; app?: string } = {},
) {
  await page.goto('/');
  await page.evaluate(
    async ({ address, rooms, app }) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestBridge, openTestRuntime, waitForRooms } = await import(helper);
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
      const { host, bridge } = openTestBridge(address);
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

async function remount(
  page: Page,
  address: string,
  options: { read?: string; write?: string; duringRead?: string } = {},
) {
  await page.evaluate(
    async ({ address, options }) => {
      const { adapter, runtimeHost, shell, stop, unbind } = window.addressFixture;
      if (runtimeHost === undefined) throw new Error('The Runtime host is missing.');
      unbind();
      const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
      const helper = '/src/testing.js';
      const { openTestBridge, waitForRooms } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (runtime: MdRuntimeClient, bridge: HouseBridge) => Promise<() => void>;
      };
      const channel = new MessageChannel();
      const detach = runtimeHost.attach(channel.port1, 'mdui');
      const connected = connectMdRuntime(channel.port2);
      const proxy =
        options.read !== undefined ||
        options.write !== undefined ||
        options.duringRead !== undefined;
      let readStarted = false;
      const runtime = proxy
        ? new Proxy(connected, {
            get(target, prop, receiver) {
              if (prop === 'presentation') {
                return {
                  async read() {
                    if (options.read !== undefined) throw new Error(options.read);
                    const value = await target.presentation.read();
                    if (options.duringRead !== undefined) {
                      readStarted = true;
                      await new Promise<void>((resolve) => {
                        window.releasePresentationRead = resolve;
                      });
                    }
                    return value;
                  },
                  write(value: unknown) {
                    if (options.write !== undefined) {
                      return Promise.reject(new Error(options.write));
                    }
                    return target.presentation.write(value);
                  },
                };
              }
              const value = Reflect.get(target, prop, receiver);
              return typeof value === 'function' ? value.bind(target) : value;
            },
          })
        : connected;
      const { host, bridge } = openTestBridge(address);
      const bound = bindApp(runtime, bridge);
      let openAt = 0;
      if (options.duringRead !== undefined) {
        const started = Date.now();
        while (!readStarted) {
          if (Date.now() - started > 5000) throw new Error('presentation.read did not start');
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        openAt = host.navigations.length;
        host.open(options.duringRead);
        window.releasePresentationRead?.();
      }
      const next = await bound;
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
        openAt,
      };
      await waitForRooms(
        connected,
        (visible: readonly { roomVersion: string | null }[]) =>
          visible.length === 1 && visible.every((room) => room.roomVersion !== null),
      );
    },
    { address, options },
  );
}

test('Presentation State is observed, restored without an address, and yields to one', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(async () => {
    const runtimeHost = window.addressFixture.runtimeHost;
    if (runtimeHost === undefined) throw new Error('The Runtime host is missing.');
    const channel = new MessageChannel();
    runtimeHost.attach(channel.port1, 'mdui');
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

test('main composes remainder addresses and never pushes Refusal or Storage', async ({ page }) => {
  await start(page);
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
    { mode: 'push', address: '/file/studio/notes/hello.md' },
    { mode: 'push', address: '/search' },
  ]);
});

test('a later delivered address wins over an earlier File resolution still in flight', async ({
  page,
}) => {
  await start(page, { address: '/search' });
  await page.evaluate(() => {
    window.addressFixture.host.open('/file/studio/notes/hello.md');
    window.addressFixture.host.open('/search');
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await expect
    .poll(async () => ({
      file: await page.getByRole('heading', { level: 1, name: 'File' }).isVisible(),
      search: await page.getByRole('heading', { level: 1, name: 'Search' }).isVisible(),
      address: await page.evaluate(() => window.addressFixture.host.address()),
    }))
    .toEqual({ file: false, search: true, address: '/search' });
});

test('a restore without an address yields to one the shell delivers afterwards', async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await remount(page, '/');
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await page.evaluate(() => window.addressFixture.host.open('/file/studio/notes/other.md'));
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Other');
  expect(await page.evaluate(() => window.addressFixture.host.address())).toBe(
    '/file/studio/notes/other.md',
  );
});

test('a restore does not clobber an address delivered while presentation is still being read', async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await remount(page, '/', { duringRead: '/file/studio/notes/other.md' });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Other');
  expect(
    await page.evaluate(() => {
      const openAt = window.addressFixture.openAt;
      if (openAt === undefined) throw new Error('remount did not record the delivery');
      return {
        address: window.addressFixture.host.address(),
        replaced: window.addressFixture.host.navigations.slice(openAt).some((entry) => {
          return entry.mode === 'replace' && entry.address === '/file/studio/notes/hello.md';
        }),
      };
    }),
  ).toEqual({ address: '/file/studio/notes/other.md', replaced: false });
});

test('a remainder that names the Work screen opens Work', async ({ page }) => {
  await start(page, { address: '/work' });
  await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeVisible();
});

test('a path that is not a remainder below the App path does not open File or Work', async ({
  page,
}) => {
  await start(page, { address: '/file/studio/notes/hello.md' });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await remount(page, '/apps/work/file/studio/notes/hello.md');
  await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Work' })).toBeHidden();
  await expect(page.getByRole('status', { name: 'Unresolved address' })).toHaveText(
    '/apps/work/file/studio/notes/hello.md',
  );
  expect(
    await page.evaluate(() => ({
      address: window.addressFixture.host.address(),
      navigations: window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    })),
  ).toEqual({ address: '/apps/work/file/studio/notes/hello.md', navigations: [] });
});

test('a malformed percent escape in a File remainder is named on Rooms', async ({ page }) => {
  await start(page, {
    address: '/file/studio/notes/hello.md',
    rooms: [
      {
        ...studio,
        documents: {
          ...studio.documents,
          'notes/hello%2.md':
            '---\ntype: note\ntitle: Literal percent\n---\n## Body\nliteral unique phrase\n',
        },
      },
    ],
  });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await remount(page, '/file/studio/notes/hello%2.md');
  await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Unresolved address' })).toHaveText(
    '/file/studio/notes/hello%2.md',
  );
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      address: window.addressFixture.host.address(),
      navigations: window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    })),
  ).toEqual({ address: '/file/studio/notes/hello%2.md', navigations: [] });
});

test('an unrecognized remainder does not yield to a conflicting stored presentation', async ({
  page,
}) => {
  await start(page, { address: '/file/studio/notes/hello.md' });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await remount(page, '/notes');
  await expect(page.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Unresolved address' })).toHaveText('/notes');
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveCount(0);
  expect(
    await page.evaluate(() => ({
      address: window.addressFixture.host.address(),
      navigations: window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    })),
  ).toEqual({ address: '/notes', navigations: [] });
});

test('Document paths with a space or a hash round-trip through the address', async ({ page }) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello world.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Spaced');
  expect(await page.evaluate(() => window.addressFixture.host.address())).toBe(
    '/file/studio/notes/hello%20world.md',
  );
  await page.evaluate(() => window.addressFixture.host.open('/file/studio/notes/hash%23name.md'));
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hashed');
  await expect(page.locator('md-document-view')).toContainText('hash unique phrase');
});

test('re-applying the current address does not hide Storage or a live Refusal', async ({
  page,
}) => {
  await start(page, { address: '/file/studio/notes/hello.md' });
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Storage' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await page.evaluate(async () => {
    const result = await window.addressFixture.runtime.save('studio', [
      { kind: 'remove', path: 'notes/other.md' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Storage' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
  await page.evaluate(async () => {
    const adapter = window.addressFixture.adapter;
    if (adapter === undefined) throw new Error('The Adapter is missing.');
    adapter.script('discover', { kind: 'revoked-authorization' });
    const result = await window.addressFixture.runtime.save('studio', [
      { kind: 'field', path: 'notes/hello.md', name: 'title', value: 'Trigger discovery' },
    ]);
    if (result.outcome !== 'saved') throw new Error(JSON.stringify(result));
  });
  await expect(page.getByRole('heading', { level: 1, name: 'Refusal' })).toBeVisible();
  await page.evaluate(() => window.addressFixture.host.open('/file/studio/notes/hello.md'));
  await expect(page.getByRole('heading', { level: 1, name: 'Refusal' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
});

test('a second tab without an address below the App path follows Presentation State', async ({
  page,
}) => {
  await start(page);
  const popup = page.context().waitForEvent('page');
  await page.evaluate(() => {
    window.addressOther = window.open('/', '_blank');
  });
  const other = await popup;
  await other.waitForLoadState('domcontentloaded');
  await other.evaluate(() => {
    window.addressRuntimePort = new Promise<MessagePort>((resolve) => {
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
    const runtimeHost = window.addressFixture.runtimeHost;
    if (runtimeHost === undefined) throw new Error('The Runtime host is missing.');
    const channel = new MessageChannel();
    runtimeHost.attach(channel.port1, 'mdui');
    window.addressOther?.postMessage({ runtime: true }, '*', [channel.port2]);
  });
  await other.evaluate(async () => {
    const port = await window.addressRuntimePort!;
    const { connectMdRuntime } = await import('@agentshouse/mdruntime/client');
    const helper = '/src/testing.js';
    const { openTestBridge, waitForRooms } = await import(helper);
    const specifier = '/src/app.js';
    const { bindApp } = (await import(specifier)) as {
      bindApp: (runtime: MdRuntimeClient, bridge: HouseBridge) => Promise<() => void>;
    };
    const runtime = connectMdRuntime(port);
    const { host, bridge } = openTestBridge('/');
    const unbind = await bindApp(runtime, bridge);
    window.addressFixture = {
      runtime,
      host,
      bridge,
      stop: unbind,
      unbind,
      seen: [],
    };
    await waitForRooms(
      runtime,
      (visible: readonly { roomVersion: string | null }[]) =>
        visible.length === 1 && visible.every((room) => room.roomVersion !== null),
    );
  });
  await expect(other.getByRole('heading', { level: 1, name: 'Rooms' })).toBeVisible();
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(other.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(other.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await other.evaluate(() => window.addressFixture.stop());
});

test('the open file stays in Presentation State when the screen is not File', async ({ page }) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Search' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await remount(page, '/');
  await expect(page.getByRole('heading', { level: 1, name: 'Search' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'File' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
});

test('a re-push of the same document keeps query and fragment', async ({ page }) => {
  await start(page, { address: '/file/studio/notes/hello.md?keep=1#Body' });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'File' })
    .click();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.addressFixture.host.navigations.map((entry) => ({
        mode: entry.mode,
        address: entry.address,
      })),
    ),
  ).toEqual([{ mode: 'push', address: '/file/studio/notes/hello.md?keep=1#Body' }]);
});

test('navigating to a different document drops query and fragment', async ({ page }) => {
  await start(page, { address: '/file/studio/notes/hello.md?keep=1#Body' });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await page.locator('md-document-view').evaluate((view) => {
    view.dispatchEvent(
      new CustomEvent('open-path', {
        bubbles: true,
        detail: { room: 'studio', path: 'notes/other.md' },
      }),
    );
  });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Other');
  expect(await page.evaluate(() => window.addressFixture.host.address())).toBe(
    '/file/studio/notes/other.md',
  );
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
    { mode: 'push', address: '/file/studio/notes/other.md' },
    { mode: 'push', address: '/search' },
  ]);
});

test('a failed presentation read reports Storage and does not restore the last screen', async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole('article', { name: 'Studio' })
    .getByRole('button', { name: 'notes/hello.md' })
    .click();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await remount(page, '/', { read: 'Injected presentation read failure' });
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Storage' })
    .click();
  await expect(page.getByRole('status', { name: 'Storage' })).toContainText(
    'Presentation State could not be read: Injected presentation read failure',
  );
  expect(await page.evaluate(() => window.addressFixture.runtime.storageLoss())).toBeNull();
});

test('a failed presentation write reports Storage and still opens the file', async ({ page }) => {
  await start(page);
  await remount(page, '/file/studio/notes/hello.md', {
    write: 'Injected presentation write failure',
  });
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await page
    .getByRole('navigation', { name: 'Screens' })
    .getByRole('button', { name: 'Storage' })
    .click();
  await expect(page.getByRole('status', { name: 'Storage' })).toContainText(
    'Presentation State could not be written: Injected presentation write failure',
  );
  expect(await page.evaluate(() => window.addressFixture.runtime.storageLoss())).toBeNull();
});

test('clearing a live Refusal lands the address that was held while it was live', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    async (rooms) => {
      const { createMemoryAdapter } = await import('@agentshouse/mdruntime/memory');
      const helper = '/src/testing.js';
      const { fixtureRoom, openTestBridge, openTestRuntime } = await import(helper);
      const specifier = '/src/app.js';
      const { bindApp } = (await import(specifier)) as {
        bindApp: (runtime: MdRuntimeClient, bridge: HouseBridge) => Promise<() => void>;
      };
      const adapter = createMemoryAdapter({ rooms: rooms.map(fixtureRoom) as never });
      adapter.script('discover', { kind: 'revoked-authorization' });
      const opened = await openTestRuntime(adapter, {
        requiredGuarantees: [],
        discoveryIntervalMs: 60_000,
      });
      const { host, bridge } = openTestBridge('/file/studio/notes/hello.md');
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
    },
    [studio],
  );
  await expect(page.getByRole('heading', { level: 1, name: 'Refusal' })).toBeVisible();
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeHidden();
  await page.evaluate(() => {
    const adapter = window.addressFixture.adapter;
    if (adapter === undefined) throw new Error('The Adapter is missing.');
    adapter.script('discover', undefined);
  });
  await page.getByRole('button', { name: 'Re-authorize' }).click();
  await expect(page.getByRole('textbox', { name: 'title', exact: true })).toHaveValue('Hello');
  await expect(page.getByRole('heading', { level: 1, name: 'File' })).toBeVisible();
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
