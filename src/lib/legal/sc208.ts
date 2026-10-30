/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-08 «VALE DE ENTREGA O DEVOLUCIÓN»
 * ==========================================================================
 * Generación del modelo oficial SC-2-08 para los Vales de Salida de COSTPRO
 * (Inicio → OPERACIÓN → Almacén → Vales de Salida), conforme a la
 * RESOLUCIÓN No. 11/2007 del Ministerio de Finanzas y Precios (Gaceta Oficial
 * No. 015 Ordinaria de 12 de febrero de 2007, Anexo Único).
 *
 * La Resolución no impone un diseño gráfico: define los DATOS DE USO
 * OBLIGATORIO que el modelo debe contener. Esta implementación los cubre
 * todos (1–11) y deja EN BLANCO para cumplimentación manual aquellos que
 * COSTPRO no gestiona — sin inventar valores, sin «N/A», sin ceros.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)                 ┬ Fuente COSTPRO                    ┬ Tratamiento
 *  │ 1. Fecha de emisión del modelo              │ issue_slips.created_at            │ Automática (dd/mm/aaaa)
 *  │ 2. Nombre y código de la entidad            │ stores.name (tienda activa)       │ Nombre automático; CÓDIGO en blanco
 *  │ 3. Nombre y código del almacén que entrega  │ stores.name (la vista presenta la │ Nombre automático; CÓDIGO en blanco
 *  │    o al que se devuelven los productos      │ tienda activa como «Almacén»)     │
 *  │ 4. Nombre y código del área / centro de     │ issue_slips.notes (concepto) +    │ Concepto y N° de OT automáticos;
 *  │    costo + código de Lote/Orden de          │ production_orders.order_number    │ ÁREA y CENTRO DE COSTO en blanco
 *  │    Producción o de Trabajo                  │                                   │
 *  │ 5. Código, descripción, UM, cantidad,       │ issue_slip_items + products       │ Automáticos (importe = total_cost
 *  │    precio unitario total, importe y saldo   │ (sku, name, unit_of_measure,      │ almacenado por el servidor);
 *  │    en existencia según almacén              │  quantity, unit_cost, total_cost) │ SALDO EN EXISTENCIA en blanco
 *  │ 6. Importe Total del Vale o Devolución      │ issue_slips.total_cost (servidor) │ Automático (CUP)
 *  │ 7. Nombre y firma del que entrega (o recibe │ profiles.full_name (creator)      │ Nombre automático; FIRMA en blanco
 *  │    la devolución) por el almacén            │                                   │
 *  │ 8. Nombre y firma del que recibe (o entrega │ (no gestionado)                   │ Nombre y firma en blanco
 *  │    los productos devueltos)                 │                                   │
 *  │ 9. Firma del que anota en el Control de     │ (no gestionado)                   │ En blanco
 *  │    Inventario                               │                                   │
 *  │ 10. Firma del que contabiliza               │ (no gestionado)                   │ En blanco
 *  │ 11. Número consecutivo del Vale             │ issue_slips.slip_number           │ Automático (VS-NNNNNN-AAAA)
 *
 * Devolución (status='reversed'): el vale devuelto es el caso «Devolución»
 * del modelo. La devolución la registró COSTPRO (voider, fecha y motivo
 * reales) y se imprime en el bloque «DEVOLUCIÓN» del documento. Anulado
 * (status='voided') se imprime con su estado y motivo — el documento existe.
 *
 * Nota (datos 12–27 de la Resolución): los datos adicionales son exclusivos
 * de la ENTREGA DE COMBUSTIBLES en camiones cisternas (chapa, compartimientos,
 * horarios de carga, etc.). COSTPRO no gestiona combustibles, por lo que no
 * se representan (no aplican a este documento).
 *
 * Reglas de datos:
 *  - Importe de línea = total_cost ALMACENADO (calculado por el servidor con
 *    products.cost_average en el momento de la operación). Nunca se recalcula.
 *  - Moneda: COSTPRO no registra moneda en issue_slips (costos en CUP por
 *    convención del sistema, igual que el resto del almacén).
 *  - El PDF se genera SOLO LECTURA: no muta el vale, el inventario ni ningún
 *    registro. Las lecturas usan el cliente Supabase del usuario (RLS activa)
 *    y siempre en el contexto de la tienda activa — sin cruce entre tiendas.
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
// Tipos de datos (espejo del esquema real issue_slips / issue_slip_items)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc208SourceItem {
  quantity: number;
  unit_cost: number;
  total_cost: number;
  products?: {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
  } | null;
}

export interface Sc208SourceData {
  vale: {
    id: string;
    slip_number: string;
    status: 'completed' | 'voided' | 'reversed';
    notes: string | null;
    total_cost: number;
    created_at: string;
    voided_at: string | null;
    void_reason: string | null;
    items?: Sc208SourceItem[];
    creator?: { full_name: string } | null;
    voider?: { full_name: string } | null;
    production_orders?: { order_number: string; order_type: string } | null;
  };
  /** Nombre de la entidad/almacén (tienda activa bajo RLS). */
  entidadNombre: string;
}

/**
 * Estructura del modelo SC-2-08. Los campos no gestionados por COSTPRO son
 * cadenas vacías: se representan en el PDF como espacios para cumplimentar
 * a mano (nunca «N/A», ceros ni guiones).
 */
export interface Sc208ModelData {
  fechaEmision: string;
  entidadNombre: string;
  entidadCodigo: string; // no gestionado → ''
  almacenNombre: string;
  almacenCodigo: string; // no gestionado → ''
  concepto: string; // notes (real; puede ser '')
  areaDestino: string; // no gestionado → ''
  centroCosto: string; // no gestionado → ''
  ordenProduccion: string; // N° OT real o ''
  lineas: Array<{
    codigo: string;
    descripcion: string;
    unidadMedida: string;
    cantidad: string;
    precioUnitario: string;
    importe: string;
    /** Dato 5: saldo en existencia — no gestionado por línea → ''. */
    saldoExistencia: string;
  }>;
  importeTotal: string;
  entregadoPor: string; // nombre real (creator) o ''
  estado: string; // Completado / Anulado / Devuelto
  devolucion: {
    fecha: string;
    responsable: string;
    motivo: string;
  } | null;
  numeroConsecutivo: string;
  identificadorVale: string;
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

export function buildSc208ModelData(source: Sc208SourceData): Sc208ModelData {
  const { vale, entidadNombre } = source;
  const lineas = (vale.items || []).map((item) => ({
    codigo: item.products?.sku || '',
    descripcion: item.products?.name || '',
    unidadMedida: item.products?.unit_of_measure || '',
    cantidad: formatRes11Quantity(item.quantity),
    precioUnitario: formatRes11Money(item.unit_cost),
    // Importe almacenado por el servidor (no se recalcula).
    importe: formatRes11Money(item.total_cost),
    saldoExistencia: '',
  }));

  // Dato 6: Importe Total del Vale — el almacenado por el servidor.
  // (costos en CUP: convención del sistema para el almacén)
  const importeTotal = formatRes11Money(vale.total_cost);

  const esReversado = vale.status === 'reversed';
  return {
    fechaEmision: formatDateRes11(vale.created_at),
    entidadNombre: entidadNombre || '',
    entidadCodigo: '',
    almacenNombre: entidadNombre || '',
    almacenCodigo: '',
    concepto: vale.notes || '',
    areaDestino: '',
    centroCosto: '',
    ordenProduccion: vale.production_orders?.order_number
      ? `${vale.production_orders.order_number} (${vale.production_orders.order_type})`
      : '',
    lineas,
    importeTotal,
    entregadoPor: vale.creator?.full_name || '',
    estado: estadoDocumentoLabel(vale.status),
    devolucion: esReversado
      ? {
          fecha: formatDateRes11(vale.voided_at),
          responsable: vale.voider?.full_name || '',
          motivo: vale.void_reason || '',
        }
      : null,
    numeroConsecutivo: vale.slip_number || '',
    identificadorVale: vale.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (número real del vale). */
export function sc208FileName(vale: Pick<Sc208SourceData['vale'], 'slip_number' | 'id'>): string {
  return res11FileName('SC-2-08', 'Vale_de_Salida', vale.slip_number || vale.id?.split('-')[0] || '');
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Completa las líneas del vale (con producto) si el documento de la vista no
 * las trae. Lectura con el cliente Supabase autenticado (RLS activa): el
 * usuario solo puede leer los vales de su tienda. No modifica ningún registro.
 */
export async function fetchSc208SourceData(
  vale: Sc208SourceData['vale'],
  activeStoreId?: string | null,
): Promise<Sc208SourceData> {
  let items = vale.items;
  if (!items || items.length === 0) {
    const { data, error } = await supabase
      .from('issue_slip_items')
      .select('quantity, unit_cost, total_cost, products(name, sku, unit_of_measure)')
      .eq('slip_id', vale.id)
      .order('created_at', { ascending: true });
    if (error) {
      logger.warn('DATABASE', 'SC208_ITEMS_READ_FAILED', { data: error });
    } else {
      items = (data as unknown as Sc208SourceItem[]) || [];
    }
  }

  let entidadNombre = '';
  const storeId = activeStoreId || null;
  if (storeId) {
    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('name')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) {
      logger.warn('DATABASE', 'SC208_STORE_NAME_READ_FAILED', { data: storeError });
    } else {
      entidadNombre = (storeRow as { name?: string | null } | null)?.name || '';
    }
  }

  return { vale: { ...vale, items }, entidadNombre };
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSc208Pdf(model: Sc208ModelData) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 12;

  // ── Encabezado del modelo ──
  let y = drawRes11Header(doc, {
    modelo: 'SC-2-08',
    titulo: 'VALE DE ENTREGA O DEVOLUCIÓN',
    lineaDerecha: `Fecha de emisión: ${model.fechaEmision || RES11_BLANK_LINE}`,
  });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  // Dato 11: número consecutivo (slip_number real)
  doc.setFont('helvetica', 'bold');
  doc.text('No. Consecutivo:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.numeroConsecutivo || RES11_BLANK_LINE, marginX + 38, y);
  // Dato 2/3: entidad y almacén
  doc.setFont('helvetica', 'bold');
  doc.text('ENTIDAD:', marginX + 100, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadNombre || RES11_BLANK_LINE, marginX + 122, y, { maxWidth: 70 });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('ALMACÉN QUE ENTREGA:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenNombre || RES11_BLANK_LINE, marginX + 46, y, { maxWidth: 60 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenCodigo || RES11_BLANK_LINE, marginX + 126, y);

  y += 6;
  // Dato 4: área / centro de costo / orden (concepto real + blancos)
  doc.setFont('helvetica', 'bold');
  doc.text('ÁREA / CENTRO DE COSTO DESTINO:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.areaDestino || RES11_BLANK_LINE, marginX + 62, y, { maxWidth: 45 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código Lote/Orden:', marginX + 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.ordenProduccion || RES11_BLANK_LINE, marginX + 145, y, { maxWidth: 50 });

  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('CONCEPTO:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.concepto || RES11_BLANK_LINE, marginX + 26, y, { maxWidth: 170 });

  // ── Dato 5: tabla de productos ──
  y += 5;
  await drawRes11Table(doc, {
    startY: y,
    head: [
      'Código',
      'Descripción',
      'U.M.',
      'Cantidad despachada o devuelta',
      'Precio unitario total',
      'Importe',
      'Saldo en existencia según almacén',
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
    columnStyles: {
      0: { cellWidth: 24, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 24, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
      6: { cellWidth: 26, halign: 'center' },
    },
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 6;

  // ── Dato 6: Importe Total del Vale ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  doc.text(`Importe Total del Vale (CUP): ${model.importeTotal || RES11_BLANK_LINE}`, pageWidth - marginX, finalY, {
    align: 'right',
  });

  // Estado documental (dato real de COSTPRO, anotación sobria)
  if (model.estado && model.estado !== 'Completado') {
    finalY += 5.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`ESTADO DEL DOCUMENTO EN COSTPRO: ${model.estado}`, pageWidth - marginX, finalY, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
  }

  // ── Devolución (vale devuelto → caso «Devolución» del modelo) ──
  if (model.devolucion) {
    finalY += 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('DEVOLUCIÓN AL ALMACÉN (registrada en COSTPRO):', marginX, finalY);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    finalY += 5;
    doc.text(
      `Fecha: ${model.devolucion.fecha || RES11_BLANK_LINE}    Responsable: ${
        model.devolucion.responsable || RES11_BLANK_LINE
      }`,
      marginX,
      finalY,
    );
    if (model.devolucion.motivo) {
      finalY += 4.5;
      doc.text(`Motivo: ${model.devolucion.motivo}`, marginX, finalY, { maxWidth: pageWidth - marginX * 2 });
    }
  }

  // ── Datos 7–10: firmas ──
  finalY += 8;
  drawRes11Signatures(
    doc,
    [
      model.entregadoPor
        ? `Entrega por el almacén — ${model.entregadoPor}`
        : 'Entrega por el almacén (nombre y firma)',
      'Recibe (nombre y firma)',
      'Anota en el Control de Inventario',
      'Contabiliza',
    ],
    finalY,
    4,
  );

  // ── Pie normativo ──
  drawRes11Footer(
    doc,
    `Identificador COSTPRO del vale: ${model.identificadorVale}${model.entidadNombre ? ` — Almacén: ${model.entidadNombre}` : ''}`,
  );

  return doc;
}

/** Genera y descarga el SC-2-08 con el nombre de archivo oficial. */
export async function generateSc208Pdf(model: Sc208ModelData): Promise<void> {
  const doc = await renderSc208Pdf(model);
  doc.save(sc208FileName({ slip_number: model.numeroConsecutivo, id: model.identificadorVale }));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: vale → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-08 de UN vale de salida. Solo lectura: no modifica
 * el vale ni ningún otro registro. Las lecturas respetan RLS y el aislamiento
 * de la tienda activa.
 */
export async function exportSc208ForVale(
  vale: Sc208SourceData['vale'],
  activeStoreId?: string | null,
): Promise<void> {
  const source = await fetchSc208SourceData(vale, activeStoreId);
  const model = buildSc208ModelData(source);
  try {
    await generateSc208Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC208_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
