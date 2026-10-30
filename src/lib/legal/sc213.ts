/**
 * MISIÓN RESOLUCIÓN 11 — EXPORTACIÓN SC-2-13 «SUBMAYOR DE INVENTARIO»
 * =====================================================================
 * Generación del modelo oficial SC-2-13 para el Submayor de un producto de
 * COSTPRO (Kardex: Inventario → botón «Kardex» / Historial de Stock),
 * conforme a la RESOLUCIÓN No. 11/2007 del Ministerio de Finanzas y Precios
 * (Gaceta Oficial No. 015 Ordinaria de 12 de febrero de 2007, Anexo Único).
 *
 * La Resolución no impone un diseño gráfico: define los DATOS DE USO
 * OBLIGATORIO que el modelo debe contener. Esta implementación los cubre
 * todos (1–13) y deja EN BLANCO para cumplimentación manual aquellos que
 * COSTPRO no gestiona — sin inventar valores, sin «N/A», sin ceros.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)                 ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Nombre y código de la entidad            │ stores.name (tienda activa)        │ Nombre automático; CÓDIGO en blanco
 *  │ 2. Nombre y código del almacén              │ stores.name (la vista presenta la  │ Nombre automático; CÓDIGO en blanco
 *  │                                             │ tienda activa como almacén)        │
 *  │ 3. Descripción del producto                 │ products.name                      │ Automático
 *  │ 4. Código de inventario del producto        │ products.sku                       │ Automático
 *  │ 5. Unidad de medida operativa               │ products.unit_of_measure           │ Automático
 *  │ 6. Ubicación: sección, estante y casilla    │ (no gestionado)                    │ En blanco
 *  │ 7. Cuenta, subcuenta y análisis contable    │ (no gestionado)                    │ En blanco
 *  │ 8. Fecha de la operación y N° del documento │ stock_movements.created_at +       │ Automáticos
 *  │    que origina el movimiento                │ stock_movements.reference_doc      │
 *  │ 9. Entradas: unidades físicas e importes    │ quantity_change > 0 (UF real);     │ UF automáticas; IMPORTES ME/MN
 *  │    en ME y MN de cada producto              │ importes por movimiento            │ EN BLANCO (no gestionados)
 *  │ 10. Salidas: unidades físicas e importes    │ quantity_change < 0 (UF real)      │ UF automáticas; IMPORTES en blanco
 *  │ 11. Existencia: unidades físicas e importes │ balance_after (saldo real del      │ UF automáticas; IMPORTES en blanco
 *  │                                             │ servidor tras cada movimiento)     │
 *  │ 12. Precio a Costo Promedio en ME y MN      │ products.cost_average (MN/CUP);    │ MN automático; ME en blanco
 *  │                                             │ ME no gestionada                   │
 *  │ 13. Firma del dependiente del almacén       │ (no gestionado)                    │ En blanco
 *
 * Nota (dato 14 de la Resolución): el detalle de mediciones es exclusivo de
 * los COMBUSTIBLES (turno, medición total, medición de agua, firmas por
 * medición). COSTPRO no gestiona combustibles, por lo que no se representa.
 *
 * Reglas de datos:
 *  - El PDF cubre la HISTORIA COMPLETA de movimientos del producto en la
 *    tienda activa (misma tabla que la vista: stock_movements bajo RLS),
 *    con tope de 10.000 movimientos — igual techo que useProductKardex.
 *    Si se trunca, se imprime una nota sobria en el documento.
 *  - Salidas = |quantity_change| cuando es negativo (nunca se altera el
 *    signo almacenado ni se reinterpreta el tipo de movimiento).
 *  - Saldo por movimiento = balance_after almacenado por el servidor
 *    (fallback: saldo corrido derivado cronológicamente, misma regla que
 *    useProductKardex).
 *  - Importes por movimiento: COSTPRO no registra la valoración MN/ME de
 *    cada movimiento → columnas EN BLANCO (no se aplica el costo promedio
 *    actual a movimientos históricos: sería un valor inventado).
 *  - El PDF se genera SOLO LECTURA: no muta el producto, el inventario ni
 *    ningún registro.
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
  res11FileName,
} from './res11-shared';
import { obtenerEtiquetaMovimiento } from '@/lib/inventory/movementPresentation';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de datos (espejo del esquema real stock_movements / products)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc213SourceMovement {
  id: string;
  created_at: string;
  movement_type: string;
  quantity_change: number;
  balance_after: number | null;
  reference_doc?: string | null;
}

export interface Sc213SourceData {
  producto: {
    id: string;
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
    cost_average?: number | null;
    cost_price?: number | null;
  };
  /** Nombre de la entidad/almacén (tienda activa bajo RLS). */
  entidadNombre: string;
  movimientos: Sc213SourceMovement[];
  /** true si la lectura alcanzó el tope de 10.000 movimientos. */
  truncado?: boolean;
}

export interface Sc213ModelData {
  entidadNombre: string;
  entidadCodigo: string; // no gestionado → ''
  almacenNombre: string;
  almacenCodigo: string; // no gestionado → ''
  productoDescripcion: string;
  productoCodigo: string;
  unidadMedida: string;
  ubicacionSeccion: string; // no gestionado → ''
  ubicacionEstante: string; // no gestionado → ''
  ubicacionCasilla: string; // no gestionado → ''
  cuentaContable: string; // no gestionado → ''
  lineas: Array<{
    fecha: string;
    documento: string;
    movimiento: string;
    entradaUF: string;
    entradaImporteME: string; // no gestionado → ''
    entradaImporteMN: string; // no gestionado → ''
    salidaUF: string;
    salidaImporteME: string; // no gestionado → ''
    salidaImporteMN: string; // no gestionado → ''
    existenciaUF: string;
    existenciaImporteME: string; // no gestionado → ''
    existenciaImporteMN: string; // no gestionado → ''
  }>;
  resumen: { saldoInicial: string; entradas: string; salidas: string; saldoFinal: string };
  precioCostoPromedioMN: string;
  precioCostoPromedioME: string; // no gestionado → ''
  valorExistenciaFinalMN: string;
  truncado: boolean;
  identificadorProducto: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

const LIMITE_MOVIMIENTOS = 10000;

export function buildSc213ModelData(source: Sc213SourceData): Sc213ModelData {
  // Movimientos en orden cronológico (el saldo corre de menor a mayor fecha).
  const movs = [...(source.movimientos || [])].sort((a, b) => {
    const da = new Date(a.created_at).getTime() || 0;
    const db = new Date(b.created_at).getTime() || 0;
    if (da !== db) return da - db;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let saldoCorrido = 0;
  let entradas = 0;
  let salidas = 0;
  const lineas = movs.map((m) => {
    const qc = Number(m.quantity_change) || 0;
    // Saldo real almacenado por el servidor; fallback derivado cronológico
    // (misma regla que useProductKardex.derivarSaldosCronologicos).
    saldoCorrido = m.balance_after != null ? Number(m.balance_after) : saldoCorrido + qc;
    if (qc > 0) entradas += qc;
    if (qc < 0) salidas += Math.abs(qc);
    return {
      fecha: format(new Date(m.created_at), 'dd/MM/yyyy'),
      documento: m.reference_doc || '',
      movimiento: obtenerEtiquetaMovimiento(m.movement_type),
      entradaUF: qc > 0 ? formatRes11Quantity(qc) : '',
      entradaImporteME: '', // no gestionado por movimiento
      entradaImporteMN: '', // no gestionado por movimiento
      salidaUF: qc < 0 ? formatRes11Quantity(Math.abs(qc)) : '',
      salidaImporteME: '', // no gestionado por movimiento
      salidaImporteMN: '', // no gestionado por movimiento
      existenciaUF: formatRes11Quantity(saldoCorrido),
      existenciaImporteME: '', // no gestionado por movimiento
      existenciaImporteMN: '', // no gestionado por movimiento
    };
  });

  // Dato 12: Precio a Costo Promedio (MN = CUP, convención del almacén).
  const costoPromedio = source.producto.cost_average ?? source.producto.cost_price ?? null;
  const saldoFinal = lineas.length > 0 ? saldoCorrido : 0;

  return {
    entidadNombre: source.entidadNombre || '',
    entidadCodigo: '',
    almacenNombre: source.entidadNombre || '',
    almacenCodigo: '',
    productoDescripcion: source.producto.name || '',
    productoCodigo: source.producto.sku || '',
    unidadMedida: source.producto.unit_of_measure || '',
    ubicacionSeccion: '',
    ubicacionEstante: '',
    ubicacionCasilla: '',
    cuentaContable: '',
    lineas,
    resumen: {
      saldoInicial: formatRes11Quantity(0),
      entradas: formatRes11Quantity(entradas),
      salidas: formatRes11Quantity(salidas),
      saldoFinal: formatRes11Quantity(saldoFinal),
    },
    precioCostoPromedioMN: costoPromedio != null ? formatRes11Money(costoPromedio) : '',
    precioCostoPromedioME: '',
    valorExistenciaFinalMN:
      costoPromedio != null ? formatRes11Money(saldoFinal * costoPromedio) : '',
    truncado: Boolean(source.truncado),
    identificadorProducto: source.producto.sku || source.producto.id?.split('-')[0] || '',
  };
}

/** Nombre del archivo generado (código real del producto). */
export function sc213FileName(producto: Sc213SourceData['producto']): string {
  return res11FileName('SC-2-13', 'Submayor_Inventario', producto.sku || producto.id?.split('-')[0] || '');
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, contexto de tienda activa)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Lee el producto y TODOS sus movimientos en la tienda activa (misma tabla y
 * misma regla de lectura que la vista Kardex: stock_movements bajo RLS, tope
 * de 10.000). No modifica ningún registro.
 */
export async function fetchSc213SourceData(
  producto: Sc213SourceData['producto'],
  activeStoreId?: string | null,
): Promise<Sc213SourceData> {
  if (!activeStoreId) {
    return { producto, entidadNombre: '', movimientos: [], truncado: false };
  }

  const [{ data: movs, error }, { data: storeRow, error: storeError }] = await Promise.all([
    supabase
      .from('stock_movements')
      .select('id, created_at, movement_type, quantity_change, balance_after, reference_doc')
      .eq('product_id', producto.id)
      .eq('store_id', activeStoreId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(0, LIMITE_MOVIMIENTOS - 1),
    supabase.from('stores').select('name').eq('id', activeStoreId).maybeSingle(),
  ]);

  if (error) {
    logger.warn('DATABASE', 'SC213_MOVEMENTS_READ_FAILED', { data: error });
  }
  if (storeError) {
    logger.warn('DATABASE', 'SC213_STORE_NAME_READ_FAILED', { data: storeError });
  }

  const lista = (movs as unknown as Sc213SourceMovement[]) || [];
  return {
    producto,
    entidadNombre: (storeRow as { name?: string | null } | null)?.name || '',
    movimientos: lista,
    truncado: lista.length >= LIMITE_MOVIMIENTOS,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

export async function renderSc213Pdf(model: Sc213ModelData) {
  // El modelo exige una tabla amplia (UF + importes ME/MN de entradas,
  // salidas y existencia) → orientación horizontal.
  const doc = await createPDFDocument('l', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;

  // ── Encabezado del modelo ──
  const y = drawRes11Header(doc, {
    modelo: 'SC-2-13',
    titulo: 'SUBMAYOR DE INVENTARIO',
  });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  // Datos 1–2: entidad y almacén
  doc.setFont('helvetica', 'bold');
  doc.text('ENTIDAD:', marginX + 4, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(model.entidadNombre || '_______________', marginX + 22, y + 7, { maxWidth: 80 });
  doc.setFont('helvetica', 'bold');
  doc.text('ALMACÉN:', marginX + 110, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenNombre || '_______________', marginX + 134, y + 7, { maxWidth: 80 });

  // Datos 3–5: producto
  doc.setFont('helvetica', 'bold');
  doc.text('PRODUCTO:', marginX + 4, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(model.productoDescripcion || '_______________', marginX + 26, y + 13, { maxWidth: 95 });
  doc.setFont('helvetica', 'bold');
  doc.text('Código:', marginX + 125, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(model.productoCodigo || '_______________', marginX + 141, y + 13);
  doc.setFont('helvetica', 'bold');
  doc.text('U.M. operativa:', marginX + 185, y + 13);
  doc.setFont('helvetica', 'normal');
  doc.text(model.unidadMedida || '_______________', marginX + 211, y + 13);

  // Datos 6–7: ubicación y cuenta contable (no gestionados → en blanco)
  doc.setFont('helvetica', 'bold');
  doc.text('Ubicación (sección / estante / casilla):', marginX + 4, y + 19);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________   _______________   _______________', marginX + 55, y + 19);
  doc.setFont('helvetica', 'bold');
  doc.text('Cuenta / Subcuenta / Análisis:', marginX + 145, y + 19);
  doc.setFont('helvetica', 'normal');
  doc.text('_______________ / _______________ / _______________', marginX + 183, y + 19);

  // ── Datos 8–11: tabla de movimientos ──
  await drawRes11Table(doc, {
    startY: y + 23,
    head: [
      'Fecha de la operación',
      'N° del documento',
      'Movimiento',
      'Entradas UF',
      'Entradas imp. ME',
      'Entradas imp. MN',
      'Salidas UF',
      'Salidas imp. ME',
      'Salidas imp. MN',
      'Existencia UF',
      'Existencia imp. ME',
      'Existencia imp. MN',
    ],
    body: model.lineas.map((l) => [
      l.fecha,
      l.documento,
      l.movimiento,
      l.entradaUF,
      l.entradaImporteME,
      l.entradaImporteMN,
      l.salidaUF,
      l.salidaImporteME,
      l.salidaImporteMN,
      l.existenciaUF,
      l.existenciaImporteME,
      l.existenciaImporteMN,
    ]),
    columnStyles: {
      0: { cellWidth: 19, halign: 'center' },
      1: { cellWidth: 27, halign: 'left' },
      2: { cellWidth: 26, halign: 'left' },
      3: { cellWidth: 15, halign: 'right' },
      4: { cellWidth: 17, halign: 'right' },
      5: { cellWidth: 17, halign: 'right' },
      6: { cellWidth: 15, halign: 'right' },
      7: { cellWidth: 17, halign: 'right' },
      8: { cellWidth: 17, halign: 'right' },
      9: { cellWidth: 15, halign: 'right' },
      10: { cellWidth: 17, halign: 'right' },
      11: { cellWidth: 17, halign: 'right' },
    },
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y + 23;
  finalY += 6;

  // ── Resumen del submayor (unidades físicas reales) ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(
    `Resumen (unidades): Saldo inicial: ${model.resumen.saldoInicial}   Entradas: ${model.resumen.entradas}   Salidas: ${model.resumen.salidas}   Existencia final: ${model.resumen.saldoFinal} ${model.unidadMedida}`.trim(),
    marginX,
    finalY,
  );

  // ── Dato 12: precio a costo promedio + valoración de la existencia ──
  finalY += 5.5;
  doc.text(
    `Precio a Costo Promedio (MN): ${model.precioCostoPromedioMN || '_______________'}    Precio a Costo Promedio (ME): _______________`,
    marginX,
    finalY,
  );
  if (model.valorExistenciaFinalMN) {
    finalY += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(
      `Valor de la existencia final a costo promedio actual (MN): ${model.valorExistenciaFinalMN}`,
      marginX,
      finalY,
    );
  }

  if (model.truncado) {
    finalY += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.text(
      'Nota: el historial de movimientos fue limitado a los primeros 10.000 registros.',
      marginX,
      finalY,
    );
  }

  // ── Dato 13: firma del dependiente del almacén ──
  finalY += 8;
  drawRes11Signatures(doc, ['Firma del dependiente del almacén'], finalY, 3);

  // ── Pie normativo ──
  drawRes11Footer(
    doc,
    `Producto (COSTPRO): ${model.productoDescripcion || model.identificadorProducto} — Código: ${model.productoCodigo || '—'}`,
  );

  return doc;
}

/** Genera y descarga el SC-2-13 con el nombre de archivo oficial. */
export async function generateSc213Pdf(model: Sc213ModelData): Promise<void> {
  const doc = await renderSc213Pdf(model);
  doc.save(sc213FileName({ id: model.identificadorProducto, sku: model.productoCodigo }));
}

// ────────────────────────────────────────────────────────────────────────────
// Orquestador: producto → datos (RLS) → modelo → PDF
// ────────────────────────────────────────────────────────────────────────────

/**
 * Genera y descarga el SC-2-13 (submayor completo) de UN producto en la
 * tienda activa. Solo lectura: no modifica el producto ni ningún registro.
 * Las lecturas respetan RLS y el aislamiento de la tienda activa.
 */
export async function exportSc213ForProduct(
  producto: Sc213SourceData['producto'],
  activeStoreId?: string | null,
): Promise<void> {
  const source = await fetchSc213SourceData(producto, activeStoreId);
  const model = buildSc213ModelData(source);
  try {
    await generateSc213Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC213_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
