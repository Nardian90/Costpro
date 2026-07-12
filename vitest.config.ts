import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // FIX-CI (2026-07-13): increase testTimeout from default 5s to 30s.
    // BacktestEngine tests with 200-500 draws + statistical tests take >5s
    // on slow CI runners, causing flaky timeouts.
    testTimeout: 30_000,
    hookTimeout: 30_000,
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
        global: { lines: 50, functions: 40, branches: 40, statements: 45 },
        'src/services/**': { lines: 40, functions: 40 },
        'src/lib/cost-engine/**': { lines: 40, functions: 40 },
        'src/app/api/**': { lines: 50, functions: 45 },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
