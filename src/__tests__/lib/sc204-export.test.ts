import { describe, it, expect } from 'vitest';
import {
  buildSc204ModelData,
  sc204FileName,
  formatSc204Money,
  formatSc204Quantity,
  formatSc204Date,
  lineCurrency,
  type Sc204SourceData,
  type Sc204SourceItem,
} from '@/lib/legal/sc204';

/**
 * MISIÓN RESOLUCIÓN 11 — SC-2-04 «INFORME DE RECEPCIÓN» (2026-10-29)
 *
 * Pruebas de la lógica pura del modelo SC-2-04 conforme a la Resolución
 * No. 11/2007 del MFP (Gaceta Oficial No. 015/2007, Anexo Único):
 *  - Los 13 datos de uso obligatorio quedan representados en el modelo.
 *  - Los datos que COSTPRO no gestiona quedan EN BLANCO ('') — nunca
 *    «N/A», ceros ni valores inventados.
 *  - Importe de línea = quantity × unit_cost (fórmula COSTPRO existente),
 *    sin redondeos ni transformaciones de los valores almacenados.
 *  - Moneda de línea = moneda_recepcion (default CUP) — los importes
 *    totales NUNCA mezclan monedas.
 *  - Nombre de archivo con el identificador real de la recepción.
 */

const mkItem = (overrides: Partial<Sc204SourceItem> = {}): Sc204SourceItem => ({
  quantity: 10,
  unit_cost: 25,
  moneda_recepcion: 'CUP',
  products: { name: 'Cerveza Bucanero 350ml', sku: 'BUC-350', unit_of_measure: 'unidades' },
  ...overrides,
});

const mkSource = (overrides: Partial<Sc204SourceData> = {}): Sc204SourceData => ({
  entidadNombre: 'Tienda QA',
  receipt: {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    reference_doc: 'FAC-101',
    supplier: 'Proveedor Central',
    reception_date: '2026-10-20T09:00:00Z',
    store_id: 'store-a',
  },
  items: [mkItem()],
  emissionDate: new Date('2026-10-29T15:30:00Z'),
  ...overrides,
});

describe('SC-2-04 — modelo según Resolución 11/2007 MFP', () => {
  it('cubre los 13 datos de uso obligatorio con la correspondencia COSTPRO correcta', () => {
    const model = buildSc204ModelData(mkSource());

    // 1. Entidad receptora: nombre automático (tienda), código en blanco
    expect(model.entidadNombre).toBe('Tienda QA');
    expect(model.entidadCodigo).toBe('');
    // 2. Almacén receptor: no gestionado → en blanco
    expect(model.almacenNombre).toBe('');
    expect(model.almacenCodigo).toBe('');
    // 3. Fecha de emisión del modelo (dd/mm/aaaa)
    expect(model.fechaEmision).toBe('29/10/2026');
    // 4. Proveedor: nombre automático, código en blanco
    expect(model.proveedorNombre).toBe('Proveedor Central');
    expect(model.proveedorCodigo).toBe('');
    // 5. Documento que ampara: número = referencia; tipo/nombre en blanco
    expect(model.documentoNumero).toBe('FAC-101');
    expect(model.documentoNombre).toBe('');
    // 6. Transportador: no gestionado → en blanco
    expect(model.transportadorNombre).toBe('');
    expect(model.transportadorCarne).toBe('');
    expect(model.transportadorChapa).toBe('');
    expect(model.transportadorCasilla).toBe('');
    expect(model.transportadorGuiaAerea).toBe('');
    // 7. Productos: código/descripción/UM/cantidad/precio/importe automáticos
    expect(model.lineas).toHaveLength(1);
    expect(model.lineas[0].codigo).toBe('BUC-350');
    expect(model.lineas[0].descripcion).toBe('Cerveza Bucanero 350ml');
    expect(model.lineas[0].unidadMedida).toBe('unidades');
    expect(model.lineas[0].cantidad).toBe('10');
    expect(model.lineas[0].precioUnitario).toBe('25.00 CUP');
    expect(model.lineas[0].importe).toBe('250.00 CUP');
    // Saldo en existencia según almacén: COSTPRO no lo registra → en blanco
    expect(model.lineas[0].saldoExistencia).toBe('');
    // 8. Importe Total del modelo
    expect(model.importesTotales).toHaveLength(1);
    expect(model.importesTotales[0].label).toBe('Importe Total del modelo (CUP):');
    expect(model.importesTotales[0].importe).toBe('250.00 CUP');
    // 9–12: firmas — espacios en blanco (se dibujan en el PDF, sin datos)
    // 13. Número consecutivo: no gestionado → en blanco
    expect(model.numeroConsecutivo).toBe('');
  });

  it('no inventa valores cuando faltan datos opcionales (todo en blanco, sin N/A ni ceros)', () => {
    const model = buildSc204ModelData(
      mkSource({
        entidadNombre: '',
        receipt: {
          id: 'aaaaaaaa-2222-4222-8222-222222222222',
          reference_doc: null,
          supplier: null,
          reception_date: null,
        },
        items: [mkItem({ products: { name: 'Producto sin SKU', sku: null, unit_of_measure: null } })],
      }),
    );

    expect(model.entidadNombre).toBe('');
    expect(model.proveedorNombre).toBe('');
    expect(model.documentoNumero).toBe('');
    expect(model.fechaRecepcion).toBe('');
    expect(model.lineas[0].codigo).toBe('');
    expect(model.lineas[0].unidadMedida).toBe('');
    // La descripción sí existe — se consigna tal cual
    expect(model.lineas[0].descripcion).toBe('Producto sin SKU');
    // Ningún campo con datos inventados
    const allValues = JSON.stringify(model);
    expect(allValues).not.toContain('N/A');
    expect(allValues).not.toContain('n/a');
  });

  it('importe de línea = quantity × unit_cost sin redondeos ni pérdida de decimales', () => {
    const model = buildSc204ModelData(
      mkSource({
        items: [mkItem({ quantity: 2.5, unit_cost: 3.335 })],
      }),
    );
    // 2.5 × 3.335 = 8.3375 — el valor se conserva exacto
    expect(model.lineas[0].cantidad).toBe('2.5');
    expect(model.lineas[0].importe).toBe('8.3375 CUP');
    expect(model.importesTotales[0].importe).toBe('8.3375 CUP');
  });

  it('no mezcla monedas: totales agrupados por moneda de línea', () => {
    const model = buildSc204ModelData(
      mkSource({
        items: [
          mkItem({ quantity: 10, unit_cost: 25, moneda_recepcion: 'CUP' }),
          mkItem({ quantity: 5, unit_cost: 2, moneda_recepcion: 'USD' }),
          mkItem({ quantity: 1, unit_cost: 900, moneda_recepcion: null }), // default CUP
        ],
      }),
    );

    expect(lineCurrency({ quantity: 1, unit_cost: 1 })).toBe('CUP');
    expect(lineCurrency({ quantity: 1, unit_cost: 1, moneda_recepcion: null })).toBe('CUP');

    expect(model.importesTotales).toHaveLength(2);
    const cup = model.importesTotales.find(t => t.label.includes('CUP'));
    const usd = model.importesTotales.find(t => t.label.includes('USD'));
    expect(cup?.importe).toBe('1,150.00 CUP'); // 250 + 900
    expect(usd?.importe).toBe('10.00 USD');
  });

  it('aplica la moneda por convención del sistema (CUP) cuando la línea no la trae', () => {
    const model = buildSc204ModelData(
      mkSource({ items: [mkItem({ moneda_recepcion: undefined })] }),
    );
    expect(model.lineas[0].precioUnitario).toBe('25.00 CUP');
    expect(model.importesTotales[0].label).toContain('CUP');
  });

  it('consigna la fecha de la recepción como trazabilidad y la de emisión aparte', () => {
    const model = buildSc204ModelData(mkSource());
    // Dato 3: fecha de emisión (momento de generación del informe)
    expect(model.fechaEmision).toBe('29/10/2026');
    // Fecha real de la recepción (dato gestionado por COSTPRO)
    expect(model.fechaRecepcion).toBe('20/10/2026');
  });

  it('nombre de archivo usa el identificador real de la recepción', () => {
    expect(sc204FileName('aaaaaaaa-1111-4111-8111-111111111111')).toBe(
      'SC-2-04_Informe_Recepcion_aaaaaaaa.pdf',
    );
    expect(sc204FileName('')).toBe('SC-2-04_Informe_Recepcion_documento.pdf');
  });

  it('formateadores: es-CU (misma convención que formatCurrency de la app) sin redondeos', () => {
    expect(formatSc204Money(0)).toBe('0.00');
    expect(formatSc204Money(1234.5)).toBe('1,234.50');
    expect(formatSc204Money(8.3375)).toBe('8.3375');
    expect(formatSc204Quantity(10)).toBe('10');
    expect(formatSc204Quantity(0.125)).toBe('0.125');
    expect(formatSc204Money(NaN)).toBe('');
    expect(formatSc204Quantity(NaN)).toBe('');
    expect(formatSc204Date(null)).toBe('');
    expect(formatSc204Date('fecha-invalida')).toBe('');
    expect(formatSc204Date(new Date('2026-02-03T00:00:00Z'))).toBe('03/02/2026');
  });

  it('múltiples líneas de un documento multi-producto se desglosan una a una', () => {
    const model = buildSc204ModelData(
      mkSource({
        items: [
          mkItem({ quantity: 10, unit_cost: 25, products: { name: 'A', sku: 'A-1', unit_of_measure: 'u' } }),
          mkItem({ quantity: 4, unit_cost: 120, products: { name: 'B', sku: 'B-1', unit_of_measure: 'paquetes' } }),
          mkItem({ quantity: 1, unit_cost: 900, products: { name: 'C', sku: 'C-1', unit_of_measure: 'cajas' } }),
        ],
      }),
    );
    expect(model.lineas).toHaveLength(3);
    expect(model.lineas.map(l => l.codigo)).toEqual(['A-1', 'B-1', 'C-1']);
    expect(model.importesTotales[0].importe).toBe('1,630.00 CUP'); // 250 + 480 + 900
  });
});
