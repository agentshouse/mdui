import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';

test('the README stays short and names no private repository or development record', () => {
  const readme = readFileSync('README.md', 'utf8');
  expect(readme.split('\n').length).toBeLessThanOrEqual(60);
  expect(readme).not.toMatch(/github\.com\/agentshouse\/(?!mdui\b)/);
  expect(readme).not.toMatch(/\b(?:R\d{1,3}|PRD-\d+|ADR-\d+)\b/);
});
