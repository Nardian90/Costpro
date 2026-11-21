// m110-diag-recon-ui.cjs — captura el error de consola del crash de la vista
// Estados Financieros en el entorno E2E (diagnóstico de spec).
const { chromium } = require('playwright');
const readline = require('readline');

async function main() {
  const E2E_URL = process.env.E2E_URL_ISOL || process.env.E2E_SUPABASE_URL;
  const EMAIL = process.env.DIAG_EMAIL;
  const PASS = 'Recon1234!x';
  const STORE = process.env.DIAG_STORE;
  if (!E2E_URL || !EMAIL || !STORE) { console.error('faltan DIAG_EMAIL/DIAG_STORE/E2E_SUPABASE_URL'); process.exit(2); }
  const REF = E2E_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)[1];

  // signIn
  const tok = await fetch(`${E2E_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: process.env.E2E_ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASS }),
  }).then(r => r.json());
  if (!tok.access_token) { console.error('signIn falló:', JSON.stringify(tok).slice(0, 200)); process.exit(2); }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 500)); });
  page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 800)));

  await page.addInitScript(([k, v]) => window.localStorage.setItem(k, v), [
    `sb-${REF}-auth-token`,
    JSON.stringify({ access_token: tok.access_token, token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'mock-refresh',
      user: { id: tok.user?.id, email: EMAIL } }),
  ]);
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.getByText('OPERACIÓN', { exact: true }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText('Estados Financieros', { exact: true }).first().click();
  await page.waitForTimeout(4000);
  const viewVisible = await page.getByTestId('financial-statements-view').isVisible().catch(() => false);
  const errBoundary = await page.getByText('Error al cargar').isVisible().catch(() => false);
  console.log('viewVisible:', viewVisible, '| errorBoundary:', errBoundary);
  if (viewVisible) {
    await page.getByTestId('tab-conciliacion').click().catch(() => {});
    await page.waitForTimeout(1200);
    const pend = await page.getByTestId('recon-pendiente').isVisible().catch(() => false);
    console.log('recon-pendiente:', pend);
    if (pend) { await page.getByTestId('btn-ejecutar-conciliacion').click().catch(e => console.log('click err', e)); }
    await page.waitForTimeout(9000);
    const matrix = await page.getByTestId('reconciliation-tab').isVisible().catch(() => false);
    console.log('reconciliation-tab visible:', matrix);
    const errTxt = await page.getByText(/Error al ejecutar|error/i).first().isVisible().catch(() => false);
    console.log('texto error visible:', errTxt);
  }
  console.log('=== ERRORES DE CONSOLA ===');
  errors.slice(0, 12).forEach(e => console.log('-', e));
  await browser.close();
}
main().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
