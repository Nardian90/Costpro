#!/usr/bin/env node
// cleanup-r05-residuos-e2e.mjs — limpieza de residuos R-05 en la BD AISLADA.
// Guard aislado. Los triggers de auditoría (SEC-026, audit_store_changes,
// backup_restore) escriben filas DURANTE el borrado que autorreferencian la
// tienda → se desactivan temporalmente y se REACTIVAN con verificación.
// Usuarios: vía RPC oficial e2e_hard_delete_user (patrón e2e-*@costpro.test).
import { createClient } from '@supabase/supabase-js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const { assertIsolatedDb } = await import(join(REPO, 'e2e', 'fixtures', 'assert-isolated-db.cjs'));
await assertIsolatedDb();

const URL = process.env.E2E_SUPABASE_URL;
const SERVICE_KEY = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
const MGMT_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!MGMT_TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }
const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });

async function runSql(q) {
  const res = await fetch('https://api.supabase.com/v1/projects/lguovmvrozxgssupkwpf/database/query', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MGMT_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: q }),
  });
  return { ok: res.ok, text: await res.text() };
}

const DISABLE = `
ALTER TABLE public.stores DISABLE TRIGGER trigger_audit_store_changes;
ALTER TABLE public.stores DISABLE TRIGGER trg_audit_backup_restore_protected;
ALTER TABLE public.user_store_memberships DISABLE TRIGGER trg_sec026_membership_audit;
`;
const ENABLE = `
ALTER TABLE public.stores ENABLE TRIGGER trigger_audit_store_changes;
ALTER TABLE public.stores ENABLE TRIGGER trg_audit_backup_restore_protected;
ALTER TABLE public.user_store_memberships ENABLE TRIGGER trg_sec026_membership_audit;
`;

let triggersRestored = false;
try {
  const d = await runSql(DISABLE);
  if (!d.ok) throw new Error('disable triggers: ' + d.text);

  const { data: stores } = await admin.from('stores').select('id').like('name', 'R05-QA-%');
  const ids = (stores || []).map(s => s.id);
  console.log('tiendas residuales:', ids.length);

  if (ids.length) {
    const r1 = await admin.from('audit_logs').delete().in('store_id', ids);
    console.log('audit por store:', r1.error ? 'ERR ' + r1.error.message : 'OK');

    const { data: prods } = await admin.from('products').select('id').in('store_id', ids);
    const pids = (prods || []).map(p => p.id);
    if (pids.length) {
      const rs = await admin.from('stock_movements').delete().in('product_id', pids);
      console.log('stock_movements:', rs.error ? 'ERR ' + rs.error.message : 'OK');
      const ri = await admin.from('inventory').delete().in('product_id', pids);
      console.log('inventory:', ri.error ? 'ERR ' + ri.error.message : 'OK');
      const rp = await admin.from('products').delete().in('id', pids);
      console.log('products:', rp.error ? 'ERR ' + rp.error.message : 'OK');
    }

    const { data: adjs } = await admin.from('inventory_adjustments').select('id').in('store_id', ids);
    const aids = (adjs || []).map(a => a.id);
    if (aids.length) {
      const rai = await admin.from('inventory_adjustment_items').delete().in('adjustment_id', aids);
      console.log('adjustment items:', rai.error ? 'ERR ' + rai.error.message : 'OK');
      const radj = await admin.from('inventory_adjustments').delete().in('id', aids);
      console.log('adjustments:', radj.error ? 'ERR ' + radj.error.message : 'OK');
    }

    const rm = await admin.from('user_store_memberships').delete().in('store_id', ids);
    console.log('memberships:', rm.error ? 'ERR ' + rm.error.message : 'OK');
    const r2 = await admin.from('audit_logs').delete().in('store_id', ids);
    console.log('audit (2ª pasada):', r2.error ? 'ERR ' + r2.error.message : 'OK');

    // Usuarios residuales (patrón e2e-r05-*@costpro.test) vía RPC oficial
    const { data: profs } = await admin.from('profiles').select('id,email').like('email', 'e2e-r05-%');
    let uok = 0, uerr = 0;
    for (const p of profs || []) {
      const { error, data } = await admin.rpc('e2e_hard_delete_user', { p_user_id: p.id });
      if (error) { uerr++; console.log('user ERR', p.email.slice(0, 30), error.message.slice(0, 80)); }
      else if (data === true) uok++;
      else uerr++;
    }
    console.log(`usuarios: eliminados=${uok}, errores=${uerr}`);

    const rs = await admin.from('stores').delete().in('id', ids);
    console.log('stores:', rs.error ? 'ERR ' + rs.error.message : 'OK');
  }
} finally {
  const e = await runSql(ENABLE);
  triggersRestored = e.ok;
  const v = await runSql(`select count(*) as disabled from pg_trigger where tgisinternal=false and tgenabled != 'O' and tgrelid in ('public.stores'::regclass, 'public.user_store_memberships'::regclass) and tgname in ('trigger_audit_store_changes','trg_audit_backup_restore_protected','trg_sec026_membership_audit');`);
  const disabledCount = v.ok ? JSON.parse(v.text)[0]?.disabled : 'n/a';
  console.log(`triggers reactivados: ${triggersRestored ? 'OK' : 'FALLO'} | aún desactivados: ${disabledCount}`);
}

const { count: resStores } = await admin.from('stores').select('*', { count: 'exact', head: true }).like('name', 'R05-QA-%');
const { data: resUsers } = await admin.from('profiles').select('id').like('email', 'e2e-r05-%');
console.log(`FIN: residuos R05-QA stores=${resStores}, usuarios residuales=${(resUsers || []).length}`);
process.exit(resStores === 0 && (resUsers || []).length === 0 && triggersRestored ? 0 : 1);
