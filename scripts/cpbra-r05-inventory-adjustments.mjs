#!/usr/bin/env node
/**
 * cpbra-r05-inventory-adjustments.mjs — CP-BRA-FINAL-VERIFICATION (FASE 6 · R-05)
 * SOLO LECTURA: análisis completo del hallazgo R-05 (INV-005):
 *   · contrato real del RPC confirm_inventory_adjustment (producción)
 *   · roles y patrón canManageStore (código + tabla store_memberships)
 *   · historial completo de inventory_adjustments (confirmaciones, desviaciones)
 *   · distribución de desviaciones y escenarios de umbral (sin imponer número)
 * NO modifica nada.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROD_REF = 'wthkddeleylijmonclxg';
if (!process.env.SUPABASE_ACCESS_TOKEN) {
  try {
    const env = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'), 'utf8');
    const m = env.match(/^SUPABASE_ACCESS_TOKEN=(.+)$/m);
    if (m) process.env.SUPABASE_ACCESS_TOKEN = m[1].trim();
  } catch { /* noop */ }
}
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
if (!TOKEN) { console.error('FALLO: token'); process.exit(2); }

async function runSql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROD_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`);
  return JSON.parse(text);
}

console.log('R-05 (INV-005) — ANÁLISIS SOLO LECTURA — ' + new Date().toISOString());

/* 1. Contrato del RPC */
console.log('\n══ 1. RPC confirm_inventory_adjustment (producción) ══');
const fn = await runSql(`SELECT pg_get_functiondef(p.oid::regprocedure) AS def, p.proacl FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='confirm_inventory_adjustment'`);
for (const f of fn) {
  const def = f.def ?? '';
  const sig = def.match(/CREATE OR REPLACE FUNCTION[^(]*\(([^)]*)\)/s);
  console.log('  firma args:', sig ? sig[1].split(',').map(s => s.trim().split(/\s+/)[0]).join(', ') : '(?)');
  console.log('  SECURITY DEFINER:', def.includes('SECURITY DEFINER'));
  console.log('  valida estado draft?:', def.includes("'draft'"));
  console.log('  valida aprobación/rol?:', /role|permission|can_|is_admin|has_store/.test(def));
  console.log('  aplica ajuste a stock?:', /UPDATE\s+(public\.)?inventory_items|product_stock|stock/i.test(def));
  console.log('  audit log?:', def.includes('audit_logs'));
  console.log('  ACL:', JSON.stringify(f.proacl));
}
console.log('\n  --- cuerpo completo (para el expediente) ---');
(fn[0]?.def ?? '').split('\n').forEach(l => console.log('  ' + l));

/* 2. Roles existentes */
console.log('\n══ 2. Roles y memberships ══');
const roles = await runSql(`SELECT role, count(*) AS n FROM user_store_memberships GROUP BY role ORDER BY n DESC`).catch(() => []);
(roles.length ? roles : []).forEach(r => console.log(`  ${r.role}: ${r.n}`));

/* 3. Historial de ajustes */
console.log('\n══ 3. inventory_adjustments — historial completo ══');
const icols = await runSql(`SELECT column_name FROM information_schema.columns WHERE table_name='inventory_adjustment_items' AND table_schema='public' ORDER BY ordinal_position`);
console.log('  columnas items:', icols.map(c => c.column_name).join(', '));
const history = await runSql(`
  SELECT a.id, a.status, a.created_at, a.confirmed_at, a.notes, a.reason,
         u.email AS confirmed_email,
         (SELECT role FROM user_store_memberships m WHERE m.user_id = a.confirmed_by LIMIT 1) AS confirmed_role,
         (SELECT count(*) FROM inventory_adjustment_items i WHERE i.adjustment_id = a.id) AS n_items
  FROM inventory_adjustments a
  LEFT JOIN auth.users u ON u.id = a.confirmed_by
  ORDER BY a.created_at DESC LIMIT 50`);
console.log(`  ajustes (últimos ${history.length}):`);
for (const h of history) {
  console.log(`  · ${String(h.created_at).slice(0,10)} [${h.status}] items=${h.n_items} confirmó=${h.confirmed_email ?? '(nadie)'} rol=${h.confirmed_role ?? '?'} motivo=${String(h.reason ?? h.notes ?? '').slice(0,40)}`);
}

/* 4. Distribución de desviaciones (por ítem, unidades) */
console.log('\n══ 4. Distribución de desviaciones por ítem (unidades y %) ══');
const items = await runSql(`
  SELECT p.name AS product_name, i.expected_quantity, i.counted_quantity, a.created_at
  FROM inventory_adjustments a
  JOIN inventory_adjustment_items i ON i.adjustment_id = a.id
  LEFT JOIN products p ON p.id = i.product_id
  WHERE a.status IN ('confirmed','completed')`);
const dist = [];
for (const it of items) {
  const sys = Number(it.expected_quantity ?? NaN), cnt = Number(it.counted_quantity ?? NaN);
  const dif = Number.isFinite(sys) && Number.isFinite(cnt) ? cnt - sys : NaN;
  if (!Number.isFinite(dif)) continue;
  const pct = Number.isFinite(sys) && sys > 0 ? Math.abs(dif / sys) * 100 : null;
  dist.push({ producto: it.product_name, sys, cnt, dif, pct });
}
console.log(`  ítems con diferencia declarada: ${dist.length}`);
const absSorted = [...dist].sort((a, b) => Math.abs(b.dif) - Math.abs(a.dif));
absSorted.slice(0, 15).forEach(d => console.log(`   · ${String(d.producto).slice(0,32)}: sistema=${d.sys} contado=${d.cnt} dif=${d.dif} pct=${d.pct === null ? 's/d' : d.pct.toFixed(1) + '%'}`));
const withPct = dist.filter(d => d.pct !== null).map(d => d.pct).sort((a, b) => a - b);
if (withPct.length) {
  const q = (p) => withPct[Math.min(withPct.length - 1, Math.floor(p * (withPct.length - 1)))];
  console.log(`  cuantiles de |%|: p50=${q(0.5).toFixed(1)}% p75=${q(0.75).toFixed(1)}% p90=${q(0.9).toFixed(1)}% p95=${q(0.95).toFixed(1)}% max=${withPct[withPct.length-1].toFixed(1)}%`);
  for (const th of [5, 10, 15, 20, 25]) {
    const n = withPct.filter(p => p >= th).length;
    console.log(`  escenario umbral ${th}%: ${n}/${withPct.length} ítems habrían requerido supervisión`);
  }
} else {
  console.log('  sin porcentajes calculables (ítems sin expected_quantity>0)');
}

/* 5. D1–D5 POS (referencia de patrón de autorización) */
console.log('\n══ 5. Patrón de autorización POS (D1–D5) — referencia ══');
console.log('  (vía código: create_sale_v2 exige supervisor_user_id + motivo cuando descuento ≥15% del subtotal o de línea)');
console.log('  (vía canManageStore: roles con gestión — ver src/lib/…; el patrón /api/payments usa admin/manager/encargado)');

console.log('\nFIN — solo lectura, nada fue modificado.');
