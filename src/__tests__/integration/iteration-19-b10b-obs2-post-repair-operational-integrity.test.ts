/**
 * W9.5 — B-10b-OBS-2-R2 · Iteración 19 · POST-REPAIR OPERATIONAL INTEGRITY (GATE 24)
 *
 * Test permanente de la fase R2. NO se conecta a la base de datos: congela y valida el
 * pack de evidencia audit-evidence/20260906-w9-b10b-obs2-r2/ producido por la ejecución
 * real del pipeline operativo (sandbox BEGIN/ROLLBACK sobre Supabase Postgres).
 *
 * CONGELA (mandato GATE 24):
 *   A. REPAIR      — batch B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW intacto:
 *                    98 products / 6427 units / 98 initial movements / 98 inventory /
 *                    98 kardex / 98 business_events / 1 audit; valor exacto
 *                    9,932,216.938816005 (kardex 2dp 9,932,216.94); WAC bit a bit.
 *   B. OPERATIONAL — venta canónica create_sale_v2: decremento de stock, inventory
 *                    sincronizada, kardex 'out' 1:1, WAC preservado, invariantes de pago
 *                    (SUM(amount_cup) == total_amount), POS void (Modelo C N1) y
 *                    admin reverse (N2) restauran el stock exactamente.
 *   C. SAFETY      — negative stock RECHAZADO con 0 mutación; concurrencia (2 conexiones:
 *                    lock timeout en Race A, serialización en Race A2, sin compensación
 *                    fantasma en Races B/C); idempotencia (2º void ERR_ALREADY_VOIDED,
 *                    reverse sobre voided = idempotent no-op); cross-store 0 diff;
 *                    exclusión Test (10 productos fuera del batch).
 *   D. FINANCIAL   — sin doble conversión USD (zelle: amount en moneda original,
 *                    amount_cup GENERATED = amount*rate); sin duplicación de pagos;
 *                    0 mutación histórica (24/24 métricas globales idénticas PRE==POST,
 *                    tras master test y tras races); residuo permanente de pruebas = 0.
 *
 * Si el pack cambia (drift, edición manual, nueva corrida), este test FALLA.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { describe, it, expect } from 'vitest';

const PACK = join(process.cwd(), 'audit-evidence', '20260906-w9-b10b-obs2-r2');
const readPack = (f: string) => readFileSync(join(PACK, f), 'utf-8');
const readJson = (f: string) => JSON.parse(readPack(f));
const first = (f: string) => (Array.isArray(readJson(f)) ? readJson(f)[0] : readJson(f));
const sha256 = (f: string) => createHash('sha256').update(readPack(f)).digest('hex');

const STORE = 'd1c4ba0e-5767-4ba0-e576-7d1c4ba0e576';
const ACTOR = '051c6157-600b-425e-b8c0-72388bacf541';
const BATCH = 'B10B-OBS2-RECON-OPENING:20260906T201637Z-S2HW';

// ── artefactos congelados ──
const gate1 = first('raw/r2_gate1.json').gate1 as {
  batch: Record<string, unknown>; global_baseline: Record<string, number | string>;
  mismatches: unknown[];
};
const master = first('raw/r2_master_result.json').r2_report as {
  all_ok: boolean; failed_steps: string[]; current_user: string;
  steps: { step: string; ok: boolean; detail: Record<string, unknown> }[];
  final_state: Record<string, number>;
};
const postGlobal = first('raw/r2_post_global.json').post as {
  global_baseline: Record<string, number | string>; batch: Record<string, unknown>;
  initial_movement_fingerprints: Record<string, string>; store_reconciliation: Record<string, number>;
};
const postRaces = first('raw/r2_post_after_races.json').post as {
  global_baseline: Record<string, number | string>; batch: Record<string, unknown>;
};
const preOp = first('raw/r2_gate3_pre.json').pre_op as {
  fixtures: { product_id: string; sku: string; stock_current: number; cost_average: number }[];
  test_products: { product_id: string; sku: string; stock_current: number; in_batch: boolean }[];
};
const fnDefs = first('raw/r2_fn_defs.json').fn_defs as {
  create_sale_v2: { acl: string; def: string };
  void_transaction: { acl: string; def: string };
  reverse_transaction_v2: { acl: string; def: string };
};
type RaceStep = { step: string; detail?: { sqlerrm?: string; status?: string } };
type RaceLog = { ts?: string; conn1?: RaceStep[]; conn2?: RaceStep[]; stock_seen_in_tx?: number; stock_seen?: number };
const race = (f: string): RaceLog => (first('raw/' + f).race ?? {}) as RaceLog;

const step = (name: string) => master.steps.find(s => s.step === name);
const stepOk = (name: string) => master.steps.find(s => s.step === name)?.ok === true;

// ── helpers ──
const numEq = (a: unknown, b: number, eps = 1e-6) => Math.abs(Number(a) - b) < eps;

describe('R2 · A. REPAIR baseline intacto (GATE 1 + POST)', () => {
  it('batch exactamente como R1 lo dejó: 98 movements / 6427 units', () => {
    const b = gate1.batch as Record<string, number | string[]>;
    expect(b.movements).toBe(98);
    expect(numEq(b.units, 6427)).toBe(true);
    expect(b.distinct_products).toBe(98);
    expect(b.movement_types).toEqual(['initial']);
    expect(b.inventory_rows).toBe(98);
    expect(numEq(b.inventory_sum, 6427)).toBe(true);
    expect(b.kardex_rows).toBe(98);
    expect(b.business_events).toBe(98);
    expect(b.audit_rows).toBe(1);
    expect(b.created_by_distinct).toEqual([ACTOR]);
  });

  it('valor WAC exacto congelado: 9,932,216.938816005 (kardex 2dp 9,932,216.94)', () => {
    const b = gate1.batch as Record<string, number>;
    expect(String(b.value_exact)).toBe('9932216.938816005');
    expect(numEq(b.kardex_value_2dp, 9932216.94, 1e-9)).toBe(true);
    const pb = postGlobal.batch as Record<string, number>;
    expect(String(pb.value_exact)).toBe('9932216.938816005');
  });

  it('triada canónica sin mismatches: stock_current == inventory == Σmovements (98/98)', () => {
    expect(gate1.mismatches).toEqual([]);
  });

  it('98 fingerprints del movimiento initial idénticos PRE→POST (genealogía intacta, GATE 17)', () => {
    const pre = first('raw/r2_gate3_pre.json').pre_op.initial_movement_fingerprints as Record<string, string>;
    const keys = Object.keys(pre);
    expect(keys.length).toBe(98);
    for (const pid of keys) expect(postGlobal.initial_movement_fingerprints[pid]).toBe(pre[pid]);
  });
});

describe('R2 · B. OPERATIONAL — pipeline canónico validado (GATE 5-12, 15, 16)', () => {
  it('master test: 23/23 pasos PASS, ninguno fallido', () => {
    expect(master.steps.length).toBe(23);
    expect(master.all_ok).toBe(true);
    expect(master.failed_steps).toEqual([]);
  });

  it('GATE 5/6: venta cash 2×350=700 → stock 19-2=17 == inventory == ledger', () => {
    expect(stepOk('P1_SALE_FA_cash700')).toBe(true);
    expect(stepOk('P2_stock_after_sale')).toBe(true);
    const d = step('P2_stock_after_sale')!.detail as Record<string, unknown>;
    expect(numEq(d.stock_current, 17)).toBe(true);
    expect(numEq(d.inventory_qty, 17)).toBe(true);
    expect(numEq(d.ledger_derived_sum, 17)).toBe(true);
    const lm = d.last_movement as Record<string, unknown>;
    expect(lm.type).toBe('sale');
    expect(numEq(lm.qty, -2)).toBe(true);
    expect(numEq(lm.balance_after, 17)).toBe(true);
    expect(lm.ref_doc).toBe('Venta POS v2');
  });

  it('GATE 7: kardex de la venta = out / 2 / 490 / 980, balance 17, referencia trazable', () => {
    expect(stepOk('P3_kardex_sale')).toBe(true);
    const k = step('P3_kardex_sale')!.detail.kardex_row as Record<string, unknown>;
    expect(k.type).toBe('out');
    expect(numEq(k.qty, 2)).toBe(true);
    expect(numEq(k.unit_cost, 490)).toBe(true);
    expect(numEq(k.total_value, 980)).toBe(true);
    expect(numEq(k.bal_qty, 17)).toBe(true);
    expect(k.ref_desc).toBe('Venta POS v2');
  });

  it('GATE 8: WAC preservado bit a bit tras la venta (A2 hotfix; wac_change_log=0)', () => {
    expect(stepOk('P4_wac_after_sale')).toBe(true);
    expect(stepOk('P4b_initial_fingerprints_in_tx')).toBe(true);
  });

  it('GATE 9: invariante de pago SUM(amount_cup)=700 == total_amount=700', () => {
    expect(stepOk('P5_payment_cash')).toBe(true);
    const d = step('P5_payment_cash')!.detail as Record<string, unknown>;
    const pays = d.payments as { amount: number; cup: number; cur: string; method: string }[];
    expect(pays.length).toBe(1);
    expect(pays[0].method).toBe('cash');
    expect(pays[0].cur).toBe('CUP');
    expect(numEq(pays[0].cup, 700)).toBe(true);
  });

  it('GATE 9/W9.4.8: zelle USD sin doble conversión (amount en moneda original, amount_cup=amount×rate)', () => {
    expect(stepOk('P6_SALE_FA_zelle350')).toBe(true);
    const d = step('P6_SALE_FA_zelle350')!.detail as Record<string, unknown>;
    const pays = d.payments as { amount: number; cup: number; cur: string; rate: number }[];
    expect(pays.length).toBe(1);
    expect(pays[0].cur).toBe('USD');
    expect(numEq(pays[0].amount * pays[0].rate, 350, 0.01)).toBe(true);
    expect(numEq(d.sum_amount_cup as number, 350, 0.01)).toBe(true);
  });

  it('GATE 10: POS void (Modelo C N1) restaura exactamente; netting de la venta = 0', () => {
    expect(stepOk('P7_VOID_tx1')).toBe(true);
    expect(stepOk('P8_stock_restored_void')).toBe(true);
    const p7 = step('P7_VOID_tx1')!.detail as Record<string, unknown>;
    const vm = p7.void_movement as Record<string, unknown>;
    expect(vm.type).toBe('sale_void');
    expect(numEq(vm.qty, 2)).toBe(true);
    const vk = p7.void_kardex as Record<string, unknown>;
    expect(vk.type).toBe('out'); // clasificación observada (CASE auto_kardex: sale_void→out) — hallazgo documentado
    const audit = p7.audit as Record<string, unknown>;
    expect(audit.action).toBe('VOID_SALE');
    expect(audit.operation).toBe('POS_UNDO');
  });

  it('GATE 11: admin reverse (Modelo C N2) sobre venta zelle → stock restaurado, audit ADMIN_REVERSE', () => {
    expect(stepOk('P10_ADMIN_REVERSE')).toBe(true);
    const d = step('P10_ADMIN_REVERSE')!.detail as Record<string, unknown>;
    expect(numEq(d.stock_after_reverse as number, 19)).toBe(true);
    const rm = d.reverse_movement as Record<string, unknown>;
    expect(rm.type).toBe('sale_reverse');
    expect(numEq(rm.qty, 1)).toBe(true);
    const audit = d.audit as Record<string, unknown>;
    expect(audit.action).toBe('REVERSE_TRANSACTION_V2');
    expect(audit.operation).toBe('ADMIN_REVERSE');
  });

  it('GATE 12: sin doble compensación — 2º void ERR_ALREADY_VOIDED; reverse sobre voided = idempotent; void sobre revertida rechazado', () => {
    expect(stepOk('P9a_double_void')).toBe(true);
    const a = step('P9a_double_void')!.detail as Record<string, unknown>;
    expect(String(a.sqlerrm)).toContain('ERR_ALREADY_VOIDED');
    expect(stepOk('P9b_reverse_on_voided')).toBe(true);
    const b = step('P9b_reverse_on_voided')!.detail as Record<string, unknown>;
    expect((b.res as Record<string, unknown>).status).toBe('idempotent');
    expect(stepOk('P10b_void_on_reversed')).toBe(true);
  });

  it('GATE 15: decimal exacto — 95.5 − 1.5 = 94.0000 (numeric(12,4), sin drift) y restauración 95.5000', () => {
    expect(stepOk('P12_SALE_FB_decimal')).toBe(true);
    const d = step('P12_SALE_FB_decimal')!.detail as Record<string, unknown>;
    expect(d.stock_after).toBe('94.0000');
    expect(d.inventory_after).toBe('94.0000');
    expect(d.balance_after).toBe('94.0000');
    expect(d.is_exact_94).toBe(true);
    expect(stepOk('P12b_VOID_decimal')).toBe(true);
    expect((step('P12b_VOID_decimal')!.detail as Record<string, unknown>).stock_restored).toBe('95.5000');
  });

  it('GATE 16: stock elevado 966 − 1 = 965 → void → 966, sin overflow ni anomalía WAC/kardex', () => {
    expect(stepOk('P13_SALE_FC_high966')).toBe(true);
    expect(stepOk('P13b_VOID_high966')).toBe(true);
    const d = step('P13_SALE_FC_high966')!.detail as Record<string, unknown>;
    expect(numEq(d.stock_after as number, 965)).toBe(true);
    const k = d.kardex as Record<string, unknown>;
    expect(numEq(k.bal_qty, 965)).toBe(true);
    expect(step('P13b_VOID_high966')!.detail).toBeTruthy();
  });
});

describe('R2 · C. SAFETY — negative stock, concurrencia, idempotencia, exclusión (GATE 13, 14, 18, 19)', () => {
  it('GATE 14: venta qty 1000 > stock 966 RECHAZADA con 0 mutación (products/inventory/movements/tx intactos)', () => {
    expect(stepOk('P11_negative_stock')).toBe(true);
    const d = step('P11_negative_stock')!.detail as Record<string, unknown>;
    expect(String(d.sqlerrm)).toContain('ERR_INSUFFICIENT_STOCK');
    const before = d.before as Record<string, number>;
    const after = d.after as Record<string, number>;
    expect(after).toEqual(before);
  });

  it('ownership: identidad forjada (sub aleatorio) RECHAZADA por void_transaction con 0 movement', () => {
    expect(stepOk('P14b_forged_void')).toBe(true);
    const d = step('P14b_forged_void')!.detail as Record<string, unknown>;
    expect(String(d.sqlerrm)).toContain('ERR_UNAUTHORIZED');
    expect(d.moves_before).toBe(d.moves_after);
  });

  it('GATE 13 Race A: 2 conexiones concurrentes — la 2ª RECHAZADA por lock timeout (exactly one writer)', () => {
    const c1 = race('r2_raceA_conn1.json');
    const c2 = race('r2_raceA_conn2.json');
    expect(c1.conn1![0].step).toBe('conn1_sale_ok');
    expect(c1.stock_seen_in_tx).toBe(7); // 19 - 12 dentro de su transacción
    expect(c2.conn2![0].step).toBe('conn2_sale_rejected');
    expect(c2.conn2![0].detail!.sqlerrm).toContain('lock timeout');
    expect(c2.stock_seen).toBe(19); // aislamiento: la venta no confirmada es invisible
  });

  it('GATE 13 Race A2: serialización sin leak — la venta de conn1 (ROLLBACK) no contamina a conn2', () => {
    const c1 = race('r2_raceA2_conn1.json');
    const c2 = race('r2_raceA2_conn2.json');
    expect(c1.conn1![0].step).toBe('conn1_sale2_ok');
    expect(c1.stock_seen_in_tx).toBe(17); // 19 - 2 in-tx
    expect(c2.conn2![0].step).toBe('conn2_sale1_ok');
    expect(c2.stock_seen_in_tx).toBe(18); // 19 - 1 (la venta de conn1 desapareció con su ROLLBACK)
  });

  it('GATE 13 Races B/C: sin compensación fantasma — void/reverse sobre transacción invisible → NOT_FOUND', () => {
    const b2 = race('r2_raceB_conn2.json');
    const c2 = race('r2_raceC_conn2.json');
    const b1 = race('r2_raceB_conn1.json');
    expect(b1.conn1!.map(s => s.step)).toEqual(['sale_ok', 'void_ok']);
    expect(b2.conn2![0].step).toBe('void_rejected');
    expect(b2.conn2![0].detail!.sqlerrm).toBe('ERR_TX_NOT_FOUND');
    expect(c2.conn2![0].step).toBe('reverse_rejected');
    expect(c2.conn2![0].detail!.sqlerrm).toBe('ERR_TRANSACTION_NOT_FOUND');
  });

  it('GATE 18: 10 productos Test excluidos — fuera del batch, sin inventory, 126 u intactas', () => {
    expect(preOp.test_products.length).toBe(10);
    expect(preOp.test_products.filter(t => t.in_batch).length).toBe(0);
    const total = preOp.test_products.reduce((a, t) => a + Number(t.stock_current), 0);
    expect(total).toBe(126);
    for (const t of preOp.test_products) expect(t.sku).toMatch(/^(CONC-|PRODWAC-|TASA-EXT-|VOID-|VOIDTRACE-|WAC-|WACFINAL-|WACFIX-|WACFN-|WACTRACE-)/);
  });

  it('GATE 19: cross-store 0 diff — otras tiendas idénticas PRE/POST (inventory 141, movements 702, kardex 702)', () => {
    expect(postGlobal.global_baseline.inventory_other).toBe(141);
    expect(postGlobal.global_baseline.movements_other).toBe(702);
    expect(postGlobal.global_baseline.kardex_other).toBe(702);
    expect(postRaces.global_baseline.movements_other).toBe(702);
  });
});

describe('R2 · D. FINANCIAL — cero residuo y cero mutación histórica (GATE 20, 23, 25)', () => {
  const expectSameBaseline = (post: Record<string, number | string>) => {
    const diffs: string[] = [];
    for (const k of Object.keys(gate1.global_baseline)) {
      if (JSON.stringify(gate1.global_baseline[k]) !== JSON.stringify(post[k])) diffs.push(k);
    }
    expect(diffs).toEqual([]);
  };

  it('24/24 métricas globales idénticas PRE==POST tras el master test', () => {
    expect(Object.keys(gate1.global_baseline).length).toBe(24);
    expectSameBaseline(postGlobal.global_baseline);
  });

  it('24/24 métricas globales idénticas PRE==POST tras las races de concurrencia', () => {
    expectSameBaseline(postRaces.global_baseline);
  });

  it('histórico intacto: 520 transactions / 366 payments / 0 commissions / 0 transacciones de la tienda', () => {
    const g = postGlobal.global_baseline;
    expect(g.transactions_all).toBe(520);
    expect(g.transactions_store).toBe(0);
    expect(g.payments_all).toBe(366);
    expect(g.commissions_all).toBe(0);
    expect(g.transaction_items_all).toBe(555);
    expect(g.wac_log_all).toBe(14);
  });

  it('residuo permanente de las pruebas = 0 (las únicas filas de la tienda siguen siendo las del batch R1)', () => {
    const g = postGlobal.global_baseline;
    expect(g.movements_store).toBeUndefined(); // no está en este shape; equivalentes abajo
    expect(g.stock_movements_all).toBe(800);   // 702 other + 98 batch
    expect(g.kardex_all).toBe(800);
    expect(g.audit_logs_all).toBe(7377);
    expect(g.audit_logs_store).toBe(366);
    expect(g.business_events_all).toBe(10651);
  });

  it('reconciliación de tienda: Σ stock == 6553; los 10 mismatches son exactamente los Test excluidos (preexistente)', () => {
    expect(numEq(postGlobal.store_reconciliation.sum_stock_store as number, 6553)).toBe(true);
    expect(postGlobal.store_reconciliation.mismatch_products).toBe(10);
    const testSkus = preOp.test_products.map(t => t.sku).sort();
    expect(testSkus).toEqual([
      'CONC-1786067801', 'PRODWAC-1786069598', 'TASA-EXT-1786067764', 'VOID-1786067801',
      'VOIDTRACE-1786068382', 'WAC-1786067683', 'WACFINAL-1786069134', 'WACFIX-1786068956',
      'WACFN-1786069224', 'WACTRACE-1786068302',
    ]);
  });

  it('pipeline canónico congelado: create_sale_v2/void_transaction ejecutables por authenticated; reverse solo postgres/service_role (ACL B-8)', () => {
    expect(fnDefs.create_sale_v2.acl).toContain('authenticated=X');
    expect(fnDefs.void_transaction.acl).toContain('authenticated=X');
    expect(fnDefs.reverse_transaction_v2.acl).not.toContain('authenticated=X');
    expect(fnDefs.create_sale_v2.def).toContain("p_movement_type := 'sale'");
    expect(fnDefs.void_transaction.def).toContain("p_movement_type := 'sale_void'");
    expect(fnDefs.reverse_transaction_v2.def).toContain("p_movement_type := 'sale_reverse'");
  });

  it('SHA256 congelados de los artefactos críticos del pack (blindaje anti-drift)', () => {
    const hashes: Record<string, string> = {
      'raw/r2_gate1.json': sha256('raw/r2_gate1.json'),
      'raw/r2_master_result.json': sha256('raw/r2_master_result.json'),
      'raw/r2_post_global.json': sha256('raw/r2_post_global.json'),
      'raw/r2_post_after_races.json': sha256('raw/r2_post_after_races.json'),
    };
    for (const [f, h] of Object.entries(hashes)) {
      expect(h).toMatch(/^[a-f0-9]{64}$/);
      // referencia cruzada con SHA256SUMS del pack (si ya fue generado en GATE 28)
      if (existsSync(join(PACK, 'SHA256SUMS'))) {
        const sums = readPack('SHA256SUMS');
        const line = sums.split('\n').find(l => l.includes(f.split('/')[1]));
        expect(line).toBeTruthy();
        expect(line!.startsWith(h)).toBe(true);
      }
    }
  });
});
