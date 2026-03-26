import { describe, it, expect } from 'vitest';
import { generateMVTContent } from '../engine';
import {
  STANDARD_MVT_TEMPLATE,
  CYP_COMEDOR_TEMPLATE,
  CYP_DEPOSITO_TEMPLATE,
  MVT_INVENTARIO_TEMPLATE,
  MVT_RECEPCION_TEMPLATE,
  MVT_RECEPCION_ALT_TEMPLATE
} from '../defaults';

describe('MVT/CYP Generation Engine', () => {
  const context = {
    global: {
      numero: 45,
      fecha: '11/03/2026',
      almacen: '0109',
      centro: '0110200012611',
      concepto: '210',
      cuenta_mn: '7000050',
      importe: 3336,
      entregado_a: 'GRACIELA ACOSTA ROJAS',
      deposito: '10140'
    },
    products: [
      { cod: 'P1', descripcion: 'Prod 1', um: 'U', cuenta_contable: '100', existencia: 10 }
    ],
    movements: [
      {
        product: { cod: 'P1', um: 'U', existencia: 10 },
        cantidad: 2,
        costo_unitario_cents: 500, // 5.00
        importe_cents: 1000
      }
    ]
  };

  it('should generate CYP Comedor content correctly', () => {
    const content = generateMVTContent(CYP_COMEDOR_TEMPLATE, context);

    expect(content).not.toContain('Header=');
    expect(content).toContain('Tipo={7C18E812-CFD1-4358-8011-BDDF2783510D}');
    expect(content).toContain('Numero=45');
    expect(content).toContain('Importe=3336');
    expect(content).toContain('EntregadoA=GRACIELA ACOSTA ROJAS');
    expect(content).toContain('[Contrapartidas]');
    expect(content).toContain('9500010|CUP|3336');
  });

  it('should generate CYP Deposito content correctly', () => {
    const content = generateMVTContent(CYP_DEPOSITO_TEMPLATE, context);

    expect(content).toContain('Tipo={69A469FB-6AB8-4C90-A126-1BCF1E785889}');
    expect(content).toContain('Descripcion=DEPÓSITO DE EFECTIVO');
    expect(content).toContain('41');
    expect(content).toContain('42');
    expect(content).toContain('43');
    expect(content).toContain('44');
  });

  it('should generate MVT Inventario content correctly', () => {
    const content = generateMVTContent(MVT_INVENTARIO_TEMPLATE, context);

    expect(content).toContain('[Documento]');
    expect(content).toContain('Concepto=2105');
    expect(content).toContain('[Ubicacion]');
    expect(content).toContain('P1|Prod 1|U|100');
    expect(content).toContain('[Movimientos]');
    expect(content).toContain('P1|U|2|5|10|0|0|10|11110|');
  });

  it('should generate MVT Recepcion (2100) content correctly', () => {
    const content = generateMVTContent(MVT_RECEPCION_TEMPLATE, context);

    expect(content).toContain('Concepto=2100');
    expect(content).toContain('Entidad=002060686|SOCIEDAD MERCANTIL FERRETERIA UNIVERSALES S.A|60686');
  });

  it('should generate MVT Recepcion Alt (202) content correctly', () => {
    const content = generateMVTContent(MVT_RECEPCION_ALT_TEMPLATE, context);

    expect(content).toContain('Concepto=202');
    expect(content).toContain('Factura=0-110');
    expect(content).toContain('Moneda=PESO CUBANO');
  });
});
