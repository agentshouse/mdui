#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const node = (script, ...args) => ({ command: process.execPath, args: [script, ...args] });

const commands = {
  build: node('scripts/build.mjs'),
  check: node('scripts/check.mjs'),
  format: {
    command: 'node_modules/.bin/oxfmt',
    args: [
      'src/**/*.{ts,html}',
      'test/**/*.ts',
      'scripts/ops.mjs',
      'scripts/build.mjs',
      'scripts/check.mjs',
      'scripts/import-types.mjs',
      'scripts/host.mjs',
      'scripts/container-user.mjs',
      '*.config.ts',
      'package.json',
      'tsconfig.json',
      '.dependency-cruiser.cjs',
      '.oxfmtrc.json',
      'compose.yaml',
      'AGENTS.md',
      'APP-CREATOR-AGENT.md',
      'ARCHITECTURE.md',
      'docs/agents/TESTING.md',
    ],
  },
  'docs check': node('scripts/docs-check.mjs'),
  'house check': node('scripts/house-baseline.mjs', 'check'),
  'house sync': node('scripts/house-baseline.mjs', 'sync'),
  'backlog frontier': node('scripts/backlog-frontier.mjs'),
  'backlog sync': node('scripts/backlog-sync.mjs'),
  'backlog check': node('scripts/backlog-sync.mjs', '--check'),
  'backlog push': node('scripts/backlog-push.mjs'),
  'backlog claim': node('scripts/backlog-claims.mjs', 'claim'),
  'backlog release': node('scripts/backlog-claims.mjs', 'release'),
  merge: node('scripts/merge.mjs'),
};

function usage() {
  console.error('usage: npm run ops -- <area> <command> [args...]');
  console.error('commands:');
  for (const name of Object.keys(commands)) console.error(`  ${name}`);
}

function resolveCommand(argv) {
  const keys = Object.keys(commands).sort((left, right) => right.length - left.length);
  const joined = argv.join(' ');
  for (const key of keys) {
    if (joined === key || joined.startsWith(`${key} `)) {
      return { key, rest: argv.slice(key.split(' ').length) };
    }
  }
  return null;
}

function main(argv) {
  if (argv.length === 0) {
    usage();
    process.exit(argv.length === 0 ? 0 : 2);
  }
  const matched = resolveCommand(argv);
  if (matched === null) {
    usage();
    process.exit(2);
  }
  const spec = commands[matched.key];
  const result = spawnSync(spec.command, [...spec.args, ...matched.rest], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}

main(process.argv.slice(2));
