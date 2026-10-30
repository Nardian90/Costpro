/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-16 «AJUSTE DE INVENTARIO»
 * ===================================================================
 * Generación del modelo oficial SC-2-16 para los Ajustes Documentales de
 * COSTPRO (Inicio → OPERACIÓN → Almacén → Ajustes Documentales), conforme a
 * la RESOLUCIÓN No. 11/2007 del Ministerio de Finanzas y Precios (Gaceta
 * Oficial No. 015 Ordinaria de 12 de febrero de 2007, Anexo Único).
 *
 * La Resolución no impone un diseño gráfico: define los DATOS DE USO
 * OBLIGATORIO que el modelo debe contener. Esta implementación los cubre
 * todos (1–11) y deja EN BLANCO para cumplimentación manual aquellos que
 * COSTPRO no gestiona — sin inventar valores, sin «N/A», sin ceros.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)                 ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Nombre y código de la entidad            │ stores.name (tienda activa)        │ Nombre automático; CÓDIGO en blanco
 *  │ 2. Nombre y código del almacén              │ stores.name (la vista presenta la  │ Nombre automático; CÓDIGO en blanco
 *  │                                             │ tienda activa como almacén)        │
 *  │ 3. Fecha de emisión del modelo              │ inventory_adjustments.created_at   │ Automática (dd/mm/aaaa)
 *  │ 4. Concepto de ajuste                       │ inventory_adjustments.reason       │ Etiqueta del concepto (traducción
 *  │                                             │ (enum real) + notes                │ literal del enum) + notas reales
 *  │ 5. Código interno, cuenta/subcuenta/análisis│ inventory_adjustment_items         │ Código interno = sku, descripción =
 *  │    + descripción, UM, cantidad, precio      │ + products (sku, name,             │ nombre, UM desde products; cantidad =
 *  │    unitario o costo real, importe y saldo   │  unit_of_measure, counted/expected │ diferencia contada-esperada (real);
 *  │    en existencia según almacén              │  quantity, difference generada)    │ PRECIO/IMPORTE y SALDO EN BLANCO
 *  │                                             │                                    │ (COSTPRO no almacena el costo del
 *  │                                             │                                    │ ajuste por línea)
 *  │ 6. Total del ajuste                         │ (no gestionado)                    │ En blanco
 *  │ 7. Nombre y firma del Jefe del Almacén      │ (no gestionado)                    │ En blanco
 *  │ 8. Nombre y firma de la persona que realiza │ creator.full_name (join real)      │ Nombre automático; FIRMA en blanco
 *  │    el inventario                            │                                    │
 *  │ 9. Firma del que contabiliza el ajuste      │ (no gestionado)                    │ En blanco
 *  │ 10. Firma del que lo anota en el control de │ (no gestionado)                    │ En blanco
 *  │     Inventario                              │                                    │
 *  │ 11. Número consecutivo del modelo           │ (no gestionado)                    │ En blanco
 *
 * Referencias reales: si el ajuste proviene de un Inventario Físico,
 * se imprime su número y fecha de corte (source_physical_inventory, dato
 * real). Estados (pendiente/confirmada/reversada/anulada) se anotan de
 * forma sobria con sus datos reales de reversión.
 *
 * Reglas de datos:
 *  - Cantidad del ajuste = counted_quantity − expected_quantity (columna
 *    «difference» generada por la BD; misma cifra que muestra la vista).
 *  - Moneda del ajuste: inventory_adjustments.currency (CUP por defecto);
 *    el importe no se imprime porque COSTPRO no almacena el costo por línea.
 *  - El PDF se genera SOLO LECTURA: no muta el ajuste ni el inventario.
 *  - Lecturas con el cliente Supabase del usuario (RLS activa).
 */

import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { logger } from '@/lib/logger';
import {
  drawRes11Header,
  drawRes11Table,
  drawRes11Signatures,
  drawRes11Footer,
  formatRes11Quantity,
  RES11_BLANK_LINE,
  res11FileName,
  estadoDocumentoLabel,
} from './res11-shared';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de datos (espejo del esquema real inventory_adjustments / _items)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc216SourceItem {
  expected_quantity: number;
  counted_quantity: number;
  products?: {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
  } | null;
}

export interface Sc216SourceData {
  adjustment: {
    id: string;
    status: 'pending' | 'confirmed' | 'reversed' | 'voided';
    reason: string;
    notes: string | null;
    created_at: string;
    reversed_at?: string | null;
    reversal_reason?: string | null;
    source_physical_inventory?: { pi_number: string; cutoff_date: string } | null;
    items?: Sc216SourceItem[];
    creator?: { full_name: string } | null;
  };
  /** Nombre de la entidad/almacén (tienda activa bajo RLS). */
  entidadNombre: string;
}

export interface Sc216ModelData {
  entidadNombre: string;
  entidadCodigo: string; // no gestionado → ''
  almacenNombre: string;
  almacenCodigo: string; // no gestionado → ''
  fechaEmision: string;
  conceptoAjuste: string;
  notas: string;
  referenciaInventarioFisico: string;
  lineas: Array<{
    codigoInterno: string;
    cuentaContable: string; // no gestionado → ''
    descripcion: string;
    unidadMedida: string;
    cantidad: string;
    precioUnitario: string; // no gestionado → ''
    importe: string; // no gestionado → ''
    saldoExistencia: string; // no gestionado → ''
  }>;
  totalAjuste: string; // no gestionado → ''
  realizaInventarioNombre: string;
  estado: string;
  reversal: { fecha: string; motivo: string } | null;
  numeroConsecutivo: string; // no gestionado → ''
  identificadorAjuste: string;
}

/** Etiquetas de concepto — traducción literal del enum real de la BD. */
export const SC216_CONCEPTOS: Record<string, string> = {
  STOCKTAKE_SHRINKAGE: 'Faltante según conteo físico (merma)',
  STOCKTAKE_SURPLUS: 'Sobrante según conteo físico',
  DAMAGED_GOODS: 'Productos dañados',
  OTHER: 'Otro',
};

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

function formatDateRes11(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd/MM/yyyy');
}

export function buildSc216ModelData(source: Sc216SourceData): Sc216ModelData {
  const { adjustment, entidadNombre } = source;
  const lineas = (adjustment.items || []).map((item) => ({
    codigoInterno: item.products?.sku || '',
    cuentaContable: '',
    descripcion: item.products?.name || '',
    unidadMedida: item.products?.unit_of_measure || '',
    // Diferencia contada − esperada (columna generada por la BD; la vista
    // presenta esta misma cifra como «Diferencia»).
    cantidad: formatRes11Quantity(
      (Number(item.counted_quantity) || 0) - (Number(item.expected_quantity) || 0),
    ),
    precioUnitario: '',
    importe: '',
    saldoExistencia: '',
  }));

  const pi = adjustment.source_physical_inventory;

  return {
    entidadNombre: entidadNombre || '',
    entidadCodigo: '',
    almacenNombre: entidadNombre || '',
    almacenCodigo: '',
    fechaEmision: formatDateRes11(adjustment.created_at),
    conceptoAjuste: SC216_CONCEPTOS[adjustment.reason] || adjustment.reason || '',
    notas: adjustment.notes || '',
    referenciaInventarioFisico: pi?.pi_number
      ? `Inventario Físico ${pi.pi_number}${pi.cutoff_date ? ` (corte: ${formatDateRes11(pi.cutoff_date)})` : ''}`
      : '',
    lineas,
    totalAjuste: '',
    realizaInventarioNombre: adjustment.creator?.full_name || '',
    estado: estadoDocumentoLabel(adjustment.status),
    reversal:
      adjustment.status === 'reversed'
        ? {
            fecha: formatDateRes11(adjustment.reversed_at),
            motivo: adjustment.reversal_reason || '',
          }
        : null,
    numeroConsecutivo: '',
    identificadorAjuste: adjustment.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (identificador real del ajuste). */
export function sc216FileName(adjustmentId: string): string {
  return res11FileName('SC-2-16', 'Ajuste_Inventario', adjustmentId?.split('-')[0] || '');
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Completa las líneas del ajuste con unidad de medida si la vista no las
 * trae (fuente real: products.unit_of_measure) y el nombre de la tienda.
 * Lecturas con el cliente Supabase autenticado (RLS activa). No modifica
 * ningún registro.
 */
export async function fetchSc216SourceData(
  adjustment: Sc216SourceData['adjustment'],
  activeStoreId?: string | null,
): Promise<Sc216SourceData> {
  const enriched: Sc216SourceData = { adjustment: { ...adjustment }, entidadNombre: '' };

  const [itemsRes, storeRes] = await Promise.all([
    adjustment.items && adjustment.items.length > 0 && adjustment.items[0]?.products?.unit_of_measure != null
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from('inventory_adjustment_items')
          .select('expected_quantity, counted_quantity, products(name, sku, unit_of_measure)')
          .eq('adjustment_id', adjustment.id)
          .order('created_at', { ascending: true }),
    activeStoreId
      ? supabase.from('stores').select('name').eq('id', activeStoreId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsRes.error) {
    logger.warn('DATABASE', 'SC216_ITEMS_READ_FAILED', { data: itemsRes.error });
  } else if (itemsRes.data) {
    enriched.adjustment.items = (itemsRes.data as unknown as Sc216SourceItem[]) || [];
  }
  if (!storeRes.error && storeRes.data) {
    enriched.entidadNombre = (storeRes.data as { name?: string | null } | null)?.name || '';
  }

  return enriched;
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSc216Pdf(model: Sc216ModelData) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // ── Encabezado del modelo ──
  let y = drawRes11Header(doc, {
    modelo: 'SC-2-16',
    titulo: 'AJUSTE DE INVENTARIO',
    lineaDerecha: `Fecha de emisión: ${model.fechaEmision || RES11_BLANK_LINE}`,
  });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  // Datos 1–2: entidad y almacén
  doc.setFont('helvetica', 'bold');
  doc.text('ENTIDAD:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadNombre || RES11_BLANK_LINE, marginX + 22, y, { maxWidth: 70 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 100, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadCodigo || RES11_BLANK_LINE, marginX + 116, y);
  doc.setFont('helvetica', 'bold');
  doc.text('ALMACÉN:', marginX + 140, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenNombre || RES11_BLANK_LINE, marginX + 162, y, { maxWidth: 45 });

  y += 6;
  // Dato 4: concepto de ajuste
  doc.setFont('helvetica', 'bold');
  doc.text('CONCEPTO DE AJUSTE:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.conceptoAjuste || RES11_BLANK_LINE, marginX + 42, y, { maxWidth: 120 });
  if (model.referenciaInventarioFisico) {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text(`Ref.: ${model.referenciaInventarioFisico}`, pageWidth - marginX, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }

  if (model.notas) {
    y += 5;
    doc.setFont('helvetica', 'bold');
    doc.text('NOTAS:', marginX + 4, y);
    doc.setFont('helvetica', 'normal');
    doc.text(model.notas, marginX + 20, y, { maxWidth: pageWidth - marginX * 2 - 20 });
  }

  // ── Dato 5: tabla de productos ──
  y += 5;
  await drawRes11Table(doc, {
    startY: y,
    head: [
      'Código interno',
      'Cuenta / Subcuenta / Análisis',
      'Descripción',
      'U.M.',
      'Cantidad',
      'Precio unitario o costo real',
      'Importe',
      'Saldo en existencia según almacén',
    ],
    body: model.lineas.map((l) => [
      l.codigoInterno,
      l.cuentaContable,
      l.descripcion,
      l.unidadMedida,
      l.cantidad,
      l.precioUnitario,
      l.importe,
      l.saldoExistencia,
    ]),
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 32, halign: 'center' },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 13, halign: 'center' },
      4: { cellWidth: 17, halign: 'right' },
      5: { cellWidth: 24, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 26, halign: 'center' },
    },
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 6;

  // ── Dato 6: Total del ajuste (no gestionado → en blanco) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total del ajuste: ${model.totalAjuste || RES11_BLANK_LINE}`, pageWidth - marginX, finalY, {
    align: 'right',
  });

  // Estado documental + reversión (datos reales, anotación sobria)
  if (model.estado && model.estado !== 'Pendiente') {
    finalY += 5.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`ESTADO DEL AJUSTE EN COSTPRO: ${model.estado}`, pageWidth - marginX, finalY, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }
  if (model.reversal) {
    finalY += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Reversado el ${model.reversal.fecha || RES11_BLANK_LINE}${model.reversal.motivo ? ` — Motivo: ${model.reversal.motivo}` : ''}`,
      marginX,
      finalY,
      { maxWidth: pageWidth - marginX * 2 },
    );
  }

  // ── Datos 7–10: firmas ──
  finalY += 10;
  drawRes11Signatures(
    doc,
    [
      'Jefe del Almacén (nombre y firma)',
      model.realizaInventarioNombre
        ? `Realiza el inventario — ${model.realizaInventarioNombre}`
        : 'Realiza el inventario (nombre y firma)',
      'Contabiliza el ajuste',
      'Anota en el control de Inventario',
    ],
    finalY,
    4,
  );

  // ── Pie normativo ──
  drawRes11Footer(
    doc,
    `Identificador COSTPRO del ajuste: ${model.identificadorAjuste} — No. consecutivo del modelo: ____________`,
  );

  return doc;
}

/** Genera y descarga el SC-2-16 con el nombre de archivo oficial. */
export async function generateSc216Pdf(model: Sc216ModelData): Promise<void> {
  const doc = await renderSc216Pdf(model);
  doc.save(sc216FileName(model.identificadorAjuste));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: ajuste → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-16 de UN ajuste de inventario. Solo lectura: no
 * modifica el ajuste ni ningún registro. Las lecturas respetan RLS y el
 * aislamiento de la tienda activa.
 */
export async function exportSc216ForAdjustment(
  adjustment: Sc216SourceData['adjustment'],
  activeStoreId?: string | null,
): Promise<void> {
  const source = await fetchSc216SourceData(adjustment, activeStoreId);
  const model = buildSc216ModelData(source);
  try {
    await generateSc216Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC216_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
