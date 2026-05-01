import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.tsx'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '.next/**',
      'e2e/**',
      'src/__fixtures__/**',
      'src/**/*.stories.*',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'src/__fixtures__/**',
        'src/**/*.stories.*',
        'e2e/**',
        '.next/**',
        'src/types/**',
        'src/**/*.d.ts',
        'src/**/index.ts',
        'src/__tests__/**',
        '**/__tests__/**',
        'vitest.config.ts',
        // Non-business-critical or external integrations
        'src/services/pick3/**',
        'src/lib/utils/**',
        'src/lib/ipv/mvt/**',
        'src/lib/ipv/data-pipeline/**',
        'src/lib/wallet/parser.ts',
        'src/components/**',
        'src/store/**',
        'src/hooks/ui/useIsMobile.ts',
        'src/lib/academy/**',
        'src/lib/ipv/costEngine.ts',
      ],
      thresholds: {
        global: { lines: 80, functions: 75, branches: 70, statements: 80 },
        'src/services/**': { lines: 85, functions: 80 },
        'src/lib/cost-engine/**': { lines: 90, functions: 85 },
        'src/app/api/**': { lines: 75, functions: 70 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
