/**
 * MISIÓN TRANSVERSAL HSAA-SUPERADMIN (2026-10-27) — Evidencia ANTES de la
 * corrección (Caso K, parte 1). SOLO LECTURA contra la BD viva.
 *
 * Demuestra el defecto real: el superadmin de plataforma (sin membresías por
 * diseño) es rechazado por has_store_access_as y su familia (check estricto
 * 'admin' de perfil), mientras que el check central is_admin_check SÍ lo
 * reconoce — y mientras que 'admin' obtiene TRUE por la misma vía.
 *
 * Uso: bun scripts/mision-hsaa-before.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const PROJECT = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace('https://', '').replace('.supabase.co', '');

async function q(sql: string): Promise<any[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const t = await r.text();
  if (!r.ok) { console.error('QUERY FAIL', r.status, t.slice(0, 300)); process.exit(4); }
  return JSON.parse(t);
}

async function scalar(sql: string): Promise<any> {
  const rows = await q(sql);
  return rows[0] ? Object.values(rows[0])[0] : null;
}

async function main() {
  console.log('══ EVIDENCIA ANTES (defecto vivo) — solo lectura ══');

  const superadmin = await q(`SELECT id, email, role FROM public.profiles WHERE email='admin@demo.com'`);
  const SA = superadmin[0].id as string;
  console.log(`superadmin: ${superadmin[0].email} (${superadmin[0].role}) id=${SA}`);

  const admin = await q(`SELECT id, email, role FROM public.profiles WHERE role='admin' LIMIT 1`);
  const AD = admin.length ? (admin[0].id as string) : null;
  if (AD) console.log(`admin de plataforma (control): ${admin[0].email} id=${AD}`);

  const stores = await q(`SELECT id, name, tenant_id FROM public.stores WHERE is_active=true ORDER BY name LIMIT 3`);
  const S1 = stores[0].id as string;
  const S2 = (stores[1] || stores[0]).id as string;
  console.log(`tiendas activas de control: ${stores.map(s => s.name).join(' | ')}`);
  console.log(`membresías del superadmin: ${await scalar(`SELECT count(*) FROM public.user_store_memberships WHERE user_id='${SA}'`)}`);

  console.log('\n── Defecto (superadmin SIN membresías):');
  console.log(`  has_store_access_as(SA, ${stores[0].name})      = ${await scalar(`SELECT public.has_store_access_as('${SA}', '${S1}')`)}`);
  console.log(`  can_admin_reverse_transaction(SA, tienda)      = ${await scalar(`SELECT public.can_admin_reverse_transaction('${SA}', '${S1}')`)}`);
  console.log(`  can_reverse_document(SA, tienda, 'receipt')    = ${await scalar(`SELECT public.can_reverse_document('${SA}', '${S1}', 'receipt')`)}`);
  console.log(`  has_management_access_as(SA, tienda)           = ${await scalar(`SELECT public.has_management_access_as('${SA}', '${S1}')`)}`);
  console.log(`  get_transferable_stores(SA, store)             = ${JSON.stringify(await q(`SELECT public.get_transferable_stores('${SA}', '${S2}') AS res`).then(r => r[0]?.res))}`);

  console.log('\n── Control positivo (el MISMO flujo con admin de plataforma):');
  if (AD) {
    console.log(`  has_store_access_as(AD, tienda)                = ${await scalar(`SELECT public.has_store_access_as('${AD}', '${S1}')`)}`);
    console.log(`  can_admin_reverse_transaction(AD, tienda)      = ${await scalar(`SELECT public.can_admin_reverse_transaction('${AD}', '${S1}')`)}`);
  }

  console.log('\n── Control del check central (la fuente a la que se delegará):');
  console.log(`  is_admin_check(SA)                             = ${await scalar(`SELECT public.is_admin_check('${SA}')`)}`);

  console.log('\n── approve_transfer: gate de aprobador estricto (texto vivo):');
  const ap = await scalar(`SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='approve_transfer'`);
  console.log(`  contiene «v_user_role = 'admin'» estricto:      = ${/v_user_role\s*=\s*'admin'/.test(String(ap))}`);

  console.log('\nCONCLUSIÓN ANTES: superadmin falsamente rechazado; admin e is_admin_check funcionan →');
  console.log('la delegación a is_admin_check corrige la raíz sin expandir permisos de otros roles.');
}

main().catch(e => { console.error(e); process.exit(1); });
