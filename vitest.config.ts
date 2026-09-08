import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'pure',
          environment: 'node',
          include: ['test/pure/**/*.spec.ts'],
        },
      },
      {
        test: {
          name: 'static',
          environment: 'node',
          include: ['test/static/**/*.spec.ts'],
        },
      },
    ],
  },
});
