/**
 * MISIÓN PI-SUPERADMIN — Verificación final de estado en BD (solo lectura).
 * Confirma: PI creado y anulado con auditoría; existencias intactas.
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';

const env = readFileSync(resolve(__dirname, '../.env'), 'utf8');
env.split('\n').forEach(l => { const m = l.match(/^([A-Z_0-9]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; });

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN!;
const ref = URL_.match(/https:\/\/(.*?)\.supabase\.co/)![1];

async function q(sql: string): Promise<any> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) throw new Error(`${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json();
}

async function main() {
  console.log('══ 1. physical_inventories (estado final) ══');
  console.log(JSON.stringify(await q(`
    SELECT pi_number, status, store_id, description, responsible_name,
           voided_at IS NOT NULL AS voided, void_reason
    FROM public.physical_inventories ORDER BY created_at DESC LIMIT 5
  `), null, 1));

  console.log('══ 2. audit_logs de la verificación ══');
  console.log(JSON.stringify(await q(`
    SELECT action, table_name, created_at FROM public.audit_logs
    WHERE action LIKE 'PHYSICAL_INVENTORY%'
    ORDER BY created_at DESC LIMIT 5
  `), null, 1));

  console.log('══ 3. Existencias SIN cambios (inventory / stock_movements de la prueba) ══');
  console.log(JSON.stringify(await q(`
    SELECT
      (SELECT count(*) FROM public.stock_movements
        WHERE created_at > NOW() - INTERVAL '2 hours'
        AND reference_id ILIKE '%PI-2026%') AS movimientos_por_pi,
      (SELECT count(*) FROM public.inventory_adjustments
        WHERE created_at > NOW() - INTERVAL '2 hours') AS ajustes_recientes,
      (SELECT count(*) FROM public.physical_inventory_items) AS lineas_pi,
      (SELECT count(*) FROM public.physical_inventory_adjustments) AS ajustes_pi
  `), null, 1));
}

main().catch(e => { console.error(e); process.exit(1); });
