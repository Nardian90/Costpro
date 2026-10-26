/**
 * retire-eltoque-migration.test.ts — Contrato de la migración
 * 20261027020000_retire_eltoque_active_source.sql (misión IC-DIVIZA-003).
 *
 * Verifica SOBRE EL ARCHIVO (sin BD, contrato estático):
 *  1. Las 4 funciones vivas (create_sale_v2, create_cash_flow_document,
 *     get_cash_balances_by_currency, open_cash_shift) estrechan el paso
 *     informal a source = 'Diviza' (6 ocurrencias ejecutables) con la
 *     prioridad por frescura intacta (ORDER BY rate_date DESC,
 *     captured_at DESC LIMIT 1).
 *  2. CERO referencias EJECUTABLES a elToque: la exclusión es EXPRESA y
 *     total — las menciones del archivo viven SOLO en comentarios del
 *     encabezado que documentan el cambio.
 *  3. La jerarquía contable queda INTACTA: store → BCC seg3 → Diviza
 *     informal → fail-closed; el staleness de 45 días se conserva
 *     (defensa en profundidad: Diviza sin tasa fresca → error, nunca un
 *     regreso silencioso al archivo).
 *  4. NINGÚN cambio de datos: sin UPDATE/INSERT/DELETE de exchange_rates
 *     (las 498 filas del archivo elToque se conservan íntegras).
 *  5. El CHECK exchange_rates_source_check NO se toca: elToque sigue
 *     siendo un valor VÁLIDO de archivo (lectura source=elToque e
 *     importación Excel bulk-upload).
 *  6. La etiqueta rate_source sigue dinámica ('global_' || lower(er.source)).
 *  7. Los cuerpos provienen de las definiciones VIVAS (pg_get_functiondef):
 *     sin ediciones de lógica contable (totales/impuestos).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SQL = readFileSync(
  join(__dirname, '../../../supabase/migrations/20261027020000_retire_eltoque_active_source.sql'),
  'utf8',
);

/** SQL sin líneas de comentario (-- ...): solo lo EJECUTABLE. */
const EXEC = SQL.split('\n').filter(l => !l.trimStart().startsWith('--')).join('\n');

describe('migración 20261027020000_retire_eltoque_active_source.sql', () => {
  it('redefine las 4 funciones vivas con CREATE OR REPLACE', () => {
    for (const fn of [
      'create_sale_v2',
      'create_cash_flow_document',
      'get_cash_balances_by_currency',
      'open_cash_shift',
    ]) {
      expect(EXEC).toMatch(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\(`));
    }
  });

  it('el paso informal de las 4 funciones es EXCLUSIVAMENTE Diviza (6 ejecutables)', () => {
    // 3 en create_sale_v2 + 1 en cada una de las otras 3 funciones
    const divizaOnly = EXEC.match(/er\.source = 'Diviza'/g) ?? [];
    expect(divizaOnly.length).toBe(6);
    // La prioridad por frescura queda intacta en cada paso estrechado
    const steps = EXEC.match(
      /er\.source = 'Diviza'[\s\S]{0,200}?ORDER BY er\.rate_date DESC, er\.captured_at DESC LIMIT 1/g,
    ) ?? [];
    expect(steps.length).toBeGreaterThanOrEqual(6);
  });

  it('CERO elToque ejecutable: la exclusión es EXPRESA y total (solo comentarios)', () => {
    // Ninguna línea ejecutable menciona elToque: ni IN (...), ni =, ni
    // etiqueta, ni mensajes de error. Una fila futura o re-capturada de
    // elToque jamás volverá a ganar el paso informal.
    expect(EXEC).not.toMatch(/elToque/i);
    // La forma antigua ampliada (IN ambos) queda retirada por completo
    expect(EXEC).not.toMatch(/er\.source IN \('elToque', 'Diviza'\)/);
    // Las menciones del archivo viven SOLO en el encabezado (documentación)
    expect((SQL.match(/elToque/g) ?? []).length).toBeGreaterThan(0);
  });

  it('la jerarquía contable queda intacta: store → BCC seg3 → Diviza → fail-closed', () => {
    // Orden de resolución en cada función: primero la tienda, luego BCC
    // seg 3, luego el informal (ahora SOLO Diviza)
    const storeIdx = EXEC.indexOf('FROM public.store_exchange_rates');
    const bccIdx = EXEC.indexOf("er.source = 'BCC' AND er.segment = '3'");
    const divizaIdx = EXEC.indexOf("er.source = 'Diviza'");
    expect(storeIdx).toBeGreaterThan(-1);
    expect(bccIdx).toBeGreaterThan(-1);
    expect(divizaIdx).toBeGreaterThan(bccIdx);
    // Fail-closed conservado: sin tasa no se completa la operación
    expect(EXEC).toMatch(/ERR_EXCHANGE_RATE_UNAVAILABLE/);
    expect(EXEC).toMatch(/ERR_RATE_STALE/);
    // Staleness de 45 días sin cambio (defensa en profundidad)
    expect(EXEC).toMatch(/INTERVAL '45 days'/);
  });

  it('NO modifica datos existentes (sin UPDATE/INSERT/DELETE sobre exchange_rates)', () => {
    // CERO cambios de datos: las 498 filas del archivo elToque se conservan
    // con su procedencia y fechas originales; ninguna se re-atribuye.
    expect(EXEC).not.toMatch(/UPDATE\s+public\.exchange_rates\s+SET/i);
    expect(EXEC).not.toMatch(/INSERT INTO public\.exchange_rates/i);
    expect(EXEC).not.toMatch(/DELETE FROM public\.exchange_rates/i);
  });

  it('el CHECK de fuente NO se toca (elToque sigue válido como archivo)', () => {
    // La migración no reescribe la restricción exchange_rates_source_check:
    // el archivo sigue siendo consultable (source=elToque) e importable
    // (Excel bulk-upload de la serie histórica).
    expect(EXEC).not.toMatch(/exchange_rates_source_check/);
    expect(EXEC).not.toMatch(/ADD CONSTRAINT/i);
    expect(EXEC).not.toMatch(/DROP CONSTRAINT/i);
  });

  it('la etiqueta rate_source sigue dinámica (refleja el proveedor que ganó)', () => {
    expect(EXEC).toMatch(/'global_' \|\| lower\(er\.source\)/);
    // Sin etiqueta hardcodeada del proveedor informal
    expect(EXEC).not.toMatch(/'global_diviza'/i);
    expect(EXEC).not.toMatch(/'global_eltoque'/i);
  });

  it('preserva los cuerpos vivos: sin ediciones de lógica contable', () => {
    // La migración se generó desde pg_get_functiondef de las funciones
    // VIVAS: los bloques críticos de create_sale_v2 siguen presentes.
    expect(EXEC).toMatch(/v_calculated_total := v_calculated_subtotal - v_discount_amount \+ v_calculated_tax/);
    expect(EXEC).toMatch(/ERR_TOTAL_MISMATCH/);
  });
});
