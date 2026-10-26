/**
 * MISIÓN PI-SUPERADMIN — Limpieza del usuario QA de las pruebas de seguridad.
 * Patrón cleanup de fc-access-test-user.cjs: ban del auth user + perfil
 * desactivado + membresías eliminadas. (e2e_hard_delete_user no está expuesta
 * en el schema cache de PostgREST en este proyecto.)
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SR = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const QA_EMAIL = 'qa.pi.mision.20261026@costpro.test';

async function sr(path: string, opts: any = {}) {
  const r = await fetch(URL_ + path, {
    ...opts,
    headers: { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });
  return { status: r.status, ok: r.ok, j: await r.json().catch(() => null) };
}

async function main() {
  const list = await sr('/auth/v1/admin/users?page=1&per_page=1&email=' + encodeURIComponent(QA_EMAIL));
  const user = list.j?.users?.[0];
  if (!user) { console.log('QA user no existe — ya limpio'); return; }
  console.log('QA user:', user.id);

  // 1. Membresías fuera
  const m = await sr('/rest/v1/user_store_memberships?user_id=eq.' + user.id, { method: 'DELETE' });
  console.log('membresías eliminadas:', m.status);

  // 2. Perfil desactivado y marcado
  const p = await sr('/rest/v1/profiles?id=eq.' + user.id, {
    method: 'PATCH',
    body: JSON.stringify({ is_active: false, deleted_at: new Date().toISOString() }),
  });
  console.log('perfil desactivado:', p.status);

  // 3. Auth user baneado permanentemente
  const b = await sr('/auth/v1/admin/users/' + user.id, {
    method: 'PUT',
    body: JSON.stringify({ ban_duration: '876000h' }),
  });
  console.log('auth user baneado:', b.status);

  // Verificación final
  const chk = await sr('/rest/v1/profiles?id=eq.' + user.id + '&select=is_active,deleted_at');
  console.log('verificación perfil:', JSON.stringify(chk.j));
}

main().catch(e => { console.error(e); process.exit(1); });
