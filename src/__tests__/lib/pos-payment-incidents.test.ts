/**
 * MISIÓN-FLEX (2026-10-17) — Tests de la librería de incidencias de pago.
 * Cobertura de la matriz de pruebas A.1–A.5 de la misión (nivel lógica):
 * pago exacto (sin incidencias falsas), pago insuficiente, sobrepago,
 * descuadre de desglose mixto y nota automática.
 */
import { describe, it, expect } from 'vitest';
import {
  computePaymentIncidents,
  buildRateDifferenceIncident,
  buildIncidenceNote,
  buildIncidentToastMessage,
  summarizeIncidents,
  round2,
} from '@/lib/pos/payment-incidents';

const STORE_RATE = 790;

/**
 * Ítem idéntico al carrito real: `subtotal` está en la moneda NATIVA del item
 * (120 USD), y el esperado en CUP = subtotal × tasa (120 × 790 = 94 800).
 * El pago (paidCup) siempre se expresa en CUP (igual que getItemPaidCup).
 */
function mpptItem(overrides: Partial<{ subtotal: number; currency: string; exchange_rate: number; paidCup: number }> = {}) {
  const subtotal = overrides.subtotal ?? 120;
  return {
    product_id: 'aaaa1111-0000-4000-8000-000000000001',
    product: { name: 'MPPT Solar 120W' },
    subtotal,
    currency: overrides.currency ?? 'USD',
    exchange_rate: overrides.exchange_rate ?? STORE_RATE,
    paidCup: overrides.paidCup ?? subtotal * (overrides.currency === 'CUP' ? 1 : STORE_RATE),
  };
}

function harness(items: ReturnType<typeof mpptItem>[], discount = null as { type: 'fixed' | 'percentage'; value: number } | null) {
  return computePaymentIncidents({
    items,
    discount,
    getItemPaidCup: (i) => (i as unknown as { paidCup: number }).paidCup ?? 0,
  });
}

describe('computePaymentIncidents — venta exacta y diferencias', () => {
  it('A.1 pago exacto → SIN incidencias (cero falsos positivos)', () => {
    const incidents = harness([mpptItem({ paidCup: 94800 })]);
    expect(incidents).toEqual([]);
    expect(buildIncidenceNote(incidents, { totalCup: 94800, receivedCup: 94800 })).toBeNull();
    expect(buildIncidentToastMessage(incidents)).toBeNull();
  });

  it('A.2 pago insuficiente → incidencia global con pendiente exacto', () => {
    const incidents = harness([mpptItem({ paidCup: 80000 })]);
    const s = summarizeIncidents(incidents);
    expect(s.hasInsufficient).toBe(true);
    expect(s.globalDifferenceCup).toBe(-14800);
    expect(s.expectedTotalCup).toBe(94800);
    expect(s.receivedTotalCup).toBe(80000);
    const note = buildIncidenceNote(incidents, { totalCup: 94800, receivedCup: 80000 })!;
    expect(note).toContain('INCIDENCIA DE PAGO: venta registrada con pago insuficiente');
    expect(note).toContain('Total: 94800.00 CUP');
    expect(note).toContain('Importe recibido: 80000.00 CUP');
    expect(note).toContain('Pendiente: 14800.00 CUP');
  });

  it('A.3 sobrepago → incidencia global positiva (no se pierde la diferencia)', () => {
    const incidents = harness([mpptItem({ paidCup: 100000 })]);
    const s = summarizeIncidents(incidents);
    expect(s.hasOverpayment).toBe(true);
    expect(s.globalDifferenceCup).toBe(5200);
    const note = buildIncidenceNote(incidents, { totalCup: 94800, receivedCup: 100000 })!;
    expect(note).toContain('sobrepago detectado');
    expect(note).toContain('Diferencia: 5200.00 CUP');
  });

  it('A.4 descuadre de desglose por línea (un item corto) → mixed_breakdown_mismatch con nombre del producto', () => {
    // Dos items de 60 USD (47 400 CUP c/u): uno cuadrado, otro con faltante.
    const items = [
      mpptItem({ subtotal: 60, paidCup: 47400 }),
      { ...mpptItem({ subtotal: 60, paidCup: 40000 }), product: { name: 'Batería Litio' } },
    ];
    const incidents = harness(items);
    const perLine = incidents.filter(i => i.type === 'mixed_breakdown_mismatch');
    expect(perLine).toHaveLength(1);
    expect(perLine[0].item_name).toBe('Batería Litio');
    expect(perLine[0].difference_cup).toBe(-7400);
    // Global: recibido 87400 vs esperado 94800 → faltante global también
    expect(summarizeIncidents(incidents).hasInsufficient).toBe(true);
  });

  it('A.4b descuadre que NETEA a cero (un item corto, otro en exceso) → solo incidencia de desglose, sin global', () => {
    const items = [
      { ...mpptItem({ subtotal: 60, paidCup: 40400 }), product: { name: 'A' } },
      { ...mpptItem({ subtotal: 60, paidCup: 54400 }), product: { name: 'B' } },
    ];
    const incidents = harness(items);
    expect(summarizeIncidents(incidents).hasInsufficient).toBe(false);
    expect(summarizeIncidents(incidents).hasOverpayment).toBe(false);
    expect(summarizeIncidents(incidents).hasBreakdownMismatch).toBe(true);
  });

  it('respeta el descuento global al calcular el esperado por línea', () => {
    // 2 items CUP de 94 800; descuento fijo 948 → esperado por item 94 800 - 474.
    const items = [
      mpptItem({ subtotal: 94800, currency: 'CUP', exchange_rate: 1, paidCup: 94326 }),
      mpptItem({ subtotal: 94800, currency: 'CUP', exchange_rate: 1, paidCup: 94326 }),
    ];
    const incidents = harness(items, { type: 'fixed', value: 948 });
    expect(incidents).toEqual([]);
  });

  it('tolerancia 0.01: diferencias de redondeo mínimas no generan incidencia', () => {
    const incidents = harness([mpptItem({ paidCup: 94800.005 })]);
    expect(incidents).toEqual([]);
  });

  it('buildRateDifferenceIncident documenta la diferencia aceptada en el modal de tasa', () => {
    const inc = buildRateDifferenceIncident(94800, 90000);
    expect(inc.type).toBe('rate_difference');
    expect(inc.difference_cup).toBe(-4800);
    expect(summarizeIncidents([inc]).hasRateDifference).toBe(true);
  });
});

describe('redondeo half-up (canónico de store/cart)', () => {
  it('round2 coincide con ROUND() de Postgres para los casos límite', () => {
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-2.675)).toBe(-2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    // No finitos: el canónico propaga (el payload fallará validación Zod finite)
    expect(Number.isNaN(round2(NaN))).toBe(true);
    expect(round2(Infinity)).toBe(Infinity);
  });
});

describe('buildIncidenceNote — detalle por línea', () => {
  it('incluye las líneas con diferencias (máx 5) y el signo correcto', () => {
    // Items CUP (tasa 1) para que los importes sean directamente legibles.
    const items = Array.from({ length: 7 }, (_, k) => ({
      ...mpptItem({ subtotal: 1000, paidCup: 900, currency: 'CUP', exchange_rate: 1 }),
      product: { name: `Prod ${k + 1}` },
    }));
    const incidents = harness(items);
    const note = buildIncidenceNote(incidents, { totalCup: 7000, receivedCup: 6300 })!;
    expect(note).toContain('"Prod 1"');
    expect(note).toContain('"Prod 5"');
    expect(note).not.toContain('"Prod 6"');
    expect(note).toContain('(+2 líneas con diferencias');
    expect(note).toContain('faltante 100.00 CUP');
    expect(note).toContain('Pendiente: 700.00 CUP');
  });
});
