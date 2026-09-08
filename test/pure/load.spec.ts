import { expect, test } from 'vitest';

test('loads the empty App as an ES module', async () => {
  await expect(import('../../src/index.js')).resolves.toBeTypeOf('object');
});
