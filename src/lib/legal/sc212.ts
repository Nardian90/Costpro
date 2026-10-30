/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-12 «FACTURA»
 * ======================================================
 * Generación del modelo oficial SC-2-12 para las ventas de COSTPRO
 * (Inicio → OPERACIÓN → Ventas → Historial de Ventas → detalle), conforme a
 * la RESOLUCIÓN No. 11/2007 del Ministerio de Finanzas y Precios (Gaceta
 * Oficial No. 015 Ordinaria de 12 de febrero de 2007, Anexo Único).
 *
 * La Resolución no impone un diseño gráfico: define los DATOS DE USO
 * OBLIGATORIO que el modelo debe contener. Esta implementación los cubre
 * todos (1–12) y deja EN BLANCO para cumplimentación manual aquellos que
 * COSTPRO no gestiona — sin inventar valores, sin «N/A», sin ceros.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)                 ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Fecha de emisión del modelo              │ transactions.completed_at          │ Automática (dd/mm/aaaa; fallback
 *  │                                             │ (fallback created_at)              │ created_at)
 *  │ 2. Nombre, dirección, código del proveedor, │ stores.name (tienda vendedora);    │ Nombre automático; DIRECCIÓN, CÓDIGO,
 *  │    cuenta/sucursal bancaria y NIT           │ resto no gestionado                │ CUENTA, SUCURSAL y NIT en blanco
 *  │ 3. Nombre, dirección y código del comprador │ transactions.customer_name;        │ Nombre automático (si existe);
 *  │                                             │ dirección y código no gestionados  │ DIRECCIÓN y CÓDIGO en blanco
 *  │ 4. Espacio para especificar la operación    │ la transacción del Historial de    │ «Venta» (naturaleza real del
 *  │                                             │ Ventas es una venta                │ documento); estado anotado si no
 *  │                                             │                                    │ está completada
 *  │ 5. Datos del transportista                  │ (no gestionado)                    │ En blanco
 *  │ 6. Código, descripción, UM, cantidad,       │ transaction_items + products       │ Automáticos (UM desde products);
 *  │    precio unitario total, importe y saldo   │ (sku, name, unit_of_measure,       │ importe = cantidad × precio a la
 *  │    en existencia según almacén              │  quantity, price_at_sale,          │ venta (misma base del modal);
 *  │                                             │  price_currency)                   │ SALDO EN EXISTENCIA en blanco
 *  │ 7. Total de la Factura                      │ transactions.total_amount          │ Automático (almacenado; moneda de
 *  │                                             │ + sale_currency                    │ la venta)
 *  │ 8. Nombre y firma del que entrega + fecha   │ vendedor (profiles.full_name si es │ Nombre real si es legible; FIRMA en
 *  │                                             │ legible)                           │ blanco
 *  │ 9. Nombre y firma del que recibe + fecha    │ (no gestionado)                    │ En blanco
 *  │ 10. Nombre y firma del transportador        │ (no gestionado)                    │ En blanco
 *  │ 11. Firma del que contabiliza y anota en el │ (no gestionado)                    │ En blanco
 *  │     control de Inventario                   │                                    │
 *  │ 12. Número consecutivo del modelo           │ transactions.invoice_number        │ Automático (en blanco si la venta
 *  │                                             │                                    │ no tiene factura asociada)
 *
 * Reglas de datos:
 *  - Importe de línea = quantity × price_at_sale (misma base de cálculo del
 *    modal de detalle de la venta). Sin redondeos ni transformaciones.
 *  - Moneda: la de cada línea (price_currency) y la del total
 *    (sale_currency, convención CUP si falta). Nunca se mezclan monedas.
 *  - El PDF se genera SOLO LECTURA: no muta la venta ni ningún registro.
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
// Tipos de datos (espejo del esquema real transactions / transaction_items)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc212SourceItem {
  quantity: number;
  price_at_sale: number;
  price_currency?: string | null;
  products?: {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
  } | null;
}

export interface Sc212SourceData {
  transaction: {
    id: string;
    status: string;
    total_amount: number;
    subtotal?: number | null;
    discount_value?: number | null;
    sale_currency?: string | null;
    customer_name?: string | null;
    invoice_number?: string | null;
    completed_at?: string | null;
    created_at: string;
    seller_id?: string | null;
    store_id?: string | null;
  };
  items: Sc212SourceItem[];
  /** Nombre de la entidad vendedora (tienda activa bajo RLS). */
  entidadNombre: string;
  /** Nombre real del vendedor (si es legible bajo RLS). */
  vendedorNombre?: string | null;
}

export interface Sc212ModelData {
  fechaEmision: string;
  proveedorNombre: string;
  proveedorDireccion: string; // no gestionado → ''
  proveedorCodigo: string; // no gestionado → ''
  proveedorCuentaBancaria: string; // no gestionado → ''
  proveedorSucursalBancaria: string; // no gestionado → ''
  proveedorNIT: string; // no gestionado → ''
  compradorNombre: string;
  compradorDireccion: string; // no gestionado → ''
  compradorCodigo: string; // no gestionado → ''
  tipoOperacion: string;
  transportadorNombre: string; // no gestionado → ''
  transportadorCarne: string; // no gestionado → ''
  transportadorChapa: string; // no gestionado → ''
  lineas: Array<{
    codigo: string;
    descripcion: string;
    unidadMedida: string;
    cantidad: string;
    precioUnitario: string;
    importe: string;
    saldoExistencia: string; // no gestionado → ''
  }>;
  importesTotales: Array<{ label: string; importe: string }>;
  entregaNombre: string;
  estado: string;
  numeroConsecutivo: string;
  identificadorVenta: string;
}

const DEFAULT_CURRENCY = 'CUP';

function formatDateRes11(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return format(d, 'dd/MM/yyyy');
}

function lineCurrency(item: Sc212SourceItem): string {
  return item.price_currency || DEFAULT_CURRENCY;
}

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

export function buildSc212ModelData(source: Sc212SourceData): Sc212ModelData {
  const { transaction } = source;
  const lineas = (source.items || []).map((item) => {
    const importe = (Number(item.quantity) || 0) * (Number(item.price_at_sale) || 0);
    const moneda = lineCurrency(item);
    return {
      codigo: item.products?.sku || '',
      descripcion: item.products?.name || '',
      unidadMedida: item.products?.unit_of_measure || '',
      cantidad: formatRes11Quantity(item.quantity),
      precioUnitario: `${formatRes11Money(item.price_at_sale)} ${moneda}`.trim(),
      importe: `${formatRes11Money(importe)} ${moneda}`.trim(),
      saldoExistencia: '',
    };
  });

  // Dato 7: Total de la Factura — el almacenado por el servidor, en la
  // moneda de la venta (nunca se recalcula ni se mezclan monedas).
  const monedaTotal = transaction.sale_currency || DEFAULT_CURRENCY;
  const importesTotales = [
    {
      label: 'Total de la Factura:',
      importe: `${formatRes11Money(transaction.total_amount)} ${monedaTotal}`.trim(),
    },
  ];

  return {
    fechaEmision: formatDateRes11(transaction.completed_at || transaction.created_at),
    proveedorNombre: source.entidadNombre || '',
    proveedorDireccion: '',
    proveedorCodigo: '',
    proveedorCuentaBancaria: '',
    proveedorSucursalBancaria: '',
    proveedorNIT: '',
    compradorNombre: transaction.customer_name || '',
    compradorDireccion: '',
    compradorCodigo: '',
    tipoOperacion: 'Venta',
    transportadorNombre: '',
    transportadorCarne: '',
    transportadorChapa: '',
    lineas,
    importesTotales,
    entregaNombre: source.vendedorNombre || '',
    estado: estadoDocumentoLabel(transaction.status),
    numeroConsecutivo: transaction.invoice_number || '',
    identificadorVenta: transaction.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (número real de factura o identificador). */
export function sc212FileName(transaction: Pick<Sc212SourceData['transaction'], 'invoice_number' | 'id'>): string {
  return res11FileName(
    'SC-2-12',
    'Factura',
    transaction.invoice_number || transaction.id?.split('-')[0] || '',
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lee las líneas de la venta con unidad de medida (fuente real: products),
 * el nombre de la tienda vendedora y del vendedor. Lecturas con el cliente
 * Supabase autenticado (RLS activa). No modifica ningún registro.
 */
export async function fetchSc212SourceData(
  transaction: Sc212SourceData['transaction'],
  activeStoreId?: string | null,
): Promise<Sc212SourceData> {
  const result: Sc212SourceData = {
    transaction,
    items: [],
    entidadNombre: '',
    vendedorNombre: '',
  };

  const [itemsRes, storeRes, sellerRes] = await Promise.all([
    supabase
      .from('transaction_items')
      .select('quantity, price_at_sale, price_currency, products(name, sku, unit_of_measure)')
      .eq('transaction_id', transaction.id)
      .order('created_at', { ascending: true }),
    (transaction.store_id || activeStoreId)
      ? supabase
          .from('stores')
          .select('name')
          .eq('id', (transaction.store_id || activeStoreId) as string)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.seller_id
      ? supabase.from('profiles').select('full_name').eq('id', transaction.seller_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsRes.error) {
    logger.warn('DATABASE', 'SC212_ITEMS_READ_FAILED', { data: itemsRes.error });
  } else {
    result.items = (itemsRes.data as unknown as Sc212SourceItem[]) || [];
  }
  if (!storeRes.error && storeRes.data) {
    result.entidadNombre = (storeRes.data as { name?: string | null } | null)?.name || '';
  }
  if (!sellerRes.error && sellerRes.data) {
    result.vendedorNombre = (sellerRes.data as { full_name?: string | null } | null)?.full_name || '';
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSc212Pdf(model: Sc212ModelData) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // ── Encabezado del modelo ──
  let y = drawRes11Header(doc, {
    modelo: 'SC-2-12',
    titulo: 'FACTURA',
    lineaDerecha: `Fecha de emisión: ${model.fechaEmision || RES11_BLANK_LINE}`,
  });

  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  // Dato 12: número consecutivo
  doc.setFont('helvetica', 'bold');
  doc.text('No. Consecutivo:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.numeroConsecutivo || RES11_BLANK_LINE, marginX + 38, y);

  y += 6;
  // Dato 2: proveedor (entidad vendedora)
  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR (entidad vendedora) — Nombre:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorNombre || RES11_BLANK_LINE, marginX + 74, y, { maxWidth: 60 });
  doc.setFont('helvetica', 'bold');
  doc.text('NIT:', marginX + 140, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorNIT || RES11_BLANK_LINE, marginX + 150, y, { maxWidth: 45 });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorDireccion || RES11_BLANK_LINE, marginX + 26, y, { maxWidth: 48 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 80, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorCodigo || RES11_BLANK_LINE, marginX + 96, y);
  doc.setFont('helvetica', 'bold');
  doc.text('Cuenta bancaria:', marginX + 116, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorCuentaBancaria || '__________', marginX + 150, y, { maxWidth: 24 });

  y += 5;
  doc.setFont('helvetica', 'bold');
  doc.text('Sucursal bancaria:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorSucursalBancaria || '__________', marginX + 38, y, { maxWidth: 30 });

  y += 6;
  // Dato 3: comprador
  doc.setFont('helvetica', 'bold');
  doc.text('COMPRADOR — Nombre:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.compradorNombre || RES11_BLANK_LINE, marginX + 44, y, { maxWidth: 80 });
  doc.setFont('helvetica', 'bold');
  doc.text('Dirección:', marginX + 130, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.compradorDireccion || RES11_BLANK_LINE, marginX + 148, y, { maxWidth: 60 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 4, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.text(model.compradorCodigo || RES11_BLANK_LINE, marginX + 20, y + 5);

  y += 11;
  // Dato 4: operación
  doc.setFont('helvetica', 'bold');
  doc.text('OPERACIÓN:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.tipoOperacion || RES11_BLANK_LINE, marginX + 26, y);
  if (model.estado && model.estado !== 'Completado') {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`ESTADO DE LA VENTA EN COSTPRO: ${model.estado}`, pageWidth - marginX, y, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }

  y += 5;
  // Dato 5: transportador (no gestionado → en blanco)
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DEL TRANSPORTISTA:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(
    `Nombre: ${RES11_BLANK_LINE}   Carné de identidad: ${RES11_BLANK_LINE}   Chapa del vehículo: ${RES11_BLANK_LINE}   Carta de Porte No.: ${RES11_BLANK_LINE}`,
    marginX + 4,
    y + 4.5,
  );
  doc.setFontSize(9);

  // ── Dato 6: tabla de productos ──
  y += 9;
  await drawRes11Table(doc, {
    startY: y,
    head: [
      'Código',
      'Descripción',
      'U.M.',
      'Cantidad',
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
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 17, halign: 'right' },
      4: { cellWidth: 27, halign: 'right' },
      5: { cellWidth: 27, halign: 'right' },
      6: { cellWidth: 30, halign: 'center' },
    },
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 6;

  // ── Dato 7: Total de la Factura ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(0, 0, 0);
  for (const total of model.importesTotales) {
    doc.text(`${total.label} ${total.importe}`, pageWidth - marginX, finalY, { align: 'right' });
    finalY += 5.5;
  }

  // ── Datos 8–11: firmas ──
  finalY += 6;
  drawRes11Signatures(
    doc,
    [
      model.entregaNombre
        ? `Entrega los productos — ${model.entregaNombre}`
        : 'Entrega los productos (nombre y firma)',
      'Recibe los productos (nombre y firma)',
      'Transportador (nombre y firma)',
      'Contabiliza y anota en el control de Inventario',
    ],
    finalY,
    4,
  );

  // ── Pie normativo ──
  drawRes11Footer(doc, `Identificador COSTPRO de la venta: ${model.identificadorVenta}`);

  return doc;
}

/** Genera y descarga el SC-2-12 con el nombre de archivo oficial. */
export async function generateSc212Pdf(model: Sc212ModelData): Promise<void> {
  const doc = await renderSc212Pdf(model);
  doc.save(sc212FileName({ invoice_number: model.numeroConsecutivo, id: model.identificadorVenta }));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: venta → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-12 de UNA venta. Solo lectura: no modifica la
 * venta ni ningún registro. Las lecturas respetan RLS y el aislamiento de
 * la tienda activa.
 */
export async function exportSc212ForTransaction(
  transaction: Sc212SourceData['transaction'],
  activeStoreId?: string | null,
): Promise<void> {
  const source = await fetchSc212SourceData(transaction, activeStoreId);
  const model = buildSc212ModelData(source);
  try {
    await generateSc212Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC212_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
