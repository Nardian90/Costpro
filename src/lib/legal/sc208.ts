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
 *  │    en existencia según almacén              │  quantity, unit_cost, total_cost) │ SALDO = submayor real (misión 2026-11-23)
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
 *
 * MISIÓN CP-WH-EXIT-VOUCHER-PDF-VALUATION-001 (2026-11-20) — DOS MODALIDADES:
 *  La exportación admite el control «Incluir valores en el PDF»:
 *   - VALORIZADO (default, comportamiento vigente): conserva la matriz
 *     normativa completa — precio unitario (costo promedio almacenado),
 *     importe por línea e Importe Total del Vale (CUP).
 *   - SIN VALORAR (solo físico): elimina COMPLETAMENTE las columnas
 *     económicas («Precio unitario total», «Importe»), el importe total y
 *     toda moneda/importe del documento. No se oculta visualmente: los datos
 *     económicos NO llegan al constructor del PDF (fetchSc208SourceData no
 *     los selecciona ni los transmite) — el documento físico queda realmente
 *     desprovisto de importes. Ambos formatos conservan la identidad
 *     documental (consecutivo, fecha, almacén, concepto, OT, cantidades,
 *     firmas, estado y devolución).
 */

import { format } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { createPDFDocument } from '@/lib/export/lazy-pdf';
import { resolveScLogoDataUrl } from './sc-logo';
import { logger } from '@/lib/logger';
import {
  drawRes11Header,
  drawRes11Table,
  drawRes11SignatureFooter,
  drawRes11Footer,
  formatRes11Money,
  formatRes11Quantity,
  formatRes11Saldo,
  RES11_BLANK_LINE,
  res11FileName,
  estadoDocumentoLabel,
  type Res11TableOptions,
} from './res11-shared';
import {
  calcularSaldoPosterior,
  fetchMovimientosPorProducto,
  movimientosDeValeSalida,
  type SaldoPosteriorMovement,
  type SaldoPosteriorResultado,
} from '@/lib/inventory/saldo-posterior';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de datos (espejo del esquema real issue_slips / issue_slip_items)
// ────────────────────────────────────────────────────────────────────────────

export interface Sc208SourceItem {
  /**
   * Producto de la línea (enlace con el submayor stock_movements). Necesario
   * para derivar el «Saldo en existencia según almacén» — mismo patrón que
   * SC-2-04/SC-2-12 (misión saldo 2026-11-23). Es dato físico: se solicita
   * también en la modalidad SIN VALORAR.
   */
  product_id?: string | null;
  quantity: number;
  /**
   * Costo unitario almacenado por el servidor (products.cost_average en el
   * momento de la operación). Opcional: la modalidad SIN VALORAR no solicita
   * ni transmite datos económicos (misión CP-WH-EXIT-VOUCHER-PDF-VALUATION-001).
   */
  unit_cost?: number | null;
  /** Importe de línea almacenado por el servidor. Opcional en modo físico. */
  total_cost?: number | null;
  products?: {
    name?: string | null;
    sku?: string | null;
    unit_of_measure?: string | null;
  } | null;
}

/**
 * Opciones de exportación del SC-2-08 (misión CP-WH-EXIT-VOUCHER-PDF-VALUATION-001).
 * La elección aplica SOLO a la exportación solicitada: nunca modifica el
 * documento almacenado, sus datos originales, el movimiento de inventario ni
 * su contabilización.
 */
export interface Sc208ExportOptions {
  /**
   * true (default, comportamiento vigente): PDF valorizado con costos,
   * importes y total general. false: PDF exclusivamente físico — sin precios,
   * importes, totales ni moneda.
   */
  incluirValores?: boolean;
}

export interface Sc208SourceData {
  vale: {
    id: string;
    /** Tienda emisora del vale (almacén que entrega — aislamiento por tienda). */
    store_id?: string | null;
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
  /**
   * Saldo en existencia según almacén por producto (mission 2026-11-23):
   * saldo posterior histórico derivado del submayor real stock_movements por
   * (producto, tienda emisora del vale) — misma doctrina de SC-2-04/SC-2-12.
   * Ausencia o limitación → «s/d» en la celda + nota al pie. NUNCA cifra
   * inventada ni inventario de otra tienda.
   */
  saldosPorProducto?: Record<string, SaldoPosteriorResultado>;
  /**
   * CP-DOC-SC-DATA-MAPPING-006: código documental de la tienda emisora
   * (consecutivo persistente stores.store_code; nunca el uuid interno).
   */
  entidadCodigo?: string | null;
  /** logo_url de la tienda emisora (multitienda); null → identificador CP. */
  logoUrl?: string | null;
}

/**
 * Estructura del modelo SC-2-08. Los campos no gestionados por COSTPRO son
 * cadenas vacías: se representan en el PDF como espacios para cumplimentar
 * a mano (nunca «N/A», ceros ni guiones).
 */
export interface Sc208ModelData {
  /** Logo de la tienda emisora o identificador CP si no tiene logo propio. */
  logoUrl?: string | null;
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
    /** Costo unitario almacenado; '' en la modalidad sin valorar. */
    precioUnitario: string;
    /** Importe de línea almacenado; '' en la modalidad sin valorar. */
    importe: string;
    /**
     * Dato 5: saldo en existencia según almacén — saldo posterior histórico
     * tras contabilizar el vale (submayor real del almacén que entrega);
     * «s/d» cuando el historial no alcanza; '' solo si la línea no tiene
     * producto asociado (cumplimentación manual, como el resto de blancos).
     */
    saldoExistencia: string;
  }>;
  /** Importe Total del Vale (CUP); '' en la modalidad sin valorar. */
  importeTotal: string;
  /**
   * Modalidad de la exportación (misión CP-WH-EXIT-VOUCHER-PDF-VALUATION-001):
   * true = valorizado (comportamiento vigente); false = solo físico.
   * El renderer elimina las columnas económicas cuando es false — y los datos
   * económicos nunca llegan al modelo (ver fetchSc208SourceData).
   */
  valorizado: boolean;
  entregadoPor: string; // nombre real (creator) o ''
  estado: string; // Completado / Anulado / Devuelto
  /**
   * Nota al pie sobre la fuente/limitación del saldo (misma regla que
   * SC-2-04/SC-2-12): solo se imprime cuando hay limitación o proyección —
   * documenta la evidencia; nunca se inventa cifra.
   */
  saldoNota?: string;
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

export function buildSc208ModelData(
  source: Sc208SourceData,
  options?: Sc208ExportOptions,
): Sc208ModelData {
  // Default TRUE: conserva el comportamiento vigente (PDF valorizado) — sin
  // sorpresas para el usuario existente.
  const incluirValores = options?.incluirValores !== false;
  const { vale, entidadNombre } = source;
  // CP-DOC-SC-DATA-MAPPING-006: código documental de la tienda emisora.
  // El almacén que entrega/recibe se identifica con la tienda emisora
  // (misma regla que el nombre: el vale se emite desde el almacén de la
  // tienda activa — COSTPRO no gestiona almacenes con código independiente).
  const codigoTienda = (source.entidadCodigo || '').trim();
  // ── Dato 5: saldo en existencia según almacén (misión 2026-11-23) ──
  // Derivado del submayor real stock_movements del almacén que entrega
  // (saldosPorProducto, calculado en fetchSc208SourceData). Varias líneas del
  // mismo SKU comparten el saldo del documento (Σ cantidades ya agregadas).
  // Celda vacía ('') SOLO para líneas sin producto asociado — cumplimentación
  // manual, igual que los demás blancos del modelo. Sin producto → sin llave
  // para el ledger → no se inventa cifra.
  const lineas = (vale.items || []).map((item) => ({
    codigo: item.products?.sku || '',
    descripcion: item.products?.name || '',
    unidadMedida: item.products?.unit_of_measure || '',
    cantidad: formatRes11Quantity(item.quantity),
    // Costo unitario ALMACENADO por el servidor (no se recalcula); '' en
    // modo físico (el dato económico ni siquiera se representa).
    precioUnitario: incluirValores ? formatRes11Money(item.unit_cost ?? NaN) : '',
    // Importe almacenado por el servidor (no se recalcula); '' en modo físico.
    importe: incluirValores ? formatRes11Money(item.total_cost ?? NaN) : '',
    // Saldo posterior histórico: cifra real o «s/d» (dato FÍSICO — se muestra
    // también en la modalidad sin valorar, la columna existe en ambas cabeceras).
    saldoExistencia: item.product_id
      ? formatRes11Saldo(source.saldosPorProducto?.[item.product_id])
      : '',
  }));

  // Nota al pie del saldo: documenta la limitación cuando hay «s/d» — misma
  // regla que SC-2-04/SC-2-12; nunca se inventa cifra. (El modelo SC-2-08
  // solo se genera sobre estados con despacho real: no hay proyección.)
  const itemsConProducto = (vale.items || []).filter((i) => i.product_id);
  const conLimitacion = itemsConProducto.some(
    (i) => source.saldosPorProducto?.[i.product_id!]?.fuente === 'limitacion',
  );
  let saldoNota = '';
  if (conLimitacion) {
    saldoNota =
      'Saldo en existencia: «s/d» — el historial de movimientos disponible no permite determinar el saldo de ese producto en el almacén (no se inventa cifra).';
  }

  // Dato 6: Importe Total del Vale — el almacenado por el servidor.
  // (costos en CUP: convención del sistema para el almacén). En modo físico
  // NO se representa ningún importe total.
  const importeTotal = incluirValores ? formatRes11Money(vale.total_cost) : '';

  const esReversado = vale.status === 'reversed';
  return {
    logoUrl: source.logoUrl ?? null,
    fechaEmision: formatDateRes11(vale.created_at),
    entidadNombre: entidadNombre || '',
    entidadCodigo: codigoTienda,
    almacenNombre: entidadNombre || '',
    almacenCodigo: codigoTienda,
    concepto: vale.notes || '',
    areaDestino: '',
    centroCosto: '',
    ordenProduccion: vale.production_orders?.order_number
      ? `${vale.production_orders.order_number} (${vale.production_orders.order_type})`
      : '',
    lineas,
    importeTotal,
    valorizado: incluirValores,
    entregadoPor: vale.creator?.full_name || '',
    estado: estadoDocumentoLabel(vale.status),
    saldoNota: saldoNota || undefined,
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
  options?: Sc208ExportOptions,
): Promise<Sc208SourceData> {
  const incluirValores = options?.incluirValores !== false;
  let items = vale.items;
  if (!items || items.length === 0) {
    // Misión CP-WH-EXIT-VOUCHER-PDF-VALUATION-001: en modo físico la lectura
    // NO solicita columnas económicas a la base de datos (mínimo dato — el PDF
    // físico no puede filtrar costos porque nunca los recibe).
    // Misión saldo 2026-11-23: product_id SIEMPRE se solicita (dato físico —
    // es la llave del submayor para el saldo; el strip económico lo preserva).
    const columnas = incluirValores
      ? 'product_id, quantity, unit_cost, total_cost, products(name, sku, unit_of_measure)'
      : 'product_id, quantity, products(name, sku, unit_of_measure)';
    const { data, error } = await supabase
      .from('issue_slip_items')
      .select(columnas)
      .eq('slip_id', vale.id)
      .order('created_at', { ascending: true });
    if (error) {
      logger.warn('DATABASE', 'SC208_ITEMS_READ_FAILED', { data: error });
    } else {
      items = (data as unknown as Sc208SourceItem[]) || [];
    }
  } else if (!incluirValores) {
    // Defensa en profundidad: el modal ya trae los ítems con costos de la
    // vista (RLS). El PDF físico se construye SIN esos datos económicos —
    // no se ocultan columnas con costos presentes por debajo.
    items = items.map(({ unit_cost: _unitCost, total_cost: _totalCost, ...rest }) => rest);
  }

  // Almacén que entrega: la tienda emisora del vale (fiel a la operación);
  // fallback a la tienda activa solo para vales históricos sin store_id.
  // Paridad con SC-2-04 (receipt.store_id || activeStoreId). El ledger se
  // consulta SIEMPRE por la tienda del vale — jamás de otra tienda.
  const storeId = vale.store_id || activeStoreId || null;

  let entidadNombre = '';
  let entidadCodigo = '';
  let logoUrl: string | null = null;
  if (storeId) {
    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('name, logo_url, store_code')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) {
      logger.warn('DATABASE', 'SC208_STORE_NAME_READ_FAILED', { data: storeError });
    } else {
      const row = storeRow as { name?: string | null; logo_url?: string | null; store_code?: number | string | null } | null;
      entidadNombre = row?.name || '';
      entidadCodigo = row?.store_code === null || row?.store_code === undefined ? '' : String(row.store_code);
      logoUrl = row?.logo_url || null;
    }
  }

  // ── Saldo en existencia según almacén (misión 2026-11-23) ──
  // Saldo posterior histórico por producto, derivado del submayor REAL
  // stock_movements por (producto, tienda emisora) — misma doctrina que
  // SC-2-04/SC-2-12: enlaces documentales propios del vale
  // ('issue_slip_out' / 'production_out' con reference_id = vale.id); las
  // reversiones posteriores no alteran el saldo histórico del documento;
  // vale 'voided' (Anulado desde En Revisión) no generó movimientos y no
  // representa operación de inventario → sin saldo posterior → «s/d».
  // Nota: el modelo oficial solo cubre estados con despacho real — el
  // modal BLOQUEA la exportación de vales 'pending' (guard existente), por
  // lo que aquí no hay rama de proyección.
  // La lectura del saldo NO bloquea el documento: ante error, las líneas
  // quedan «s/d» y la nota al pie documenta la limitación.
  const saldosPorProducto: Record<string, SaldoPosteriorResultado> = {};
  const productIds = Array.from(
    new Set((items || []).map((i) => i.product_id).filter((id): id is string => !!id)),
  );
  if (storeId && productIds.length > 0) {
    try {
      const ledger = await fetchMovimientosPorProducto(supabase, productIds, storeId);
      // Σ cantidades del vale por producto (varias líneas del mismo SKU) —
      // solo informativa para auditoría: el saldo proviene del ledger.
      const deltaPorProducto: Record<string, number> = {};
      for (const it of items || []) {
        if (!it.product_id) continue;
        deltaPorProducto[it.product_id] = (deltaPorProducto[it.product_id] || 0) + (it.quantity || 0);
      }
      for (const pid of productIds) {
        const movs: SaldoPosteriorMovement[] = ledger[pid] || [];
        saldosPorProducto[pid] = calcularSaldoPosterior({
          movimientos: movs,
          movimientosPropios: movimientosDeValeSalida(movs, vale.id),
          deltaDocumento: -(deltaPorProducto[pid] || 0),
          pendienteContabilizar: false,
        });
      }
    } catch (e) {
      logger.warn('DATABASE', 'SC208_SALDO_POSTERIOR_READ_FAILED', { error: e });
    }
  }

  return { vale: { ...vale, items }, entidadNombre, entidadCodigo, logoUrl, saldosPorProducto };
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
  const logo = await resolveScLogoDataUrl(model.logoUrl);
  let y = drawRes11Header(doc, {
    modelo: 'SC-2-08',
    nombreInstitucional: model.entidadNombre,
    logoDataUrl: logo.dataUrl,
    logoSource: logo.source,
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
  // CP-DOC-PDF-UX-004: etiqueta completa — nunca «Código:» genérico.
  doc.text('Código del almacén que entrega:', marginX + 110, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.almacenCodigo || RES11_BLANK_LINE, marginX + 162, y);

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
  // Misión CP-WH-EXIT-VOUCHER-PDF-VALUATION-001: en modo físico las columnas
  // económicas («Precio unitario total» e «Importe») NO EXISTEN en el modelo
  // del documento — no se ocultan visualmente con datos presentes.
  y += 5;
  const cabezas = model.valorizado
    ? [
        'Código',
        'Descripción',
        'U.M.',
        'Cantidad despachada o devuelta',
        'Precio unitario total',
        'Importe',
        'Saldo en existencia según almacén',
      ]
    : [
        'Código',
        'Descripción',
        'U.M.',
        'Cantidad despachada o devuelta',
        'Saldo en existencia según almacén',
      ];
  const cuerpo = model.lineas.map((l) =>
    model.valorizado
      ? [l.codigo, l.descripcion, l.unidadMedida, l.cantidad, l.precioUnitario, l.importe, l.saldoExistencia]
      : [l.codigo, l.descripcion, l.unidadMedida, l.cantidad, l.saldoExistencia],
  );
  const estilosColumna: Res11TableOptions['columnStyles'] = model.valorizado
    ? {
        0: { cellWidth: 24, halign: 'center' as const },
        1: { cellWidth: 'auto' as const },
        2: { cellWidth: 14, halign: 'center' as const },
        3: { cellWidth: 24, halign: 'right' as const },
        4: { cellWidth: 22, halign: 'right' as const },
        5: { cellWidth: 22, halign: 'right' as const },
        6: { cellWidth: 26, halign: 'center' as const },
      }
    : {
        0: { cellWidth: 24, halign: 'center' as const },
        1: { cellWidth: 'auto' as const },
        2: { cellWidth: 14, halign: 'center' as const },
        3: { cellWidth: 24, halign: 'right' as const },
        4: { cellWidth: 30, halign: 'center' as const },
      };
  await drawRes11Table(doc, {
    startY: y,
    head: cabezas,
    body: cuerpo,
    columnStyles: estilosColumna,
    marginX,
  });

  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || y;
  finalY += 6;

  if (model.valorizado) {
    // ── Dato 6: Importe Total del Vale ──
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(0, 0, 0);
    doc.text(`Importe Total del Vale (CUP): ${model.importeTotal || RES11_BLANK_LINE}`, pageWidth - marginX, finalY, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  } else {
    // Modalidad sin valorar: nota documental sobria — ningún importe, moneda
    // ni espacio de total económico en el documento.
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text('Documento emitido sin valoración económica (información física).', pageWidth - marginX, finalY, {
      align: 'right',
    });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }

  // ── Nota del saldo (misión 2026-11-23): documenta fuente/limitación ──
  // Solo se imprime cuando hay «s/d» o proyección — misma regla que
  // SC-2-04/SC-2-12. Nunca sustituye a la cifra: el dato va en la tabla.
  if (model.saldoNota) {
    finalY += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 0, 0);
    doc.text(model.saldoNota, marginX, finalY, { maxWidth: pageWidth - marginX * 2 });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
  }

  // Estado documental (dato real de COSTPRO, anotación sobria)
  if (model.estado && model.estado !== 'Completado') {
    finalY += 5.5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.text(`ESTADO DEL DOCUMENTO EN ADNEGOCIO: ${model.estado}`, pageWidth - marginX, finalY, {
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
    doc.text('DEVOLUCIÓN AL ALMACÉN (registrada en ADNEGOCIO):', marginX, finalY);
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

  // ── Datos 7–10: firmas — pie unificado (referencia de diseño 2026-11-09) ──
  // Cargos centrados en MAYÚSCULAS debajo de la línea; el nombre dinámico
  // de quien entrega se consigna ENCIMA de su línea. Sin marcos.
  drawRes11SignatureFooter(
    doc,
    {
      signatures: [
        {
          role: 'Entrega por el almacén (nombre y firma)',
          name: model.entregadoPor || undefined,
        },
        { role: 'Recibe (nombre y firma)' },
        { role: 'Anota en el Control de Inventario' },
        { role: 'Contabiliza' },
      ],
      columns: 4,
    },
    finalY,
  );

  // ── Pie normativo ──
  drawRes11Footer(
    doc,
    `Identificador ADNegocio del vale: ${model.identificadorVale}${model.entidadNombre ? ` — Almacén: ${model.entidadNombre}` : ''}`,
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
  options?: Sc208ExportOptions,
): Promise<void> {
  const source = await fetchSc208SourceData(vale, activeStoreId, options);
  const model = buildSc208ModelData(source, options);
  try {
    await generateSc208Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC208_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
