import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const appModules = [
  'address.js',
  'app.js',
  'components/comments.js',
  'components/fields.js',
  'components/ftp.js',
  'components/html.js',
  'components/links.js',
  'components/markdown.js',
  'components/profile.js',
  'components/runtime.js',
  'components/status.js',
  'components/theme.js',
  'components/view.js',
  'index.js',
];

const packages = [
  '@agentshouse/app-bridge',
  '@agentshouse/mdruntime/client',
  'micromark',
  'micromark-core-commonmark',
  'micromark-extension-gfm',
  'micromark-util-character',
  'micromark-util-sanitize-uri',
];

const network = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'EventSource',
  'sendBeacon',
  'importScripts',
  'navigator.connection',
];

async function appFiles(prefix = ''): Promise<string[]> {
  const entries = await readdir(join('app', prefix), { withFileTypes: true });
  const found: string[] = [];
  for (const entry of entries) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await appFiles(path)));
    else found.push(path);
  }
  return found.sort();
}

test('the manifest declares the entry document and no external origin', async () => {
  const manifest: unknown = JSON.parse(await readFile('app.json', 'utf8'));

  expect(manifest).toEqual({ entry: 'app/index.html', external_origins: [] });
});

test('the entry document carries the App module and no other reference', async () => {
  const document = await readFile('app/index.html', 'utf8');

  expect([...document.matchAll(/\s(?:src|href)="([^"]*)"/g)].map(([, value]) => value)).toEqual([
    'index.js',
  ]);
  expect(document).toContain('<script type="module" src="index.js"></script>');
  expect(document).not.toContain('<link');
  expect(document).not.toContain('<style');
});

test('the App carries its own modules and no test placement', async () => {
  expect(await appFiles()).toEqual(['index.html', ...appModules].sort());
});

test('the App imports only packages the lockfile pins', async () => {
  const lockfile: { packages: Record<string, unknown> } = JSON.parse(
    await readFile('package-lock.json', 'utf8'),
  );
  const imported = new Set<string>();
  for (const name of appModules) {
    const code = await readFile(join('app', name), 'utf8');
    for (const [, specifier] of code.matchAll(/ from '([^']+)'/g)) {
      if (!specifier.startsWith('.')) imported.add(specifier);
    }
  }

  expect([...imported].sort()).toEqual(packages);
  for (const specifier of imported) {
    const scoped = specifier.startsWith('@');
    const name = specifier
      .split('/')
      .slice(0, scoped ? 2 : 1)
      .join('/');
    expect(Object.hasOwn(lockfile.packages, `node_modules/${name}`)).toBe(true);
  }
});

test('the App reaches no network of its own', async () => {
  for (const name of appModules) {
    const code = await readFile(join('app', name), 'utf8');
    for (const primitive of network) expect(code).not.toContain(primitive);
  }
});
