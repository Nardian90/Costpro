/**
 * CP-BRA-REMEDIATION-001 (R-02) — pruebas de la tasa canónica CxC.
 *
 * Regla FIN-009/FIN-011: la conversión a CUP usa la jerarquía canónica de
 * tasas de la tienda (store_exchange_rates); NUNCA una constante ad-hoc
 * (la tasa fija 450 anterior era el defecto R-02 del RISK-REGISTER).
 */
import { describe, it, expect } from 'vitest';
import { resolveCanonicalRate, convertBalanceToCup, round2 } from '@/lib/accounts-receivable/rates';

describe('resolveCanonicalRate — jerarquía canónica (R-02)', () => {
  const rates = [
    { currency: 'USD', rate: 440 },
    { currency: 'EUR', rate: 460 },
    { currency: 'MLC', rate: 230.5 },
  ];

  it('CUP → 1 siempre (sin consulta de tasas)', () => {
    expect(resolveCanonicalRate(rates, 'CUP')).toBe(1);
    expect(resolveCanonicalRate(rates, null)).toBe(1);
    expect(resolveCanonicalRate(rates, undefined)).toBe(1);
    expect(resolveCanonicalRate(rates, '')).toBe(1);
  });

  it('divisa con tasa vigente de la tienda → tasa canónica', () => {
    expect(resolveCanonicalRate(rates, 'USD')).toBe(440);
    expect(resolveCanonicalRate(rates, 'usd')).toBe(440); // case-insensitive
    expect(resolveCanonicalRate(rates, 'EUR')).toBe(460);
    expect(resolveCanonicalRate(rates, 'MLC')).toBe(230.5);
  });

  it('divisa SIN tasa vigente → null (fail-closed, NUNCA inventa una tasa)', () => {
    expect(resolveCanonicalRate(rates, 'GBP')).toBeNull();
    expect(resolveCanonicalRate([], 'USD')).toBeNull();
    // tasas no admisibles (<= 1) no se usan
    expect(resolveCanonicalRate([{ currency: 'USD', rate: 1 }], 'USD')).toBeNull();
    expect(resolveCanonicalRate([{ currency: 'USD', rate: 0 }], 'USD')).toBeNull();
    expect(resolveCanonicalRate([{ currency: 'USD', rate: Number.NaN }], 'USD')).toBeNull();
  });

  it('acepta rate como string (filas de Supabase) sin romper la resolución', () => {
    expect(resolveCanonicalRate([{ currency: 'USD', rate: '790' } as unknown as { currency: string; rate: number }], 'USD')).toBe(790);
  });
});

describe('convertBalanceToCup — conversión canónica (R-02)', () => {
  it('CUP → el propio saldo (redondeado a 2)', () => {
    expect(convertBalanceToCup(1500, 'CUP', 1)).toBe(1500);
    expect(convertBalanceToCup(1500.005, 'CUP', 1)).toBe(1500.01);
  });

  it('divisa con tasa → saldo × tasa canónica', () => {
    expect(convertBalanceToCup(100, 'USD', 440)).toBe(44000);
    expect(convertBalanceToCup(100, 'USD', 790.25)).toBe(79025);
  });

  it('sin tasa → null (el saldo NO se convierte; se expone en moneda original)', () => {
    expect(convertBalanceToCup(100, 'USD', null)).toBeNull();
  });

  it('redondeo monetario a 2 decimales (misma semántica que ROUND(numeric,2))', () => {
    expect(round2(2.675)).toBe(2.68);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.004)).toBe(-1);
    expect(round2(44000.004)).toBe(44000);
  });
});

describe('regresión R-02 — la constante 450 quedó eliminada de la conversión', () => {
  it('la ruta CxC ya NO contiene la conversión fija ×450 y usa la tasa canónica', async () => {
    const { readFileSync } = await import('fs');
    const { resolve } = await import('path');
    const route = readFileSync(resolve(process.cwd(), 'src/app/api/accounts-receivable/route.ts'), 'utf8');
    // El defecto original: `const balanceCup = ... : balance * 450;`
    expect(route).not.toContain('balance * 450');
    expect(route).not.toMatch(/\*\s*450\b/);
    // La conversión pasa por la jerarquía canónica server-side.
    expect(route).toContain("from '@/lib/accounts-receivable/rates'");
    expect(route).toContain('resolveCanonicalRate');
    expect(route).toContain('convertBalanceToCup');
    expect(route).toContain('store_exchange_rates');
    // FIN-009: los saldos sin tasa NO entran en los totales CUP (fail-closed).
    expect(route).toContain('balance_cup !== null');
    expect(route).toContain('unrated');
  });
});
