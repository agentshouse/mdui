#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  backlogArtifacts,
  obsoleteArtifacts,
  writeBacklogArtifacts,
} from './backlog-artifacts.mjs';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function values(argv, flag) {
  const found = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== flag) continue;
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--'))
      throw new Error(`backlog sync ${flag} requires a value`);
    found.push(value);
  }
  return found;
}

function selectedRoot(argv) {
  const roots = values(argv, '--root');
  if (roots.length > 1) throw new Error('backlog sync accepts at most one --root');
  if (roots[0] === undefined) return repositoryRoot;
  return resolve(roots[0]);
}

function current(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

function reportCheck(root, artifacts) {
  const stale = artifacts.filter((artifact) => current(artifact.path) !== artifact.content);
  const obsolete = obsoleteArtifacts(root);
  if (stale.length === 0 && obsolete.length === 0) {
    process.stdout.write('backlog state: current\n');
    return 0;
  }
  for (const artifact of stale)
    process.stderr.write(`backlog state is stale: ${relative(root, artifact.path)}\n`);
  for (const path of obsolete)
    process.stderr.write(`obsolete backlog artifact remains: ${relative(root, path)}\n`);
  return 1;
}

function main(argv) {
  const check = argv.includes('--check');
  const allowed = new Set(['--check', '--root', ...values(argv, '--root')]);
  const unknown = argv.filter((value) => !allowed.has(value));
  if (unknown.length > 0) throw new Error(`unknown backlog sync arguments: ${unknown.join(', ')}`);
  const root = selectedRoot(argv);
  const artifacts = backlogArtifacts(root);
  if (check) return reportCheck(root, artifacts);
  const obsolete = obsoleteArtifacts(root).map((path) => relative(root, path));
  writeBacklogArtifacts(root, artifacts);
  for (const artifact of artifacts)
    process.stdout.write(`updated ${relative(root, artifact.path)}\n`);
  for (const path of obsolete) process.stdout.write(`removed ${path}\n`);
  return 0;
}

try {
  process.exit(main(process.argv.slice(2)));
} catch (error) {
  process.stderr.write(`backlog sync: ${error.message ?? error}\n`);
  process.exit(1);
}
