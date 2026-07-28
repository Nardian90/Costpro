import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

// Cargar .env para que los tests e2e tengan acceso a NEXT_PUBLIC_SUPABASE_URL,
// SERVICE_KEY, etc. Sin esto, los tests que llaman a Supabase directo fallan.
dotenv.config({ path: './.env' });

/**
 * Playwright E2E configuration for CostPro.
 *
 * Los tests e2e requieren:
 * 1. Instalar @playwright/test: `npm install -D @playwright/test`
 * 2. Instalar navegadores: `npx playwright install --with-deps`
 * 3. Servidor corriendo en localhost:3000
 *
 * Ejecutar: `npm run test:e2e`
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // Los tests de Supabase real no son paralelos-safe
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Un solo worker para evitar conflictos con datos compartidos
  reporter: process.env.CI ? 'github' : 'html',
  timeout: 60_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    storageState: undefined, // Cada test maneja su propio login
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // No auto-start webServer — el servidor debe estar corriendo manualmente
  // o via un script separado en CI.
});
