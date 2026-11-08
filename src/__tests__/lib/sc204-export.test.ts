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
  entidadCodigo: '3',
  receipt: {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    reference_doc: 'FAC-101',
    document_number: 'ENT-000014-2026',
    supplier: 'Proveedor Central',
    supplier_tax_id: 'J-31015873-2',
    reception_date: '2026-10-20T09:00:00Z',
    status: 'active',
    store_id: 'store-a',
  },
  items: [mkItem()],
  emissionDate: new Date('2026-10-29T15:30:00Z'),
  ...overrides,
});

describe('SC-2-04 — modelo según Resolución 11/2007 MFP', () => {
  it('cubre los 13 datos de uso obligatorio con la correspondencia COSTPRO correcta', () => {
    const model = buildSc204ModelData(mkSource());

    // 1. Entidad receptora: nombre + código consecutivo persistente de la tienda
    expect(model.entidadNombre).toBe('Tienda QA');
    expect(model.entidadCodigo).toBe('3');
    // 2. Almacén receptor: identificación de la entidad receptora (regla del modelo)
    expect(model.almacenNombre).toBe('Tienda QA');
    expect(model.almacenCodigo).toBe('3');
    // 3. Fecha de emisión del modelo (dd/mm/aaaa)
    expect(model.fechaEmision).toBe('29/10/2026');
    // 4. Proveedor: nombre real + código = NIT/CI (snapshot congelado)
    expect(model.proveedorNombre).toBe('Proveedor Central');
    expect(model.proveedorCodigo).toBe('J-31015873-2');
    // 5. Documento que ampara: tipo «Entrada» + número real de la entrada.
    //    reference_doc (factura externa) NO es el número del documento que ampara.
    expect(model.documentoNombre).toBe('Entrada');
    expect(model.documentoNumero).toBe('ENT-000014-2026');
    expect(model.documentoNumero).not.toBe('FAC-101');
    // 6. Transportador: COSTPRO no lo gestiona → vacíos (bloque de firma)
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
    // Saldo en existencia según almacén: sin datos de ledger en la fuente →
    // «s/d» (jamás una cifra inventada; con saldosPorProducto muestra el saldo).
    expect(model.lineas[0].saldoExistencia).toBe('s/d');
    // 8. Importe Total del modelo
    expect(model.importesTotales).toHaveLength(1);
    expect(model.importesTotales[0].label).toBe('IMPORTE TOTAL DEL MODELO (CUP):');
    expect(model.importesTotales[0].importe).toBe('250.00 CUP');
    // 9–12: firmas — espacios en blanco (se dibujan en el PDF, sin datos)
    // 13. Número consecutivo: no gestionado → en blanco
    expect(model.numeroConsecutivo).toBe('');
  });

  it('CP-DOC-SC-DATA-MAPPING-006 · caso de prueba de identificación documental', () => {
    // Caso de la misión §12: cada valor aparece en su campo correcto y el
    // nombre del proveedor JAMÁS se presenta como número documental.
    const model = buildSc204ModelData(
      mkSource({
        entidadNombre: 'PUERTO PADRE',
        entidadCodigo: '1',
        // El defecto observado en producción: el nombre del proveedor capturado
        // como reference_doc. Debe quedarse FUERA del número documental.
        receipt: {
          id: 'bbbbbbbb-3333-4333-8333-333333333333',
          reference_doc: 'Almacen Lari',
          document_number: 'ENT-000001-2026',
          supplier: 'Almacen Lari',
          supplier_tax_id: '02110651121',
          reception_date: '2026-11-05T09:00:00Z',
          status: 'active',
          store_id: 'store-a',
        },
        transportador: {
          nombre: 'Juan Pérez',
          carne: '91020511234',
          chapa: 'P-123456',
          casilla: '45',
          guiaAerea: 'GA-778812',
        },
      }),
    );
    expect(model.entidadNombre).toBe('PUERTO PADRE');
    expect(model.entidadCodigo).toBe('1');
    expect(model.almacenNombre).toBe('PUERTO PADRE');
    expect(model.almacenCodigo).toBe('1');
    expect(model.proveedorNombre).toBe('Almacen Lari');
    expect(model.proveedorCodigo).toBe('02110651121');
    expect(model.documentoNombre).toBe('Entrada');
    expect(model.documentoNumero).toBe('ENT-000001-2026');
    expect(model.documentoNumero).not.toContain('Almacen Lari');
    expect(model.transportadorNombre).toBe('Juan Pérez');
    expect(model.transportadorCarne).toBe('91020511234');
    expect(model.transportadorChapa).toBe('P-123456');
    expect(model.transportadorCasilla).toBe('45');
    expect(model.transportadorGuiaAerea).toBe('GA-778812');
  });

  it('CP-DOC-SC-DATA-MAPPING-006 · sin NIT/CI y sin número de entrada → líneas en blanco', () => {
    // Recepción histórica (sin document_number) y proveedor sin tax_id: los
    // campos del SC conservan su línea de cumplimentación, sin inventos.
    const model = buildSc204ModelData(
      mkSource({
        receipt: {
          id: 'cccccccc-4444-4444-8444-444444444444',
          reference_doc: 'Almacen Lari',
          document_number: null,
          supplier: 'Almacen Lari',
          supplier_tax_id: null,
          reception_date: '2026-01-10T09:00:00Z',
          status: 'active',
          store_id: 'store-a',
        },
      }),
    );
    expect(model.proveedorCodigo).toBe('');
    expect(model.documentoNumero).toBe('');
    expect(model.documentoNombre).toBe('Entrada');
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
          status: 'active',
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
