import { globSync, readFileSync } from 'node:fs';
import { parseSync } from '@swc/core';
import { expect, test } from 'vitest';

test('source, tests and scripts contain only tool-required comments', () => {
  const paths = globSync(
    [
      'src/**/*.{ts,tsx,js}',
      'packages/*/src/**/*.{ts,tsx,js}',
      'test/**/*.{ts,js}',
      'scripts/*.mjs',
      '*.{ts,mts,cjs,mjs}',
    ],
    { exclude: (path) => path.includes('/fixtures/') },
  );
  expect(paths.length).toBeGreaterThan(0);
  const failures: string[] = [];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    const source = Buffer.from(text);
    const parsed = parseSync(text, {
      syntax: 'typescript',
      tsx: path.endsWith('.tsx'),
      decorators: true,
    });
    function mask(value: unknown): void {
      if (value === null || typeof value !== 'object') return;
      if (Array.isArray(value)) {
        for (const item of value) mask(item);
        return;
      }
      const node = value as { type?: string; span?: { start: number; end: number } };
      if (
        node.span !== undefined &&
        ['StringLiteral', 'RegExpLiteral', 'TemplateElement', 'JSXText'].includes(node.type ?? '')
      ) {
        source.fill(32, node.span.start - 1, node.span.end - 1);
      }
      for (const child of Object.values(value)) mask(child);
    }
    mask(parsed);
    for (const comment of source.toString('utf8').matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//gu)) {
      if (
        /^(?:\/\/\/?\s*(?:@ts-(?:expect-error|ignore|check|nocheck)\b|<reference\b)|\/[/\*]\s*(?:eslint|oxlint|prettier|oxfmt)[ -])/u.test(
          comment[0],
        )
      )
        continue;
      failures.push(path);
    }
  }
  expect(failures).toEqual([]);
});
