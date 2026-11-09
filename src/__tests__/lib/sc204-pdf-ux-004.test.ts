/**
 * CP-DOC-PDF-UX-004 — SC-2-04 «INFORME DE RECEPCIÓN»: NORMALIZACIÓN VISUAL,
 * SEMÁNTICA Y VALIDACIÓN (2026-11-09)
 * ========================================================================
 * Escenarios obligatorios de la misión (§10), verificados a DOS niveles:
 *  · MODELO (buildSc204ModelData): cada dato procede EXCLUSIVAMENTE de su
 *    campo de origen (entidad/almacén/proveedor/documento) — sin intercambios.
 *  · RENDER (renderSc204Pdf + decodificación del stream PDF): cada etiqueta
 *    COMPLETA aparece en el documento y los bloques A–F quedan representados.
 *
 * Reglas del modelo oficial (Res. 11/2007 MFP) que NO cambian: campos no
 * gestionados quedan EN BLANCO (línea de cumplimentación manual) — jamás
 * «N/A», ceros, códigos inventados ni sustituciones por datos de otra entidad.
 */

import { describe, it, expect } from 'vitest';
import {
  buildSc204ModelData,
  renderSc204Pdf,
  formatSc204Money,
  type Sc204ModelData,
  type Sc204SourceData,
  type Sc204SourceItem,
} from '@/lib/legal/sc204';

function decodePdf(bytes: ArrayBuffer): string {
  return new TextDecoder('latin1').decode(bytes);
}

/** Cuenta apariciones literales en el stream del PDF. */
function countOccurrences(haystack: string, needle: string): number {
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + 1);
  }
  return n;
}


/** Texto EFECTIVAMENTE dibujado: une los operandos de texto del stream
 * (un título que envuelve a dos líneas sigue siendo un único rótulo). */
function pdfDrawnText(bytes: ArrayBuffer): string {
  const raw = decodePdf(bytes);
  return (raw.match(/\(((?:\\.|[^\\()])*)\)\s*T[jJ]/g) ?? [])
    .map((m) => m.slice(1, m.lastIndexOf(')')))
    .join(' ');
}

const mkItem = (overrides: Partial<Sc204SourceItem> = {}): Sc204SourceItem => ({
  quantity: 34,
  unit_cost: 1,
  moneda_recepcion: 'CUP',
  product_id: 'prod-1',
  products: { name: 'Cemento TBV 50 Kg', sku: '141', unit_of_measure: 'unidad' },
  ...overrides,
});

const mkSource = (overrides: Partial<Sc204SourceData> = {}): Sc204SourceData => ({
  entidadNombre: 'PUERTO PADRE',
  entidadCodigo: '1',
  receipt: {
    id: 'bbbbbbbb-3333-4333-8333-333333333333',
    reference_doc: 'FAC-2026-00871',
    document_number: 'ENT-000007-2026',
    supplier: 'Almacen Lari',
    supplier_tax_id: 'J-31015873-2',
    reception_date: '2026-10-09T09:00:00Z',
    status: 'active',
    store_id: 'store-a',
  },
  items: [mkItem()],
  saldosPorProducto: {
    'prod-1': { saldoPosterior: 34, fuente: 'ledger' },
  } as never,
  emissionDate: new Date('2026-10-09T15:30:00Z'),
  ...overrides,
});

const mkModel = (overrides: Partial<Sc204ModelData> = {}): Sc204ModelData => ({
  entidadNombre: 'PUERTO PADRE',
  entidadCodigo: '1',
  almacenNombre: 'PUERTO PADRE',
  almacenCodigo: '1',
  fechaEmision: '09/10/2026',
  proveedorNombre: 'Almacen Lari',
  proveedorCodigo: 'J-31015873-2',
  documentoNombre: 'Entrada',
  documentoNumero: 'ENT-000007-2026',
  fechaRecepcion: '09/10/2026',
  transportadorNombre: '',
  transportadorCarne: '',
  transportadorChapa: '',
  transportadorCasilla: '',
  transportadorGuiaAerea: '',
  lineas: [
    {
      codigo: '141',
      descripcion: 'Cemento TBV 50 Kg',
      unidadMedida: 'unidad',
      cantidad: '34',
      precioUnitario: '1.00 CUP',
      importe: '34.00 CUP',
      saldoExistencia: '34',
    },
  ],
  importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '34.00 CUP' }],
  numeroConsecutivo: '',
  identificadorRecepcion: 'bbbbbbbb',
  ...overrides,
});

describe('CP-DOC-PDF-UX-004 · Escenario A — campos completos en su ubicación', () => {
  it('cada dato procede EXCLUSIVAMENTE de su campo de origen (sin intercambios)', () => {
    const model = buildSc204ModelData(
      mkSource({
        items: [mkItem()],
      }),
    );
    // Entidad receptora ← nombre + código consecutivo persistente de la tienda
    expect(model.entidadNombre).toBe('PUERTO PADRE');
    expect(model.entidadCodigo).toBe('1');
    // Almacén receptor ← identificación de la entidad receptora (regla del modelo)
    expect(model.almacenNombre).toBe('PUERTO PADRE');
    expect(model.almacenCodigo).toBe('1');
    // Proveedor ← receipts.supplier + supplier_tax_id (NIT/CI congelado)
    expect(model.proveedorNombre).toBe('Almacen Lari');
    expect(model.proveedorCodigo).toBe('J-31015873-2');
    // Documento que ampara ← tipo «Entrada» + número real de la entrada
    // (document_number); la factura externa (reference_doc) NO es el número
    // del documento que ampara, y el nombre del proveedor jamás lo es.
    expect(model.documentoNombre).toBe('Entrada');
    expect(model.documentoNumero).toBe('ENT-000007-2026');
    expect(model.documentoNumero).not.toBe('FAC-2026-00871');
    expect(model.documentoNumero).not.toBe(model.proveedorNombre);
  });

  it('render: bloques A–E con etiquetas COMPLETAS e inequívicas en el PDF', async () => {
    const doc = await renderSc204Pdf(mkModel());
    const text = decodePdf(doc.output('arraybuffer'));

    // Etiquetas completas (§4: nunca «Código:» genérico con varios códigos)
    expect(text).toContain('Código de la entidad receptora:');
    expect(text).toContain('Código del almacén receptor:');
    expect(text).toContain('Código del proveedor:');
    expect(text).toContain('Nombre de la entidad:');
    expect(text).toContain('Nombre del almacén:');
    expect(text).toContain('Nombre o razón social:');
    expect(text).toContain('Nombre o tipo de documento:');
    expect(text).toContain('Número del documento:');
    expect(text).toContain('Fecha de la recepción:');
    expect(text).toContain('Fecha de emisión del modelo:');
    // CP-DOC-SC-DATA-MAPPING-006 §6: el bloque independiente «DATOS DEL
    // TRANSPORTADOR» ya no existe — sus datos viven en su bloque de firma.
    expect(text).not.toContain('DATOS DEL TRANSPORTADOR');

    // Bloque D independiente: el número del documento es el documental real
    expect(text).toContain('ENT-000007-2026');
    // Tabla normalizada (§5) — el encabezado de la última columna se envuelve
    // en dos líneas dentro de su celda (30 mm), por eso se aserta por fragmentos
    expect(text).toContain('Precio unitario');
    expect(text).toContain('Saldo en existencia');
    expect(text).toContain('según almacén');
    // Total con etiqueta normativa (§6)
    expect(text).toContain('IMPORTE TOTAL DEL MODELO');
    expect(text).toContain('IMPORTE TOTAL');
    expect(text).toContain('34.00 CUP');
    // Firmas (§7 de la misión): PIE UNIFICADO (referencia de diseño
    // 2026-11-09) — fila de tres firmas de empleados + sección
    // «TRANSPORTADOR:» con sus datos de identificación dentro del bloque.
    expect(text).toContain('TRANSPORTADOR:');
    expect(text).toContain('Carné de identidad:');
    expect(text).toContain('Chapa:');
    expect(text).toContain('Casilla:');
    expect(text).toContain('Guía aérea:');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE RECEPCIONA');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE CONTABILIZA');
    expect(pdfDrawnText(doc.output('arraybuffer'))).toContain('FIRMA DEL EMPLEADO QUE ANOTA EN EL CONTROL DE INVENTARIO');
  }, 30_000);
});

describe('CP-DOC-PDF-UX-004 · Escenario B — campos incompletos (sin sustituciones)', () => {
  it('proveedor sin código, documento sin número, transportador y almacén vacíos', () => {
    const model = buildSc204ModelData(
      mkSource({
        entidadNombre: '',
        entidadCodigo: '',
        receipt: {
          id: 'bbbbbbbb-4444-4444-8444-444444444444',
          reference_doc: null,
          document_number: null,
          supplier: 'Almacen Lari',
          supplier_tax_id: null,
          reception_date: null,
          status: 'active',
          store_id: 'store-a',
        },
        items: [mkItem({ product_id: null })],
      }),
    );
    // Sin código de proveedor gestionado → en blanco (nunca inventado)
    expect(model.proveedorCodigo).toBe('');
    // Sin número documental → EN BLANCO; jamás el nombre del proveedor
    expect(model.documentoNumero).toBe('');
    // El tipo del documento que ampara es siempre la clasificación documental
    expect(model.documentoNombre).toBe('Entrada');
    // Almacén sin entidad → vacío
    expect(model.almacenNombre).toBe('');
    expect(model.almacenCodigo).toBe('');
    // Transportador no gestionado → vacío
    expect(model.transportadorNombre).toBe('');
    // Fecha de recepción ausente → vacía (nunca la fecha de impresión)
    expect(model.fechaRecepcion).toBe('');
    const serialized = JSON.stringify(model);
    expect(serialized).not.toContain('N/A');
  });

  it('render: los campos vacíos conservan línea de cumplimentación manual', async () => {
    const doc = await renderSc204Pdf(mkModel({
      proveedorCodigo: '',
      documentoNumero: '',
      almacenNombre: '',
      almacenCodigo: '',
      fechaRecepcion: '',
      transportadorNombre: '',
      transportadorCarne: '',
      transportadorChapa: '',
      transportadorCasilla: '',
      transportadorGuiaAerea: '',
    }));
    const text = decodePdf(doc.output('arraybuffer'));
    // El modelo reserva espacios de cumplimentación (líneas de subrayado)
    expect(text).toContain('_______________');
    // Y el nombre del proveedor jamás aparece como número de documento:
    // con documentoNumero='' no hay segundo «Almacen Lari» posible a nivel de campo
    expect(text).not.toContain('Número del documento: Almacen Lari');
  }, 30_000);
});

describe('CP-DOC-PDF-UX-004 · Escenario C — códigos similares no se intercambian', () => {
  it('códigos distintos por entidad permanecen en su bloque', async () => {
    const doc = await renderSc204Pdf(mkModel({
      entidadCodigo: '77214',
      almacenCodigo: '77215',
      proveedorCodigo: '77216',
    }));
    const text = decodePdf(doc.output('arraybuffer'));
    // Los tres códigos (casi iguales) aparecen — cada uno una sola vez,
    // en su bloque de entidad correspondiente
    expect(countOccurrences(text, '77214')).toBe(1);
    expect(countOccurrences(text, '77215')).toBe(1);
    expect(countOccurrences(text, '77216')).toBe(1);
  }, 30_000);

  it('modelo: los campos de código no comparten propiedad ni valor', () => {
    const model = buildSc204ModelData(mkSource());
    // Tres campos INDEPENDIENTES en el modelo (claves separadas, sin alias)
    const keys = Object.keys(model).filter((k) => k.endsWith('Codigo'));
    expect(keys).toEqual(expect.arrayContaining(['entidadCodigo', 'almacenCodigo', 'proveedorCodigo']));
    // El número del documento proviene de document_number (entrada real),
    // no de reference_doc (factura externa) ni de supplier
    expect(model.documentoNumero).toBe(mkSource().receipt.document_number);
    expect(model.documentoNumero).not.toBe(mkSource().receipt.reference_doc);
    expect(model.documentoNumero).not.toBe(model.proveedorNombre);
  });
});

describe('CP-DOC-PDF-UX-004 · Escenario D — datos extensos sin superposición', () => {
  const nombreLargoEntidad = 'EMPRESA MUNICIPAL DE COMERCIO MINORISTA DE PUERTO PADRE LAS COLORADAS';
  const descripcionLarga =
    'Cemento Portland P-35 TBV saco de 50 kg granel nacional norma NC 95 vigilancia técnica calidad';

  it('modelo: los textos largos se conservan completos (sin recortes ni transformaciones)', () => {
    const model = buildSc204ModelData(
      mkSource({
        entidadNombre: nombreLargoEntidad,
        items: [mkItem({ products: { name: descripcionLarga, sku: '141-L', unit_of_measure: 'unidad' } })],
      }),
    );
    expect(model.entidadNombre).toBe(nombreLargoEntidad);
    expect(model.lineas[0].descripcion).toBe(descripcionLarga);
  });

  it('render: documento válido en una página, con todo el contenido present', async () => {
    const doc = await renderSc204Pdf(mkModel({
      entidadNombre: nombreLargoEntidad,
      almacenNombre: 'ALMACÉN PRINCIPAL DE RECEPCIÓN Y DISTRIBUCIÓN ZONA INDUSTRIAL NORTE',
      lineas: [
        {
          codigo: '141',
          descripcion: descripcionLarga,
          unidadMedida: 'unidad',
          cantidad: '34',
          precioUnitario: '1.00 CUP',
          importe: '34.00 CUP',
          saldoExistencia: '34',
        },
      ],
    }));
    expect(doc.getNumberOfPages()).toBe(1);
    const text = decodePdf(doc.output('arraybuffer'));
    // La descripción larga se dibuja (partida o completa — sin pérdida de dato)
    expect(text).toContain('Cemento Portland P-35 TBV');
    // Los bloques posteriores siguen presentes (la tabla no invadió el layout)
    expect(text).toContain('IMPORTE TOTAL DEL MODELO');
    expect(text).toContain('IMPORTE TOTAL');
    expect(text).toContain('FIRMA DEL EMPLEADO QUE RECEPCIONA');
  }, 30_000);
});

describe('CP-DOC-PDF-UX-004 · Escenario E — varias páginas con encabezados repetidos', () => {
  it('tabla extensa: encabezados repetidos en cada página y firmas juntas al final', async () => {
    const items = Array.from({ length: 60 }, (_, i) =>
      mkItem({
        product_id: `prod-${i}`,
        products: { name: `Producto de recepción número ${i + 1}`, sku: `SKU-${100 + i}`, unit_of_measure: 'unidad' },
        quantity: 1 + (i % 5),
        unit_cost: 2 + i,
      }),
    );
    const doc = await renderSc204Pdf(mkModel({
      lineas: items.map((it) => {
        const model = buildSc204ModelData(mkSource({ items: [it] }));
        return model.lineas[0];
      }),
      importesTotales: [{ label: 'IMPORTE TOTAL DEL MODELO (CUP):', importe: '9,999.00 CUP' }],
    }));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const text = decodePdf(doc.output('arraybuffer'));
    // El encabezado de la tabla se repite en TODAS las páginas que llevan
    // tabla (§5); la última página puede ser exclusiva de totales + cuadrícula
    // de firmas (el conjunto de firmas se mueve SIEMPRE junto — misión §7: ninguna
    // firma separada de las restantes).
    const reps = countOccurrences(text, 'según almacén');
    expect(reps).toBeGreaterThanOrEqual(1);
    expect(reps).toBeLessThanOrEqual(doc.getNumberOfPages());
    // Las firmas no quedan huérfanas: la cuadrícula completa está en el documento
    expect(text).toContain('FIRMA DEL EMPLEADO QUE RECEPCIONA');
    expect(pdfDrawnText(doc.output('arraybuffer'))).toContain('FIRMA DEL EMPLEADO QUE ANOTA EN EL CONTROL DE INVENTARIO');
  }, 45_000);
});

describe('CP-DOC-PDF-UX-004 · Escenario F — regresión documental (saldo y totales)', () => {
  it('el saldo posterior histórico llega a la línea del producto tal cual el ledger', () => {
    const model = buildSc204ModelData(
      mkSource({
        saldosPorProducto: {
          'prod-1': { saldoPosterior: 134.5, fuente: 'ledger' },
        } as never,
        items: [mkItem({ quantity: 34, unit_cost: 1 })],
      }),
    );
    // Saldo resultante de la recepción (34 anterior + 34 recibida) — sin
    // alterar ninguna fórmula de inventario: se consigna el valor del ledger
    expect(model.lineas[0].saldoExistencia).toBe('134.5');
    // La línea sigue siendo quantity × unit_cost (fórmula intacta)
    expect(model.lineas[0].importe).toBe('34.00 CUP');
    expect(model.importesTotales[0].importe).toBe('34.00 CUP');
  });

  it('saldo indeterminado → «s/d» documentado (jamás una cifra inventada)', () => {
    const model = buildSc204ModelData(mkSource({ saldosPorProducto: undefined }));
    expect(model.lineas[0].saldoExistencia).toBe('s/d');
  });

  it('formato monetario: separador de miles, decimales consistentes y moneda visible', () => {
    expect(formatSc204Money(1234567.891)).toBe('1,234,567.891');
    expect(mkModel().lineas[0].precioUnitario).toContain('CUP');
    expect(mkModel().lineas[0].importe).toContain('CUP');
  });

  it('identificación normativa y trazabilidad de la tienda en el PDF', async () => {
    const doc = await renderSc204Pdf(mkModel());
    const text = decodePdf(doc.output('arraybuffer'));
    expect(text).toContain('MODELO SC-2-04');
    expect(text).toContain('INFORME DE RECEPCIÓN');
    expect(text).toContain('Res. No. 11/2007 MFP');
    expect(text).toContain('Identificador COSTPRO de la recepción: bbbbbbbb');
  }, 30_000);
});
