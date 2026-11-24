import { describe, it, expect } from 'vitest';
import {
  buildSc204ModelData,
  type Sc204SourceData,
  type Sc204SourceItem,
} from '@/lib/legal/sc204';

/**
 * CP-RECEPCIONES-PDF-STOCK-MASTER-SKU-001 §1 — exportación del SC-2-04
 * SIN valores económicos.
 *
 * Contrato:
 *  - Default (sin opción o incluirValoresEconomicos: true) → comportamiento
 *    vigente: columnas Precio unitario/Importe pobladas + importesTotales.
 *  - incluirValoresEconomicos: false → SOLO representación:
 *      · las líneas llegan con precioUnitario='' e importe='';
 *      · importesTotales queda vacío (ningún total revela lo excluido);
 *      · cantidades, unidades, códigos, descripciones y saldo intactos;
 *      · el modelo NO toca la recepción ni sus importes almacenados (función
 *        pura sobre los datos fuente — sin mutaciones ni cálculos nuevos).
 *  - El render (renderSc204Pdf) omite las dos columnas y redistribuye el ancho
 *    (verificado por contrato estático en cp-recep001-migrations.test.ts y
 *     visualmente en la evidencia de la misión).
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
  items: [
    mkItem(),
    mkItem({ quantity: 3, unit_cost: 2.5, moneda_recepcion: 'USD', products: { name: 'Vaso plástico', sku: 'VAS-01', unit_of_measure: 'unidad' } }),
  ],
  emissionDate: new Date('2026-10-29T15:30:00Z'),
  ...overrides,
});

describe('SC-2-04 — exportación con/sin valores económicos (CP-RECEP-001 §1)', () => {
  it('default (sin opciones) conserva el comportamiento vigente (con valores)', () => {
    const model = buildSc204ModelData(mkSource());
    expect(model.incluirValoresEconomicos).toBe(true);
    expect(model.lineas[0].precioUnitario).toBe('25.00 CUP');
    expect(model.lineas[0].importe).toBe('250.00 CUP');
    expect(model.importesTotales).toHaveLength(2); // CUP + USD (una línea por moneda)
  });

  it('incluirValoresEconomicos: true equivale al default', () => {
    const model = buildSc204ModelData(mkSource(), { incluirValoresEconomicos: true });
    expect(model.incluirValoresEconomicos).toBe(true);
    expect(model.lineas[0].precioUnitario).toBe('25.00 CUP');
    expect(model.importesTotales).toHaveLength(2);
  });

  it('sin valores: celdas económicas vacías y SIN totales que revelen lo excluido', () => {
    const model = buildSc204ModelData(mkSource(), { incluirValoresEconomicos: false });
    expect(model.incluirValoresEconomicos).toBe(false);
    for (const l of model.lineas) {
      expect(l.precioUnitario).toBe('');
      expect(l.importe).toBe('');
    }
    expect(model.importesTotales).toHaveLength(0);
  });

  it('sin valores: cantidades, unidades, códigos, descripciones y saldo intactos', () => {
    const model = buildSc204ModelData(
      mkSource({
        items: [
          mkItem({ product_id: 'pid-1' }),
          mkItem({ quantity: 3, unit_cost: 2.5, moneda_recepcion: 'USD', products: { name: 'Vaso plástico', sku: 'VAS-01', unit_of_measure: 'unidad' } }),
        ],
        saldosPorProducto: { 'pid-1': { saldoAnterior: 5, saldoPosterior: 15, fuente: 'ledger' } },
      }),
      { incluirValoresEconomicos: false },
    );
    expect(model.lineas[0].codigo).toBe('BUC-350');
    expect(model.lineas[0].descripcion).toBe('Cerveza Bucanero 350ml');
    expect(model.lineas[0].unidadMedida).toBe('unidades');
    expect(model.lineas[0].cantidad).toBe('10');
    // Saldo posterior real del ledger (intacto por la opción de representación).
    expect(model.lineas[0].saldoExistencia).toBe('15');
    expect(model.lineas[1].cantidad).toBe('3');
    // La fecha de recepción y el proveedor no se tocan.
    expect(model.proveedorNombre).toBe('Proveedor Central');
    expect(model.documentoNumero).toBe('ENT-000014-2026');
  });

  it('función pura: el modelo no muta los items fuente ni recalcula importes almacenados', () => {
    const items = [mkItem()];
    const source = mkSource({ items });
    buildSc204ModelData(source, { incluirValoresEconomicos: false });
    // Los datos fuente conservan unit_cost/quantity exactos (sin redondeos).
    expect(items[0].unit_cost).toBe(25);
    expect(items[0].quantity).toBe(10);
  });

  it('recepción extensa (varias líneas del mismo SKU): sin valores se agregan igual las cantidades', () => {
    const model = buildSc204ModelData(
      mkSource({
        items: [
          mkItem({ quantity: 4 }),
          mkItem({ quantity: 6 }),
        ],
      }),
      { incluirValoresEconomicos: false },
    );
    expect(model.lineas).toHaveLength(2);
    expect(model.lineas[0].cantidad).toBe('4');
    expect(model.lineas[1].cantidad).toBe('6');
    expect(model.importesTotales).toHaveLength(0);
  });
});
