import { describe, it, expect } from 'vitest';
import { parseTransactionMetadata } from '../metadata-parser';

describe('metadata-parser', () => {
  it('should parse a complete transaction string correctly', () => {
    const input = "NIT:50004478172;PD:1/12/2025;PH:31/12/2025;TP:0;RF: Impuestos Seguridad Especial (0820232);II:000030000.00;Principal:000001500.00;Recargo:000000000000;TI:00005;IO:000001500.00;PF:0820232 Cont.SS trabajadores PJ y PN;SUC:6461 Ejecutado por: ADRIAN YANDY POMPA SANTANA Autorizado por: JESÚS ALEJANDRO MORALES AGRAMONTE";

    const result = parseTransactionMetadata(input);

    expect(result.nit).toBe('50004478172');
    expect(result.pd).toBe('1/12/2025');
    expect(result.rf).toBe('Impuestos Seguridad Especial (0820232)');
    expect(result.principal).toBe(1500);
    expect(result.valor).toBe(1500);
    expect(result.suc).toBe('6461');
    expect(result.ejecutado_por).toBe('ADRIAN YANDY POMPA SANTANA');
    expect(result.autorizado_por).toBe('JESÚS ALEJANDRO MORALES AGRAMONTE');
  });

  it('should fallback to IO if Principal is 0', () => {
    const input = "Principal:0;IO:123.45";
    const result = parseTransactionMetadata(input);
    expect(result.valor).toBe(123.45);
  });

  it('should handle malformed parts without colon', () => {
    const input = "NIT:123;MalformedPart;PD:2025";
    const result = parseTransactionMetadata(input);
    expect(result.nit).toBe('123');
    expect(result.pd).toBe('2025');
    expect(result.inconsistencies).toContain('Part without colon: "MalformedPart"');
  });

  it('should detect missing fields when NIT is present', () => {
    const input = "NIT:123";
    const result = parseTransactionMetadata(input);
    expect(result.inconsistencies).toContain("Missing PD (Fecha)");
    expect(result.inconsistencies).toContain("Missing RF (Impuesto)");
  });
});
