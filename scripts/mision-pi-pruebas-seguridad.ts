/**
 * MISIÓN PI-SUPERADMIN (2026-10-26) — Batería de seguridad EN VIVO (Casos C-F).
 *
 * Patrón QA del repo (fc-access-test-user.cjs / cleanup_qa_users.cjs):
 *   1. Crea usuario de prueba qa.pi.mision.*@costpro.test (admin API).
 *   2. Le asigna membresía SOLO en Puerto Padre (clerk).
 *   3. Verifica en vivo contra la app (localhost:3000) y PostgREST (RLS):
 *      - Caso C: rol operativo ve/usa SOLO su tienda autorizada (200).
 *      - Caso E: acceso a tienda NO autorizada → 403 app / ERR_UNAUTHORIZED RPC
 *                (aunque manipule el storeId del cliente).
 *      - Caso F: RLS stores — el clerk SOLO ve su tienda (aislamiento multitienda).
 *      - Caso D: sin membresías → lista vacía legítima (200 con data: []),
 *                NO un error.
 *   4. Limpieza: e2e_hard_delete_user (helper SECURITY DEFINER oficial).
 *
 * Uso: bun scripts/mision-pi-pruebas-seguridad.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const APP = 'http://localhost:3000';

const QA_EMAIL = 'qa.pi.mision.20261026@costpro.test';
const QA_PASS = 'Qa-Pi-Mision-2026!';

const STORE_ENERVIDA = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // NO autorizada al QA
const STORE_PUERTO = '43a4dabc-b8b4-4b66-82b3-0c75335ca5d1';   // autorizada al QA

async function sr(path: string, opts: any = {}) {
  const r = await fetch(URL_ + path, {
    ...opts,
    headers: {
      apikey: SR,
      Authorization: 'Bearer ' + SR,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let j: any = null; try { j = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, ok: r.ok, j, text };
}

async function appReq(path: string, token: string, opts: any = {}) {
  const r = await fetch(APP + path, {
    ...opts,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Origin: APP,
      ...(opts.headers || {}),
    },
  });
  const text = await r.text();
  let j: any = null; try { j = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, j, text };
}

const results: Array<{ caso: string; prueba: string; esperado: string; obtenido: string; pass: boolean }> = [];
function check(caso: string, prueba: string, esperado: string, obtenido: string, pass: boolean) {
  results.push({ caso, prueba, esperado, obtenido, pass });
  console.log(`  ${pass ? '✓' : '✗ FALLO'} [${caso}] ${prueba} — esperado: ${esperado} | obtenido: ${obtenido}`);
}

async function main() {
  console.log('══ CASOS DE SEGURIDAD EN VIVO (C, D, E, F) ══');
  console.log('── Preparación: usuario QA con membresía clerk en Puerto Padre');

  // 1. Crear/reutilizar usuario QA
  const list = await sr('/auth/v1/admin/users?page=1&per_page=1&email=' + encodeURIComponent(QA_EMAIL));
  let user = list.j?.users?.[0];
  if (!user) {
    const created = await sr('/auth/v1/admin/users', {
      method: 'POST',
      body: JSON.stringify({ email: QA_EMAIL, password: QA_PASS, email_confirm: true }),
    });
    if (!created.ok) throw new Error('create user failed: ' + created.text?.slice(0, 300));
    user = created.j;
  } else {
    await sr('/auth/v1/admin/users/' + user.id, {
      method: 'PUT',
      body: JSON.stringify({ password: QA_PASS, email_confirm: true, ban_duration: 'none' }),
    });
  }
  const qaId = user.id as string;
  console.log('  QA user id:', qaId);

  // Profile rol 'usuario' (operativo, sin nivel administrativo)
  const prof = await sr('/rest/v1/profiles?id=eq.' + qaId + '&select=id');
  if (!prof.j?.length) {
    await sr('/rest/v1/profiles', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ id: qaId, email: QA_EMAIL, full_name: 'QA PI Misión', role: 'usuario', plan: 'free', is_active: true }),
    });
  } else {
    await sr('/rest/v1/profiles?id=eq.' + qaId, {
      method: 'PATCH',
      body: JSON.stringify({ role: 'usuario', is_active: true, deleted_at: null }),
    });
  }

  // Membresía clerk SOLO en Puerto Padre
  await sr('/rest/v1/user_store_memberships?user_id=eq.' + qaId, { method: 'DELETE' });
  const memIns = await sr('/rest/v1/user_store_memberships', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: qaId, store_id: STORE_PUERTO, role: 'clerk', status: 'active' }),
  });
  if (!memIns.ok && !/duplicate/i.test(memIns.text || '')) throw new Error('membership insert failed: ' + memIns.text?.slice(0, 300));

  // Login QA
  const loginRes = await fetch(URL_ + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: QA_EMAIL, password: QA_PASS }),
  });
  if (!loginRes.ok) throw new Error('QA login failed ' + loginRes.status);
  const qaToken = (await loginRes.json()).access_token as string;

  // ── CASO C: rol operativo — solo su tienda ──────────────────────────────
  console.log('── Caso C (usuario ordinario: SOLO tiendas autorizadas)');
  const c1 = await appReq(`/api/physical-inventory?storeId=${STORE_PUERTO}`, qaToken);
  check('C', 'GET inventarios de SU tienda', '200', `HTTP ${c1.status}`, c1.status === 200);

  const c2 = await appReq('/api/stores', qaToken);
  const c2stores = (c2.j?.data || []).map((s: any) => s.name);
  check('C', 'GET /api/stores devuelve SOLO Puerto Padre', '["Puerto Padre VITALLCONS"]', JSON.stringify(c2stores),
    c2stores.length === 1 && c2stores[0] === 'Puerto Padre VITALLCONS');

  // ── CASO E: acceso no autorizado (manipulando storeId) ──────────────────
  console.log('── Caso E (acceso no autorizado a tienda ajena)');
  const e1 = await appReq(`/api/physical-inventory?storeId=${STORE_ENERVIDA}`, qaToken);
  check('E', 'GET inventarios de tienda AJENA → 403', '403', `HTTP ${e1.status}`, e1.status === 403);

  const e2 = await appReq('/api/physical-inventory', qaToken, {
    method: 'POST',
    body: JSON.stringify({
      storeId: STORE_ENERVIDA,
      cutoffDate: new Date(Date.now() - 3600_000).toISOString(),
      scopeType: 'full', blindMode: false,
    }),
  });
  check('E', 'POST crear inventario en tienda AJENA → 403', '403', `HTTP ${e2.status}`, e2.status === 403);

  // Barrera final RPC (PostgREST directo, saltándose la app)
  const e3 = await fetch(URL_ + '/rest/v1/rpc/create_physical_inventory', {
    method: 'POST',
    headers: { apikey: ANON, Authorization: 'Bearer ' + qaToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_store_id: STORE_ENERVIDA, p_cutoff_date: new Date(Date.now() - 3600_000).toISOString(), p_scope_type: 'full', p_blind_mode: false }),
  });
  const e3j: any = await e3.json().catch(() => ({}));
  check('E', 'RPC directa en tienda AJENA → ERR_UNAUTHORIZED', 'ERR_UNAUTHORIZED_CREATE_PI', e3j?.message || `HTTP ${e3.status}`,
    e3j?.message?.includes('ERR_UNAUTHORIZED'));

  // ── CASO F: aislamiento multitienda (RLS stores con token del clerk) ────
  console.log('── Caso F (aislamiento multitienda vía RLS)');
  const f1 = await fetch(URL_ + '/rest/v1/stores?select=id,name&is_active=eq.true', {
    headers: { apikey: ANON, Authorization: 'Bearer ' + qaToken },
  });
  const f1stores = (await f1.json()).map((s: any) => s.name);
  check('F', 'RLS stores como clerk → SOLO su tienda', '["Puerto Padre VITALLCONS"]', JSON.stringify(f1stores),
    f1stores.length === 1 && f1stores[0] === 'Puerto Padre VITALLCONS');

  // ── CASO D: usuario SIN tiendas → vacío legítimo, no error ──────────────
  console.log('── Caso D (usuario sin tiendas: ausencia legítima)');
  await sr('/rest/v1/user_store_memberships?user_id=eq.' + qaId, { method: 'DELETE' });
  const d1 = await appReq('/api/stores', qaToken);
  check('D', 'GET /api/stores sin membresías → 200 data:[]', '200 + []', `HTTP ${d1.status} + ${JSON.stringify(d1.j?.data)}`,
    d1.status === 200 && Array.isArray(d1.j?.data) && d1.j.data.length === 0);

  const d2 = await fetch(URL_ + '/rest/v1/stores?select=id&is_active=eq.true', {
    headers: { apikey: ANON, Authorization: 'Bearer ' + qaToken },
  });
  const d2stores = await d2.json();
  check('D', 'RLS stores sin membresías → [] (vacío, no error)', '[]', JSON.stringify(d2stores),
    Array.isArray(d2stores) && d2stores.length === 0);

  // ── Limpieza ────────────────────────────────────────────────────────────
  console.log('── Limpieza del usuario QA');
  await sr('/rest/v1/user_store_memberships?user_id=eq.' + qaId, { method: 'DELETE' });
  const del = await sr('/rest/v1/rpc/e2e_hard_delete_user', {
    method: 'POST',
    body: JSON.stringify({ p_user_id: qaId }),
  });
  console.log('  e2e_hard_delete_user:', del.status, del.ok ? 'OK' : (del.text || '').slice(0, 200));

  // ── Resumen ─────────────────────────────────────────────────────────────
  const failed = results.filter(r => !r.pass);
  console.log('\n══ RESUMEN ══');
  console.log(`  ${results.length - failed.length}/${results.length} pruebas OK${failed.length ? ' — FALLOS: ' + failed.map(f => f.prueba).join('; ') : ''}`);
  if (failed.length) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
