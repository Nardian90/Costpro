/**
 * cash-report-user-filter.test.ts — MISIÓN FILTRO MULTIUSUARIO
 * (Reporte Entrega, 2026-11-08). Criterio de las tarjetas y del filtro:
 *
 *   · El CREADOR de la venta es transactions.seller_id (p_seller_id del
 *     checkout POS). NUNCA paid_by (quien cobró) ni el usuario de sesión.
 *   · Importe de tarjeta = Σ amount_cup de los buckets de la MISMA
 *     reconstrucción del reporte (equivalente CUP canónico); monedas
 *     nativas informadas por separado (sin mezclar).
 *   · Σ tarjetas (incl. «Usuario no identificado») reconciilia 1:1 con el
 *     total del universo de ventas.
 *   · El filtro de usuarios es exclusión sobre el MISMO pipeline (unión con
 *     la exclusión manual, sin duplicados; 'all' no excluye nada).
 *   · «Ajuste extraordinario» marcado por defecto (aceptación §7.12).
 */
import { describe, it, expect } from 'vitest';
import {
  aggregateSalesByUser,
  toUserCardsFromServer,
  userSelectionExcludedIds,
  saleRowUserKey,
  USER_UNASSIGNED_KEY,
  DEFAULT_SUMMARY_CONCEPTS,
  computeSelectedSalesTotals,
  type SaleRow,
} from '@/lib/cash-report/report-selection';

const fila = (id: string, sellerId: string | null, buckets: SaleRow['buckets']): SaleRow => ({
  id, created_at: '2026-11-08T15:00:00Z', status: 'completed',
  source: 'ledger', buckets, items: [], payments: [], seller_id: sellerId,
});

const UNIVERSE: SaleRow[] = [
  // U1: 10 000 CUP efectivo + 2 000 CUP transferencia ⇒ 12 000
  fila('v-1', 'u-1', [{ method: 'cash', currency: 'CUP', amount: 10000, amount_cup: 10000 }]),
  fila('v-4', 'u-1', [{ method: 'transfer', currency: 'CUP', amount: 2000, amount_cup: 2000 }]),
  // U2: 7 USD efectivo (equiv. 5 600) + mixta 2 000 CUP + 5 USD (equiv. 4 000) ⇒ 9 600
  fila('v-2', 'u-2', [{ method: 'cash', currency: 'USD', amount: 7, amount_cup: 5600 }]),
  fila('v-3', 'u-2', [
    { method: 'cash', currency: 'CUP', amount: 2000, amount_cup: 2000 },
    { method: 'cash', currency: 'USD', amount: 5, amount_cup: 4000 },
  ]),
  // Sin creador identificable: 3 000 CUP (Usuario no identificado)
  fila('v-5', null, [{ method: 'cash', currency: 'CUP', amount: 3000, amount_cup: 3000 }]),
];

const universoTotalCup = (rows: SaleRow[]) =>
  Math.round(rows.reduce((s, r) => s + r.buckets.reduce((x, b) => x + b.amount_cup, 0), 0) * 100) / 100;

describe('agregación por usuario creador (tarjetas)', () => {
  it('agrupa por seller_id con importe canónico, nativo por moneda y conteo', () => {
    const cards = aggregateSalesByUser(UNIVERSE);
    expect(cards.map(c => c.key)).toEqual(['u-1', 'u-2', USER_UNASSIGNED_KEY]);
    const u1 = cards.find(c => c.key === 'u-1')!;
    expect(u1.transactionCount).toBe(2);
    expect(u1.totalCup).toBe(12000);
    expect(u1.native).toContainEqual({ currency: 'CUP', total: 12000 });
    const u2 = cards.find(c => c.key === 'u-2')!;
    expect(u2.totalCup).toBe(11600);
    // monedas nativas SIN mezclar: CUP y USD por separado
    expect(u2.native).toContainEqual({ currency: 'CUP', total: 2000 });
    expect(u2.native).toContainEqual({ currency: 'USD', total: 12 });
  });

  it('las ventas sin creador identificable forman el grupo «Usuario no identificado»', () => {
    const cards = aggregateSalesByUser(UNIVERSE);
    const na = cards.find(c => c.key === USER_UNASSIGNED_KEY)!;
    expect(na.sellerId).toBeNull();
    expect(na.totalCup).toBe(3000);
    expect(na.transactionCount).toBe(1);
  });

  it('CONCILIACIÓN: Σ tarjetas (incl. no identificado) = total del universo', () => {
    const cards = aggregateSalesByUser(UNIVERSE);
    const suma = Math.round(cards.reduce((s, c) => s + c.totalCup, 0) * 100) / 100;
    expect(suma).toBe(universoTotalCup(UNIVERSE));
    expect(suma).toBe(26600);
  });

  it('usuarios sin ventas no generan tarjeta', () => {
    const cards = aggregateSalesByUser(UNIVERSE);
    expect(cards.some(c => c.key === 'u-3')).toBe(false);
  });
});

describe('toUserCardsFromServer (agregado del servidor)', () => {
  it('normaliza el payload del servidor, incluido seller_id null', () => {
    const res = toUserCardsFromServer([
      { seller_id: 'u-1', seller_name: 'María Pérez', transaction_count: 2, total_cup: 12000, native: [{ currency: 'CUP', total: 12000 }] },
      { seller_id: null, seller_name: null, transaction_count: 1, total_cup: 3000, native: [{ currency: 'CUP', total: 3000 }] },
    ])!;
    expect(res.cards).toHaveLength(2);
    expect(res.cards[0].sellerName).toBe('María Pérez');
    expect(res.cards[1].key).toBe(USER_UNASSIGNED_KEY);
    expect(res.totalCup).toBe(15000);
  });

  it('payload inválido ⇒ null (el cliente cae al fallback sobre filas cargadas)', () => {
    expect(toUserCardsFromServer('no-soy-array')).toBeNull();
    expect(toUserCardsFromServer([{ total_cup: 'x' }])).toBeNull();
    expect(toUserCardsFromServer(undefined)).toBeNull();
  });
});

describe('filtro de usuarios como exclusión REAL sobre el pipeline', () => {
  it("'all' no excluye nada", () => {
    expect(userSelectionExcludedIds(UNIVERSE, 'all').size).toBe(0);
  });

  it('un usuario: excluye SOLO las ventas de los demás', () => {
    const excl = userSelectionExcludedIds(UNIVERSE, new Set(['u-1']));
    expect([...excl].sort()).toEqual(['v-2', 'v-3', 'v-5']);
    const totals = computeSelectedSalesTotals(UNIVERSE, excl);
    expect(totals.includedCount).toBe(2);
  });

  it('varios usuarios: unión sin duplicados (las filas cuentan una sola vez)', () => {
    const excl = userSelectionExcludedIds(UNIVERSE, new Set(['u-1', 'u-2']));
    expect(excl.has('v-1')).toBe(false);
    expect(excl.has('v-2')).toBe(false);
    expect(excl.has('v-3')).toBe(false);
    expect(excl.has('v-4')).toBe(false);
    expect([...excl]).toEqual(['v-5']);
    const totals = computeSelectedSalesTotals(UNIVERSE, excl);
    expect(totals.includedCount).toBe(4);
    // Σ total_cup de los grupos incluidos = suma de las dos tarjetas (12 000 + 11 600)
    const sumaGrupos = Math.round(totals.groups.reduce((s, g) => s + g.total_cup, 0) * 100) / 100;
    expect(sumaGrupos).toBe(23600);
  });

  it('el grupo no identificado es seleccionable como tarjeta', () => {
    const excl = userSelectionExcludedIds(UNIVERSE, new Set([USER_UNASSIGNED_KEY]));
    expect(excl.has('v-5')).toBe(false);
    expect(excl.size).toBe(4);
  });

  it('clave de fila: seller_id presente o grupo no identificado', () => {
    expect(saleRowUserKey({ seller_id: 'u-1' })).toBe('u-1');
    expect(saleRowUserKey({ seller_id: null })).toBe(USER_UNASSIGNED_KEY);
    expect(saleRowUserKey({})).toBe(USER_UNASSIGNED_KEY);
  });
});

describe('configuración predeterminada de conceptos (misión §5)', () => {
  it('«Ajuste extraordinario» aparece MARCADO por defecto y es desmarcable', () => {
    expect(DEFAULT_SUMMARY_CONCEPTS.ajustes).toBe(true);
  });
});
