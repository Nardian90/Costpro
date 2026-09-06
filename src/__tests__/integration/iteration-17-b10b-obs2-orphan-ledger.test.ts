/**
 * W9.5 — B-10b-OBS-2 · Iteración 17
 *
 * Detector permanente de STOCK HUÉRFANO: products.stock_current sin ledger
 * (inventory ausente / Σ stock_movements divergente). Fuente normativa:
 * audit-evidence/20260906-w9-b10b-obs2/ (pack completo, fase READ-ONLY).
 *
 * CONGELA (mandato §20):
 *   1. el universo exacto de la tienda d1c4ba0e (U=124, U1=108/6.553 u, ledger=0)
 *   2. el escaneo GLOBAL de huérfanos (142 filas, 100% ORPHAN_FULL, 0 MISMATCH)
 *   3. la prueba del backup 08-02 (110/114 frozen; prod==inv==Σmov=5.495)
 *   4. el algoritmo de detección puro (válido para CUALQUIER tienda, no solo d1c4ba0e)
 *   5. la naturaleza del hallazgo: stock REAL respaldado por backup + 10 Test
 *   6. fase sin mutaciones: decisión HUMAN_DECISION_REQUIRED documentada
 *   7. valor económico etiquetado ESTIMATED (nunca precio arbitrario)
 *   8. root cause: purge SQL directo post-08-17; NINGÚN reset deja stock>0
 *
 * El CSV 10-global-orphan-scan.csv se regenera contra la BD viva con
 * audit-evidence/20260906-w9-b10b-obs2/scripts/{g13_residual.sql,gen_csvs.js};
 * si el estado de la BD cambia (reparación futura o nuevo drift), el detector
 * de este test deja de cuadrar y FALLA — que es exactamente su función.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const PACK = join(process.cwd(), 'audit-evidence', '20260906-w9-b10b-obs2');
const readPack = (f: string) => readFileSync(join(PACK, f), 'utf-8');
const readCsv = (f: string): string[][] =>
  readPack(f).trim().split('\n').map(l => {
    const cells: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (inQ) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    return cells;
  });
const toObjects = (rows: string[][]) => {
  const header = rows[0];
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};

const STORE = 'd1c4ba0e';

// ── Detector puro (GATE 16): clasificación global, independiente de tienda ──
type StockRow = { stock: number; invQty: number | null; movsSum: number | null; movsN: number };
export function classifyStockConsistency(r: StockRow): string {
  if (r.invQty === null && r.movsN === 0) return 'ORPHAN_FULL';
  if (r.invQty === null) return 'ORPHAN_NO_INVENTORY';
  if (r.movsN === 0) return 'ORPHAN_NO_MOVEMENTS';
  if (r.invQty !== r.stock || r.movsSum !== r.stock) return 'MISMATCH';
  return 'OK';
}

describe('PT-OBS2.1 — Universo exacto de la tienda (GATE 1/2)', () => {
  const universe = toObjects(readCsv('02-store-universe.csv'));
  const get = (capa: string) => universe.find(u => u.capa === capa)!;

  it('reconstruye U=124 productos y U1=108/6553 sin aceptar el número del spec', () => {
    expect(get('U products_total').valor).toBe('124');
    expect(get('U1 stock_gt0_count').valor).toBe('108');
    expect(get('U1 stock_gt0_units').valor).toBe('6553');
  });

  it('el ledger está COMPLETAMENTE ausente (inventory/movements/kardex/transactions = 0)', () => {
    expect(get('U2 inventory_rows').valor).toBe('0');
    expect(get('U3 stock_movements').valor).toBe('0');
    expect(get('U4 kardex_entries').valor).toBe('0');
    expect(get('U5 transactions').valor).toBe('0');
    expect(get('U5 transaction_items').valor).toBe('0');
  });

  it('las 13 devoluciones SOBREVIVIERON al purge y ninguna capa U6-U9 existe', () => {
    expect(Number(get('U5 devolutions').valor)).toBe(13);
    expect(get('U6 receipts').valor).toBe('0');
    expect(get('U7 production_orders').valor).toBe('0');
    expect(get('U9 transfers_origin').valor).toBe('0');
    for (const key of ['matrix with_inventory', 'matrix with_movements', 'matrix with_kardex', 'matrix with_transactions']) {
      expect(Number(get(key).valor)).toBe(0);
    }
  });
});

describe('PT-OBS2.2 — Detector global de huérfanos (GATE 11/16)', () => {
  const scan = toObjects(readCsv('10-global-orphan-scan.csv'));

  const rowToStockRow = (r: Record<string, string>): StockRow => ({
    stock: Number(r.stock_current),
    invQty: r.inventory_qty === 'MISSING' ? null : Number(r.inventory_qty),
    movsSum: Number(r.movs_sum),
    movsN: Number(r.movs_n),
  });

  it('el detector reproduce la clasificación de TODAS las filas del escaneo global', () => {
    expect(scan.length).toBeGreaterThan(0);
    for (const r of scan) {
      expect(classifyStockConsistency(rowToStockRow(r))).toBe(r.classification);
    }
  });

  it('detecta exactamente 142 huérfanos globales, todos ORPHAN_FULL (0 MISMATCH / parciales)', () => {
    expect(scan).toHaveLength(142);
    expect(scan.filter(r => r.classification === 'ORPHAN_FULL')).toHaveLength(142);
    expect(scan.filter(r => r.classification !== 'ORPHAN_FULL')).toHaveLength(0);
  });

  it('d1c4ba0e concentra 108 productos / 6.553 unidades', () => {
    const store = scan.filter(r => r.store_id === STORE);
    expect(store).toHaveLength(108);
    const units = store.reduce((a, r) => a + Number(r.stock_current), 0);
    expect(units).toBe(6553);
  });

  it('las tiendas comerciales vivas NO están en el escaneo (pipeline canónico consistente)', () => {
    expect(scan.some(r => r.store_id.startsWith('43a4dabc'))).toBe(false);
    expect(scan.some(r => r.store_id.startsWith('5e6fe821'))).toBe(false);
  });
});

describe('PT-OBS2.3 — Algoritmo de detección con fixtures sintéticos (GATE 16)', () => {
  it('detecta el patrón exacto del incidente en cualquier tienda futura', () => {
    expect(classifyStockConsistency({ stock: 50, invQty: null, movsSum: null, movsN: 0 })).toBe('ORPHAN_FULL');
    expect(classifyStockConsistency({ stock: 50, invQty: null, movsSum: 50, movsN: 2 })).toBe('ORPHAN_NO_INVENTORY');
    expect(classifyStockConsistency({ stock: 50, invQty: 50, movsSum: null, movsN: 0 })).toBe('ORPHAN_NO_MOVEMENTS');
    expect(classifyStockConsistency({ stock: 50, invQty: 45, movsSum: 50, movsN: 3 })).toBe('MISMATCH');
    expect(classifyStockConsistency({ stock: 50, invQty: 50, movsSum: 48, movsN: 3 })).toBe('MISMATCH');
  });
});

describe('PT-OBS2.4 — Prueba del backup 08-02 y naturaleza del stock (GATE 7/8/10)', () => {
  const origin = toObjects(readCsv('08-origin-analysis.csv'));

  it('110 de los 114 productos del backup están CONGELADOS idénticos hoy', () => {
    const inBackup = origin.filter(r => r.origin.includes('bulk_import_20260730'));
    expect(inBackup.length).toBe(114);
    expect(inBackup.filter(r => r.origin_class === 'FROZEN_FROM_BACKUP')).toHaveLength(110);
    expect(inBackup.filter(r => r.origin_class === 'MUTATED_POST_BACKUP')).toHaveLength(4);
  });

  it('el stock respaldado por backup es REAL_STOCK_SUPPORTED (nunca inventado)', () => {
    const real = origin.filter(r => r.stock_reality === 'REAL_STOCK_SUPPORTED');
    expect(real.length).toBeGreaterThan(0);
    expect(origin.filter(r => r.stock_reality === 'CORRUPTED')).toHaveLength(0);
  });

  it('los 10 productos Test del 08-07 están clasificados TEST_DATA (126 u)', () => {
    const tests = origin.filter(r => r.origin_class === 'TEST_PRODUCT_POST_BACKUP');
    expect(tests).toHaveLength(10);
    expect(tests.every(r => r.origin.includes('test_scripts_20260807'))).toBe(true);
    const units = tests.reduce((a, r) => a + Number(r.stock_current), 0);
    expect(units).toBe(126);
  });

  it('reconstrucción: todos los huérfanos vivos son MISSING_LEDGER con difference = stock', () => {
    const ledger = toObjects(readCsv('07-ledger-reconstruction.csv'));
    const orphans = ledger.filter(r => r.classification === 'MISSING_LEDGER');
    expect(orphans).toHaveLength(108);
    for (const r of orphans) {
      expect(Number(r.ledger_qty)).toBe(0);
      expect(Number(r.difference)).toBe(Number(r.stock_current));
      expect(r.inventory_qty).toBe('');
    }
  });
});

describe('PT-OBS2.5 — Valor económico etiquetado y root cause (GATE 13/12)', () => {
  it('toda valoración es ESTIMATED sobre cost_average (nunca precio arbitrario)', () => {
    const econ = toObjects(readCsv('12-economic-impact.csv'));
    expect(econ).toHaveLength(108);
    expect(econ.every(r => r.valuation_label === 'ESTIMATED')).toBe(true);
    const units = econ.reduce((a, r) => a + Number(r.units_orphan), 0);
    expect(units).toBe(6553);
  });

  it('ningún evento store_reset/restore auditado apunta a la tienda (purge = SQL directo)', () => {
    const audit = toObjects(readCsv('09-audit-analysis.csv'));
    const resetRestore = audit.filter(r => r.seccion === 'global_reset_restore_event');
    expect(resetRestore.length).toBeGreaterThan(0);
    expect(resetRestore.filter(r => r.clave.includes(STORE))).toHaveLength(0);
  });

  it('el análisis de writers congela que NINGÚN reset_store_data deja stock>0', () => {
    const writers = readPack('05-stock-writers.md');
    expect(writers).toContain('NINGUNA deja');
    expect(writers).toContain('stock_current=0');
    expect(writers).toContain('session_replication_role');
  });

  it('la decisión queda documentada como HUMAN_DECISION_REQUIRED (fase sin mutaciones)', () => {
    const decision = readPack('14-repair-decision.md');
    expect(decision).toContain('BLOCKED — HUMAN DECISION REQUIRED');
    expect(decision).toContain('NINGUNA');
  });
});
