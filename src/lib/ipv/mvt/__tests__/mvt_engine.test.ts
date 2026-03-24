import { describe, it, expect } from 'vitest';
import { generateMVTContent } from '../engine';
import { STANDARD_MVT_TEMPLATE } from '../defaults';

describe('MVT Generation Engine', () => {
  it('should generate MVT content correctly with default template', () => {
    const context = {
      global: {
        numero: 1,
        fecha: '01/02/2026',
        almacen: '0109',
        centro: '0110200012611',
        concepto: '210',
        cuenta_mn: '7000050'
      },
      products: [
        { cod: 'P1', descripcion: 'Prod 1', um: 'U', cuenta_contable: '100', existencia: 10 }
      ],
      movements: [
        {
          product: { cod: 'P1', um: 'U', costo_unitario: 5, existencia: 10 },
          cantidad: 2
        }
      ]
    };

    const content = generateMVTContent(STANDARD_MVT_TEMPLATE, context);

    expect(content).toContain('[Documento]');
    expect(content).toContain('Concepto=210');
    expect(content).toContain('Numero=1');
    expect(content).toContain('NumCtrl=010(1)');

    expect(content).toContain('[Ubicacion]');
    expect(content).toContain('P1|Prod 1|U|100|10');

    expect(content).toContain('[Movimientos]');
    expect(content).toContain('P1|U|2|5|10|0|0|10'); // Importe = 2 * 5 = 10
  });
});
