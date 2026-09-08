import { transformFile } from '@swc/core';
import { glob, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

await rm('tmp/compiled', { recursive: true, force: true });
for await (const source of glob('src/**/*.ts')) {
  const destination = source.replace(/^src\//, 'tmp/compiled/').replace(/\.ts$/, '.js');
  const { code } = await transformFile(source);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, code);
}
