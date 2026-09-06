/**
 * W9.5 — B-10b-OBS-2 · Iteración 18 · REPAIR DESIGN (GATE 20)
 *
 * Test permanente de DISEÑO de la reparación del residuo huérfano. NO se conecta a la
 * base de datos y NO escribe en ella: valida el pack de diseño
 * audit-evidence/20260906-w9-b10b-obs2-repair-design/ y su matemática.
 *
 * CONGELA (mandato §G20):
 *   1. el universo de reparación (98 productos / 6.427 u; sets A=94/B=4/C=10; U=124)
 *   2. las exclusiones (10 Test EXCLUDED_FROM_REPAIR + 16 stock-0)
 *   3. las cantidades (identidades 5.495+932=6.427=6.553−126; propuesta == current)
 *   4. el WAC (98/98 WAC_CONFIRMED; unit_cost == cost_average; invariancia del blend D-01)
 *   5. la clasificación (A frozen == backup; B delta CONFIRMED por journal BE; C test)
 *   6. la clave de idempotencia (formato de batch y barrera de prefijo)
 *   7. las invariantes del diseño (I1–I14 vía simulación canónica reproducible aquí)
 *   8. la simulación completa (totals cuadran; 2ª ejecución rechazada)
 *   9. la neutralidad financiera (0 payments/transactions/commissions; valor ESTIMATED)
 *  10. la evidencia usada para la futura reparación (SHA256 de los artefactos congelados)
 *
 * Si se altera CUALQUIER artefacto congelado (nueva corrida de scripts, edición manual,
 * drift), este test FALLA — su función es blindar el paquete que la firma humana aprobará.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';

const PACK = join(process.cwd(), 'audit-evidence', '20260906-w9-b10b-obs2-repair-design');
const readPack = (f: string) => readFileSync(join(PACK, f), 'utf-8');
const readJson = (f: string) => JSON.parse(readPack(f));

interface FrozenRow {
  product_id: string; id8: string; sku: string; name: string;
  set: 'A' | 'B' | 'C'; classification: string; confidence: string;
  backup_qty: number | null; current_stock: number; wac: number | null;
  wac_class: string; status: string; is_active: boolean;
  be_total: number; be_post: number; be_post_qty: number;
  be_last_new_qty: number | null; proposed_repair_qty: number;
}
const frozen = readJson(join('raw', 'frozen_universe.json')) as {
  store: string; backup_ts: string; summary: Record<string, number>;
  rows: FrozenRow[];
};
const sim = readJson(join('raw', 'simulation_result.json')) as {
  movements_applied: number; invariants_pass: boolean; invariants_violations: string[];
  idempotency: { second_run_rejected: boolean };
  wac_blend_invariance_proof: { sku: string; invariant: boolean }[];
  totals: Record<string, number>;
  expected_db_deltas: Record<string, string>;
  per_product: { sku: string; before_qty: number; repair_qty: number; after_qty: number; before_wac: number; after_wac: number; economic_value: number }[];
};

const readCsv = (f: string): Record<string, string>[] => {
  const lines = readPack(f).trim().split('\n');
  const split = (l: string) => {
    const cells: string[] = []; let cur = '', inQ = false;
    for (let i = 0; i < l.length; i++) {
      const ch = l[i];
      if (inQ) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') inQ = false; else cur += ch; }
      else if (ch === '"') inQ = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur); return cells;
  };
  const header = split(lines[0]);
  return lines.slice(1).map(l => Object.fromEntries(header.map((h, i) => [h, split(l)[i]])));
};
const num = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v));
const EPS = 1e-6;

// ── Simulador canónico in-test (misma semántica congelada que scripts/simulate_repair.js) ──
function simulate(rows: FrozenRow[], batchDoc: string, existingDocs: Set<string> = new Set()) {
  if ([...existingDocs].some(d => d.startsWith('B10B-OBS2-RECON-OPENING:')))
    throw new Error('ERR_RECON_ALREADY_APPLIED');                  // barrera idempotencia (PRE, una vez)
  const inventory = new Map<string, number>();
  const movements: { product_id: string; qty: number; balance_after: number; type: string }[] = [];
  const kardex: { product_id: string; qty: number }[] = [];
  const events: unknown[] = [];
  const applied: string[] = [];
  for (const r of rows) {
    if (r.proposed_repair_qty <= 0) continue;                       // exclusión implícita
    if (inventory.has(r.product_id)) throw new Error('ERR_UNIVERSE_CHANGED: inventory preexistente');
    inventory.set(r.product_id, r.proposed_repair_qty);              // fn_sync_inventory_on_movement
    movements.push({ product_id: r.product_id, qty: r.proposed_repair_qty, balance_after: r.proposed_repair_qty, type: 'initial' });
    kardex.push({ product_id: r.product_id, qty: r.proposed_repair_qty });   // trg_auto_kardex 1:1
    events.push({});                                                 // business_events 1:1
    applied.push(r.sku);
  }
  existingDocs.add(batchDoc);
  return { inventory, movements, kardex, events, applied };
}
const blend = (S: number, ca: number, q: number, uc: number) => (S * ca + q * uc) / (S + q);

// ── Manifiesto de evidencia congelada (GATE 20.10) ──
const FROZEN_SHA: Record<string, string> = {
  'raw/frozen_universe.json': '74e84b6c885568392f1cfd25be916a26ba9f0fc4412d76c2ef12fc3b940e7101',
  'raw/simulation_result.json': '91a35c9c44f70457633a31100ef29a1e6644ded5e2078b97c386dd8335e38716',
  '07-proposed-opening.csv': 'c67ac312f0a2ccd5bef44afde8a90dab13a02593dd4a8c5d60e27a678e253125',
  '03-repair-universe.csv': 'a4efd032e8cf1de8eccfbf6e047da1a1155493f50d03faaaff1568aff067240c',
  '04-post-backup-deltas.csv': '695a77bd56161f549b53d3b2a6ecf358da316ab270b8b62fdd188b80b8720f3a',
  '05-test-exclusions.csv': '7d7ba5203ecb9c3b13b85f46b0a40b342c756afc48f3a56d63d45b17779a88c2',
  '06-wac-analysis.csv': '0a4a57b4c00e869cf8a9241f20a638ad1d20b64099577903758034dd23fe4271',
};

describe('PT-OBS2-RD.1 — Universo de reparación congelado (GATE 2/20.1)', () => {
  const rows = frozen.rows;
  it('U completo: 124 productos de la tienda d1c4ba0e, sin fila sin clasificar', () => {
    expect(rows.length).toBe(124);
    expect(rows.every(r => ['A', 'B', 'C'].includes(r.set))).toBe(true);
  });
  it('Set A frozen = 110 (94 con stock>0), Set B = 4, Set C = 10', () => {
    const A = rows.filter(r => r.set === 'A');
    const B = rows.filter(r => r.set === 'B');
    const C = rows.filter(r => r.set === 'C');
    expect(A.length).toBe(110); expect(A.filter(r => r.current_stock > 0).length).toBe(94);
    expect(B.length).toBe(4); expect(C.length).toBe(10);
  });
  it('apertura propuesta: 98 productos / 6.427 unidades', () => {
    const repair = rows.filter(r => r.proposed_repair_qty > 0);
    expect(repair.length).toBe(98);
    expect(repair.reduce((s, r) => s + r.proposed_repair_qty, 0)).toBe(6427);
  });
});

describe('PT-OBS2-RD.2 — Clasificación con evidencia (GATE 20.5)', () => {
  const rows = frozen.rows;
  it('Set A: cada fila cumple current == backup (frozen match demostrado)', () => {
    for (const r of rows.filter(r => r.set === 'A')) {
      expect(r.classification).toBe('FROZEN_MATCH');
      expect(Math.abs(r.current_stock - (r.backup_qty as number))).toBeLessThan(EPS);
    }
  });
  it('Set B: los 4 deltas son CONFIRMED por el journal business_events', () => {
    for (const r of rows.filter(r => r.set === 'B')) {
      expect(r.confidence).toBe('CONFIRMED');
      expect(r.classification).toBe('DELTA_CONFIRMED_BY_EVENTS');
      // Σ eventos post-backup == delta y último new_qty == current (cero asunciones)
      expect(r.be_post).toBeGreaterThan(0);
      expect(Math.abs(r.be_post_qty - (r.current_stock - (r.backup_qty as number)))).toBeLessThan(EPS);
      expect(Math.abs((r.be_last_new_qty as number) - r.current_stock)).toBeLessThan(EPS);
    }
  });
  it('Set C: los 10 Test quedan EXCLUDED_FROM_REPAIR (proposed=0) con motivo documentado', () => {
    const excl = readCsv('05-test-exclusions.csv');
    expect(excl.length).toBe(10);
    for (const r of rows.filter(r => r.set === 'C')) expect(r.proposed_repair_qty).toBe(0);
    for (const e of excl) {
      expect(e.exclusion_reason).toContain('TEST_RESIDUE');
      expect(Number(e.current_stock)).toBeGreaterThan(0);
    }
  });
});

describe('PT-OBS2-RD.3 — Matemática exacta (GATE 3/20.3)', () => {
  const rows = frozen.rows;
  it('por producto: propuesta == backup + delta_confirmado (nunca SUM(stock_current) como fuente)', () => {
    for (const r of rows.filter(r => r.proposed_repair_qty > 0)) {
      const backup = r.backup_qty ?? 0;
      const confirmedDelta = r.set === 'B' ? r.be_post_qty : 0;
      expect(Math.abs(r.proposed_repair_qty - (backup + confirmedDelta))).toBeLessThan(EPS);
      expect(Math.abs(r.proposed_repair_qty - r.current_stock)).toBeLessThan(EPS);
    }
  });
  it('identidad incremental: 5.495 + 932 = 6.427', () => {
    const g2 = rows.filter(r => r.set === 'B').reduce((s, r) => s + (r.current_stock - (r.backup_qty as number)), 0);
    expect(g2).toBe(932);
    expect(5495 + g2).toBe(6427);
  });
  it('identidad decremental: 6.553 − 126 = 6.427', () => {
    const orphan = rows.filter(r => r.current_stock > 0).reduce((s, r) => s + r.current_stock, 0);
    const test = rows.filter(r => r.set === 'C').reduce((s, r) => s + r.current_stock, 0);
    expect(orphan).toBe(6553); expect(test).toBe(126);
    expect(orphan - test).toBe(6427);
  });
});

describe('PT-OBS2-RD.4 — Modelo WAC (GATE 4/6/20.4)', () => {
  const rows = frozen.rows;
  it('98/98 WAC_CONFIRMED; 0 WAC_UNKNOWN en la apertura; unit_cost == cost_average', () => {
    const repair = readCsv('07-proposed-opening.csv');
    expect(repair.length).toBe(98);
    for (const r of rows.filter(r => r.proposed_repair_qty > 0)) {
      expect(r.wac_class).toBe('WAC_CONFIRMED');
      expect(r.wac === null || r.wac <= 0).toBe(false);
    }
    for (const o of repair) expect(Math.abs(Number(o.opening_unit_cost) - Number(o.wac ?? o.opening_unit_cost))).toBeLessThan(EPS);
  });
  it('blend D-01 invariante con uc = ca_prev para cualquier S (incluido S huérfano)', () => {
    for (const { S, ca, q } of [{ S: 0, ca: 489.99, q: 19 }, { S: 532, ca: 489.99, q: 532 }, { S: 300, ca: 11.919, q: 966 }, { S: 9999, ca: 0.01, q: 1 }]) {
      expect(Math.abs(blend(S, ca, q, ca) - ca)).toBeLessThan(1e-9);
    }
    expect(sim.wac_blend_invariance_proof.every(p => p.invariant)).toBe(true);
  });
  it('el payload del backup no provee WAC por producto (limitación documentada, no inventada)', () => {
    const wac = readCsv('06-wac-analysis.csv');
    expect(wac.every(r => r.wac_backup_available === 'NO (backup payload has no per-product WAC field)')).toBe(true);
  });
});

describe('PT-OBS2-RD.5 — Simulación canónica y determinismo (GATE 15/20.7/20.8)', () => {
  const rows = frozen.rows;
  it('re-ejecuta el simulador in-test y reproduce los totales del pack', () => {
    const docs = new Set<string>();
    const s = simulate(rows, 'B10B-OBS2-RECON-OPENING:TEST-DETERMINISM', docs);
    expect(s.applied.length).toBe(98);
    expect(s.movements.length).toBe(98); expect(s.kardex.length).toBe(98); expect(s.events.length).toBe(98);
    const ledgerTotal = [...s.inventory.values()].reduce((x, y) => x + y, 0);
    expect(ledgerTotal).toBe(6427);
    // tríada canónica I1 por producto
    for (const m of s.movements) expect(Math.abs(m.balance_after - (s.inventory.get(m.product_id) as number))).toBeLessThan(EPS);
  });
  it('los totales del simulador del pack cuadran exactamente', () => {
    expect(sim.totals.TOTAL_BEFORE_DECLARED).toBe(6553);
    expect(sim.totals.TOTAL_BEFORE_RECOGNIZED_LEDGER).toBe(0);
    expect(sim.totals.TOTAL_REPAIR_UNITS).toBe(6427);
    expect(Math.abs(sim.totals.TOTAL_REPAIR_VALUE_ESTIMATED - 9932216.938816005)).toBeLessThan(1e-3);
    expect(sim.totals.TOTAL_AFTER_LEDGER_UNITS).toBe(6427);
    expect(sim.totals.TOTAL_AFTER_DECLARED).toBe(6553);
    expect(sim.totals.TEST_RESIDUE_EXCLUDED_UNITS).toBe(126);
  });
  it('la segunda ejecución es RECHAZADA (barrera de idempotencia) — GATE 20.6/20.8', () => {
    expect(sim.idempotency.second_run_rejected).toBe(true);
    const docs = new Set<string>();
    simulate(rows, 'B10B-OBS2-RECON-OPENING:PRIMERA', docs);
    expect(() => simulate(rows, 'B10B-OBS2-RECON-OPENING:SEGUNDA-OTRO-BATCH', docs)).toThrow(/ERR_RECON_ALREADY_APPLIED/);
  });
  it('sin violaciones de invariantes en la simulación congelada', () => {
    expect(sim.invariants_pass).toBe(true);
    expect(sim.invariants_violations.length).toBe(0);
  });
});

describe('PT-OBS2-RD.6 — Clave de idempotencia y trazabilidad (GATE 11/20.6)', () => {
  it('el formato del batch pertenece a la familia RECON y va en reference_doc (p_sale_id es uuid)', () => {
    const opening = readCsv('07-proposed-opening.csv');
    const family = /^B10B-OBS2-RECON-OPENING(:[0-9T-Z-]+-[A-Z0-9]{4})?$/;
    expect(opening.length).toBeGreaterThan(0);
    for (const o of opening) expect(family.test(o.reference_doc), o.reference_doc).toBe(true);
    expect(opening.every(o => o.movement_type === 'initial')).toBe(true);
    // el patrón normativo con sufijo de batch queda congelado en el diseño
    expect(readPack('10-opening-design.md')).toContain("'B10B-OBS2-RECON-OPENING:<batch_id>'");
  });
  it('la trazabilidad del lote existe en los tres sellos (movement + kardex + audit)', () => {
    expect(existsSync(join(PACK, '10-opening-design.md'))).toBe(true);
    const design = readPack('10-opening-design.md');
    expect(design).toContain("movement_type | `'initial'`");
    expect(design).toContain('B10B-OBS2-RECON-OPENING:');
    expect(design).toContain('STOCK_RECONCILIATION_OPENING');
  });
});

describe('PT-OBS2-RD.7 — Neutralidad financiera y deltas esperados (GATE 14/20.9)', () => {
  it('ningún documento financiero es tocado por la apertura', () => {
    const d = sim.expected_db_deltas;
    expect(d['transactions']).toBe('+0');
    expect(d['payments']).toBe('+0');
    expect(d['commissions']).toBe('+0');
    expect(d['devolutions']).toBe('+0');
    expect(d['receipts']).toBe('+0');
    expect(d['wac_change_log']).toBe('+0');
    expect(d['products_rows']).toContain('+0');
    expect(d['products_rows']).toContain('UNCHANGED');
  });
  it('la apertura crea exactamente 98 movimientos/inventory/kardex/BE + 1 audit de lote', () => {
    const d = sim.expected_db_deltas;
    expect(d['stock_movements']).toBe('+98');
    expect(d['inventory']).toContain('+98');
    expect(d['kardex_entries']).toBe('+98');
    expect(d['business_events']).toBe('+98');
    expect(d['audit_logs']).toBe('+1 (batch row)');
  });
  it('toda valoración del pack queda etiquetada ESTIMATED (nunca precio arbitrario)', () => {
    const opening = readCsv('07-proposed-opening.csv');
    expect(opening.every(o => o.opening_value !== '' && o.date_policy.includes('EXECUTION_TIMESTAMP'))).toBe(true);
    const reco = readPack('16-repair-recommendation.md');
    expect(reco).toContain('ESTIMATED');
  });
});

describe('PT-OBS2-RD.8 — Evidencia congelada para la reparación futura (GATE 20.10)', () => {
  it('los artefactos congelados existen y su SHA256 coincide con el manifiesto del test', () => {
    for (const [file, expected] of Object.entries(FROZEN_SHA)) {
      const h = createHash('sha256').update(readPack(file)).digest('hex');
      expect(h, `tamper detected in ${file}`).toBe(expected);
    }
  });
  it('el pack de diseño está completo (22 documentos + SHA256SUMS)', () => {
    const docs = ['01-baseline.md','02-forensic-facts.md','03-repair-universe.csv','04-post-backup-deltas.csv','05-test-exclusions.csv','06-wac-analysis.csv','07-proposed-opening.csv','08-mathematical-reconciliation.md','09-wac-model.md','10-opening-design.md','11-idempotency.md','12-atomicity.md','13-invariants.md','14-financial-neutrality.md','15-option-comparison.md','16-repair-recommendation.md','17-rollback-design.md','18-execution-checklist.md','19-abort-criteria.md','20-zero-mutation.md','21-regression.md','22-final-verdict.md'];
    for (const d of docs) expect(existsSync(join(PACK, d)), `falta ${d}`).toBe(true);
  });
  it('la decisión humana queda registrada como pendiente (firma, no ejecución)', () => {
    const reco = readPack('16-repair-recommendation.md').toLowerCase();
    expect(reco).toContain('pendiente de firma humana');
    expect(reco).toContain('esta fase no ejecuta');
    const verdict = readPack('22-final-verdict.md');
    expect(verdict).toContain('REPAIR DESIGN APPROVED — HUMAN SIGNATURE REQUIRED');
  });
});
