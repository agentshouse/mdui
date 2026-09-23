import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

test('refuses a Provider-specific import outside the Adapter and passes after its removal', ({
  onTestFinished,
}) => {
  mkdirSync('tmp', { recursive: true });
  const directory = mkdtempSync('tmp/neutrality-');
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const entry = join(directory, 'index.ts');
  const cruise = () =>
    spawnSync('node_modules/.bin/depcruise', [entry, '--config', '.dependency-cruiser.cjs'], {
      encoding: 'utf8',
    });

  writeFileSync(entry, "import '@agentshouse/mdruntime/client';\n");
  expect(cruise().status).toBe(0);

  for (const source of [
    "import '@agentshouse/mdruntime-adapter';\n",
    "import type { NativeAdapter } from '@agentshouse/mdruntime-adapter';\nexport type { NativeAdapter };\n",
    "export type { NativeAdapter } from '@agentshouse/mdruntime-adapter';\n",
  ]) {
    writeFileSync(entry, source);
    const refused = cruise();
    expect(refused.status, refused.stdout + refused.stderr).toBe(1);
    expect(refused.stdout + refused.stderr).toContain('neutrality');
  }

  writeFileSync(entry, "import '@agentshouse/mdruntime/client';\n");
  expect(cruise().status).toBe(0);
});
