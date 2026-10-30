/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-09 «TRANSFERENCIA ENTRE ALMACENES»
 * ===========================================================================
 * Generación del modelo oficial SC-2-09 para las transferencias de stock de
 * COSTPRO (Inicio → OPERACIÓN → Logística → Transferencia Stock), conforme a
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
 *  │ 1. Fecha de emisión del modelo              │ transfers.created_at               │ Automática (dd/mm/aaaa)
 *  │ 2. Nombre y código de la entidad            │ stores.name (tienda origen)        │ Nombre automático; CÓDIGO en blanco
 *  │ 3. Nombre, código y dirección del almacén   │ stores.name (origen, join real);   │ Nombre automático; CÓDIGO y
 *  │    que entrega                              │ código y dirección no gestionados  │ DIRECCIÓN en blanco
 *  │ 4. Nombre, código y dirección del almacén   │ stores.name (destino, join real);  │ Nombre automático; CÓDIGO y
 *  │    receptor                                 │ código y dirección no gestionados  │ DIRECCIÓN en blanco
 *  │ 5. Código, descripción, UM, cantidad        │ transfer_items + products          │ Remitida = quantity (real). Recibida =
 *  │    remitida/recibida, costo unitario,       │ (sku, name, unit_of_measure,       │ quantity cuando la transferencia está
 *  │    importes remitidos/recibidos, saldos     │  quantity, unit_cost)              │ CONFIRMADA (la confirmación traslada
 *  │    de existencia e importes totales de      │                                    │ exactamente esa cantidad — dato real);
 *  │    entrega y recepción                      │                                    │ en blanco si está pendiente.
 *  │                                             │                                    │ Importes = quantity × unit_cost.
 *  │                                             │                                    │ Saldos de existencia: EN BLANCO.
 *  │ 6. Nombre y firma del que entrega + fecha   │ creator.full_name (join real) +    │ Nombre y fecha automáticos; FIRMA en blanco
 *  │    del traslado                             │ transfers.created_at               │
 *  │ 7. Nombre y firma del que recibe + fecha    │ confirmer.full_name (si CONFIRMADA │ Nombre y fecha automáticos; FIRMA en
 *  │    de la recepción                          │ y legible) + confirmed_at          │ blanco; en blanco si no hay recepción
 *  │ 8. Firma del que autoriza la Transferencia  │ (no gestionado)                    │ En blanco
 *  │ 9. Firma del que actualiza el control de    │ (no gestionado)                    │ En blanco (entrega y recepción)
 *  │    Inventario en ambos almacenes            │                                    │
 *  │ 10. Firma del que contabiliza (ambos)       │ (no gestionado)                    │ En blanco (entrega y recepción)
 *  │ 11. Número consecutivo del modelo           │ (no gestionado)                    │ En blanco
 *
 * Estados: PENDIENTE (solo remitida), CANCELADA y REVERSADA (con fecha y
 * motivo reales de COSTPRO en un bloque sobrio). La anotación del estado es
 * un dato real del sistema, nunca una reinvención del documento.
 *
 * Reglas de datos:
 *  - Importe de línea = quantity × unit_cost (misma fórmula que aplica la
 *    RPC create_transfer al calcular transfers.total_cost). Sin redondeos.
 *  - Los costos de transferencia se registran en CUP (convención del sistema).
 *  - El PDF se genera SOLO LECTURA: no muta la transferencia ni ningún
 *    registro. Las lecturas usan el cliente Supabase del usuario (RLS activa).
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
  formatRes11Money,
  formatRes11Quantity,
  RES11_BLANK_LINE,
  res11FileName,
  estadoDocumentoLabel,
} from './res11-shared';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de datos (espejo del esquema real transfers / transfer_items)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc209SourceItem {
  quantity: number;
  unit_cost: number;
  products?: {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
  } | null;
}

export interface Sc209SourceData {
  transfer: {
    id: string;
    /** UUIDs reales de la fila transfers (necesarios para completar nombres). */
    origin_store_id?: string | null;
    destination_store_id?: string | null;
    confirmed_by?: string | null;
    status: 'PENDIENTE' | 'CONFIRMADA' | 'CANCELADA' | 'REVERSADA';
    notes: string | null;
    created_at: string;
    confirmed_at?: string | null;
    reversed_at?: string | null;
    reversal_reason?: string | null;
    origin_store?: { name?: string | null } | null;
    destination_store?: { name?: string | null } | null;
    creator?: { full_name: string } | null;
    confirmer?: { full_name: string } | null;
    items?: Sc209SourceItem[];
  };
}

export interface Sc209ModelData {
  fechaEmision: string;
  entidadNombre: string;
  entidadCodigo: string; // no gestionado → ''
  almacenEntregaNombre: string;
  almacenEntregaCodigo: string; // no gestionado → ''
  almacenEntregaDireccion: string; // no gestionado → ''
  almacenReceptorNombre: string;
  almacenReceptorCodigo: string; // no gestionado → ''
  almacenReceptorDireccion: string; // no gestionado → ''
  lineas: Array<{
    codigo: string;
    descripcion: string;
    unidadMedida: string;
    cantidadRemitida: string;
    cantidadRecibida: string;
    costoUnitario: string;
    importeRemitido: string;
    importeRecibido: string;
    saldoEntrega: string; // no gestionado → ''
    saldoRecepcion: string; // no gestionado → ''
  }>;
  importeTotalEntrega: string;
  importeTotalRecepcion: string;
  entregaNombre: string;
  entregaFecha: string;
  recepcionNombre: string;
  recepcionFecha: string;
  estado: string;
  reversal: { fecha: string; motivo: string } | null;
  numeroConsecutivo: string; // no gestionado → ''
  identificadorTransferencia: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

function formatDateRes11(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd/MM/yyyy');
}

export function buildSc209ModelData(source: Sc209SourceData): Sc209ModelData {
  const { transfer } = source;
  const confirmada = transfer.status === 'CONFIRMADA';

  let totalEntrega = 0;
  const lineas = (transfer.items || []).map((item) => {
    const cantidad = Number(item.quantity) || 0;
    const costo = Number(item.unit_cost) || 0;
    const importe = cantidad * costo;
    totalEntrega += importe;
    return {
      codigo: item.products?.sku || '',
      descripcion: item.products?.name || '',
      unidadMedida: item.products?.unit_of_measure || '',
      cantidadRemitida: formatRes11Quantity(cantidad),
      // La confirmación traslada exactamente la cantidad remitida (dato real
      // del sistema); si no hay recepción, se deja en blanco.
      cantidadRecibida: confirmada ? formatRes11Quantity(cantidad) : '',
      costoUnitario: formatRes11Money(costo),
      importeRemitido: formatRes11Money(importe),
      importeRecibido: confirmada ? formatRes11Money(importe) : '',
      saldoEntrega: '',
      saldoRecepcion: '',
    };
  });

  return {
    fechaEmision: formatDateRes11(transfer.created_at),
    entidadNombre: transfer.origin_store?.name || '',
    entidadCodigo: '',
    almacenEntregaNombre: transfer.origin_store?.name || '',
    almacenEntregaCodigo: '',
    almacenEntregaDireccion: '',
    almacenReceptorNombre: transfer.destination_store?.name || '',
    almacenReceptorCodigo: '',
    almacenReceptorDireccion: '',
    lineas,
    importeTotalEntrega: formatRes11Money(totalEntrega),
    importeTotalRecepcion: confirmada ? formatRes11Money(totalEntrega) : '',
    entregaNombre: transfer.creator?.full_name || '',
    entregaFecha: formatDateRes11(transfer.created_at),
    recepcionNombre: transfer.confirmer?.full_name || '',
    recepcionFecha: formatDateRes11(transfer.confirmed_at),
    estado: estadoDocumentoLabel(transfer.status),
    reversal:
      transfer.status === 'REVERSADA'
        ? {
            fecha: formatDateRes11(transfer.reversed_at),
            motivo: transfer.reversal_reason || '',
          }
        : null,
    numeroConsecutivo: '',
    identificadorTransferencia: transfer.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (identificador real de la transferencia). */
export function sc209FileName(transferId: string): string {
  return res11FileName('SC-2-09', 'Transferencia_Almacenes', transferId?.split('-')[0] || '');
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Completa los datos que el modal de detalle puede no traer: items con
 * producto, nombre del confirmer y nombres de los almacenes. Lecturas con el
 * cliente Supabase autenticado (RLS activa). No modifica ningún registro.
 */
export async function fetchSc209SourceData(transfer: Sc209SourceData['transfer']): Promise<Sc209SourceData> {
  const enriched: Sc209SourceData['transfer'] = { ...transfer };

  const [itemsRes, originRes, destRes, confirmerRes] = await Promise.all([
    transfer.items && transfer.items.length > 0
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from('transfer_items')
          .select('quantity, unit_cost, products(name, sku, unit_of_measure)')
          .eq('transfer_id', transfer.id)
          .order('created_at', { ascending: true }),
    transfer.origin_store?.name
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from('stores')
          .select('name')
          .eq('id', transfer.origin_store_id ?? '')
          .maybeSingle(),
    transfer.destination_store?.name
      ? Promise.resolve({ data: null, error: null })
      : supabase
          .from('stores')
          .select('name')
          .eq('id', transfer.destination_store_id ?? '')
          .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name')
      .eq('id', transfer.confirmed_by || '00000000-0000-0000-0000-000000000000')
      .maybeSingle(),
  ]);

  if (itemsRes.error) {
    logger.warn('DATABASE', 'SC209_ITEMS_READ_FAILED', { data: itemsRes.error });
  } else if (itemsRes.data) {
    enriched.items = (itemsRes.data as unknown as Sc209SourceItem[]) || [];
  }
  if (!originRes.error && originRes.data) {
    enriched.origin_store = { name: (originRes.data as { name?: string | null } | null)?.name || '' };
  }
  if (!destRes.error && destRes.data) {
    enriched.destination_store = { name: (destRes.data as { name?: string | null } | null)?.name || '' };
  }
  if (!confirmerRes.error && confirmerRes.data) {
    enriched.confirmer = {
      full_name: (confirmerRes.data as { full_name?: string | null } | null)?.full_name || '',
    };
  }

  return { transfer: enriched };
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSc209Pdf(model: Sc209ModelData) {
  // El modelo exige una tabla amplia (remitida/recibida, importes y saldos
  // de ambos almacenes) → orientación horizontal.
  const doc = await createPDFDocument('l', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // ── Encabezado del modelo ──
  let y = drawRes11Header(doc, {
    modelo: 'SC-2-09',
    titulo: 'TRANSFERENCIA ENTRE ALMACENES',
    lineaDerecha: `Fecha de emisión: ${model.fechaEmision || RES11_BLANK_LINE}`,
  });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  // Dato 2: entidad
  doc.setFont('helvetica', 'bold');
  doc.text('ENTIDAD:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadNombre || RES11_BLANK_LINE, marginX + 22, y, { maxWidth: 110 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 140, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadCodigo || RES11_BLANK_LINE, marginX + 156, y);

  y += 6;
  // Datos 3–4: almacenes
  doc.setFont('helvetica', 'bold');
  doc.text('ALMACÉN QUE ENTREGA:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenEntregaNombre || RES11_BLANK_LINE, marginX + 44, y, { maxWidth: 70 });
  doc.setFont('helvetica', 'bold');
  doc.text('ALMACÉN RECEPTOR:', marginX + 125, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenReceptorNombre || RES11_BLANK_LINE, marginX + 161, y, { maxWidth: 70 });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección entrega:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenEntregaDireccion || RES11_BLANK_LINE, marginX + 34, y, { maxWidth: 80 });
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección recepción:', marginX + 125, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenReceptorDireccion || RES11_BLANK_LINE, marginX + 155, y, { maxWidth: 80 });

  // ── Dato 5: tabla de productos ──
  y += 5;
  await drawRes11Table(doc, {
    startY: y,
    head: [
      'Código',
      'Descripción',
      'U.M.',
      'Cantidad remitida',
      'Cantidad recibida',
      'Costo unitario total',
      'Importe remitido',
      'Importe recibido',
      'Saldo según alm. entrega',
      'Saldo según alm. receptor',
    ],
    body: model.lineas.map((l) => [
      l.codigo,
      l.descripcion,
      l.unidadMedida,
      l.cantidadRemitida,
      l.cantidadRecibida,
      l.costoUnitario,
      l.importeRemitido,
      l.importeRecibido,
      l.saldoEntrega,
      l.saldoRecepcion,
    ]),
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 20, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 22, halign: 'right' },
      7: { cellWidth: 22, halign: 'right' },
      8: { cellWidth: 22, halign: 'center' },
      9: { cellWidth: 22, halign: 'center' },
    },
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 6;

  // ── Dato 5: importes totales de entrega y recepción ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Importe total de la entrega (CUP): ${model.importeTotalEntrega || RES11_BLANK_LINE}        Importe total de la recepción (CUP): ${model.importeTotalRecepcion || RES11_BLANK_LINE}`,
    marginX,
    finalY,
  );

  // Estado documental + reversión (datos reales, anotación sobria)
  if (model.estado && model.estado !== 'Confirmada') {
    finalY += 5.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`ESTADO DE LA TRANSFERENCIA EN COSTPRO: ${model.estado}`, marginX, finalY);
  }
  if (model.reversal) {
    finalY += 5;
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Reversada el ${model.reversal.fecha || RES11_BLANK_LINE}${model.reversal.motivo ? ` — Motivo: ${model.reversal.motivo}` : ''}`,
      marginX,
      finalY,
      { maxWidth: pageWidth - marginX * 2 },
    );
  }
  if (model.fechaEmision || model.entregaFecha) {
    finalY += model.reversal ? 5 : 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Fecha del traslado: ${model.entregaFecha || RES11_BLANK_LINE}`, marginX, finalY);
  }

  // ── Datos 6–10: firmas ──
  finalY += 10;
  finalY = drawRes11Signatures(
    doc,
    [
      model.entregaNombre ? `Entrega los productos — ${model.entregaNombre}` : 'Entrega los productos (nombre y firma)',
      model.recepcionNombre ? `Recibe los productos — ${model.recepcionNombre}` : 'Recibe los productos (nombre y firma)',
      'Autoriza la Transferencia',
      'Actualiza el control de Inventario (almacén que entrega)',
      'Actualiza el control de Inventario (almacén que recibe)',
      'Contabiliza (almacén que entrega)',
      'Contabiliza (almacén que recibe)',
      'No. Consecutivo del modelo: ____________',
    ],
    finalY,
    4,
  );

  // ── Pie normativo ──
  drawRes11Footer(doc, `Identificador COSTPRO de la transferencia: ${model.identificadorTransferencia}`);

  return doc;
}

/** Genera y descarga el SC-2-09 con el nombre de archivo oficial. */
export async function generateSc209Pdf(model: Sc209ModelData): Promise<void> {
  const doc = await renderSc209Pdf(model);
  doc.save(sc209FileName(model.identificadorTransferencia));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: transferencia → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-09 de UNA transferencia. Solo lectura: no
 * modifica la transferencia ni ningún registro. Las lecturas respetan RLS.
 */
export async function exportSc209ForTransfer(transfer: Sc209SourceData['transfer']): Promise<void> {
  const source = await fetchSc209SourceData(transfer);
  const model = buildSc209ModelData(source);
  try {
    await generateSc209Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC209_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
