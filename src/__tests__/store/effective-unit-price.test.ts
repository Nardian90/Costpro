/**
 * FASE E-SEC — helper effectiveUnitPrice (R-SEC-1, corrección del flujo legítimo).
 *
 * La UI negocia precios vía descuento por ítem (por línea). El payload V2 debe
 * enviar el precio unitario REALMENTE cobrado para que total == Σ price×qty y
 * el servidor pueda validar el desvío contra el catálogo sin ERR_TOTAL_MISMATCH
 * (pre-fix: toda venta con descuento por ítem fallaba con 422).
 *
 * FASE E-SEC-FINAL (D5): precio monetario de línea → 2 decimales (half-up
 * exacto, ≡ ROUND(numeric,2) de PostgreSQL). Cliente y servidor comparten la
 * semántica: effectiveUnitPrice SIEMPRE devuelve 2dp; calculateItemSubtotal
 * replica la aritmética del RPC (ROUND(ROUND(unit,2)*qty,2)).
 */
import { describe, it, expect } from 'vitest';
import { effectiveUnitPrice, round2 } from '@/store/cart';

describe('E-SEC — effectiveUnitPrice (precio negociado legítimo)', () => {
  it('sin descuento → precio de catálogo intacto', () => {
    expect(effectiveUnitPrice(500, 1, null, 0)).toBe(500);
    expect(effectiveUnitPrice(500, 3, null, null)).toBe(500);
    expect(effectiveUnitPrice(500, 2, 'percentage', 0)).toBe(500);
  });

  it('porcentaje: 500 con 2% → 490 (el caso comercial 500→490)', () => {
    expect(effectiveUnitPrice(500, 1, 'percentage', 2)).toBeCloseTo(490, 6);
  });

  it('porcentaje: 500 con 10% → 450', () => {
    expect(effectiveUnitPrice(500, 1, 'percentage', 10)).toBeCloseTo(450, 6);
  });

  it('fijo por LÍNEA: 500×2 con 10 → 495/u (10 una vez, no por unidad)', () => {
    expect(effectiveUnitPrice(500, 2, 'fixed', 10)).toBeCloseTo(495, 6);
  });

  it('fijo por LÍNEA: 500×1 con 10 → 490', () => {
    expect(effectiveUnitPrice(500, 1, 'fixed', 10)).toBeCloseTo(490, 6);
  });

  it('fijo mayor que la línea → clampea a 0 (nunca negativo)', () => {
    expect(effectiveUnitPrice(500, 1, 'fixed', 600)).toBe(0);
  });

  it('porcentaje 100% → 0 (venta gratuita con supervisor, no negativa)', () => {
    expect(effectiveUnitPrice(500, 1, 'percentage', 100)).toBe(0);
  });

  it('coherencia D5: Σ round2(unit)×qty == subtotal de línea == aritmética del RPC', () => {
    // D5: el unitario es monetario (2dp). fixed 50 sobre 500×3 → unit 483.33
    // (el float daría 483.3333…); el total de línea es ROUND(483.33×3, 2) =
    // 1449.99 — EXACTAMENTE lo que calcula create_sale_v2 con el payload V2.
    // Este es el contrato D5: total = suma de subtotales de línea ya redondeados.
    const qty = 3;
    const price = effectiveUnitPrice(500, qty, 'fixed', 50);
    expect(price).toBe(483.33);
    expect(round2(price * qty)).toBe(1449.99);
    const price2 = effectiveUnitPrice(500, qty, 'percentage', 20);
    expect(price2).toBe(400);
    expect(round2(price2 * qty)).toBe(1200);
  });
});

describe('E-SEC-FINAL D5 — round2 (half-up exacto ≡ ROUND(numeric,2) de PostgreSQL)', () => {
  it('valores de la matriz de seguridad: 19.99 / 33.33 / 99.95 / 0.01', () => {
    expect(round2(19.99)).toBe(19.99);
    expect(round2(33.33)).toBe(33.33);
    expect(round2(99.95)).toBe(99.95);
    expect(round2(0.01)).toBe(0.01);
  });

  it('mitad de centavo: 19.995 → 20.00 (el float daría 19.99)', () => {
    expect(round2(19.995)).toBe(20);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.005)).toBe(1.01);
  });

  it('polvo binario se recorta sin alterar el decimal', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(490.00000000000006)).toBe(490);
    expect(round2(240.00000000000003)).toBe(240);
  });

  it('subtotal de línea: ROUND(ROUND(unit,2) * qty, 2) — réplica del RPC', () => {
    // unit 33.33 × qty 3 = 99.99
    expect(round2(round2(33.33) * 3)).toBe(99.99);
    // unit 19.99 × qty 3 = 59.97
    expect(round2(round2(19.99) * 3)).toBe(59.97);
    // unit 99.95 × qty 2 = 199.90
    expect(round2(round2(99.95) * 2)).toBe(199.9);
    // qty fraccional: 33.33 × 0.5 = 16.665 → half-up → 16.67
    expect(round2(round2(33.33) * 0.5)).toBe(16.67);
  });

  it('negativos: half-away-from-zero (≡ SQL ROUND)', () => {
    expect(round2(-2.675)).toBe(-2.68);
  });

  it('no finito pasa tal cual (el RPC lo rechaza por su cuenta)', () => {
    expect(round2(Infinity)).toBe(Infinity);
  });

  it('effectiveUnitPrice SIEMPRE devuelve 2dp (D5: precio monetario de línea)', () => {
    // 99.99 con 33.33% → 66.6566... → 66.66 (no 66.65666666...)
    expect(effectiveUnitPrice(99.99, 1, 'percentage', 33.33)).toBe(66.66);
    // el payload V2 envía este valor y el servidor lo re-redondea sin cambio
    expect(effectiveUnitPrice(500, 3, 'fixed', 10)).toBeCloseTo(round2((500 * 3 - 10) / 3), 10);
  });
});
