import { test, expect } from '@playwright/test';

/**
 * CP-INFRA-011 — Prueba del centinela de aislamiento desde el runner E2E.
 * Caso D del guard (mandato FASE 2 §3.2): la RPC public.e2e_is_isolated_db()
 * debe devolver true. Se consulta vía REST con la anon key — el grant de
 * EXECUTE a anon permite verificar desde el propio runner sin service-role
 * en el navegador. Si esta prueba corre contra producción o una base no
 * preparada, falla (fail-closed) — el global-setup ya lo garantiza antes.
 */
test('el centinela de aislamiento responde true vía REST (CP-INFRA-011)', async ({ request }) => {
  const url = (process.env.E2E_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const anon = process.env.E2E_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  expect(url, 'URL del proyecto E2E (E2E_SUPABASE_URL)').toBeTruthy();

  const res = await request.post(`${url}/rest/v1/rpc/e2e_is_isolated_db`, {
    headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
    data: {},
  });
  expect(res.status(), 'la RPC del centinela debe existir (HTTP 200)').toBe(200);
  const valor = await res.json();
  expect(valor, 'public.e2e_is_isolated_db() debe devolver exactamente true').toBe(true);
});
