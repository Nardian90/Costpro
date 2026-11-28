/**
 * exchange-sources.test.ts — Contrato del registro ÚNICO de fuentes de
 * tasas informales (misión IC-DIVIZA-003, 2026-10-26).
 *
 * CostPro usa Diviza (cubadivisas.com) como ÚNICA fuente informal ACTIVA.
 * elToque es ARCHIVO HISTÓRICO (serie congelada 2025-12-25 → 2026-07-28,
 * su proveedor real solucionescuba.com está caído) y NO participa en
 * ninguna decisión de tasa vigente: selección, resolución del proveedor
 * más reciente, fallback, carry-forward, brecha, indicadores ni
 * simuladores.
 *
 * Este módulo (src/lib/exchange-sources.ts) es la fuente única de verdad
 * compartida por la API (/api/exchange-rates), la lib de captura
 * (exchange-capture.ts) y la vista (ExchangeIntelligenceView.tsx) — la
 * misma clasificación en servidor y cliente, sin divergencia. Estas
 * pruebas fijan el contrato para que ningún consumidor lo erosione.
 */
import { describe, it, expect } from 'vitest';
import {
  INFORMAL_ACTIVE_SOURCES,
  INFORMAL_HISTORICAL_SOURCES,
  INFORMAL_RECOVERED_SOURCES,
  ALL_INFORMAL_SOURCES,
  isActiveInformalSource,
  isHistoricalInformalSource,
  isKnownInformalSource,
  normalizeCosteoRateSource,
} from '@/lib/exchange-sources';

describe('registro de fuentes informales (IC-DIVIZA-003 + CP-FX-001)', () => {
  it("ACTIVAS = ['Diviza'] EXACTAMENTE — la única con derecho a vigencia", () => {
    // Exactitud (toEqual, no toContain): añadir una segunda fuente activa
    // es una decisión de misión que debe pasar por aquí explícitamente.
    expect([...INFORMAL_ACTIVE_SOURCES]).toEqual(['Diviza']);
  });

  it("HISTÓRICAS = ['elToque'] EXACTAMENTE — archivo verificable", () => {
    expect([...INFORMAL_HISTORICAL_SOURCES]).toEqual(['elToque']);
  });

  it("RECUPERADAS = ['Cuba Clara'] EXACTAMENTE — fuente compatible importada (CP-FX-001)", () => {
    // Decisión de misión explícita: Cuba Clara «Dólar en la calle»
    // (cubaclara.org, CC BY 4.0) entra como fuente RECUPERADA con el
    // MISMO trato que el archivo histórico: verificable, consultable,
    // JAMÁS vigente, JAMÁS carry-forward.
    expect([...INFORMAL_RECOVERED_SOURCES]).toEqual(['Cuba Clara']);
  });

  it('ALL = activas + históricas + recuperadas (orden estable, sin duplicados)', () => {
    expect([...ALL_INFORMAL_SOURCES]).toEqual(['Diviza', 'elToque', 'Cuba Clara']);
    expect(new Set(ALL_INFORMAL_SOURCES).size).toBe([...ALL_INFORMAL_SOURCES].length);
  });

  it('las listas son DISJUNTAS (una fuente no puede ser activa e histórica/recuperada)', () => {
    for (const h of [...INFORMAL_HISTORICAL_SOURCES, ...INFORMAL_RECOVERED_SOURCES]) {
      expect((INFORMAL_ACTIVE_SOURCES as readonly string[]).includes(h)).toBe(false);
    }
    for (const a of INFORMAL_ACTIVE_SOURCES) {
      expect((INFORMAL_HISTORICAL_SOURCES as readonly string[]).includes(a)).toBe(false);
      expect((INFORMAL_RECOVERED_SOURCES as readonly string[]).includes(a)).toBe(false);
    }
  });
});

describe('predicados de clasificación', () => {
  it('isActiveInformalSource: true SOLO para Diviza', () => {
    expect(isActiveInformalSource('Diviza')).toBe(true);
    // ElToque: archivo histórico — jamás vigente
    expect(isActiveInformalSource('elToque')).toBe(false);
    expect(isActiveInformalSource('BCC')).toBe(false);
    expect(isActiveInformalSource('Manual')).toBe(false);
    expect(isActiveInformalSource('')).toBe(false);
    // Case-sensitive: los valores de exchange_rates.source son exactos
    expect(isActiveInformalSource('diviza')).toBe(false);
    expect(isActiveInformalSource('DIVIZA')).toBe(false);
  });

  it('isHistoricalInformalSource: true para elToque Y Cuba Clara (ambas jamás vigentes)', () => {
    expect(isHistoricalInformalSource('elToque')).toBe(true);
    // CP-FX-001: la fuente recuperada comparte el trato de archivo histórico.
    expect(isHistoricalInformalSource('Cuba Clara')).toBe(true);
    expect(isHistoricalInformalSource('Diviza')).toBe(false);
    expect(isHistoricalInformalSource('BCC')).toBe(false);
    expect(isHistoricalInformalSource('')).toBe(false);
    expect(isHistoricalInformalSource('eltoque')).toBe(false);
    expect(isHistoricalInformalSource('cuba clara')).toBe(false); // case-sensitive
    expect(isHistoricalInformalSource('CUBA CLARA')).toBe(false);
  });

  it('isKnownInformalSource: activas + históricas + recuperadas (la BD conoce las tres)', () => {
    // El CHECK exchange_rates_source_check permite las tres: el archivo
    // elToque sigue siendo un valor VÁLIDO (lectura source=elToque e
    // importación Excel bulk-upload) y Cuba Clara entra por CP-FX-001
    // (migración 20261128120000).
    expect(isKnownInformalSource('Diviza')).toBe(true);
    expect(isKnownInformalSource('elToque')).toBe(true);
    expect(isKnownInformalSource('Cuba Clara')).toBe(true);
    expect(isKnownInformalSource('BCC')).toBe(false);
    expect(isKnownInformalSource('Manual')).toBe(false);
    expect(isKnownInformalSource('')).toBe(false);
  });
});

describe('normalización del costeo dinámico (valor legado)', () => {
  it("'elToque' (persistido por versiones anteriores) se resuelve con 'Diviza'", () => {
    // El usuario que tenía guardada la opción «Informal» conserva su
    // intención — los datos ahora vienen de Diviza, no del archivo
    // histórico congelado.
    expect(normalizeCosteoRateSource('elToque')).toBe('Diviza');
  });

  it("'Cuba Clara' (fuente recuperada CP-FX-001) también se resuelve con 'Diviza'", () => {
    // El costeo vigente SOLO puede usar la fuente activa: una fuente
    // recuperada (archivo) jamás alimenta el cálculo de la tasa actual.
    expect(normalizeCosteoRateSource('Cuba Clara')).toBe('Diviza');
  });

  it('el resto de valores se devuelve SIN cambios (identidad)', () => {
    for (const v of ['BCC_seg1', 'BCC_seg2', 'BCC_seg3', 'Diviza', 'Manual', 'otro', '']) {
      expect(normalizeCosteoRateSource(v)).toBe(v);
    }
  });

  it('la normalización es PURA (determinista, sin estado)', () => {
    expect(normalizeCosteoRateSource('elToque')).toBe(normalizeCosteoRateSource('elToque'));
    expect(normalizeCosteoRateSource('elToque')).not.toBe('elToque');
  });
});
