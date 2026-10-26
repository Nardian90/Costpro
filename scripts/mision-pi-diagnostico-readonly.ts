/**
 * Diagnóstico READ-ONLY del contexto real del usuario admin@demo.com (MISIÓN §2).
 * No modifica datos: solo SELECT sobre vistas de catálogo y tablas.
 * Uso: bun scripts/mision-pi-diagnostico-readonly.ts
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = SUPABASE_URL.match(/https:\/\/(.*?)\.supabase\.co/)![1];

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) { console.error('SQL ERROR:', text.slice(0, 400)); return null; }
  try { return JSON.parse(text); } catch { return text.slice(0, 400); }
}

async function main() {
  console.log('═══ 1. Usuario autenticado admin@demo.com (profiles) ═══');
  console.log(JSON.stringify(await q(`
    SELECT id, email, role, plan, tenant_id, active_store_id, store_id, deleted_at, is_active
    FROM public.profiles WHERE email = 'admin@demo.com'
  `), null, 1));

  console.log('═══ 2. Membresías de tienda del usuario ═══');
  console.log(JSON.stringify(await q(`
    SELECT m.user_id, m.store_id, m.role, m.status, s.name AS store_name
    FROM public.user_store_memberships m
    LEFT JOIN public.stores s ON s.id = m.store_id
    WHERE m.user_id = (SELECT id FROM public.profiles WHERE email = 'admin@demo.com')
  `), null, 1));

  console.log('═══ 3. Tiendas activas y su tenant ═══');
  console.log(JSON.stringify(await q(`
    SELECT id, name, is_active, is_archived, tenant_id, slug
    FROM public.stores ORDER BY name
  `), null, 1));

  console.log('═══ 4. Tenants ═══');
  console.log(JSON.stringify(await q(`
    SELECT id, name, is_active, owner_id FROM public.tenants
  `), null, 1));

  console.log('═══ 5. Definición VIVA de has_store_role (3 args) — ¿incluye admin-level? ═══');
  console.log(JSON.stringify(await q(`
    SELECT pg_get_functiondef(oid) AS def FROM pg_proc
    WHERE proname = 'has_store_role' AND pronargs = 3
  `), null, 1));

  console.log('═══ 6. Definición VIVA de gate en create_physical_inventory ═══');
  console.log(JSON.stringify(await q(`
    SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname = 'create_physical_inventory'
  `), null, 1));

  console.log('═══ 7. is_admin() e is_admin_check() vivas ═══');
  console.log(JSON.stringify(await q(`
    SELECT pg_get_functiondef(oid) AS def FROM pg_proc WHERE proname IN ('is_admin','is_admin_check') ORDER BY proname
  `), null, 1));

  console.log('═══ 8. Volumen de datos (¿entorno de pruebas o producción?) ═══');
  console.log(JSON.stringify(await q(`
    SELECT
      (SELECT count(*) FROM public.profiles) AS perfiles,
      (SELECT count(*) FROM public.stores) AS tiendas,
      (SELECT count(*) FROM public.user_store_memberships) AS membresias,
      (SELECT count(*) FROM public.physical_inventories) AS inventarios_fisicos,
      (SELECT count(*) FROM public.transactions) AS ventas,
      (SELECT count(*) FROM public.products) AS productos
  `), null, 1));

  console.log('═══ 9. Políticas RLS vivas de physical_inventories ═══');
  console.log(JSON.stringify(await q(`
    SELECT policyname, cmd, qual FROM pg_policies
    WHERE tablename = 'physical_inventories'
  `), null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
