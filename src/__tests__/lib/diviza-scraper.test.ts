/**
 * diviza-scraper.test.ts — Pruebas del adaptador de cubadivisas.com (Diviza).
 *
 * Misión IC-DIVIZA (2026-10-26). Cubre los casos obligatorios:
 *  - Captura válida de USD, EUR y MLC desde el HTML real (fixture anonimizado).
 *  - Respuesta de error / mantenimiento / HTML vacío / estructura alterada.
 *  - Valor no numérico, cero, negativo, extremadamente alto o ambiguo.
 *  - Moneda ausente → null (NUNCA se fabrica desde otra moneda).
 *  - Momento de actualización de la fuente distinto del de captura.
 *  - Fallo de red/HTTP → null sin lanzar (carry-forward del caller).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  parseDivizaHtml,
  parseDivizaUpdatedAt,
  validateRateValue,
  fetchDivizaRates,
} from '@/lib/diviza-scraper';

const FIXTURES_DIR = join(__dirname, '../fixtures/diviza');

/** HTML real anonimizado de cubadivisas.com (estructura conv-data intacta). */
const REAL_HOME_HTML = readFileSync(join(FIXTURES_DIR, 'home-real.html'), 'utf8');

/** Construye un HTML válido con conv-data personalizable. */
function buildHtml(convData: unknown, opts?: { updated?: string; minLength?: boolean }): string {
  const json = typeof convData === 'string' ? convData : JSON.stringify(convData);
  const padding = opts?.minLength === false ? '' : '<!--' + 'x'.repeat(300) + '-->';
  const updated =
    opts?.updated ??
    'Actualizado el 25 de octubre de 2026, 5:30 p. m. (hora de Cuba) · se actualiza cada 30 minutos';
  return `<!DOCTYPE html><html lang="es"><head><title>Precio del dólar en Cuba hoy</title></head>
<body><main><h1>Precio del dólar en Cuba hoy</h1><p>${updated}</p>${padding}
<script type="application/json" id="conv-data">${json}</script>
</main></body></html>`;
}

const VALID_CONV = {
  informal: [
    { code: 'USD', label: 'USD', rate: 839 },
    { code: 'ECU', label: 'EUR', rate: 930 },
    { code: 'MLC', label: 'MLC', rate: 691.62 },
    { code: 'CAD', label: 'CAD', rate: 539.44 },
    { code: 'USD_Zelle.CUP', label: 'Zelle', rate: 821.25 },
    { code: 'CLA', label: 'CLA', rate: 758.38 },
  ],
  formal: [
    { code: 'USD', label: 'USD', rate: 757.86 },
    { code: 'EUR', label: 'EUR', rate: 848.65 },
  ],
};

describe('diviza-scraper — parseDivizaHtml', () => {
  it('extrae USD, EUR y MLC del HTML real anonimizado (fixture)', () => {
    const rates = parseDivizaHtml(REAL_HOME_HTML);
    expect(rates).not.toBeNull();
    expect(rates!.usd).toBe(839);
    expect(rates!.eur).toBe(930);
    expect(rates!.mlc).toBe(691.62);
    expect(rates!.sourceUrl).toBe('https://cubadivisas.com/');
    expect(rates!.strategy).toBe('conv-data-json');
  });

  it('distingue el momento de actualización de la fuente del de captura', () => {
    const before = new Date().toISOString();
    const rates = parseDivizaHtml(REAL_HOME_HTML);
    const after = new Date().toISOString();
    // La fuente declara: 25 de octubre de 2026, 5:30 p. m. (hora de Cuba)
    // Cuba está en horario de verano (2º dom. marzo → 1º dom. noviembre) → UTC-4
    expect(rates!.sourceUpdatedAt).toBe('2026-10-25T17:30:00-04:00');
    // capturedAt es el momento de COSTPRO (entre before y after)
    expect(rates!.capturedAt >= before).toBe(true);
    expect(rates!.capturedAt <= after).toBe(true);
    expect(rates!.capturedAt).not.toBe(rates!.sourceUpdatedAt);
  });

  it('EUR usa code ECU + label EUR (ambas claves aceptadas)', () => {
    const onlyCode = buildHtml({
      informal: [
        { code: 'USD', label: 'USD', rate: 500 },
        { code: 'ECU', label: 'Otro', rate: 560 },
        { code: 'MLC', label: 'MLC', rate: 420 },
      ],
    });
    expect(parseDivizaHtml(onlyCode)?.eur).toBe(560);

    const onlyLabel = buildHtml({
      informal: [
        { code: 'USD', label: 'USD', rate: 500 },
        { code: 'EUR', label: 'EUR', rate: 570 },
        { code: 'MLC', label: 'MLC', rate: 420 },
      ],
    });
    expect(parseDivizaHtml(onlyLabel)?.eur).toBe(570);
  });

  it('no confunde la serie formal con la informal', () => {
    // El formal tiene USD 757.86 — NO debe usarse como informal (839).
    const rates = parseDivizaHtml(buildHtml(VALID_CONV));
    expect(rates!.usd).toBe(839);
    expect(rates!.usd).not.toBe(757.86);
  });

  // ── Páginas de error / mantenimiento / estructura alterada ──

  it('HTML vacío o < 200 chars → null (página de error)', () => {
    expect(parseDivizaHtml('')).toBeNull();
    expect(parseDivizaHtml('<html><body>Maintenance</body></html>')).toBeNull();
  });

  it('página de mantenimiento con cuerpo largo pero sin conv-data → null', () => {
    const maintenance = `<!DOCTYPE html><html><body><div>${'Sitio en mantenimiento. '.repeat(50)}</div></body></html>`;
    expect(parseDivizaHtml(maintenance)).toBeNull();
  });

  it('conv-data con JSON malformado → null (sin crash)', () => {
    const broken = buildHtml('{"informal":[{"code":"USD","rate":839,,}]}');
    expect(parseDivizaHtml(broken)).toBeNull();
  });

  it('conv-data sin array informal → null', () => {
    expect(parseDivizaHtml(buildHtml({ formal: VALID_CONV.formal }))).toBeNull();
    expect(parseDivizaHtml(buildHtml({ informal: [] }))).toBeNull();
  });

  it('sin USD válido → null (USD es obligatoria)', () => {
    const noUsd = buildHtml({
      informal: [
        { code: 'ECU', label: 'EUR', rate: 930 },
        { code: 'MLC', label: 'MLC', rate: 691.62 },
      ],
    });
    expect(parseDivizaHtml(noUsd)).toBeNull();
  });

  // ── Valores inválidos por moneda ──

  it('EUR no numérico / cero / negativo / extremo → null (no fabricado)', () => {
    const cases: unknown[] = ['abc', 0, -50, 999999999, NaN, Infinity, null, undefined, ''];
    for (const bad of cases) {
      const html = buildHtml({
        informal: [
          { code: 'USD', label: 'USD', rate: 839 },
          { code: 'ECU', label: 'EUR', rate: bad as any },
          { code: 'MLC', label: 'MLC', rate: 691.62 },
        ],
      });
      const rates = parseDivizaHtml(html);
      // USD sigue válida; EUR null — JAMÁS inventado
      expect(rates).not.toBeNull();
      expect(rates!.usd).toBe(839);
      expect(rates!.eur).toBeNull();
      expect(rates!.mlc).toBe(691.62);
    }
  });

  it('MLC ausente → null (no se copia desde USD)', () => {
    const html = buildHtml({
      informal: [
        { code: 'USD', label: 'USD', rate: 839 },
        { code: 'ECU', label: 'EUR', rate: 930 },
      ],
    });
    const rates = parseDivizaHtml(html);
    expect(rates!.mlc).toBeNull();
    expect(rates!.mlc).not.toBe(rates!.usd);
  });

  it('valores numéricos en string ("839", "691,62") se aceptan y redondean a 2 decimales', () => {
    const html = buildHtml({
      informal: [
        { code: 'USD', label: 'USD', rate: '839' },
        { code: 'ECU', label: 'EUR', rate: '930.50' },
        { code: 'MLC', label: 'MLC', rate: '691.625' },
      ],
    });
    const rates = parseDivizaHtml(html);
    expect(rates!.usd).toBe(839);
    expect(rates!.eur).toBe(930.5);
    expect(rates!.mlc).toBe(691.63); // redondeo a 2 decimales
  });

  it('rate como string con coma decimal se normaliza ("691,62" → 691.62)', () => {
    const html = buildHtml({
      informal: [
        { code: 'USD', label: 'USD', rate: 839 },
        { code: 'MLC', label: 'MLC', rate: '691,62' },
      ],
    });
    expect(parseDivizaHtml(html)?.mlc).toBe(691.62);
  });

  it('timestamp de la fuente ausente → sourceUpdatedAt null (captura no falla)', () => {
    const html = buildHtml(VALID_CONV, { updated: 'sin sello temporal' });
    const rates = parseDivizaHtml(html);
    expect(rates).not.toBeNull();
    expect(rates!.sourceUpdatedAt).toBeNull();
    expect(rates!.usd).toBe(839);
  });
});

describe('diviza-scraper — validateRateValue', () => {
  it('rechaza cero, negativos, no finitos y fuera de rango', () => {
    expect(validateRateValue(0)).toBeNull();
    expect(validateRateValue(-1)).toBeNull();
    expect(validateRateValue(NaN)).toBeNull();
    expect(validateRateValue(Infinity)).toBeNull();
    expect(validateRateValue(-Infinity)).toBeNull();
    expect(validateRateValue(100001)).toBeNull();
    expect(validateRateValue(0.5)).toBeNull();
    expect(validateRateValue(undefined)).toBeNull();
    expect(validateRateValue({})).toBeNull();
  });

  it('acepta números y strings numéricos válidos', () => {
    expect(validateRateValue(839)).toBe(839);
    expect(validateRateValue(691.62)).toBe(691.62);
    expect(validateRateValue('839')).toBe(839);
    expect(validateRateValue(1)).toBe(1);
    expect(validateRateValue(100000)).toBe(100000);
  });
});

describe('diviza-scraper — parseDivizaUpdatedAt', () => {
  it('parsea p. m. / a. m. con y sin espacios, y horas 12', () => {
    expect(parseDivizaUpdatedAt('Actualizado el 25 de octubre de 2026, 5:30 p. m. (hora de Cuba)'))
      .toBe('2026-10-25T17:30:00-04:00');
    expect(parseDivizaUpdatedAt('Actualizado el 25 de octubre de 2026, 5:30 p.m.'))
      .toBe('2026-10-25T17:30:00-04:00');
    expect(parseDivizaUpdatedAt('Actualizado el 25 de octubre de 2026, 12:15 a.m.'))
      .toBe('2026-10-25T00:15:00-04:00');
    expect(parseDivizaUpdatedAt('Actualizado el 25 de octubre de 2026, 12:15 p.m.'))
      .toBe('2026-10-25T12:15:00-04:00');
    expect(parseDivizaUpdatedAt('Actualizado el 25 de octubre de 2026, 9 a.m.'))
      .toBe('2026-10-25T09:00:00-04:00');
  });

  it('aplica horario de invierno (UTC-5) fuera del periodo DST', () => {
    // 15 de enero de 2026 → invierno → -05:00
    expect(parseDivizaUpdatedAt('Actualizado el 15 de enero de 2026, 3:00 p. m.'))
      .toBe('2026-01-15T15:00:00-05:00');
  });

  it('devuelve null ante texto sin timestamp', () => {
    expect(parseDivizaUpdatedAt('')).toBeNull();
    expect(parseDivizaUpdatedAt('Actualizado cada 30 minutos')).toBeNull();
    expect(parseDivizaUpdatedAt('Actualizado el 99 de mumbo de 2026, 5:30 p. m.')).toBeNull();
  });
});

describe('diviza-scraper — fetchDivizaRates (red)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('HTTP 200 con HTML válido → tasas con procedencia Diviza', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => REAL_HOME_HTML,
    }) as any;
    const rates = await fetchDivizaRates();
    expect(rates).not.toBeNull();
    expect(rates!.usd).toBe(839);
    expect(rates!.sourceUpdatedAt).toBe('2026-10-25T17:30:00-04:00');
  });

  it('HTTP 500 → null sin lanzar (error del servidor del proveedor)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'err',
    }) as any;
    expect(await fetchDivizaRates()).toBeNull();
  });

  it('timeout / error de red → null sin lanzar', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('This operation was aborted')) as any;
    expect(await fetchDivizaRates()).toBeNull();
  });

  it('HTTP 200 con página de mantenimiento → null (sin cotizaciones)', async () => {
    const maintenance = `<html><body>${'En mantenimiento. Volveremos pronto. '.repeat(30)}</body></html>`;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => maintenance,
    }) as any;
    expect(await fetchDivizaRates()).toBeNull();
  });
});
