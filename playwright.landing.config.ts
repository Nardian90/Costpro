/**
 * playwright.landing.config.ts — ADN-LANDING-HERO-AND-PAGER-FIX-004
 * ============================================================================
 * Config mínima para specs de landing de SOLO-UI (sin fixtures de BD).
 *
 * ¿Por qué existe si ya hay playwright.config.ts?
 *   La config principal ejecuta globalSetup/globalTeardown con el guard de
 *   aislamiento CP-INFRA-011 y el aprovisionamiento de pilotos E2E — necesario
 *   para specs que tocan Supabase. Los specs del landing público NO tocan la
 *   base de datos (nada de auth, nada de escrituras): ejecutarlos con el
 *   harness completo exigiría el swap §7 + reinicio del servidor solo para
 *   validar scroll y clics. Esta config levanta los mismos specs sin hooks de
 *   BD → cero riesgo para CostproE2E, cero credenciales en juego.
 *
 * Requisito: servidor en localhost:3000 (pm2 con el .env PRINCIPAL).
 * Ejecutar:
 *   bunx playwright test --config=playwright.landing.config.ts landing-pager
 * ============================================================================
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  // Solo specs de landing público (UI pura) — el resto mantiene su harness BD.
  testMatch: /landing-pager\.spec\.ts|landing-page\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    { name: 'landing-ui', use: { ...devices['Desktop Chrome'] } },
  ],
});
