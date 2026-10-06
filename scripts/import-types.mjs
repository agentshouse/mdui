#!/usr/bin/env node
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseSync } from '@swc/core';

const SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

function sources(path) {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { recursive: true })
    .filter((entry) => SOURCE.test(entry))
    .map((entry) => join(path, entry));
}

function importTypes(node, found) {
  if (node === null || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    for (const item of node) importTypes(item, found);
    return found;
  }
  if (node.type === 'TsImportType') found.push(node.argument.value);
  for (const child of Object.values(node)) importTypes(child, found);
  return found;
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  process.stderr.write('usage: node scripts/import-types.mjs <path>...\n');
  process.exit(2);
}

let refused = false;
for (const path of paths.flatMap(sources)) {
  const parsed = parseSync(readFileSync(path, 'utf8'), {
    syntax: 'typescript',
    tsx: path.endsWith('.tsx'),
    decorators: true,
  });
  for (const specifier of importTypes(parsed, [])) {
    refused = true;
    process.stderr.write(
      `import-types: ${path} names import('${specifier}') as a type, which dependency-cruiser does not extract; use an import type declaration\n`,
    );
  }
}
process.exit(refused ? 1 : 0);
