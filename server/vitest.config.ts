import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['dist', 'node_modules'],
  },
  resolve: {
    alias: {
      '#shared': path.resolve(__dirname, '../shared'),
    },
  },
});
