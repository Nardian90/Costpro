import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.tsx'],
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/__fixtures__/**',
        'src/**/*.stories.tsx',
        'e2e/**',
        '.next/**',
        'src/**/index.ts',
        'src/types/**',
        'src/config/navigation/**',
        'src/lib/supabaseClient.ts',
      ],
      thresholds: {
        global: {
          lines: 80,
          functions: 75,
          branches: 70,
          statements: 80,
        },
        'src/services/**': {
          lines: 85,
          functions: 80,
        },
        'src/lib/cost-engine/**': {
          lines: 90,
          functions: 85,
        },
        'src/hooks/logic/**': {
          lines: 80,
          functions: 75,
        },
      },
    },
    reporters: process.env.CI ? ['verbose', 'junit'] : ['verbose'],
    outputFile: {
      junit: './test-results/junit.xml'
    },
  },
});
