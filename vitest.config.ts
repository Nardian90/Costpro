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
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/cypress/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,playwright}.config.*',
      '**/e2e/**',
      '**/.next/**',
      '**/standalone/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'src/__fixtures__/**',
        'src/**/*.stories.tsx',
        '**/e2e/**',
        '**/.next/**',
        '**/standalone/**',
        'src/**/index.ts',
        'src/types/**',
        'src/config/navigation/**',
        'src/lib/supabaseClient.ts',
      ],
      thresholds: {
        global: {
          lines: 50,
          functions: 75,
          branches: 70,
          statements: 50,
        },
        'src/services/**': {
          lines: 60,
          functions: 70,
        },
        'src/lib/cost-engine/**': {
          lines: 60,
          functions: 60,
        },
        'src/hooks/logic/**': {
          lines: 50,
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
