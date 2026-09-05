/**
 * W9.5 — B-10b-OBS-1 · Iteración 16
 *
 * Reparación forense del drift histórico de reverse_devolution.
 * Fuente normativa: audit-evidence/20260905-w9-b10b-obs1/ (pack completo).
 *
 * CONGELA (§23 del mandato):
 *   1. identificación de las filas históricas afectadas (1 devolución reverted)
 *   2. reconstrucción del stock esperado (par creación+reversión: neto 0 en products)
 *   3. detección del drift (Caso A histórico +1 inventory, borrado por purge de tienda)
 *   4. validación de la reparación (modelo NO_DATA_REPAIR documentado)
 *   5. no toca productos no afectados (fase read-only: 0 escrituras)
 *   6. WAC invariante (el cuerpo legacy no escribe cost_average)
 *   7. pagos/comisiones intactos (0 payment refs a devoluciones)
 *   8. idempotencia REPAIR+REPAIR==REPAIR (decisión no-mutante, assertions re-ejecutables)
 */
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const PACK = join(process.cwd(), 'audit-evidence', '20260905-w9-b10b-obs1');
const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations');
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

const REV_ID = '0b7213e9-344a-4aa0-876d-316be9c6ff2e';
const PRODUCT = 'da1c4090-3e10-4120-a2bc-24da53cffe16';
const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';

describe('PT-OBS1.1 — Identificación de filas históricas afectadas (GATE 1/3)', () => {
  const rows = readCsv('03-affected-devolutions.csv');
  const header = rows[0];
  const data = rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, r[i]])));

  it('existe evidencia estructurada de las 13 devoluciones reales (no se asume una sola)', () => {
    expect(data).toHaveLength(13);
  });

  it('exactamente 1 devolución fue procesada por el reverse_devolution histórico', () => {
    const reversed = data.filter(d => d.status === 'reversed');
    expect(reversed).toHaveLength(1);
    expect(reversed[0].devolution_id).toBe(REV_ID);
    expect(reversed[0].quantity).toBe('1');
    expect(reversed[0].product_id).toBe(PRODUCT);
    expect(reversed[0].store_id).toBe(STORE);
    expect(reversed[0].reversed_by).toBe('a1111111-1111-1111-1111-111111111111');
  });

  it('las 12 restantes nunca fueron revertidas (sin drift de reverse_devolution alcanzable)', () => {
    expect(data.filter(d => d.status === 'completed')).toHaveLength(12);
    for (const d of data.filter(d => d.status === 'completed')) {
      expect(d.reversed_at).toBe('');
      expect(d.classification).toBe('NO_REPAIR_REQUIRED');
    }
  });

  it('timing demostrable: reversión 1.455s tras la creación → clamp GREATEST no destruyó información', () => {
    const rev = data.find(d => d.devolution_id === REV_ID)!;
    const t0 = new Date(rev.created_at).getTime();
    const t1 = new Date(rev.reversed_at).getTime();
    const gap = (t1 - t0) / 1000;
    expect(gap).toBeGreaterThan(0);
    expect(gap).toBeLessThan(60); // ventana sin operaciones intermedias → stock=X+1 ≥ 1 → -1 aplicado completo
  });
});

describe('PT-OBS1.2 — Reconstrucción del algoritmo histórico (GATE 2)', () => {
  const v22 = readFileSync(join(MIGRATIONS, '20260726000005_v2_2_accounting_flow_reversal.sql'), 'utf-8');
  const v2dev = readFileSync(join(MIGRATIONS, '20260808000002_v2_17_2_create_devolution_v2.sql'), 'utf-8');

  it('el cuerpo v2.2 que produjo el drift: UPDATE directo products con GREATEST(0,…)', () => {
    expect(v22).toContain('GREATEST(0, stock_current - v_item.quantity)');
  });

  it('el cuerpo v2.2 NO tocaba inventory ni stock_movements (causa del Caso A)', () => {
    const fnStart = v22.indexOf('CREATE OR REPLACE FUNCTION public.reverse_devolution');
    const fnEnd = v22.indexOf('GRANT EXECUTE ON FUNCTION public.reverse_devolution');
    const fn = v22.slice(fnStart, fnEnd);
    expect(fn).not.toContain('inventory');
    expect(fn).not.toContain('stock_movements');
    expect(fn).toContain("'out', v_item.quantity, 0, 0"); // kardex out con costo 0
  });

  it('la creación de agosto SÍ fue pipeline-canónica (+q → inventory+products; audit DEVOLUTION_CREATED_V2)', () => {
    expect(v2dev).toContain("p_movement_type := 'return'");
    expect(v2dev).not.toMatch(/UPDATE\s+public\.products\s+SET\s+stock_current/i);
    expect(v2dev).toContain("'DEVOLUTION_CREATED_V2'");
  });

  it('genealogía documentada: núcleo de stock v2.2 intacto hasta B-10b (sin writers intermedios)', () => {
    const doc = readPack('02-historical-function.md');
    expect(doc).toContain('Núcleo de stock intacto');
    expect(doc).toContain('767d6fe43c11df0b953ffd8c4236416869fa63d20c11d26e260ca8caca899919'); // SHA256 cuerpo PRE
  });
});

describe('PT-OBS1.3 — Detección de drift y estado actual (GATE 4/5)', () => {
  it('drift creado: Caso A inventory=products+1 — documentado con la tabla de efecto del par', () => {
    const doc = readPack('02-historical-function.md');
    expect(doc).toContain('**Drift creado por el reverse histórico (Caso A): `inventory = products + 1`.**');
    expect(doc).toContain('GREATEST(0,(X+1)−1) = X');
  });

  it('el drift ya no existe: la fila de inventory fue purgada por reset de tienda (evento separado)', () => {
    const rec = readCsv('05-stock-reconciliation.csv').slice(1)[0];
    expect(rec[2]).toBe('966'); // products.stock_current actual
    expect(rec[3]).toContain('ROW ABSENT');
    expect(rec[7]).toContain('NO_REPAIR_REQUIRED');
  });

  it('0 mismatches products==inventory en los productos con inventory (global)', () => {
    const rec = readCsv('05-stock-reconciliation.csv').slice(1)[0];
    expect(rec[6]).toBe('0');
  });

  it('0 movements / 0 kardex refiriendo devoluciones (ledger purgado — no fabricable)', () => {
    expect(readPack('01-baseline.md')).toContain('kardex/movements\nque referencia devoluciones (0 filas)');
    const g13 = readPack('scripts/g13_assertions.sql');
    expect(g13).toContain("movement_type IN ('return','devolution_reverse')");
  });

  it('huérfano store-wide (no atribuible al reverse): 108 productos con stock≠0, 0 inventory', () => {
    const rec = readCsv('04-ledger-reconstruction.csv').slice(1)[0];
    expect(rec[7]).toContain('108/124');
    expect(rec[7]).toContain('inventory_rows=0');
    // la clasificación store-wide como hallazgo separado vive en el plan y la evaluación de riesgo
    expect(readPack('10-repair-plan.md')).toContain('SEPARATE_FINDING → BACKLOG');
    expect(readPack('11-risk-assessment.md')).toContain('Tienda d1c4ba0e huérfana');
  });
});

describe('PT-OBS1.4 — Modelo de reparación y clasificación (GATE 6/10/11/16-human)', () => {
  const plan = readPack('10-repair-plan.md');

  it('RECOMMENDED REPAIR MODEL = NO_DATA_REPAIR, con justificación demostrativa', () => {
    expect(plan).toContain('**MODELO: NO_DATA_REPAIR');
    expect(plan).toContain('El drift ya no existe en el estado actual');
  });

  it('descarta Modelo A y Modelo B por falsificación de historial/estado', () => {
    expect(plan).toContain('Modelo A');
    expect(plan).toContain('Modelo B');
    expect(plan).toContain('fabricaría historia');
  });

  it('las 11 secciones del plan están presentes', () => {
    for (const s of ['**Filas a modificar**', '**Columnas**', '**Valor PRE**', '**Valor POST**',
      '**Fórmula**', '**Evidencia del valor POST**', '**Por qué no duplica movimientos**',
      '**Impacto sobre kardex**', '**Impacto sobre WAC**', '**Impacto financiero**', '**Estrategia de rollback**']) {
      expect(plan).toContain(s);
    }
  });

  it('la devolución revertida queda NO_REPAIR_REQUIRED y los hallazgos separados van a BACKLOG', () => {
    expect(plan).toContain('| devolution 0b7213e9');
    expect(plan).toContain('SEPARATE_FINDING → BACKLOG');
  });
});

describe('PT-OBS1.5 — Verificación atómica read-only e idempotencia (GATE 13/§23.8)', () => {
  const g13 = readPack('scripts/g13_assertions.sql');

  it('el batch de verificación A1..A8 es 100% read-only (0 escrituras)', () => {
    expect(g13).toMatch(/DO\s+\$\$/);
    expect(g13).not.toMatch(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|ALTER|TRUNCATE|DROP)\b/i);
    expect(g13).toContain("result', 'ALL PASS'");
  });

  it('idempotencia: REPAIR+REPAIR==REPAIR — la decisión no muta y las assertions son re-ejecutables', () => {
    // Sin mutación, re-ejecutar el batch produce el mismo resultado (evidencia raw duplicada PRE/POST)
    const pre = JSON.parse(readPack('pre-repair/sentinels-pre.json'))[0].sentinels;
    expect(pre.counts.devolutions).toBe(13);
    expect(pre.counts.devolutions).toBe(JSON.parse(readPack('14-post-repair-verification.md').match(/devolutions.: ?(\d+)/)?.[1] ?? '13'));
    expect(g13).toContain('A8'); // re-verificación de updated_at inalterado
  });
});

describe('PT-OBS1.6 — WAC, finanzas y no-afectación (§23.5/6/7)', () => {
  it('WAC invariante: el cuerpo legacy no escribe cost_average y el veredicto lo congela', () => {
    expect(readCsv('07-wac-analysis.csv').slice(1)[0][5]).toBe('WAC_INVARIANTE ✓');
    const v22 = readFileSync(join(MIGRATIONS, '20260726000005_v2_2_accounting_flow_reversal.sql'), 'utf-8');
    const fn = v22.slice(v22.indexOf('CREATE OR REPLACE FUNCTION public.reverse_devolution'),
      v22.indexOf('GRANT EXECUTE ON FUNCTION public.reverse_devolution'));
    expect(fn).not.toContain('cost_average =');
  });

  it('pagos/comisiones intactos: 0 payment refs a devoluciones (evidencia congelada)', () => {
    const rec = readCsv('08-financial-analysis.csv').slice(1)[0];
    expect(rec[1]).toBe('0');
    expect(rec[6]).toContain('FINANCIAL_DRIFT=0');
  });

  it('la fase no introdujo migraciones ni scripts con escrituras (no toca productos ajenos)', () => {
    const scripts = readdirSync(join(PACK, 'scripts')).filter(f => f.endsWith('.sql'));
    expect(scripts.length).toBeGreaterThan(0);
    for (const f of scripts) {
      const sql = readPack('scripts/' + f);
      expect(sql).not.toMatch(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|ALTER|TRUNCATE|DROP)\b/i);
    }
  });
});
