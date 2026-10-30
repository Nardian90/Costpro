/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-04 «INFORME DE RECEPCIÓN» (2026-10-29)
 * ==============================================================================
 * Generación del modelo oficial SC-2-04 para las recepciones de COSTPRO
 * (Inicio → OPERACIÓN → Logística → Recepciones), conforme a la
 * RESOLUCIÓN No. 11/2007 del Ministerio de Finanzas y Precios (Gaceta Oficial
 * No. 015 Ordinaria de 12 de febrero de 2007, Anexo Único, págs. 246–252).
 *
 * La Resolución no impone un diseño gráfico: define los DATOS DE USO
 * OBLIGATORIO que el modelo debe contener. Esta implementación los cubre
 * todos (1–13) y deja EN BLANCO para cumplimentación manual aquellos que
 * COSTPRO no gestiona — sin inventar valores, sin «N/A», sin ceros.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)              ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Nombre y código entidad receptora     │ stores.name                        │ Nombre automático; CÓDIGO en blanco
 *  │ 2. Nombre y código almacén receptor      │ (no gestionado)                    │ En blanco
 *  │ 3. Fecha de emisión del modelo           │ fecha de generación del PDF        │ Automática (dd/mm/aaaa)
 *  │ 4. Nombre y código del proveedor         │ receipts.supplier                  │ Nombre automático; CÓDIGO en blanco
 *  │ 5. Número y nombre doc. que ampara       │ receipts.reference_doc (Factura)   │ Número automático; NOMBRE/TIPO en blanco
 *  │ 6. Transportador (nombre, carné, chapa,  │ (no gestionado)                    │ En blanco
 *  │    casilla o guía aérea)                 │                                    │
 *  │ 7. Código, descripción, UM, cantidad,    │ receipt_items + products           │ Automático; SALDO EN EXISTENCIA en blanco
 *  │    precio unitario total, importe y      │ (sku, name, unit_of_measure,       │ (COSTPRO no registra el saldo posterior
 *  │    saldo en existencia según almacén     │  quantity, unit_cost, moneda)      │  de esa recepción por línea)
 *  │ 8. Importe Total del modelo              │ Σ (quantity × unit_cost) por       │ Automático, agrupado por moneda
 *  │                                          │ moneda de línea                    │
 *  │ 9–12. Firmas (Jefe Almacén, Transporta-  │ (no gestionado)                    │ Espacios en blanco para firma
 *  │    dor, recepciona, contabiliza/anota)   │                                    │
 *  │ 13. Número consecutivo del modelo        │ (no gestionado)                    │ En blanco
 *
 * Nota (14–16 de la Resolución): los datos adicionales son exclusivos de la
 * recepción de COMBUSTIBLES (volúmenes bajo/sobre flecha o domo, temperaturas
 * de bombeo). COSTPRO no gestiona recepciones de combustibles, por lo que no
 * se representan (no aplican a este documento).
 *
 * Reglas de datos:
 *  - Importe de línea = quantity × unit_cost (misma fórmula que ya usa
 *    ReceptionDetailsModal y la pestaña Productos). Sin redondeos ni
 *    transformaciones de los valores almacenados.
 *  - Moneda de línea = moneda_recepcion ('CUP' por convención del sistema
 *    cuando no está presente — igual que el resto de Recepciones).
 *  - El PDF se genera SOLO LECTURA: no muta la recepción, el inventario,
 *    el kardex ni ningún registro.
 *  - Las lecturas se hacen con el cliente Supabase del usuario (RLS activa)
 *    y siempre filtradas por la tienda activa — sin cruce entre tiendas.
 */

import { format } from 'date-fns';
import type { Receipt } from '@/types';
import { supabase } from '@/lib/supabaseClient';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { logger } from '@/lib/logger';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de datos
// ────────────────────────────────────────────────────────────────────────────

/** Línea de producto tal como se lee de la BD (join products incluido). */
export interface Sc204SourceItem {
  quantity: number;
  unit_cost: number;
  moneda_recepcion?: string | null;
  products?: {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
  } | null;
}

/** Insumos para construir el modelo (todo dato disponible en COSTPRO). */
export interface Sc204SourceData {
  /** Nombre de la entidad receptora (tienda activa bajo RLS). */
  entidadNombre: string;
  /** Recepción que se formaliza. */
  receipt: Pick<Receipt, 'id' | 'reference_doc' | 'supplier' | 'reception_date'> & {
    store_id?: string | null;
  };
  /** Líneas de la recepción (receipt_items + products). */
  items: Sc204SourceItem[];
  /** Fecha de emisión del modelo (momento de generación). */
  emissionDate: Date;
}

/**
 * Estructura del modelo SC-2-04. Los campos no gestionados por COSTPRO son
 * cadenas vacías: se representan en el PDF como espacios para cumplimentar
 * a mano (nunca «N/A», ceros ni guiones).
 */
export interface Sc204ModelData {
  // 1. Entidad receptora
  entidadNombre: string;
  entidadCodigo: string; // no gestionado → ''
  // 2. Almacén receptor
  almacenNombre: string; // no gestionado → ''
  almacenCodigo: string; // no gestionado → ''
  // 3. Fecha de emisión (dd/mm/aaaa)
  fechaEmision: string;
  // 4. Proveedor
  proveedorNombre: string;
  proveedorCodigo: string; // no gestionado → ''
  // 5. Documento que ampara
  documentoNombre: string; // tipo (Factura/Conduce/…) no gestionado → ''
  documentoNumero: string;
  // Trazabilidad COSTPRO (dato real de la recepción; complementa el dato 3)
  fechaRecepcion: string;
  // 6. Transportador — no gestionado
  transportadorNombre: string;
  transportadorCarne: string;
  transportadorChapa: string;
  transportadorCasilla: string;
  transportadorGuiaAerea: string;
  // 7. Productos
  lineas: Array<{
    codigo: string;
    descripcion: string;
    unidadMedida: string;
    cantidad: string;
    precioUnitario: string;
    importe: string;
    /** Dato 7: saldo en existencia — no gestionado → '' (en blanco). */
    saldoExistencia: string;
  }>;
  // 8. Importe Total del modelo (una línea por moneda — nunca se mezclan)
  importesTotales: Array<{ label: string; importe: string }>;
  // 13. Número consecutivo — no gestionado
  numeroConsecutivo: string;
  // Identificador COSTPRO de la recepción (nota al pie / nombre de archivo)
  identificadorRecepcion: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Formateo (es-CU, sin redondeos ni transformaciones de los valores)
// ────────────────────────────────────────────────────────────────────────────

const moneyFormatter = new Intl.NumberFormat('es-CU', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 20,
});

const quantityFormatter = new Intl.NumberFormat('es-CU', {
  maximumFractionDigits: 20,
});

/** Moneda por defecto — convención del sistema (product-lines.ts, modal). */
const DEFAULT_CURRENCY = 'CUP';

export function formatSc204Money(value: number): string {
  if (!Number.isFinite(value)) return '';
  // Canonicalización: elimina el ruido de representación binaria (float64)
  // sin alterar el valor almacenado (columnas numeric de PostgreSQL).
  return moneyFormatter.format(Number(value.toFixed(10)));
}

export function formatSc204Quantity(value: number): string {
  if (!Number.isFinite(value)) return '';
  return quantityFormatter.format(Number(value.toFixed(10)));
}

export function formatSc204Date(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd/MM/yyyy');
}

/** Moneda efectiva de una línea (CUP cuando no está presente). */
export function lineCurrency(item: Sc204SourceItem): string {
  return item.moneda_recepcion || DEFAULT_CURRENCY;
}

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

export function buildSc204ModelData(source: Sc204SourceData): Sc204ModelData {
  const lineas = (source.items || []).map((item) => {
    const importe = (item.quantity || 0) * (item.unit_cost || 0);
    const moneda = lineCurrency(item);
    return {
      // Código del producto: SKU gestionado por COSTPRO (blanco si no existe)
      codigo: item.products?.sku || '',
      descripcion: item.products?.name || '',
      unidadMedida: item.products?.unit_of_measure || '',
      cantidad: formatSc204Quantity(item.quantity),
      precioUnitario: `${formatSc204Money(item.unit_cost)} ${moneda}`.trim(),
      importe: `${formatSc204Money(importe)} ${moneda}`.trim(),
      // Dato 7 (saldo en existencia según almacén): COSTPRO no registra el
      // saldo posterior a esta recepción por línea → se deja en blanco.
      saldoExistencia: '',
    };
  });

  // Dato 8: Importe Total del modelo — agrupado por moneda de línea.
  // Nunca se mezclan monedas en una misma suma.
  const totalsByCurrency = new Map<string, number>();
  for (const item of source.items || []) {
    const moneda = lineCurrency(item);
    const importe = (item.quantity || 0) * (item.unit_cost || 0);
    totalsByCurrency.set(moneda, (totalsByCurrency.get(moneda) || 0) + importe);
  }
  const currencies = Array.from(totalsByCurrency.keys());
  const importesTotales = currencies.map((moneda) => ({
    label: `Importe Total del modelo (${moneda}):`,
    importe: `${formatSc204Money(totalsByCurrency.get(moneda) || 0)} ${moneda}`.trim(),
  }));

  return {
    // 1. Entidad receptora: nombre de la tienda; código no gestionado
    entidadNombre: source.entidadNombre || '',
    entidadCodigo: '',
    // 2. Almacén receptor: no gestionado por COSTPRO
    almacenNombre: '',
    almacenCodigo: '',
    // 3. Fecha de emisión del modelo
    fechaEmision: formatSc204Date(source.emissionDate),
    // 4. Proveedor
    proveedorNombre: source.receipt.supplier || '',
    proveedorCodigo: '',
    // 5. Documento que ampara: número = referencia gestionada por COSTPRO
    //    (etiquetada «Factura» en la UI); el nombre/tipo del documento se
    //    deja en blanco para cumplimentación manual (no es inequívoco).
    documentoNombre: '',
    documentoNumero: source.receipt.reference_doc || '',
    // Trazabilidad: fecha real de la recepción gestionada por COSTPRO
    fechaRecepcion: formatSc204Date(source.receipt.reception_date),
    // 6. Transportador: no gestionado
    transportadorNombre: '',
    transportadorCarne: '',
    transportadorChapa: '',
    transportadorCasilla: '',
    transportadorGuiaAerea: '',
    lineas,
    importesTotales,
    // 13. Número consecutivo: no gestionado por COSTPRO
    numeroConsecutivo: '',
    identificadorRecepcion: source.receipt.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (identificador real de la recepción). */
export function sc204FileName(receiptId: string): string {
  const shortId = receiptId?.split('-')[0] || 'documento';
  return `SC-2-04_Informe_Recepcion_${shortId}.pdf`;
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lee las líneas de la recepción (con código, descripción y unidad de medida
 * del producto) y el nombre de la tienda. Todas las lecturas usan el cliente
 * Supabase autenticado (RLS activa) — el usuario solo puede leer su tienda.
 * No modifica ningún registro.
 */
export async function fetchSc204SourceData(
  receipt: Sc204SourceData['receipt'],
  activeStoreId?: string | null,
): Promise<Pick<Sc204SourceData, 'entidadNombre' | 'items'>> {
  const storeId = receipt.store_id || activeStoreId || null;
  const { data: items, error } = await supabase
    .from('receipt_items')
    .select(
      'id, receipt_id, product_id, quantity, unit_cost, moneda_recepcion, products(name, sku, unit_of_measure)',
    )
    .eq('receipt_id', receipt.id)
    .order('created_at', { ascending: true });
  if (error) throw error;

  let entidadNombre = '';
  if (storeId) {
    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) {
      // El nombre de la entidad no bloquea el informe: queda en blanco.
      logger.warn('DATABASE', 'SC204_STORE_NAME_READ_FAILED', { data: storeError });
    } else {
      entidadNombre = (storeRow as { name?: string | null } | null)?.name || '';
    }
  }

  return {
    entidadNombre,
    items: (items as unknown as Sc204SourceItem[]) || [],
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

const BLANK_LINE = '_______________';

function blankField(label: string): string {
  return `${label}: ${BLANK_LINE}`;
}

/**
 * Construye el documento SC-2-04 sin descargarlo (patrón del proyecto:
 * el caller decide preview o descarga). Permite verificación a nivel de
 * bytes en las pruebas (impresión económica: sin bandas de tinta).
 */
export async function renderSc204Pdf(model: Sc204ModelData) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;

  // ── Encabezado: identificación del modelo ──
  doc.setDrawColor(0);
  doc.setLineWidth(0.4);
  doc.rect(marginX, 10, contentWidth, 34);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('MODELO SC-2-04', pageWidth - marginX - 4, 16, { align: 'right' });
  doc.setFontSize(11);
  doc.text('INFORME DE RECEPCIÓN', pageWidth - marginX - 4, 22, { align: 'right' });
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text('Uso obligatorio — Res. No. 11/2007 MFP', pageWidth - marginX - 4, 27, {
    align: 'right',
  });
  doc.setFont('helvetica', 'normal');
  doc.text('No. Consecutivo: ____________', pageWidth - marginX - 4, 32, {
    align: 'right',
  });
  doc.text(
    `Fecha de emisión: ${model.fechaEmision || BLANK_LINE}`,
    pageWidth - marginX - 4,
    36,
    { align: 'right' },
  );

  // Dato 1: entidad receptora (nombre automático, código en blanco)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ENTIDAD RECEPTORA:', marginX + 4, 16);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadNombre || BLANK_LINE, marginX + 42, 16, { maxWidth: 70 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 4, 21);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadCodigo || BLANK_LINE, marginX + 20, 21);

  // Dato 2: almacén receptor (no gestionado → en blanco)
  doc.setFont('helvetica', 'bold');
  doc.text('ALMACÉN RECEPTOR:', marginX + 4, 26);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenNombre || BLANK_LINE, marginX + 42, 26);
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 100, 26);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenCodigo || BLANK_LINE, marginX + 116, 26);

  // Dato 4: proveedor
  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR — Nombre:', marginX + 4, 31);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorNombre || BLANK_LINE, marginX + 48, 31, {
    maxWidth: 80,
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 100, 31);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorCodigo || BLANK_LINE, marginX + 116, 31);

  // Dato 5: documento que ampara los productos
  doc.setFont('helvetica', 'bold');
  doc.text('DOCUMENTO QUE AMPARA — Nombre (tipo):', marginX + 4, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(model.documentoNombre || BLANK_LINE, marginX + 68, 36);
  doc.setFont('helvetica', 'bold');
  doc.text('Número:', marginX + 110, 36);
  doc.setFont('helvetica', 'normal');
  doc.text(model.documentoNumero || BLANK_LINE, marginX + 126, 36, {
    maxWidth: 60,
  });

  // Fecha de la recepción (dato real gestionado por COSTPRO — trazabilidad)
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA DE LA RECEPCIÓN:', marginX + 4, 41);
  doc.setFont('helvetica', 'normal');
  doc.text(model.fechaRecepcion || BLANK_LINE, marginX + 50, 41);

  // Dato 6: transportador (no gestionado → en blanco)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('DATOS DEL TRANSPORTADOR:', marginX + 4, 47.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    blankField('Nombre') +
      '   ' +
      blankField('Carné de identidad') +
      '   ' +
      blankField('Chapa'),
    marginX + 4,
    52,
  );
  doc.text(blankField('Casilla') + '   ' + blankField('Guía aérea'), marginX + 4, 57);

  // ── Dato 7: tabla de productos ──
  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    startY: 62,
    head: [
      [
        'Código',
        'Descripción',
        'U.M.',
        'Cantidad',
        'Precio unitario total',
        'Importe',
        'Saldo en existencia según almacén',
      ],
    ],
    body: model.lineas.map((l) => [
      l.codigo,
      l.descripcion,
      l.unidadMedida,
      l.cantidad,
      l.precioUnitario,
      l.importe,
      l.saldoExistencia,
    ]),
    theme: 'grid',
    styles: {
      font: 'helvetica',
      fontSize: 7.5,
      cellPadding: 1.6,
      textColor: 0,
      // IMPRESIÓN ECONÓMICA: líneas finas y fondo blanco (sin rellenos).
      lineColor: [150, 150, 150],
      lineWidth: 0.15,
      fillColor: [255, 255, 255],
    },
    headStyles: {
      // IMPRESIÓN ECONÓMICA (FASE 5/6 de la misión): cabecera BLANCA con
      // texto negro — antes era una banda negra que consumía tinta.
      fillColor: [255, 255, 255],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      halign: 'center',
      fontSize: 7,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
    },
    alternateRowStyles: {
      // Sin bandas de fondo para alternar filas (ahorro de tinta).
      fillColor: [255, 255, 255],
    },
    rowPageBreak: 'avoid',
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 17, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 27, halign: 'right' },
      6: { cellWidth: 30, halign: 'center' },
    },
    margin: { left: marginX, right: marginX },
  });

  // ── Dato 8: Importe Total del modelo ──
  // Etiqueta + valor como una sola línea alineada a la derecha (evita
  // superposición cuando la etiqueta es larga por el nombre de la moneda).
  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || 62;
  finalY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  for (const total of model.importesTotales) {
    doc.text(`${total.label} ${total.importe}`, pageWidth - marginX, finalY, {
      align: 'right',
    });
    finalY += 5.5;
  }

  // ── Datos 9–12: firmas (espacios en blanco para cumplimentación manual) ──
  if (finalY + 34 > pageHeight - 14) {
    doc.addPage();
    finalY = 16;
  }
  const sigY = finalY + 14;
  doc.setLineWidth(0.2);
  const colWidth = contentWidth / 4;
  const signatures = [
    'Firma del Jefe del Almacén',
    'Firma del Transportador',
    'Firma del empleado que recepciona',
    'Firma del empleado que lo contabiliza y del que lo anota en el Control de Inventario',
  ];
  signatures.forEach((label, i) => {
    const x0 = marginX + i * colWidth + 3;
    const x1 = marginX + (i + 1) * colWidth - 3;
    doc.line(x0, sigY, x1, sigY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.text(label, (x0 + x1) / 2, sigY + 3.5, {
      align: 'center',
      maxWidth: colWidth - 6,
    });
  });

  // ── Nota al pie sobria (identificación normativa y trazabilidad) ──
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(6.5);
  doc.text(
    'Modelo SC-2-04 (Uso obligatorio) — Resolución No. 11/2007, Ministerio de Finanzas y Precios — Gaceta Oficial No. 015 de 2007.',
    marginX,
    pageHeight - 12,
    { maxWidth: contentWidth },
  );
  doc.text(
    `Identificador COSTPRO de la recepción: ${model.identificadorRecepcion}`,
    marginX,
    pageHeight - 8,
    { maxWidth: contentWidth },
  );

  return doc;
}

/** Genera y descarga el SC-2-04 con el nombre de archivo oficial. */
export async function generateSc204Pdf(model: Sc204ModelData): Promise<void> {
  const doc = await renderSc204Pdf(model);
  doc.save(sc204FileName(model.identificadorRecepcion));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: recepción → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-04 de UNA recepción. Solo lectura: no modifica
 * la recepción ni ningún otro registro. Las lecturas respetan RLS y el
 * aislamiento de la tienda activa.
 */
export async function exportSc204ForReceipt(
  receipt: Sc204SourceData['receipt'],
  activeStoreId?: string | null,
): Promise<void> {
  const { entidadNombre, items } = await fetchSc204SourceData(receipt, activeStoreId);
  const model = buildSc204ModelData({
    entidadNombre,
    receipt,
    items,
    emissionDate: new Date(),
  });
  try {
    await generateSc204Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC204_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
