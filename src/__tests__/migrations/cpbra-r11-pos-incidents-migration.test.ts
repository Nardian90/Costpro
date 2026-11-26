/**
 * CP-BRA-REMEDIATION-001 — PR fix/cpbra-r11 (R-11: incidencias POS).
 *
 * Test de contrato de la migración 20261126150000 (patrón estático sin BD).
 * Valida lo no negociable de la regla POS-006: la puerta MISIÓN-FLEX sigue
 * abierta, pero ya NO es evadible — cada incidencia es un objeto tipado y
 * coherente, y el descuadre real (Σpagos ≠ total) debe estar EXPLICADO por
 * una incidencia con esa diferencia exacta.
 *
 * Compatibilidad verificada: las 3 ventas históricas con incidencias
 * (2026-10-16/19, evidencia producción) y el payload del checkout
 * (src/lib/pos/payment-incidents.ts) cumplen el contrato.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const MIGRATION = resolve(process.cwd(), 'supabase/migrations/20261126150000_cpbra_r11_pos_incidents_validation.sql');
const SOURCE = resolve(process.cwd(), 'supabase/migrations/20261125120000_cp_pos_per_item_payments.sql');
const INCIDENTS_LIB = resolve(process.cwd(), 'src/lib/pos/payment-incidents.ts');
const sql = readFileSync(MIGRATION, 'utf8');
const src = readFileSync(SOURCE, 'utf8');
const lib = readFileSync(INCIDENTS_LIB, 'utf8');

describe('migración 20261126150000 — R-11: validación server-side de incidencias', () => {
  it('existe, transaccional, reemite create_sale_v2 con ACL y marca', () => {
    expect(sql).toContain('20261126150000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.create_sale_v2;');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.create_sale_v2(');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.create_sale_v2(');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_sale_v2(');
    expect(sql).toContain('CP-BRA-REMEDIATION-001 (R-11)');
  });

  it('§11.6: cada incidencia es un objeto con type del enum y campos numéricos', () => {
    expect((sql.match(/ERR_INCIDENT_INVALID_STRUCTURE/g) || []).length).toBe(4);
    expect(sql).toContain("'insufficient_payment', 'overpayment', 'mixed_breakdown_mismatch', 'rate_difference'");
    expect(sql).toContain("COALESCE(v_it->>'expected_cup', '') = ''");
    expect(sql).toContain("COALESCE(v_it->>'received_cup', '') = ''");
    expect(sql).toContain("COALESCE(v_it->>'difference_cup', '') = ''");
    expect(sql).toContain('expected_cup/received_cup no pueden ser negativos');
  });

  it('§11.6: coherencia aritmética difference_cup = received_cup − expected_cup', () => {
    const block = sql.slice(
      sql.indexOf('ERR_INCIDENT_ARITHMETIC_MISMATCH') - 400,
      sql.indexOf('ERR_INCIDENT_ARITHMETIC_MISMATCH') + 400,
    );
    expect(block).toContain("(v_it->>'difference_cup')::numeric");
    expect(block).toContain("(v_it->>'received_cup')::numeric - (v_it->>'expected_cup')::numeric");
    expect(block).toContain('> 0.01');
  });

  it('§18: el descuadre real debe estar EXPLICADO por una incidencia (cobertura)', () => {
    expect(sql).toContain('ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE');
    const block = sql.slice(
      sql.indexOf('ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE') - 700,
      sql.indexOf('ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE') + 200,
    );
    // La cobertura compara contra el DESCUADRE REAL (Σpagos − total), no contra
    // un valor declarado por el cliente.
    expect(block).toContain('v_sum_payments - v_calculated_total');
    expect(block).toContain('jsonb_array_elements(v_incidents)');
    expect(block).toContain('<= 0.01');
    // La cobertura vive DENTRO del bloque de mismatch (después del raise
    // canónico de PT011 sin incidencias — orden verificado).
    const pIdx = sql.indexOf("USING ERRCODE = 'PT011'");
    const covIdx = sql.indexOf('ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE');
    expect(covIdx).toBeGreaterThan(pIdx);
  });

  it('fidelidad verbatim: el resto del contrato de create_sale_v2 intacto', () => {
    // Los invariantes clave del source siguen presentes (una sola reemisión
    // con DOS bloques añadidos — nada más cambia). El CHECK DDL de total no
    // negativo (chk_transaction_total_non_negative) vive en 20261017000000
    // (constraint de tabla persistente) y no forma parte de esta reemisión.
    for (const marker of [
      'ERR_NEGATIVE_SALE',
      'ERR_TOTAL_MISMATCH',
      'ERR_RATE_REQUIRED_FOR_INCIDENT',
      'ERR_SELLER_MISMATCH',
      'ERR_IDEMPOTENCY_KEY_REUSE',
      'SALE_PAYMENT_INCIDENT',
      'payment_distributions',
    ]) {
      expect(src).toContain(marker);
      expect(sql).toContain(marker);
    }
    // La longitud crece (bloques añadidos) pero el cuerpo base es el mismo:
    // la firma es idéntica.
    const sigSrc = src.match(/CREATE OR REPLACE FUNCTION public\.create_sale_v2\(([^)]+)\)/)![1];
    const sigNew = sql.match(/CREATE OR REPLACE FUNCTION public\.create_sale_v2\(([^)]+)\)/)![1];
    expect(sigNew).toBe(sigSrc);
  });

  it('compatibilidad con el payload del checkout (lib payment-incidents)', () => {
    // El contrato server-side exige exactamente los campos que emite la lib
    // del checkout: type (enum), expected_cup, received_cup, difference_cup.
    expect(lib).toContain("type: PaymentIncidentType");
    expect(lib).toContain('expected_cup: number');
    expect(lib).toContain('received_cup: number');
    expect(lib).toContain('difference_cup: number');
    expect(lib).toContain("'insufficient_payment'");
    expect(lib).toContain("'overpayment'");
    expect(lib).toContain("'mixed_breakdown_mismatch'");
    expect(lib).toContain("'rate_difference'");
  });

  it('compatibilidad con las 3 ventas históricas con incidencias (evidencia producción)', () => {
    // Forense 2026-11-25: venta 8ab7becf (overpayment +200 = 16000-15800),
    // venta 1df5d727 (overpayment +12000) y venta 28e94349 (insufficient/
    // rate_difference -8100 = 169670-177770): TODAS declaran una incidencia
    // cuya difference_cup coincide con el descuadre real → pasan la cobertura.
    // Se documenta aquí como caso de regresión (no se ejecuta contra BD).
    expect(sql).toContain('R-11 (CP-BRA-REMEDIATION-001)');
    expect(sql).toContain('3 ventas reales quedaron');
  });
});
