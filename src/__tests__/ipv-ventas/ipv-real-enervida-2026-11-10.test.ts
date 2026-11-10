/**
 * VERIFICACIÓN CON DATOS REALES (READ-ONLY) — CORRECCIÓN IPV 2026-11-11.
 *
 * Ejecuta computeIpv sobre un fixture de PRODUCCIÓN descargado en modo
 * SOLO LECTURA por scripts/ipv-usd-fetch-fixture.mjs (fuera del repo): las
 * mismas 6 fuentes que GET /api/ipv-ventas para ENERVIDA-VITALLCONS en el día
 * de negocio 2026-11-10 (America/Havana) — el día EXACTO del incidente
 * reportado (SKU 88 "Cable Solar Rojo 4mm": 7 u, 29.295,00 CUP y 31,50 USD
 * ficticios por precio de referencia del catálogo).
 *
 * Esta prueba NO corre en CI (no hay fixture): se activa con
 *   IPV_REAL_FIXTURE=<ruta.json> bunx vitest run src/__tests__/ipv-ventas/ipv-real-enervida-2026-11-10.test.ts
 * y permite RE-VERIFICAR la corrección contra datos frescos de producción
 * (protocolo de resiliencia: verificación repetible).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  computeIpv,
  type IpvComputeInput,
  type IpvSalesLineRow,
  type IpvSalePaymentRow,
} from '@/lib/ipv-ventas/compute';

const FIXTURE_PATH = process.env.IPV_REAL_FIXTURE || '';
const fixtureExists = FIXTURE_PATH !== '';

interface FixtureShape {
  meta: { store: string; businessDay: string; counts: Record<string, number> };
  input: {
    products: IpvComputeInput['products'];
    movements: IpvComputeInput['movements'];
    inventory: IpvComputeInput['inventory'];
    salesLines: IpvSalesLineRow[];
    devolutionLines: IpvComputeInput['devolutionLines'];
    salesPayments: IpvSalePaymentRow[];
  };
}

const fixture: FixtureShape | null = fixtureExists
  ? JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as FixtureShape
  : null;

describe.skipIf(!fixtureExists)('IPV real — ENERVIDA-VITALLCONS, día de negocio 2026-11-10 (datos de producción, read-only)', () => {
  const result = fixture ? computeIpv({
    window: { fromISO: fixture.meta.businessDay ? '2026-11-10T05:00:00.000Z' : '', toISO: '2026-11-11T04:59:59.999Z' },
    movements: fixture.input.movements,
    inventory: fixture.input.inventory,
    salesLines: fixture.input.salesLines,
    salesPayments: fixture.input.salesPayments,
    devolutionLines: fixture.input.devolutionLines,
    products: fixture.input.products,
  }) : null;

  it('SKU 88 "Cable Solar Rojo 4mm": 29.295,00 CUP y 0,00 USD — sin los 31,50 USD ficticios', () => {
    const row = result!.rows.find((r) => r.sku === '88');
    expect(row).toBeTruthy();
    expect(row!.cantidadesVendidas).toBe(7);
    expect(row!.ventasImporteCup).toBe(29295); // 4185 × 7 — contable SIN CAMBIO
    expect(row!.ventasImporteUsd).toBe(0);     // cobro 100 % CUP → columna USD vacía («—»)
  });

  it('el total de Ventas USD del día == Σ importes USD de las filas de pago reales (correspondencia)', () => {
    const usdReal = fixture!.input.salesPayments
      .filter((p) => String(p.currency).toUpperCase() === 'USD')
      .reduce((s, p) => s + Number(p.amount ?? 0), 0);
    expect(usdReal).toBe(0); // el 10/11/2026 NO se cobró ningún USD en la tienda
    expect(result!.totals.ventasImporteUsd).toBeCloseTo(usdReal, 2);
  });

  it('ninguna fila del día muestra ingreso USD sin pago USD registrado', () => {
    for (const row of result!.rows) {
      expect(row.ventasImporteUsd, `producto ${row.sku}`).toBe(0);
    }
  });

  it('la columna contable CUP sigue cuadrando con las líneas de venta reales del día', () => {
    // Σ línea CUP histórica de las 6 líneas del día (misma fórmula del IPV).
    const expectedCup = fixture!.input.salesLines.reduce((s, l) => {
      const cup = Number(l.price_at_sale_cup ?? 0);
      const rate = Number(l.exchange_rate ?? 0) > 0 ? Number(l.exchange_rate) : (Number(l.sale_exchange_rate ?? 0) > 0 ? Number(l.sale_exchange_rate) : 1);
      const qty = Number(l.quantity ?? 0);
      const unit = Number(l.price_at_sale ?? 0) * rate;
      // Forma unitaria (la de las filas reales de la ventana): unit × qty.
      const total = Math.abs(cup - unit) <= 0.01 || cup === 0 ? (cup || unit) * qty : cup * qty;
      return s + Math.round((total + Number.EPSILON) * 100) / 100;
    }, 0);
    expect(result!.totals.ventasImporteCup).toBeCloseTo(expectedCup, 2);
  });
});
