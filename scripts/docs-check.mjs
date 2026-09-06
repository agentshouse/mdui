#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const prdDirectory = join(root, 'docs/prd');

function refuse(lines) {
  process.stderr.write(`${lines.map((line) => `docs check: ${line}`).join('\n')}\n`);
  process.exit(1);
}

function main() {
  const files = (existsSync(prdDirectory) ? readdirSync(prdDirectory) : [])
    .filter((name) => /^prd-\d{4}-.+\.md$/.test(name))
    .sort();
  const errors = [];
  for (const name of files) {
    const body = readFileSync(join(prdDirectory, name), 'utf8');
    if (!body.startsWith('---\n')) {
      errors.push(`${name}: missing YAML frontmatter`);
      continue;
    }
    const end = body.indexOf('\n---\n', 4);
    if (end === -1) {
      errors.push(`${name}: unterminated YAML frontmatter`);
      continue;
    }
    const frontmatter = body.slice(4, end);
    if (/^status:\s*/m.test(frontmatter))
      errors.push(`${name}: status frontmatter is removed; publication is acceptance`);
    if (!/^type:\s*(build|shape)\s*$/m.test(frontmatter))
      errors.push(`${name}: missing type: build|shape`);
    if (!/^honors:\s*\S/m.test(frontmatter)) errors.push(`${name}: missing honors:`);
  }
  if (errors.length > 0) refuse(errors);
  process.stdout.write(`docs check: ${files.length} PRDs\n`);
}

main();
