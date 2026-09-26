/**
 * FASE E-SEC — helper effectiveUnitPrice (R-SEC-1, corrección del flujo legítimo).
 *
 * La UI negocia precios vía descuento por ítem (por línea). El payload V2 debe
 * enviar el precio unitario REALMENTE cobrado para que total == Σ price×qty y
 * el servidor pueda validar el desvío contra el catálogo sin ERR_TOTAL_MISMATCH
 * (pre-fix: toda venta con descuento por ítem fallaba con 422).
 */
import { describe, it, expect } from 'vitest';
import { effectiveUnitPrice } from '@/store/cart';

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

  it('coherencia: Σ price×qty == subtotal de línea (contrato del payload V2)', () => {
    const qty = 3;
    const price = effectiveUnitPrice(500, qty, 'fixed', 50);
    expect(price * qty).toBeCloseTo(1450, 6);
    const price2 = effectiveUnitPrice(500, qty, 'percentage', 20);
    expect(price2 * qty).toBeCloseTo(1200, 6);
  });
});
