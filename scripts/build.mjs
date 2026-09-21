#!/usr/bin/env node
import { parse, transformFile } from '@swc/core';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { dirname as posixDirname, join as posixJoin } from 'node:path/posix';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'src');
const output = join(root, 'app');
const entryDocument = 'index.html';
const entryModule = 'index.ts';
const sourceScript = '<script type="module" src="/src/index.js"></script>';
const appScript = '<script type="module" src="index.js"></script>';

function refuse(lines) {
  process.stderr.write(`${lines.map((line) => `build: ${line}`).join('\n')}\n`);
  process.exit(1);
}

async function importedSpecifiers(code) {
  const parsed = await parse(code, { syntax: 'ecmascript', target: 'es2022' });
  return parsed.body.map((item) => item.source?.value).filter((value) => typeof value === 'string');
}

async function moduleGraph() {
  const built = new Map();
  const pending = [entryModule];
  while (pending.length > 0) {
    const name = pending.shift();
    const emitted = name.replace(/\.ts$/, '.js');
    if (built.has(emitted)) continue;
    const { code } = await transformFile(join(source, name));
    if (/\bimport\s*\(/.test(code)) refuse([`src/${name} imports at runtime`]);
    built.set(emitted, code);
    for (const specifier of await importedSpecifiers(code)) {
      if (!specifier.startsWith('.')) continue;
      if (!specifier.endsWith('.js')) refuse([`src/${name} imports ${specifier}`]);
      pending.push(`${posixJoin(posixDirname(name), specifier).slice(0, -3)}.ts`);
    }
  }
  return built;
}

async function buildApp() {
  const document = await readFile(join(source, entryDocument), 'utf8');
  if (!document.includes(sourceScript)) refuse([`src/${entryDocument} carries no App module`]);
  const files = new Map([[entryDocument, document.replace(sourceScript, appScript)]]);
  for (const [name, code] of await moduleGraph()) files.set(name, code);
  return files;
}

async function builtFiles(prefix = '') {
  const entries = await readdir(join(output, prefix), { withFileTypes: true }).catch(() => []);
  const found = [];
  for (const entry of entries) {
    const name = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await builtFiles(name)));
    else found.push(name);
  }
  return found;
}

async function check(files, present) {
  const drift = [];
  for (const [name, content] of files) {
    const current = await readFile(join(output, name), 'utf8').catch(() => null);
    if (current === null) drift.push(`app/${name} is missing`);
    else if (current !== content) drift.push(`app/${name} is stale`);
  }
  for (const name of present) if (!files.has(name)) drift.push(`app/${name} is not built`);
  if (drift.length > 0) refuse([...drift, 'run npm run ops -- build']);
  process.stdout.write(`build: app is ${files.size} current files\n`);
}

async function write(files, present) {
  for (const name of present) if (!files.has(name)) await rm(join(output, name));
  for (const [name, content] of files) {
    await mkdir(dirname(join(output, name)), { recursive: true });
    await writeFile(join(output, name), content);
  }
  process.stdout.write(`build: app is ${files.size} files\n`);
}

const [mode, ...rest] = process.argv.slice(2);
if (rest.length > 0 || (mode !== undefined && mode !== '--check')) {
  process.stderr.write('usage: npm run ops -- build [--check]\n');
  process.exit(2);
}
const files = await buildApp();
const present = await builtFiles();
if (mode === '--check') await check(files, present);
else await write(files, present);
