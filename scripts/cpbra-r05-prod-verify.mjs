#!/usr/bin/env node
/** §2.4 — Verificación productiva R-05 (SOLO LECTURA, sin movimientos artificiales). */
import { assertNotProduction } from '/home/z/my-project/Costpro/scripts/lib/assert-not-production.mjs';

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: token'); process.exit(2); }
const PROD_REF = 'wthkddeleylijmonclxg';
await assertNotProduction({ mode: 'read', projectRef: PROD_REF, context: 'cpbra-r05-prod-verify.mjs' });

const apiBase = `https://api.supabase.com/v1/projects/${PROD_REF}/database/query`;
async function runSql(query) {
  const res = await fetch(apiBase, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text);
}

const out = {};

// 1. Distribución de estados de ajustes (impacto operativo del deploy)
out.ajustes_por_estado = await runSql(`
  SELECT status, count(*) FROM public.inventory_adjustments GROUP BY status ORDER BY status;`);

// 2. Auditoría ADJUSTMENT_CONFIRMED tras el deploy (esperado 0 — nadie confirmó aún)
out.audit_confirmadas = await runSql(`
  SELECT count(*) AS n FROM public.audit_logs WHERE action = 'ADJUSTMENT_CONFIRMED';`);

// 3. Estructura audit_logs: constraint de store_id compatible con el INSERT del RPC
out.audit_constraint = await runSql(`
  SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid = 'public.audit_logs'::regclass AND contype = 'c' LIMIT 5;`);

// 4. Historial: quién confirmó ajustes (compatibilidad del caso encargado)
out.historial_confirmaciones = await runSql(`
  SELECT a.id, a.status, a.confirmed_at, m.role AS rol_del_confirmador
    FROM public.inventory_adjustments a
    LEFT JOIN public.user_store_memberships m
      ON m.user_id = a.confirmed_by AND m.store_id = a.store_id
   WHERE a.confirmed_by IS NOT NULL
   ORDER BY a.confirmed_at DESC LIMIT 5;`);

// 5. ACL final del RPC
out.acl_final = await runSql(`
  SELECT string_agg(distinct rg.grantee, ',' ORDER BY rg.grantee) AS grantees
    FROM information_schema.role_routine_grants rg
   WHERE rg.specific_schema='public' AND rg.routine_name='confirm_inventory_adjustment'
     AND rg.privilege_type='EXECUTE';`);

// 6. Kardex: total de movimientos adjustment (invariante: no cambió por el deploy)
out.kardex_adjustments = await runSql(`
  SELECT count(*) AS n FROM public.stock_movements WHERE movement_type = 'adjustment';`);

console.log(JSON.stringify(out, null, 1));
