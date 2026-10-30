/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-01 «SOLICITUD DE COMPRA»
 * ==================================================================
 * Generación del modelo oficial SC-2-01 para las Órdenes de Compra de
 * COSTPRO (Inicio → OPERACIÓN → Logística → Órdenes de Compra), conforme a
 * la RESOLUCIÓN No. 11/2007 del Ministerio de Finanzas y Precios (Gaceta
 * Oficial No. 015 Ordinaria de 12 de febrero de 2007, Anexo Único).
 *
 * La Resolución no impone un diseño gráfico: define los DATOS DE USO
 * OBLIGATORIO que el modelo debe contener. Esta implementación los cubre
 * todos (1–9) y deja EN BLANCO para cumplimentación manual aquellos que
 * COSTPRO no gestiona — sin inventar valores, sin «N/A», sin ceros.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)                 ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Fecha de emisión del modelo              │ purchase_orders.created_at         │ Automática (dd/mm/aaaa)
 *  │ 2. Nombre, código y dirección del proveedor │ purchase_orders.supplier_name      │ Nombre automático; CÓDIGO y DIRECCIÓN en blanco
 *  │ 3. Nombre, código, dirección del solicitante│ stores.name (tienda activa)        │ Nombre automático; CÓDIGO, DIRECCIÓN,
 *  │    + cuenta bancaria y sucursal bancaria    │ (resto no gestionado)              │ CUENTA y SUCURSAL BANCARIA en blanco
 *  │ 4. Vía, fecha y lugar de entrega            │ purchase_orders.expected_date      │ FECHA automática; VÍA y LUGAR en blanco
 *  │ 5. Código, descripción, UM, cantidad,       │ purchase_order_items               │ Automáticos; importe = cantidad
 *  │    precio unitario total e importe          │ (sku, product_name, unit_of_measure│ ordenada × costo unitario (misma
 *  │    de cada producto                         │  quantity_ordered, unit_cost)      │ fórmula que muestra la vista)
 *  │ 6. Total de la solicitud                    │ purchase_orders.total_amount       │ Automático (almacenado por el servidor)
 *  │ 7. Nombre y firma del funcionario autorizado│ creador (profiles.full_name si es  │ Nombre real si es legible; FIRMA en
 *  │    a emitir la Solicitud                    │ legible; si no, en blanco)         │ blanco
 *  │ 8. Firma de la persona que autoriza la venta│ (no gestionado)                    │ En blanco
 *  │    por el proveedor                         │                                    │
 *  │ 9. Número consecutivo del modelo            │ purchase_orders.po_number          │ Automático
 *
 * Reglas de datos:
 *  - Importe de línea = quantity_ordered × unit_cost (misma fórmula que la
 *    columna «Subtotal» del modal de detalle). Sin redondeos.
 *  - Total = purchase_orders.total_amount ALMACENADO (calculado por el
 *    servidor en la RPC de creación). Nunca se recalcula.
 *  - El PDF se genera SOLO LECTURA: no muta la orden ni ningún registro.
 *  - Lecturas con el cliente Supabase del usuario (RLS activa) y siempre en
 *    el contexto de la tienda activa — sin cruce entre tiendas.
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
// Tipos de datos (espejo del esquema real purchase_orders / _items)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc201SourceItem {
  product_name: string;
  sku?: string | null;
  quantity_ordered: number;
  unit_cost: number;
  unit_of_measure: string;
}

export interface Sc201SourceData {
  order: {
    id: string;
    po_number?: string | null;
    supplier_name: string;
    status: string;
    total_amount: number;
    notes?: string | null;
    expected_date?: string | null;
    created_by?: string | null;
    created_at: string;
  };
  items: Sc201SourceItem[];
  /** Nombre de la entidad solicitante (tienda activa bajo RLS). */
  entidadNombre: string;
  /** Nombre real del creador (si es legible bajo RLS). */
  creadorNombre?: string | null;
}

export interface Sc201ModelData {
  fechaEmision: string;
  proveedorNombre: string;
  proveedorCodigo: string; // no gestionado → ''
  proveedorDireccion: string; // no gestionado → ''
  solicitanteNombre: string;
  solicitanteCodigo: string; // no gestionado → ''
  solicitanteDireccion: string; // no gestionado → ''
  solicitanteCuentaBancaria: string; // no gestionado → ''
  solicitanteSucursalBancaria: string; // no gestionado → ''
  viaEntrega: string; // no gestionado → ''
  fechaEntrega: string; // expected_date real o ''
  lugarEntrega: string; // no gestionado → ''
  lineas: Array<{
    codigo: string;
    descripcion: string;
    unidadMedida: string;
    cantidad: string;
    precioUnitario: string;
    importe: string;
  }>;
  totalSolicitud: string;
  emisorNombre: string;
  notas: string;
  estado: string;
  numeroConsecutivo: string;
  identificadorOrden: string;
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

export function buildSc201ModelData(source: Sc201SourceData): Sc201ModelData {
  const { order, items } = source;
  const lineas = (items || []).map((item) => ({
    codigo: item.sku || '',
    descripcion: item.product_name || '',
    unidadMedida: item.unit_of_measure || '',
    cantidad: formatRes11Quantity(item.quantity_ordered),
    precioUnitario: formatRes11Money(item.unit_cost),
    // Importe = cantidad ordenada × costo unitario (misma fórmula de la vista).
    importe: formatRes11Money((Number(item.quantity_ordered) || 0) * (Number(item.unit_cost) || 0)),
  }));

  return {
    fechaEmision: formatDateRes11(order.created_at),
    proveedorNombre: order.supplier_name || '',
    proveedorCodigo: '',
    proveedorDireccion: '',
    solicitanteNombre: source.entidadNombre || '',
    solicitanteCodigo: '',
    solicitanteDireccion: '',
    solicitanteCuentaBancaria: '',
    solicitanteSucursalBancaria: '',
    viaEntrega: '',
    fechaEntrega: formatDateRes11(order.expected_date),
    lugarEntrega: '',
    lineas,
    // Total almacenado por el servidor (nunca se recalcula).
    totalSolicitud: formatRes11Money(order.total_amount),
    emisorNombre: source.creadorNombre || '',
    notas: order.notes || '',
    estado: estadoDocumentoLabel(order.status),
    numeroConsecutivo: order.po_number || '',
    identificadorOrden: order.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (número real de la orden). */
export function sc201FileName(order: Pick<Sc201SourceData['order'], 'po_number' | 'id'>): string {
  return res11FileName('SC-2-01', 'Solicitud_de_Compras', order.po_number || order.id?.split('-')[0] || '');
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Completa las líneas de la orden y el nombre de la entidad/creador si la
 * vista no los trae. Lecturas con el cliente Supabase autenticado (RLS
 * activa). No modifica ningún registro; los fallos de lectura no bloquean
 * el documento (el campo queda en blanco, nunca inventado).
 */
export async function fetchSc201SourceData(
  order: Sc201SourceData['order'],
  activeStoreId?: string | null,
): Promise<Sc201SourceData> {
  const result: Sc201SourceData = {
    order,
    items: [],
    entidadNombre: '',
    creadorNombre: '',
  };

  const [itemsRes, storeRes, creatorRes] = await Promise.all([
    supabase
      .from('purchase_order_items')
      .select('product_name, sku, quantity_ordered, unit_cost, unit_of_measure')
      .eq('po_id', order.id)
      .order('created_at', { ascending: true }),
    activeStoreId
      ? supabase.from('stores').select('name').eq('id', activeStoreId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    order.created_by
      ? supabase.from('profiles').select('full_name').eq('id', order.created_by).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsRes.error) {
    logger.warn('DATABASE', 'SC201_ITEMS_READ_FAILED', { data: itemsRes.error });
  } else {
    result.items = (itemsRes.data as unknown as Sc201SourceItem[]) || [];
  }
  if (!storeRes.error && storeRes.data) {
    result.entidadNombre = (storeRes.data as { name?: string | null } | null)?.name || '';
  }
  if (!creatorRes.error && creatorRes.data) {
    result.creadorNombre = (creatorRes.data as { full_name?: string | null } | null)?.full_name || '';
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSc201Pdf(model: Sc201ModelData) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // ── Encabezado del modelo ──
  let y = drawRes11Header(doc, {
    modelo: 'SC-2-01',
    titulo: 'SOLICITUD DE COMPRA',
    lineaDerecha: `Fecha de emisión: ${model.fechaEmision || RES11_BLANK_LINE}`,
  });

  y += 8;
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  // Dato 9: número consecutivo
  doc.setFont('helvetica', 'bold');
  doc.text('No. Consecutivo:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.numeroConsecutivo || RES11_BLANK_LINE, marginX + 38, y);

  y += 6;
  // Dato 2: proveedor
  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR — Nombre:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorNombre || RES11_BLANK_LINE, marginX + 46, y, { maxWidth: 75 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 125, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorCodigo || RES11_BLANK_LINE, marginX + 141, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección del proveedor:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorDireccion || RES11_BLANK_LINE, marginX + 46, y, { maxWidth: 120 });

  y += 6;
  // Dato 3: solicitante (entidad + datos bancarios en blanco)
  doc.setFont('helvetica', 'bold');
  doc.text('SOLICITANTE — Nombre:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.solicitanteNombre || RES11_BLANK_LINE, marginX + 46, y, { maxWidth: 75 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 125, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.solicitanteCodigo || RES11_BLANK_LINE, marginX + 141, y);

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.solicitanteDireccion || RES11_BLANK_LINE, marginX + 26, y, { maxWidth: 52 });
  doc.setFont('helvetica', 'bold');
  doc.text('Cuenta bancaria:', marginX + 84, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.solicitanteCuentaBancaria || '__________', marginX + 118, y, { maxWidth: 28 });
  doc.setFont('helvetica', 'bold');
  doc.text('Sucursal:', marginX + 152, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.solicitanteSucursalBancaria || '__________', marginX + 170, y, { maxWidth: 22 });

  y += 6;
  // Dato 4: vía, fecha y lugar de entrega
  doc.setFont('helvetica', 'bold');
  doc.text('VÍA DE ENTREGA:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.viaEntrega || RES11_BLANK_LINE, marginX + 36, y, { maxWidth: 40 });
  doc.setFont('helvetica', 'bold');
  doc.text('FECHA DE ENTREGA:', marginX + 82, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.fechaEntrega || RES11_BLANK_LINE, marginX + 118, y);
  doc.setFont('helvetica', 'bold');
  doc.text('LUGAR:', marginX + 150, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.lugarEntrega || RES11_BLANK_LINE, marginX + 166, y, { maxWidth: 28 });

  // ── Dato 5: tabla de productos ──
  y += 5;
  await drawRes11Table(doc, {
    startY: y,
    head: ['Código', 'Descripción', 'U.M.', 'Cantidad', 'Precio unitario total', 'Importe'],
    body: model.lineas.map((l) => [l.codigo, l.descripcion, l.unidadMedida, l.cantidad, l.precioUnitario, l.importe]),
    columnStyles: {
      0: { cellWidth: 26, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 20, halign: 'center' },
      3: { cellWidth: 22, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
      5: { cellWidth: 32, halign: 'right' },
    },
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 6;

  // ── Dato 6: Total de la solicitud ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de la Solicitud (CUP): ${model.totalSolicitud || RES11_BLANK_LINE}`, pageWidth - marginX, finalY, {
    align: 'right',
  });

  // Notas reales de la orden (dato de COSTPRO, no exigido por el modelo)
  if (model.notas) {
    finalY += 5.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`Notas: ${model.notas}`, marginX, finalY, { maxWidth: pageWidth - marginX * 2 });
  }

  // Estado documental (anotación sobria)
  if (model.estado && model.estado !== 'Borrador') {
    finalY += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`ESTADO DE LA ORDEN EN COSTPRO: ${model.estado}`, pageWidth - marginX, finalY, { align: 'right' });
  }

  // ── Datos 7–8: firmas ──
  finalY += 10;
  drawRes11Signatures(
    doc,
    [
      model.emisorNombre
        ? `Funcionario autorizado a emitir — ${model.emisorNombre}`
        : 'Funcionario autorizado a emitir la Solicitud (nombre y firma)',
      'Autoriza la venta por el proveedor (nombre y firma)',
    ],
    finalY,
    2,
  );

  // ── Pie normativo ──
  drawRes11Footer(doc, `Identificador COSTPRO de la orden: ${model.identificadorOrden}`);

  return doc;
}

/** Genera y descarga el SC-2-01 con el nombre de archivo oficial. */
export async function generateSc201Pdf(model: Sc201ModelData): Promise<void> {
  const doc = await renderSc201Pdf(model);
  doc.save(sc201FileName({ po_number: model.numeroConsecutivo, id: model.identificadorOrden }));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: orden → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-01 de UNA orden de compra. Solo lectura: no
 * modifica la orden ni ningún registro. Las lecturas respetan RLS y el
 * aislamiento de la tienda activa.
 */
export async function exportSc201ForOrder(
  order: Sc201SourceData['order'],
  activeStoreId?: string | null,
): Promise<void> {
  const source = await fetchSc201SourceData(order, activeStoreId);
  const model = buildSc201ModelData(source);
  try {
    await generateSc201Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC201_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
