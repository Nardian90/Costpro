#!/usr/bin/env node
/**
 * CP-INFRA-020 T5.1 — Censo de filas (cheap) de tablas de negocio.
 *
 * Guarda en un JSON local el conteo de filas por tabla de negocio de la BD
 * apuntada por DATABASE_URL y lo compara contra un censo anterior (o contra
 * el manifiesto del último respaldo cifrado si se pasa --against <json>),
 * informando caídas grandes (>20% relativo y >50 filas absolutas) SIN
 * mostrar datos: solo números de tabla.
 *
 * Guard de lectura (fail-closed):
 *   · SOLO SELECT count(*) — sin datos de fila, sin PII.
 *   · Contra producción exige ALLOW_PROD=read-only (scripts/lib/
 *     assert-not-production.mjs) y muestra identidad antes de contar.
 *   · Sin DATABASE_URL → error accionable, nunca un fallback silencioso.
 *
 * Uso:
 *   node scripts/ops/row-census.cjs                        # censo nuevo → scripts/ops/censos/censo-<ts>.json (o --out)
 *   node scripts/ops/row-census.cjs --against <censo.json> # censo + diff contra el anterior
 *
 * Cuándo correrlo: con cada respaldo semanal (ver docs/OPERATIONS/
 * PROCESO_CAMBIOS_PRODUCCION.md) y antes/después de operaciones masivas.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Tablas de negocio (mismo criterio que CP-INFRA-020 T4/D4.2 + snapshots de
// evidencia que sobrevivieron al borrado original).
const TABLAS = [
  'tenants', 'stores', 'profiles', 'user_store_memberships',
  'products', 'product_variants', 'categories', 'suppliers', 'units_of_measure',
  'transactions', 'transaction_items', 'sales', 'sale_items',
  'inventory', 'inventory_movements', 'inventory_batches', 'inventory_snapshots',
  'inventory_adjustments', 'inventory_adjustment_items', 'stock_movements',
  'cash_closures', 'cash_movements', 'cash_register_sessions',
  'purchase_orders', 'purchase_items', 'receipts', 'receipt_items',
  'transfers', 'transfer_items',
  'audit_logs', 'business_events',
  'commission_rules', 'commission_rule_versions',
  'idempotency_keys', 'sync_log',
];

const UMBRAL_PCT = 20;   // caída relativa
const UMBRAL_ABS = 50;   // y además filas absolutas

function parseArgs() {
  const args = { against: null, out: null };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--against') args.against = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') args.help = true;
  }
  return args;
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    console.log('Uso: node scripts/ops/row-census.cjs [--against censo-anterior.json] [--out salida.json]');
    process.exit(0);
  }

  // ── Guard de lectura (CP-INFRA-019/020): fail-closed ────────────────────
  // El censo es SOLO LECTURA (count(*)); el guard exige ALLOW_PROD=read-only
  // si el destino resulta ser producción, y bloquea destinos no identificables.
  const guard = await import('../lib/assert-not-production.mjs');
  const dbUrl = process.env.DATABASE_URL || process.env.E2E_SUPABASE_DB_URL;
  if (!dbUrl) {
    console.error('CP-INFRA-020 row-census: falta DATABASE_URL (o E2E_SUPABASE_DB_URL). Exporta la cadena de conexión (sin credenciales en el comando) y reintenta.');
    process.exit(2);
  }
  try {
    guard.assertNotProduction({ mode: 'read', url: dbUrl, context: 'row-census' });
  } catch (e) {
    console.error(`CP-INFRA-020 row-census: guard de producción bloqueó el censo.\n${e.message}`);
    process.exit(2);
  }

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  // Identidad de la BD (para dejar constancia en el JSON, sin credenciales)
  const ident = await client.query('select current_database() as db, current_user as usr');
  console.log(`censo sobre: bd=${ident.rows[0].db} usuario=${ident.rows[0].usr}`);

  const conteos = {};
  const ausentes = [];
  for (const t of TABLAS) {
    try {
      const r = await client.query(`select count(*)::bigint as n from public.${JSON.stringify(t).replace(/"/g, '')}`);
      conteos[t] = Number(r.rows[0].n);
    } catch {
      ausentes.push(t); // tabla inexistente en esta BD: se registra, no se inventa
    }
  }
  await client.end();

  const now = new Date();
  const censo = {
    _doc: 'Censo de filas CP-INFRA-020 — solo conteos por tabla (sin datos/PII). Comparar con --against.',
    generado_en: now.toISOString(),
    base_datos: ident.rows[0].db,
    usuario: ident.rows[0].usr,
    conteos,
    tablas_ausentes: ausentes,
  };

  const outPath = args.out || path.join(__dirname, 'censos', `censo-${now.toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(censo, null, 2));
  console.log(`censo guardado: ${outPath} (${Object.keys(conteos).length} tablas${ausentes.length ? `, ${ausentes.length} ausentes` : ''})`);

  // ── Diff contra censo anterior ──────────────────────────────────────────
  if (args.against) {
    if (!fs.existsSync(args.against)) {
      console.error(`--against: no existe ${args.against}`);
      process.exit(2);
    }
    const prev = JSON.parse(fs.readFileSync(args.against, 'utf8'));
    let caidas = 0;
    console.log('\ndiff contra ' + args.against + ':');
    for (const [t, n] of Object.entries(censo.conteos)) {
      const p = prev.conteos?.[t];
      if (p === undefined) { console.log(`  [nueva] ${t}: ${n}`); continue; }
      if (n < p) {
        const delta = p - n;
        const pct = p > 0 ? (delta / p) * 100 : 0;
        if (delta >= UMBRAL_ABS && pct >= UMBRAL_PCT) {
          console.log(`  [⚠ CAÍDA] ${t}: ${p} → ${n} (-${delta}, -${pct.toFixed(1)}%)`);
          caidas++;
        } else if (delta > 0) {
          console.log(`  [menor] ${t}: ${p} → ${n} (-${delta})`);
        }
      }
    }
    if (caidas === 0) console.log('  sin caídas grandes (>20% y >50 filas) ✓');
    else {
      console.error(`\nCP-INFRA-020 row-census: ${caidas} tabla(s) con caída grande frente al censo anterior. NO restaures a ciegas: revisa el respaldo más reciente y el acta de la operación.`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(`CP-INFRA-020 row-census: ${e.message}`);
  process.exit(1);
});
