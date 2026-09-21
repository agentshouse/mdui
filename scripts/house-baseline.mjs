#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, '.house/manifest.json');
const MARKER = 'house: vendored from agentshouse/house';
const REPAIR = 'Do not edit this copy. Edit it in `house`, then run `npm run ops -- house sync`.';

function refuse(lines) {
  for (const line of lines) process.stderr.write(`house: ${line}\n`);
  process.exit(1);
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readManifest() {
  if (!existsSync(manifestPath)) {
    refuse([
      'this repository has no .house/manifest.json',
      'a consumer declares its channels there before house check can run',
    ]);
  }
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

function flagValue(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) refuse([`${name} needs a value`]);
  return value;
}

function markdownHeader(source, channel) {
  return `<!-- ${MARKER} — ${source} (channel ${channel}).\n${REPAIR} -->`;
}

function yamlHeader(source, channel) {
  return `# ${MARKER} — ${source} (channel ${channel}).\n# ${REPAIR}`;
}

function render(body, target, source, channel) {
  if (target.endsWith('.md')) {
    const header = markdownHeader(source, channel);
    const lines = body.split('\n');
    if (lines[0] !== '---') return `${header}\n\n${body}`;
    const close = lines.indexOf('---', 1);
    if (close === -1) return `${header}\n\n${body}`;
    return [...lines.slice(0, close + 1), '', header, ...lines.slice(close + 1)].join('\n');
  }
  if (target.endsWith('.yaml') || target.endsWith('.yml')) {
    return `${yamlHeader(source, channel)}\n\n${body}`;
  }
  return body;
}

function walk(directory, prefix = '') {
  const found = [];
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) =>
    left.name < right.name ? -1 : 1,
  )) {
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...walk(join(directory, entry.name), relativePath));
    else found.push(relativePath);
  }
  return found;
}

function check() {
  const manifest = readManifest();
  const entries = Object.entries(manifest.files);
  const problems = [];
  for (const [target, entry] of entries) {
    const path = join(root, target);
    if (!existsSync(path) || !statSync(path).isFile()) {
      problems.push(`${target}: vendored file is missing`);
      continue;
    }
    const actual = digest(readFileSync(path));
    if (actual === entry.sha256) continue;
    problems.push(`${target}: expected ${entry.sha256}, actual ${actual}`);
  }
  if (problems.length > 0) {
    refuse([
      `${problems.length} of ${entries.length} vendored files disagree with .house/manifest.json`,
      ...problems,
      `these files are authored in agentshouse/house at ${manifest.upstream.commit}`,
      'route the change upstream, then run `npm run ops -- house sync`',
      'to accept an upstream move instead, run `npm run ops -- house sync --upstream <sha>`',
    ]);
  }
  process.stdout.write(
    `house: ${entries.length} vendored files match ${manifest.upstream.commit.slice(0, 12)} (channels ${manifest.channels.join(', ')})\n`,
  );
}

function git(directory, ...args) {
  return execFileSync('git', ['-C', directory, ...args], { encoding: 'utf8' }).trim();
}

function houseCheckout(argv, manifest) {
  const override = flagValue(argv, '--house') ?? process.env.HOUSE_CHECKOUT;
  if (override !== undefined) {
    const path = resolve(override);
    if (!existsSync(join(path, 'channels.json'))) {
      refuse([`${path} is not a house checkout: no channels.json`]);
    }
    return { path, pinned: false };
  }
  const cache = join(root, 'tmp/house');
  mkdirSync(join(root, 'tmp'), { recursive: true });
  if (existsSync(join(cache, '.git'))) git(cache, 'fetch', '--quiet', 'origin');
  else {
    execFileSync('git', ['clone', '--quiet', manifest.upstream.remote, cache], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  return { path: cache, pinned: true };
}

function sync(argv) {
  const manifest = readManifest();
  const requested = flagValue(argv, '--upstream');
  const { path: house, pinned } = houseCheckout(argv, manifest);
  if (pinned) git(house, 'checkout', '--quiet', requested ?? manifest.upstream.commit);
  else if (requested !== undefined) {
    refuse(['--upstream and a local house checkout are mutually exclusive']);
  }
  const commit = git(house, 'rev-parse', 'HEAD');
  const channels = JSON.parse(readFileSync(join(house, 'channels.json'), 'utf8'));
  const files = {};
  for (const channel of manifest.channels) {
    const declared = channels.channels[channel];
    if (declared === undefined) refuse([`${channel} is not a channel of house at ${commit}`]);
    for (const mapping of declared.mappings) {
      const from = join(house, mapping.from);
      if (!existsSync(from)) refuse([`${mapping.from} is absent from house at ${commit}`]);
      const members = statSync(from).isDirectory() ? walk(from) : [''];
      for (const member of members) {
        const source = member === '' ? mapping.from : `${mapping.from}/${member}`;
        const target = member === '' ? mapping.to : `${mapping.to}/${member}`;
        if (files[target] !== undefined) {
          refuse([`${target} is claimed by two channels; house channels must not overlap`]);
        }
        const body = readFileSync(join(house, source), 'utf8');
        const rendered = render(body, target, source, channel);
        const path = join(root, target);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, rendered);
        files[target] = { source, channel, sha256: digest(readFileSync(path)) };
      }
    }
  }
  for (const stale of Object.keys(manifest.files)) {
    if (files[stale] === undefined) rmSync(join(root, stale), { force: true });
  }
  const next = {
    upstream: { remote: manifest.upstream.remote, commit },
    channels: manifest.channels,
    files,
  };
  writeFileSync(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  process.stdout.write(
    `house: vendored ${Object.keys(files).length} files from ${commit.slice(0, 12)} (channels ${manifest.channels.join(', ')})\n`,
  );
}

function main(argv) {
  const mode =
    argv[0] === 'sync' ? 'sync' : argv[0] === 'check' || argv.length === 0 ? 'check' : undefined;
  if (mode === undefined) {
    refuse(['usage: house-baseline.mjs <check|sync> [--upstream <sha>] [--house <path>]']);
  }
  if (mode === 'check') check();
  else sync(argv.slice(1));
}

main(process.argv.slice(2));
