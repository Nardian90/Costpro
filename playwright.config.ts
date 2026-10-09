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

// ── E2E-FIXTURE-REUSE / separación de tests de creación (2026-10-09) ────────
// Decisión del propietario: la suite ORDINARIA (proyecto 'core') nunca crea
// usuarios ni tiendas — reutiliza las pilotos persistentes A/B vía el modo
// reuse de e2e/fixtures/session.fixture.ts. Los specs cuyo OBJETIVO es
// comprobar la creación real viven en el proyecto 'creation', que SOLO
// existe cuando el operador lo invoca explícitamente con E2E_ALLOW_CREATION=1
// (y se ejecutan con E2E_ISOLATION=1: entorno aislado por-run con teardown
// reconciliado). Sin esas variables el proyecto ni siquiera se registra →
// es imposible ejecutarlos por accidente (fail-closed en la CONFIG, no en
// el test). Lista EXPLÍCITA y revisable en PR.
// Patrones RELATIVOS a testDir ('./e2e') — así los resuelve Playwright.
const CREATION_SPECS = [
  '**/creation/**',
  '**/data-hygiene-probe.spec.ts',
  '**/isolation-proof.spec.ts',
  '**/multi-store-comprehensive.spec.ts',
  '**/security.spec.ts',
  '**/store-create-autoswitch.spec.ts',
  '**/store-lifecycle.spec.ts',
  '**/store-reset.spec.ts',
  '**/store-switching.spec.ts',
  '**/stores-crud.spec.ts',
  '**/workers-create.spec.ts',
];
const creationAllowed = process.env.E2E_ALLOW_CREATION === '1';

export default defineConfig({
  testDir: './e2e',
  // FASE E2E-80: autentica usuarios reales y exporta E2E_TEST_*_TOKEN/ID
  // ANTES de lanzar workers → reactiva ~150 tests que antes saltaban.
  // Los workers heredan el env del proceso padre tras completar el setup.
  globalSetup: './e2e/global-setup.ts',
  // E2E-RUNNER-ISOLATION: teardown del run aislado (limpia SOLO los recursos
  // propios — usuarios/tenant/pilotos provisionados por el global-setup).
  globalTeardown: './e2e/global-teardown.ts',
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
    // Sandbox de 4GB sin swap: el dev server (Next dev) + chromium pueden
    // agotar la memoria y el OOM-killer termina el runner de forma silenciosa
    // (reproducido). --disable-dev-shm-usage evita /dev/shm de 64MB; sin GPU.
    launchOptions: {
      args: ['--disable-dev-shm-usage', '--disable-gpu'],
    },
  },

  projects: [
    {
      name: 'core',
      testIgnore: CREATION_SPECS,
      use: { ...devices['Desktop Chrome'] },
    },
    // Proyecto 'creation': registrado SOLO con E2E_ALLOW_CREATION=1.
    // Uso documentado (bajo petición explícita del propietario):
    //   E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation
    ...(creationAllowed
      ? [
          {
            name: 'creation',
            testMatch: CREATION_SPECS,
            use: { ...devices['Desktop Chrome'] },
          },
        ]
      : []),
  ],

  // No auto-start webServer — el servidor debe estar corriendo manualmente
  // o via un script separado en CI.
});
