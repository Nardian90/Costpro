import { describe, it, expect } from 'vitest';
import {
  buildSc208ModelData,
  sc208FileName,
  renderSc208Pdf,
  type Sc208SourceData,
} from '@/lib/legal/sc208';
import {
  buildSc213ModelData,
  sc213FileName,
  renderSc213Pdf,
  type Sc213SourceData,
} from '@/lib/legal/sc213';
import {
  buildSc201ModelData,
  sc201FileName,
  renderSc201Pdf,
  type Sc201SourceData,
} from '@/lib/legal/sc201';
import {
  buildSc209ModelData,
  sc209FileName,
  renderSc209Pdf,
  type Sc209SourceData,
} from '@/lib/legal/sc209';
import {
  buildSc212ModelData,
  sc212FileName,
  renderSc212Pdf,
  type Sc212SourceData,
} from '@/lib/legal/sc212';
import {
  buildSc216ModelData,
  sc216FileName,
  renderSc216Pdf,
  SC216_CONCEPTOS,
  type Sc216SourceData,
} from '@/lib/legal/sc216';
import { renderSc204Pdf } from '@/lib/legal/sc204';
import {
  formatRes11Money,
  formatRes11Quantity,
  res11FileName,
  estadoDocumentoLabel,
  RES11_BLANK_LINE,
} from '@/lib/legal/res11-shared';

/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIONES PDF DE DOCUMENTOS OFICIALES (2026-10-30)
 * ==============================================================================
 * Pruebas de los 6 nuevos modelos SC-2-xx de la Resolución No. 11/2007 del MFP
 * + verificación de IMPRESIÓN ECONÓMICA a nivel de bytes (FASE 5/6):
 *  - Los datos de uso obligatorio quedan representados en cada modelo.
 *  - Los datos que COSTPRO no gestiona quedan EN BLANCO ('') — nunca «N/A»,
 *    ceros ni valores inventados.
 *  - Los valores almacenados se respetan (sin recálculos ni redondeos
 *    distintos de la fuente; solo se elimina el ruido de representación
 *    binaria del float64).
 *  - El PDF no contiene NINGÚN rectángulo relleno con color oscuro (fondo
 *    blanco, texto negro, líneas finas) — criterio de ahorro de tinta.
 */

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

/** Detecta rectángulos rellenos con color oscuro (< 0.5) en el stream PDF. */
function countDarkFilledRects(pdfText: string): number {
  let lastColor: { value: number; kind: string } | null = null;
  let dark = 0;
  const opRe = /([\d.]+) (g|rg)\b|([\d.-]+ [\d.-]+ [\d.-]+ [\d.-]+) re\s*([a-zA-Z*]+)/g;
  for (const m of pdfText.matchAll(opRe)) {
    if (m[1] !== undefined) {
      lastColor = { value: parseFloat(m[1]), kind: m[2] };
    } else if (lastColor && /f|B/.test(m[4])) {
      if (lastColor.value < 0.5) dark += 1;
    }
  }
  return dark;
}

// ────────────────────────────────────────────────────────────────────────────
// Utilidades compartidas
// ────────────────────────────────────────────────────────────────────────────

describe('res11-shared — formateo y nombres de archivo', () => {
  it('elimina el ruido de representación binaria sin alterar el valor', () => {
    // 8.5 × 120.4 = 1023.4000000000001 en float64 → se imprime 1.023,40
    expect(formatRes11Money(8.5 * 120.4)).toBe('1,023.40');
    expect(formatRes11Quantity(0.1 + 0.2)).toBe('0.3');
    // Los valores reales se conservan íntegros (escala ≤ 6 decimales)
    expect(formatRes11Money(1234.567)).toBe('1,234.567');
    expect(formatRes11Quantity(2.5)).toBe('2.5');
    expect(formatRes11Money(NaN)).toBe('');
  });

  it('genera nombres de archivo seguros SC-2-XX_<Documento>_<id>', () => {
    expect(res11FileName('SC-2-08', 'Vale_de_Salida', 'VS-000123-2026')).toBe(
      'SC-2-08_Vale_de_Salida_VS-000123-2026.pdf',
    );
    // Tildes y caracteres especiales se transliteran
    expect(res11FileName('SC-2-12', 'Factura', 'FV-2026/A#1')).toBe('SC-2-12_Factura_FV-2026_A_1.pdf');
  });

  it('etiqueta los estados documentales sin inventar valores', () => {
    expect(estadoDocumentoLabel('reversed')).toBe('Devuelto');
    expect(estadoDocumentoLabel('CONFIRMADA')).toBe('Confirmada');
    expect(estadoDocumentoLabel('sent')).toBe('Enviada');
    expect(estadoDocumentoLabel('desconocido')).toBe('desconocido');
    expect(RES11_BLANK_LINE).toMatch(/^_+$/);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SC-2-08 — Vale de Entrega o Devolución (Vales de Salida)
// ────────────────────────────────────────────────────────────────────────────

const mkVale = (overrides: Partial<Sc208SourceData['vale']> = {}): Sc208SourceData['vale'] => ({
  id: 'bbbbbbbb-2222-4222-8222-222222222222',
  slip_number: 'VS-000123-2026',
  status: 'completed',
  notes: 'Consumo cafetería',
  total_cost: 4210.9,
  created_at: '2026-10-22T10:15:00Z',
  voided_at: null,
  void_reason: null,
  creator: { full_name: 'Marta Rodríguez' },
  items: [
    {
      quantity: 5,
      unit_cost: 320.18,
      total_cost: 1600.9,
      products: { name: 'Azúcar 1 kg', sku: 'AZU-1K', unit_of_measure: 'unidades' },
    },
  ],
  ...overrides,
});

describe('SC-2-08 — modelo según Resolución 11/2007', () => {
  it('cubre los 11 datos de uso obligatorio con la correspondencia COSTPRO', () => {
    const model = buildSc208ModelData({ entidadNombre: 'Tienda QA', vale: mkVale() });
    expect(model.fechaEmision).toBe('22/10/2026');            // 1
    expect(model.entidadNombre).toBe('Tienda QA');            // 2
    expect(model.entidadCodigo).toBe('');                     //    (no gestionado)
    expect(model.almacenNombre).toBe('Tienda QA');            // 3
    expect(model.almacenCodigo).toBe('');
    expect(model.concepto).toBe('Consumo cafetería');         // 4 (notes real)
    expect(model.areaDestino).toBe('');                       //    (no gestionado)
    expect(model.centroCosto).toBe('');
    expect(model.lineas[0].codigo).toBe('AZU-1K');            // 5
    expect(model.lineas[0].cantidad).toBe('5');
    expect(model.lineas[0].importe).toBe('1,600.90');         // total_cost almacenado
    expect(model.lineas[0].saldoExistencia).toBe('');         //    (no gestionado)
    expect(model.importeTotal).toBe('4,210.90');              // 6 (almacenado por el servidor)
    expect(model.entregadoPor).toBe('Marta Rodríguez');       // 7 (nombre; firma en blanco)
    expect(model.numeroConsecutivo).toBe('VS-000123-2026');   // 11
  });

  it('el vale devuelto imprime el bloque de DEVOLUCIÓN con datos reales', () => {
    const model = buildSc208ModelData({
      entidadNombre: 'Tienda QA',
      vale: mkVale({
        status: 'reversed',
        voided_at: '2026-10-24T16:40:00Z',
        void_reason: 'No se consumió el material',
        voider: { full_name: 'Luis Gómez' },
      }),
    });
    expect(model.estado).toBe('Devuelto');
    expect(model.devolucion?.fecha).toBe('24/10/2026');
    expect(model.devolucion?.responsable).toBe('Luis Gómez');
    expect(model.devolucion?.motivo).toBe('No se consumió el material');
  });

  it('el vale completado no inventa datos de devolución', () => {
    const model = buildSc208ModelData({ entidadNombre: 'Tienda QA', vale: mkVale() });
    expect(model.devolucion).toBeNull();
  });

  it('usa el número real del vale en el nombre de archivo', () => {
    expect(sc208FileName({ slip_number: 'VS-000123-2026', id: 'bbbbbbbb' })).toBe(
      'SC-2-08_Vale_de_Salida_VS-000123-2026.pdf',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SC-2-13 — Submayor de Inventario (Kardex)
// ────────────────────────────────────────────────────────────────────────────

describe('SC-2-13 — modelo según Resolución 11/2007', () => {
  const base: Sc213SourceData = {
    producto: {
      id: 'prod-1',
      name: 'Cerveza Bucanero 350 ml',
      sku: 'BUC-350',
      unit_of_measure: 'unidades',
      cost_average: 45.75,
    },
    entidadNombre: 'Tienda QA',
    movimientos: [
      { id: 'm1', created_at: '2026-09-01T12:00:00Z', movement_type: 'purchase', quantity_change: 30, balance_after: 30, reference_doc: 'OC-1' },
      { id: 'm2', created_at: '2026-09-02T12:00:00Z', movement_type: 'sale', quantity_change: -8.5, balance_after: 21.5, reference_doc: 'VTA-1' },
      { id: 'm3', created_at: '2026-09-03T12:00:00Z', movement_type: 'issue_slip_out', quantity_change: -5, balance_after: 16.5, reference_doc: 'VS-1' },
    ],
  };

  it('cubre los 13 datos de uso obligatorio; los importes por movimiento van EN BLANCO', () => {
    const model = buildSc213ModelData(base);
    expect(model.entidadNombre).toBe('Tienda QA');            // 1–2
    expect(model.productoDescripcion).toBe('Cerveza Bucanero 350 ml'); // 3
    expect(model.productoCodigo).toBe('BUC-350');             // 4
    expect(model.unidadMedida).toBe('unidades');              // 5
    expect(model.ubicacionSeccion).toBe('');                  // 6 (no gestionado)
    expect(model.cuentaContable).toBe('');                    // 7
    expect(model.lineas).toHaveLength(3);                     // 8–11
    expect(model.lineas[0].fecha).toBe('01/09/2026');
    expect(model.lineas[0].documento).toBe('OC-1');
    expect(model.lineas[0].entradaUF).toBe('30');
    expect(model.lineas[1].salidaUF).toBe('8.5');
    expect(model.lineas[1].existenciaUF).toBe('21.5');        // balance_after real
    // Importes ME/MN por movimiento: no gestionados → EN BLANCO (nunca inventados)
    for (const l of model.lineas) {
      expect(l.entradaImporteME).toBe('');
      expect(l.entradaImporteMN).toBe('');
      expect(l.salidaImporteME).toBe('');
      expect(l.salidaImporteMN).toBe('');
      expect(l.existenciaImporteME).toBe('');
      expect(l.existenciaImporteMN).toBe('');
    }
    expect(model.resumen).toEqual({
      saldoInicial: '0', entradas: '30', salidas: '13.5', saldoFinal: '16.5',
    });
    expect(model.precioCostoPromedioMN).toBe('45.75');        // 12 (MN real)
    expect(model.precioCostoPromedioME).toBe('');             //    (ME no gestionada)
  });

  it('deriva el saldo cronológicamente cuando balance_after falta (misma regla que la vista)', () => {
    const model = buildSc213ModelData({
      ...base,
      movimientos: base.movimientos.map((m) => ({ ...m, balance_after: null })),
    });
    expect(model.lineas.map((l) => l.existenciaUF)).toEqual(['30', '21.5', '16.5']);
  });

  it('usa el SKU real en el nombre de archivo', () => {
    expect(sc213FileName(base.producto)).toBe('SC-2-13_Submayor_Inventario_BUC-350.pdf');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SC-2-01 — Solicitud de Compra (Órdenes de Compra)
// ────────────────────────────────────────────────────────────────────────────

describe('SC-2-01 — modelo según Resolución 11/2007', () => {
  const base: Sc201SourceData = {
    order: {
      id: 'cccccccc-3333-4333-8333-333333333333',
      po_number: 'OC-2026-00077',
      supplier_name: 'Proveedor Central',
      status: 'sent',
      total_amount: 18750.4,
      notes: 'Entregar en puerta de carga 2',
      expected_date: '2026-11-05',
      created_by: 'user-1',
      created_at: '2026-10-28T09:30:00Z',
    },
    items: [
      { product_name: 'Harina Panadera 50 kg', sku: 'HAR-50', quantity_ordered: 20, unit_cost: 610.5, unit_of_measure: 'sacos' },
    ],
    entidadNombre: 'Tienda QA',
    creadorNombre: 'José Díaz',
  };

  it('cubre los 9 datos de uso obligatorio con los datos bancarios EN BLANCO', () => {
    const model = buildSc201ModelData(base);
    expect(model.fechaEmision).toBe('28/10/2026');            // 1
    expect(model.proveedorNombre).toBe('Proveedor Central');  // 2
    expect(model.proveedorCodigo).toBe('');
    expect(model.proveedorDireccion).toBe('');
    expect(model.solicitanteNombre).toBe('Tienda QA');        // 3
    expect(model.solicitanteCuentaBancaria).toBe('');
    expect(model.solicitanteSucursalBancaria).toBe('');
    expect(model.viaEntrega).toBe('');                        // 4 (no gestionado)
    expect(model.fechaEntrega).toBe('05/11/2026');            //    (fecha esperada real)
    expect(model.lugarEntrega).toBe('');
    expect(model.lineas[0].importe).toBe('12,210.00');        // 5 = 20 × 610.5
    expect(model.totalSolicitud).toBe('18,750.40');           // 6 (almacenado)
    expect(model.emisorNombre).toBe('José Díaz');             // 7 (nombre real)
    expect(model.numeroConsecutivo).toBe('OC-2026-00077');    // 9
  });

  it('usa el número real de la orden en el nombre de archivo', () => {
    expect(sc201FileName(base.order)).toBe('SC-2-01_Solicitud_de_Compras_OC-2026-00077.pdf');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SC-2-09 — Transferencia entre Almacenes
// ────────────────────────────────────────────────────────────────────────────

describe('SC-2-09 — modelo según Resolución 11/2007', () => {
  const base: Sc209SourceData = {
    transfer: {
      id: 'dddddddd-4444-4444-8444-444444444444',
      status: 'CONFIRMADA',
      notes: null,
      created_at: '2026-10-25T08:00:00Z',
      confirmed_at: '2026-10-26T14:20:00Z',
      origin_store: { name: 'Tienda Origen' },
      destination_store: { name: 'Tienda Destino' },
      creator: { full_name: 'Marta Rodríguez' },
      items: [
        { quantity: 30, unit_cost: 45.75, products: { name: 'Cerveza', sku: 'BUC-350', unit_of_measure: 'unidades' } },
        { quantity: 8.5, unit_cost: 120.4, products: { name: 'Detergente', sku: 'DET-1L', unit_of_measure: 'unidades' } },
      ],
    },
  };

  it('transferencia CONFIRMADA: cantidad recibida e importes de recepción reales', () => {
    const model = buildSc209ModelData(base);
    expect(model.fechaEmision).toBe('25/10/2026');            // 1
    expect(model.almacenEntregaNombre).toBe('Tienda Origen'); // 3
    expect(model.almacenReceptorNombre).toBe('Tienda Destino'); // 4
    expect(model.lineas[1].cantidadRemitida).toBe('8.5');     // 5
    expect(model.lineas[1].cantidadRecibida).toBe('8.5');     //    (confirmación traslada la cantidad)
    expect(model.lineas[1].importeRemitido).toBe('1,023.40'); //    sin ruido de float
    expect(model.lineas[1].importeRecibido).toBe('1,023.40');
    expect(model.lineas[0].saldoEntrega).toBe('');            //    (no gestionado)
    expect(model.importeTotalEntrega).toBe('2,395.90');
    expect(model.importeTotalRecepcion).toBe('2,395.90');
    expect(model.entregaNombre).toBe('Marta Rodríguez');      // 6
    expect(model.recepcionFecha).toBe('26/10/2026');          // 7 (confirmed_at real)
    expect(model.numeroConsecutivo).toBe('');                 // 11 (no gestionado)
  });

  it('transferencia PENDIENTE: los datos de recepción van EN BLANCO (no se inventan)', () => {
    const model = buildSc209ModelData({
      transfer: { ...base.transfer, status: 'PENDIENTE', confirmed_at: null },
    });
    expect(model.lineas[0].cantidadRecibida).toBe('');
    expect(model.lineas[0].importeRecibido).toBe('');
    expect(model.importeTotalRecepcion).toBe('');
    expect(model.recepcionNombre).toBe('');
    expect(model.recepcionFecha).toBe('');
  });

  it('transferencia REVERSADA anota fecha y motivo reales', () => {
    const model = buildSc209ModelData({
      transfer: {
        ...base.transfer,
        status: 'REVERSADA',
        reversed_at: '2026-10-27T10:00:00Z',
        reversal_reason: 'Error de destino',
      },
    });
    expect(model.estado).toBe('Reversada');
    expect(model.reversal?.fecha).toBe('27/10/2026');
    expect(model.reversal?.motivo).toBe('Error de destino');
  });

  it('usa el identificador real en el nombre de archivo', () => {
    expect(sc209FileName('dddddddd-4444-4444-8444-444444444444')).toBe(
      'SC-2-09_Transferencia_Almacenes_dddddddd.pdf',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SC-2-12 — Factura (Ventas)
// ────────────────────────────────────────────────────────────────────────────

describe('SC-2-12 — modelo según Resolución 11/2007', () => {
  const base: Sc212SourceData = {
    transaction: {
      id: 'eeeeeeee-5555-4555-8555-555555555555',
      status: 'completed',
      total_amount: 5487.3,
      subtotal: 5680,
      discount_value: 192.7,
      sale_currency: 'CUP',
      customer_name: 'Combinado Deportivo',
      invoice_number: 'FV-2026-003412',
      completed_at: '2026-10-27T11:45:00Z',
      created_at: '2026-10-27T11:45:00Z',
      seller_id: 'seller-1',
      store_id: 'store-a',
    },
    items: [
      { quantity: 12, price_at_sale: 210, price_currency: 'CUP', products: { name: 'Aceite 1 L', sku: 'ACE-1L', unit_of_measure: 'unidades' } },
      { quantity: 25, price_at_sale: 115.5, price_currency: 'CUP', products: { name: 'Picadillo 500 g', sku: 'PIC-500', unit_of_measure: 'paquetes' } },
    ],
    entidadNombre: 'Tienda QA',
    vendedorNombre: 'Ana Torres',
  };

  it('cubre los 12 datos de uso obligatorio con NIT/cuenta/sucursal EN BLANCO', () => {
    const model = buildSc212ModelData(base);
    expect(model.fechaEmision).toBe('27/10/2026');            // 1
    expect(model.proveedorNombre).toBe('Tienda QA');          // 2 (entidad vendedora)
    expect(model.proveedorNIT).toBe('');
    expect(model.proveedorCuentaBancaria).toBe('');
    expect(model.compradorNombre).toBe('Combinado Deportivo'); // 3
    expect(model.compradorDireccion).toBe('');
    expect(model.tipoOperacion).toBe('Venta');                // 4
    expect(model.transportadorNombre).toBe('');               // 5
    expect(model.lineas[0].importe).toBe('2,520.00 CUP');     // 6 (12 × 210)
    expect(model.lineas[0].saldoExistencia).toBe('');
    expect(model.importesTotales[0].importe).toBe('5,487.30 CUP'); // 7 (almacenado)
    expect(model.entregaNombre).toBe('Ana Torres');           // 8
    expect(model.numeroConsecutivo).toBe('FV-2026-003412');   // 12 (invoice_number real)
  });

  it('venta sin número de factura deja el consecutivo EN BLANCO y usa el id en el archivo', () => {
    const model = buildSc212ModelData({
      ...base,
      transaction: { ...base.transaction, invoice_number: null },
    });
    expect(model.numeroConsecutivo).toBe('');
    expect(sc212FileName({ invoice_number: null, id: 'eeeeeeee-5555' })).toBe(
      'SC-2-12_Factura_eeeeeeee.pdf',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// SC-2-16 — Ajuste de Inventario
// ────────────────────────────────────────────────────────────────────────────

describe('SC-2-16 — modelo según Resolución 11/2007', () => {
  const base: Sc216SourceData = {
    adjustment: {
      id: 'ffffffff-6666-4666-8666-666666666666',
      status: 'confirmed',
      reason: 'STOCKTAKE_SHRINKAGE',
      notes: 'Faltantes del conteo de octubre',
      created_at: '2026-10-23T17:00:00Z',
      reversed_at: null,
      reversal_reason: null,
      source_physical_inventory: { pi_number: 'IF-2026-021', cutoff_date: '2026-10-23T00:00:00Z' },
      items: [
        {
          expected_quantity: 48,
          counted_quantity: 45,
          products: { name: 'Jabón 110 g', sku: 'JAB-110', unit_of_measure: 'unidades' },
        },
      ],
      creator: { full_name: 'Marta Rodríguez' },
    },
    entidadNombre: 'Tienda QA',
  };

  it('cubre los 11 datos de uso obligatorio con costo/importe EN BLANCO', () => {
    const model = buildSc216ModelData(base);
    expect(model.entidadNombre).toBe('Tienda QA');            // 1–2
    expect(model.fechaEmision).toBe('23/10/2026');            // 3
    expect(model.conceptoAjuste).toBe(SC216_CONCEPTOS.STOCKTAKE_SHRINKAGE); // 4
    expect(model.referenciaInventarioFisico).toContain('IF-2026-021');
    expect(model.lineas[0].codigoInterno).toBe('JAB-110');    // 5
    expect(model.lineas[0].cantidad).toBe('-3');              //    (45 − 48, como la vista)
    expect(model.lineas[0].precioUnitario).toBe('');          //    (no gestionado)
    expect(model.lineas[0].importe).toBe('');
    expect(model.lineas[0].saldoExistencia).toBe('');
    expect(model.totalAjuste).toBe('');                       // 6 (no gestionado)
    expect(model.realizaInventarioNombre).toBe('Marta Rodríguez'); // 8 (nombre real)
    expect(model.numeroConsecutivo).toBe('');                 // 11 (no gestionado)
  });

  it('los conceptos son la traducción literal del enum real de la BD', () => {
    expect(SC216_CONCEPTOS.STOCKTAKE_SHRINKAGE).toBe('Faltante según conteo físico (merma)');
    expect(SC216_CONCEPTOS.STOCKTAKE_SURPLUS).toBe('Sobrante según conteo físico');
    expect(SC216_CONCEPTOS.DAMAGED_GOODS).toBe('Productos dañados');
    expect(SC216_CONCEPTOS.OTHER).toBe('Otro');
  });

  it('usa el identificador real en el nombre de archivo', () => {
    expect(sc216FileName('ffffffff-6666-4666-8666-666666666666')).toBe(
      'SC-2-16_Ajuste_Inventario_ffffffff.pdf',
    );
  });
});

// ────────────────────────────────────────────────────────────────────────────
// IMPRESIÓN ECONÓMICA (FASE 5/6) — verificación a nivel de bytes
// ────────────────────────────────────────────────────────────────────────────

describe('Impresión económica — ningún relleno oscuro en los 7 modelos', () => {
  // Fixtures locales (independientes de los bloques anteriores)
  const inkVale = mkVale();
  const inkTransfer: Sc209SourceData = {
    transfer: {
      id: 'dddddddd-4444-4444-8444-444444444444',
      status: 'CONFIRMADA',
      notes: null,
      created_at: '2026-10-25T08:00:00Z',
      confirmed_at: '2026-10-26T14:20:00Z',
      origin_store: { name: 'Tienda Origen' },
      destination_store: { name: 'Tienda Destino' },
      items: [{ quantity: 30, unit_cost: 45.75, products: { name: 'Cerveza', sku: 'BUC-350', unit_of_measure: 'unidades' } }],
    },
  };
  const inkSale: Sc212SourceData = {
    transaction: {
      id: 'eeeeeeee-5555-4555-8555-555555555555',
      status: 'completed',
      total_amount: 5487.3,
      subtotal: 5680,
      discount_value: 192.7,
      sale_currency: 'CUP',
      customer_name: 'Combinado Deportivo',
      invoice_number: 'FV-2026-003412',
      completed_at: '2026-10-27T11:45:00Z',
      created_at: '2026-10-27T11:45:00Z',
      seller_id: null,
      store_id: 'store-a',
    },
    items: [
      { quantity: 12, price_at_sale: 210, price_currency: 'CUP', products: { name: 'Aceite 1 L', sku: 'ACE-1L', unit_of_measure: 'unidades' } },
    ],
    entidadNombre: 'Tienda QA',
  };
  const inkAdjustment: Sc216SourceData = {
    adjustment: {
      id: 'ffffffff-6666-4666-8666-666666666666',
      status: 'confirmed',
      reason: 'STOCKTAKE_SHRINKAGE',
      notes: 'Faltantes del conteo',
      created_at: '2026-10-23T17:00:00Z',
      reversed_at: null,
      reversal_reason: null,
      source_physical_inventory: { pi_number: 'IF-2026-021', cutoff_date: '2026-10-23T00:00:00Z' },
      items: [
        { expected_quantity: 48, counted_quantity: 45, products: { name: 'Jabón 110 g', sku: 'JAB-110', unit_of_measure: 'unidades' } },
      ],
      creator: { full_name: 'Marta Rodríguez' },
    },
    entidadNombre: 'Tienda QA',
  };
  it('SC-2-04: fondo blanco en todas las celdas (la banda negra anterior está corregida)', async () => {
    const doc = await renderSc204Pdf({
      entidadNombre: 'Tienda QA',
      entidadCodigo: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaEmision: '30/10/2026',
      proveedorNombre: 'Proveedor',
      proveedorCodigo: '',
      documentoNombre: '',
      documentoNumero: 'FAC-1',
      fechaRecepcion: '20/10/2026',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
      lineas: [{ codigo: 'A', descripcion: 'Prod', unidadMedida: 'u', cantidad: '1', precioUnitario: '10,00 CUP', importe: '10,00 CUP', saldoExistencia: '' }],
      importesTotales: [{ label: 'Importe Total del modelo (CUP):', importe: '10,00 CUP' }],
      numeroConsecutivo: '',
      identificadorRecepcion: 'aaaaaaaa',
    });
    const text = decodePdf(doc.output('arraybuffer'));
    expect(text).toContain('MODELO SC-2-04');
    expect(text).toContain('INFORME DE RECEPCIÓN');
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);

  it('SC-2-08: sin rellenos oscuros y con el título oficial', async () => {
    const model = buildSc208ModelData({ entidadNombre: 'Tienda QA', vale: inkVale });
    const text = decodePdf((await renderSc208Pdf(model)).output('arraybuffer'));
    expect(text).toContain('VALE DE ENTREGA O DEVOLUCIÓN');
    expect(text).toContain('VS-000123-2026');
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);

  it('SC-2-13: sin rellenos oscuros en múltiples páginas (tabla amplia)', async () => {
    const model = buildSc213ModelData({
      producto: { id: 'p1', name: 'Prod', sku: 'SKU-1', unit_of_measure: 'u', cost_average: 10 },
      entidadNombre: 'Tienda QA',
      movimientos: Array.from({ length: 40 }, (_, i) => ({
        id: `m${i}`,
        created_at: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        movement_type: i % 2 ? 'sale' : 'purchase',
        quantity_change: i % 2 ? -2 : 5,
        balance_after: 5 * Math.ceil((i + 1) / 2) - 2 * Math.floor(i / 2),
        reference_doc: `DOC-${i}`,
      })),
    });
    const doc = await renderSc213Pdf(model);
    const text = decodePdf(doc.output('arraybuffer'));
    expect(text).toContain('SUBMAYOR DE INVENTARIO');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2); // paginación real
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);

  it('SC-2-01: sin rellenos oscuros y con el título oficial', async () => {
    const model = buildSc201ModelData({
      order: {
        id: 'cccccccc',
        po_number: 'OC-1',
        supplier_name: 'Proveedor',
        status: 'sent',
        total_amount: 100,
        notes: null,
        expected_date: '2026-11-01',
        created_by: null,
        created_at: '2026-10-28T09:30:00Z',
      },
      items: [{ product_name: 'Harina', sku: 'HAR', quantity_ordered: 2, unit_cost: 25, unit_of_measure: 'sacos' }],
      entidadNombre: 'Tienda QA',
    });
    const text = decodePdf((await renderSc201Pdf(model)).output('arraybuffer'));
    expect(text).toContain('SOLICITUD DE COMPRA');
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);

  it('SC-2-09: sin rellenos oscuros y con el título oficial', async () => {
    const model = buildSc209ModelData(inkTransfer);
    const text = decodePdf((await renderSc209Pdf(model)).output('arraybuffer'));
    expect(text).toContain('TRANSFERENCIA ENTRE ALMACENES');
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);

  it('SC-2-12: sin rellenos oscuros y con el título oficial', async () => {
    const model = buildSc212ModelData(inkSale);
    const text = decodePdf((await renderSc212Pdf(model)).output('arraybuffer'));
    expect(text).toContain('FACTURA');
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);

  it('SC-2-16: sin rellenos oscuros y con el título oficial', async () => {
    const model = buildSc216ModelData(inkAdjustment);
    const text = decodePdf((await renderSc216Pdf(model)).output('arraybuffer'));
    expect(text).toContain('AJUSTE DE INVENTARIO');
    expect(countDarkFilledRects(text)).toBe(0);
  }, 30_000);
});
