#!/usr/bin/env node
/**
 * m110-rectification-prod.mjs — CP-FIN-110 D4: RECT-110-A en producción.
 * Asiento de rectificación (ajuste_manual) del SOBRECOSTE histórico de ventas
 * medido al céntimo contra la fuente viva:
 *   Dr ACT_INVENTARIO 2.950.375,33 / Cr GAS_COSTO_VENTAS 2.950.375,33
 *   economic_date 2026-10-31 (anterior al período 01-21/11 → no afecta el
 *   resultado del período), document_type 'AJUSTE_INVENTARIO', número
 *   'RECT-110-A-SOBRECOSTE-COGS', generación ACTIVA (GEN-2) para que el pase 4
 *   de GEN-3 lo copie por p_include_ajuste_ids.
 *
 * Respaldo previo verificable (JSON en OUT) + idempotencia por document_number
 * + guardas fail-closed: importes constantes al céntimo y puente exacto.
 * Doble flag CP-INFRA-019. Uso:
 *   ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND SUPABASE_ACCESS_TOKEN=... \
 *     node scripts/m110-rectification-prod.mjs [--check]
 */
import { writeFileSync } from 'node:fs';
import { assertNotProduction } from './lib/assert-not-production.mjs';

const PROD_REF = 'wthkddeleylijmonclxg';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const OUT = '/home/z/my-project/scripts/out/m110-audit';
const STORE = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'; // ENERVIDA-VITALLCONS
const DOC_NUMBER = 'RECT-110-A-SOBRECOSTE-COGS';
if (!TOKEN) { console.error('FALLO: SUPABASE_ACCESS_TOKEN requerido'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 800)}`);
  return JSON.parse(text);
}

async function main() {
  const mode = process.argv.includes('--check') ? 'read' : 'write';
  assertNotProduction({ mode, projectRef: PROD_REF, context: 'm110-rectification-prod.mjs' });

  // 0) Puente exacto vivo (read-only): importe = WAC vivo − mayor ACT_INVENTARIO
  const bridge = await runSql(`
    SELECT
      round((SELECT coalesce(sum(p.stock_current * coalesce(p.cost_average, 0)), 0)
             FROM public.products p WHERE p.store_id = '${STORE}'), 2) AS valor_wac_vivo,
      round((SELECT coalesce(sum(CASE WHEN m.sense = 'debito' THEN m.amount_cup ELSE -m.amount_cup END), 0)
             FROM public.fin_movements m
             JOIN public.fin_entries e ON e.id = m.entry_id
             JOIN public.fin_categories c ON c.code = m.category_code
             WHERE m.store_id = '${STORE}' AND c.code = 'ACT_INVENTARIO'
               AND e.generation_id IS NOT DISTINCT FROM public.fin_active_generation('${STORE}')
               AND e.economic_date <= DATE '2026-11-21'), 2) AS mayor_inventario_gen_activa,
      public.fin_active_generation('${STORE}') AS gen_activa;`);
  const wac = Number(bridge[0].valor_wac_vivo);
  const ledger = Number(bridge[0].mayor_inventario_gen_activa);
  const expected = Math.round((wac - ledger) * 100) / 100;
  console.log(`Puente vivo: WAC=${wac} mayor=${ledger} → importe esperado=${expected}`);
  writeFileSync(`${OUT}/m110-rect-pre-bridge.json`, JSON.stringify(bridge[0], null, 1));

  // 1) Existencia previa (idempotencia)
  const exists = await runSql(`
    SELECT e.id, e.economic_date FROM public.fin_entries e
    WHERE e.store_id='${STORE}' AND e.document_number='${DOC_NUMBER}' AND e.event='ajuste_manual' LIMIT 1;`);
  if (exists.length) {
    console.log('RECT-110-A YA EXISTE (idempotente):', JSON.stringify(exists[0]));
    return;
  }

  if (mode === 'write') {
    // 2) Guarda fail-closed: el importe medido debe ser EXACTAMENTE 2950375.33
    //    (constante certificada del diagnóstico; cualquier desvío aborta).
    if (Math.abs(expected - 2950375.33) > 0.005) {
      throw new Error(`GUARDA: el puente vivo (${expected}) diverge de la constante certificada 2950375.33 — ABORTAR y re-diagnosticar`);
    }
    const res = await runSql(`
      INSERT INTO public.fin_entries (
        store_id, document_type, document_id, document_number, event, payment_ref,
        economic_date, rule_version_id, movements_snapshot, description, created_by, generation_id)
      SELECT '${STORE}', 'AJUSTE_INVENTARIO', NULL, '${DOC_NUMBER}', 'ajuste_manual', NULL,
             DATE '2026-10-31', NULL,
             $J$[{"traza":{"regla":"rectificacion-cp-fin-110","motivo":"sobrecosto histórico de ventas (FAC-VITALLCONS-001 + COGS congelado DF-02) — medido al céntimo contra la fuente viva","puente":"WAC vivo − mayor GEN activa","expediente":"docs/audits/cp-fin-auditoria-enervida-110"}},
                  "amount": 2950375.33, "sentido": "debito", "categoria": "ACT_INVENTARIO"},
                 {"traza":{"regla":"rectificacion-cp-fin-110"},
                  "amount": 2950375.33, "sentido": "credito", "categoria": "GAS_COSTO_VENTAS"}]$J$::jsonb,
             'Rectificación CP-FIN-110 D4: sobrecosto histórico de COGS (2.950.375,33) — Dr ACT_INVENTARIO / Cr GAS_COSTO_VENTAS. Puente: recepciones 2.961.795,90 ✓, vales 810.567,06 ✓, ajustes 1,00 ✓, devoluciones 2,00 ✓, apertura 0 ✓ → residuo 100% COGS.',
             NULL, public.fin_active_generation('${STORE}')
      RETURNING id;`);
    const entryId = res[0].id;
    await runSql(`
      INSERT INTO public.fin_movements (entry_id, store_id, category_code, sense, amount, currency, exchange_rate, economic_date, document_number, description)
      VALUES ('${entryId}', '${STORE}', 'ACT_INVENTARIO', 'debito', 2950375.33, 'CUP', 1, DATE '2026-10-31', '${DOC_NUMBER}', 'Rectificación sobrecosto histórico COGS — Dr inventario'),
             ('${entryId}', '${STORE}', 'GAS_COSTO_VENTAS', 'credito', 2950375.33, 'CUP', 1, DATE '2026-10-31', '${DOC_NUMBER}', 'Rectificación sobrecosto histórico COGS — Cr costo de ventas');`);
    console.log('RECT-110-A INSERTADA en GEN activa. entry_id =', entryId);
    // Auditoría del expediente (patrón RECT-013/014: audit_logs SYSTEM_RECT...)
    await runSql(`
      INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
      VALUES (NULL, 'SYSTEM_RECT110_ENTRY', 'fin_entries', '${entryId}',
              jsonb_build_object('entrada', null),
              jsonb_build_object('entry_id', '${entryId}', 'importe', 2950375.33,
                                 'documento', '${DOC_NUMBER}', 'puente', 'WAC vivo − mayor GEN activa'),
              '${STORE}');`);
  }

  // 3) Verificación final (read-only, re-ejecutable)
  const post = await runSql(`
    SELECT e.id, e.generation_id, e.economic_date, e.movements_snapshot::text AS snap,
           (SELECT round(coalesce(sum(CASE WHEN m.sense='debito' THEN m.amount_cup ELSE -m.amount_cup END),0),2)
            FROM public.fin_movements m WHERE m.entry_id = e.id) AS balance_debito_credito
    FROM public.fin_entries e
    WHERE e.store_id='${STORE}' AND e.document_number='${DOC_NUMBER}' AND e.event='ajuste_manual' LIMIT 1;`);
  console.log('POST:', JSON.stringify(post, null, 1));
  writeFileSync(`${OUT}/m110-rect-post.json`, JSON.stringify(post, null, 1));
}

main().catch(err => { console.error('FALLO:', err.message); process.exit(1); });
