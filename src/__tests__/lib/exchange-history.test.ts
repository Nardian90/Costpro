/**
 * exchange-history.test.ts — Serie informal UNIFICADA del Histórico
 * (misión IC-UX-HISTORY-004, 2026-10-26 §4).
 *
 * DEFECTO ORIGINAL que estas pruebas fijan: tras IC-DIVIZA-003 (Diviza
 * única fuente activa), la pestaña «Histórico» heredó la consulta de la
 * fuente ACTIVA y quedó reducida a ~2 días (Diviza comenzó 2026-10-25)
 * pese a existir en la base de datos meses de cotizaciones reales del
 * archivo elToque (2025-12-25 → 2026-07-28, 166 filas) y 141 días de BCC.
 *
 * CONTRATO de buildUnifiedHistorySeries:
 *   - La serie informal une TODAS las fuentes reales que aportaron datos
 *     (Diviza activa + elToque histórico + BCC oficial) — como UNA serie
 *     lógica, no una tabla por proveedor.
 *   - Exactamente UN punto informal por fecha (regla determinista:
 *     calidad real > estimated > carry_forward; procedencia activa >
 *     histórica; frescura captured_at DESC).
 *   - La procedencia original de cada fila se conserva (informalSource).
 *   - Los días sin cotización verificable NO se fabrican (huecos = null).
 *   - Orden cronológico estricto; las filas con rate_date futuro no
 *     desplazan a las válidas (aparecen al final tal cual).
 *
 * Este módulo NO selecciona la tasa VIGENTE (responsabilidad exclusiva de
 * la fuente activa vía /api/exchange-rates source=informal — IC-DIVIZA-003):
 * solo construye la SERIE HISTÓRICA para gráficos y análisis.
 */
import { describe, it, expect } from 'vitest';
import {
  buildUnifiedHistorySeries,
  pickUnifiedInformalRow,
  summarizeInformalProvenance,
  type UnifiedHistoryPoint,
} from '@/lib/exchange-history';

// ── Helpers de filas crudas (forma de la respuesta de la API) ──
type Row = {
  id?: string;
  rate_date: string;
  captured_at?: string | null;
  currency: string;
  source: string;
  segment?: string | null;
  rate: number;
  capture_method?: 'real' | 'estimated' | 'carry_forward' | string | null;
  original_rate_date?: string | null;
};

function elToque(date: string, rate: number, at = 'T03:32:28Z'): Row {
  return { rate_date: date, captured_at: `${date}${at}`, currency: 'USD', source: 'elToque', segment: '3', rate, capture_method: 'real' };
}
function diviza(date: string, rate: number, at = 'T23:00:00Z'): Row {
  return { rate_date: date, captured_at: `${date}${at}`, currency: 'USD', source: 'Diviza', segment: '3', rate, capture_method: 'real' };
}
function bcc(date: string, rate: number, segment = '3', at = 'T18:00:00Z'): Row {
  return { rate_date: date, captured_at: `${date}${at}`, currency: 'USD', source: 'BCC', segment, rate, capture_method: 'real' };
}
function virtual(base: Row, rateDate: string): Row {
  return { ...base, rate_date: rateDate, capture_method: 'carry_forward', original_rate_date: base.rate_date, id: `cf-${base.id ?? ''}` };
}

describe('buildUnifiedHistorySeries — serie informal unificada (IC-UX-HISTORY-004 §4)', () => {
  it('meses de datos de varias fuentes NO quedan reducidos a los días de la fuente activa (defecto original)', () => {
    // Réplica del estado real de la BD: archivo elToque dic→jul + Diviza
    // solo 2 días. El Histórico debe reflejar TODO el rango informal.
    const rows: Row[] = [
      elToque('2025-12-25', 440),
      elToque('2026-01-15', 450),
      elToque('2026-03-20', 460),
      elToque('2026-07-28', 475), // última fila del archivo
      diviza('2026-10-25', 840),  // primera de la fuente activa
      diviza('2026-10-26', 845),
    ];
    const series = buildUnifiedHistorySeries(rows);
    // 6 fechas distintas → 6 puntos (no 2).
    expect(series).toHaveLength(6);
    expect(series[0].date).toBe('2025-12-25');
    expect(series[series.length - 1].date).toBe('2026-10-26');
    // El salto del archivo (jul) a la activa (oct) NO se rellena: no se
    // fabrican fechas entre 2026-07-29 y 2026-10-24.
    const dates = series.map(p => p.date);
    expect(dates).not.toContain('2026-07-29');
    expect(dates.filter(d => d > '2026-07-28' && d < '2026-10-25')).toHaveLength(0);
  });

  it('incluye las filas de TODAS las fuentes reales con su procedencia (elToque no se descarta por source ≠ Diviza)', () => {
    const series = buildUnifiedHistorySeries([
      elToque('2026-01-05', 450),
      diviza('2026-10-25', 840),
      bcc('2026-10-25', 380),
    ]);
    const enero = series.find(p => p.date === '2026-01-05')!;
    expect(enero.informal).toBe(450);
    expect(enero.informalSource).toBe('elToque'); // trazabilidad conservada
    const hoy = series.find(p => p.date === '2026-10-25')!;
    expect(hoy.informal).toBe(840);
    expect(hoy.informalSource).toBe('Diviza');
    expect(hoy.oficial).toBe(380);
  });

  it('criterio 8: misma fecha con dos fuentes → UN solo punto informal (sin doble cómputo ni duplicación)', () => {
    const series = buildUnifiedHistorySeries([
      elToque('2026-10-25', 830),
      diviza('2026-10-25', 840),
    ]);
    expect(series).toHaveLength(1);
    expect(series[0].informal).toBe(840);
    expect(series[0].informalSource).toBe('Diviza');
  });

  it('regla de selección §1 CALIDAD: real > estimated > carry_forward (una real del archivo gana a una virtual de la activa)', () => {
    const realArchivo = elToque('2026-05-10', 460);
    const virtualDiviza = virtual(diviza('2026-05-03', 440), '2026-05-10');
    const series = buildUnifiedHistorySeries([realArchivo, virtualDiviza]);
    expect(series[0].informal).toBe(460);
    expect(series[0].informalSource).toBe('elToque');
    expect(series[0].informalCaptureMethod).toBe('real');
  });

  it('regla de selección §2 PROCEDENCIA: a igual calidad, la fuente ACTIVA (Diviza) precede al archivo (elToque)', () => {
    const picked = pickUnifiedInformalRow([
      elToque('2026-10-25', 830, 'T20:00:00Z'),
      diviza('2026-10-25', 840, 'T10:00:00Z'),
    ]);
    // Aunque elToque se capturó «más fresco» ese día, la calidad es igual
    // (real) y la procedencia activa manda.
    expect(picked?.source).toBe('Diviza');
    expect(picked?.rate).toBe(840);
  });

  it('regla de selección §3 FRESCURA: igual calidad y procedencia → captured_at más reciente (recaptura = upsert, no duplica)', () => {
    const picked = pickUnifiedInformalRow([
      diviza('2026-10-26', 840, 'T10:00:00Z'),
      diviza('2026-10-26', 845, 'T23:00:00Z'),
    ]);
    expect(picked?.rate).toBe(845);
  });

  it('criterio 10: filas con fecha futura NO desplazan a las válidas — aparecen al final tal cual están', () => {
    const series = buildUnifiedHistorySeries([
      diviza('2026-10-26', 845),
      // Fila legado del bug UTC pre-fix (fecha futura): se conserva, no
      // re-fechea, y no empuja a las válidas fuera de su orden.
      { ...diviza('2026-10-28', 999), capture_method: 'real' as const },
      diviza('2026-10-25', 840),
    ]);
    expect(series.map(p => p.date)).toEqual(['2026-10-25', '2026-10-26', '2026-10-28']);
    expect(series[2].informal).toBe(999);
  });

  it('huecos reales: los días sin cotización verificable NO existen en la serie (jamás se interpolan)', () => {
    const series = buildUnifiedHistorySeries([
      elToque('2026-01-01', 440),
      elToque('2026-01-02', 441),
      // 8 días sin datos…
      elToque('2026-01-10', 442),
    ]);
    expect(series).toHaveLength(3);
    expect(series.some(p => p.informal == null)).toBe(false);
  });

  it('filtra por moneda y segmento BCC; las informales siempre entran como segmento informal', () => {
    const series = buildUnifiedHistorySeries(
      [
        bcc('2026-10-25', 380, '3'),
        bcc('2026-10-25', 120, '1'), // otro segmento oficial: fuera
        elToque('2026-10-25', 830),
        { ...elToque('2026-10-25', 999), currency: 'EUR' }, // otra moneda: fuera
      ],
      { segment: '3', currency: 'USD' },
    );
    expect(series).toHaveLength(1);
    expect(series[0].oficial).toBe(380);
    expect(series[0].informal).toBe(830);
  });

  it('entrada desordenada → serie ordenada cronológicamente ascendente', () => {
    const series = buildUnifiedHistorySeries([
      diviza('2026-10-26', 845),
      elToque('2026-01-01', 440),
      bcc('2026-05-05', 370),
    ]);
    expect(series.map(p => p.date)).toEqual(['2026-01-01', '2026-05-05', '2026-10-26']);
  });

  it('una fila virtual solo gana el día si NO hay observaciones verificadas ese día', () => {
    const base = diviza('2026-10-24', 840);
    const series = buildUnifiedHistorySeries([
      base,
      virtual(base, '2026-10-25'), // hoy sin captura → arrastre de la ACTIVA
    ]);
    const hoy = series.find(p => p.date === '2026-10-25')!;
    expect(hoy.informal).toBe(840);
    expect(hoy.informalCaptureMethod).toBe('carry_forward');
    expect(hoy.informalOriginalRateDate).toBe('2026-10-24');
  });
});

describe('summarizeInformalProvenance — trazabilidad de la serie unificada', () => {
  it('resume por fuente: conteo, rango y estado activo/archivo (criterio 7: sin falsa atribución a Diviza)', () => {
    const series: UnifiedHistoryPoint[] = [
      { date: '2026-01-01', oficial: null, informal: 440, informalSource: 'elToque', informalCaptureMethod: 'real', informalOriginalRateDate: null },
      { date: '2026-01-02', oficial: 360, informal: 441, informalSource: 'elToque', informalCaptureMethod: 'real', informalOriginalRateDate: null },
      { date: '2026-10-25', oficial: 380, informal: 840, informalSource: 'Diviza', informalCaptureMethod: 'real', informalOriginalRateDate: null },
      { date: '2026-10-26', oficial: 380, informal: null, informalSource: null, informalCaptureMethod: null },
    ];
    const summary = summarizeInformalProvenance(series);
    expect(summary.totalInformalDays).toBe(3);
    expect(summary.daysWithInformal).toBe(3);
    expect(summary.firstDate).toBe('2026-01-01');
    expect(summary.lastDate).toBe('2026-10-25');
    const elToqueEntry = summary.entries.find(e => e.source === 'elToque')!;
    expect(elToqueEntry.count).toBe(2);
    expect(elToqueEntry.active).toBe(false); // archivo, no activa
    expect(elToqueEntry.firstDate).toBe('2026-01-01');
    const divizaEntry = summary.entries.find(e => e.source === 'Diviza')!;
    expect(divizaEntry.count).toBe(1);
    expect(divizaEntry.active).toBe(true);
  });

  it('serie vacía → resumen vacío sin inventar rango', () => {
    const summary = summarizeInformalProvenance([]);
    expect(summary.entries).toHaveLength(0);
    expect(summary.totalInformalDays).toBe(0);
    expect(summary.firstDate).toBeNull();
    expect(summary.lastDate).toBeNull();
  });
});

describe('pickUnifiedInformalRow — regla determinista y total', () => {
  it('vacío → undefined (nunca lanza ni inventa)', () => {
    expect(pickUnifiedInformalRow([])).toBeUndefined();
  });

  it('determinista: mismas entradas en distinto orden → misma selección', () => {
    const rows = [
      elToque('2026-10-25', 830, 'T20:00:00Z'),
      diviza('2026-10-25', 840, 'T10:00:00Z'),
      { ...diviza('2026-10-25', 835, 'T12:00:00Z'), capture_method: 'estimated' as const },
    ];
    const a = pickUnifiedInformalRow(rows);
    const b = pickUnifiedInformalRow([...rows].reverse());
    expect(a).toBe(b);
    // estimated pierde ante real aunque sea de la fuente activa.
    expect(a?.rate).toBe(840);
  });
});
