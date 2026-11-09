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
 * Matriz de correspondencia (campos reales de COSTPRO) — actualizada por
 * CP-DOC-SC-DATA-MAPPING-006 (cada campo sale EXCLUSIVAMENTE de su fuente):
 *  ┌ Dato oficial (Res. 11/2007)              ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Nombre y código entidad receptora     │ stores.name + stores.store_code    │ Automáticos (código = consecutivo
 *  │                                          │                                    │ persistente por tenant del trigger
 *  │                                          │                                    │ trg_stores_assign_store_code)
 *  │ 2. Nombre y código almacén receptor      │ Misma entidad receptora            │ Regla funcional del modelo: el
 *  │                                          │ (regla del modelo SC-2-04)         │ almacén receptor se identifica con
 *  │                                          │                                    │ la entidad receptora (nombre+codigo)
 *  │ 3. Fecha de emisión del modelo           │ fecha de generación del PDF        │ Automática (dd/mm/aaaa)
 *  │ 4. Nombre y código del proveedor         │ receipts.supplier + supplier_tax_id│ Código = NIT/CI congelado al recibir
 *  │                                          │ (snapshot; fallback ficha          │ (snapshot cp_clasificador_fase4);
 *  │                                          │ suppliers.tax_id)                  │ sin NIT/CI → línea en blanco
 *  │ 5. Número y nombre doc. que ampara       │ Tipo: «Entrada» (clasificación     │ Número = receipts.document_number
 *  │                                          │ documental de las recepciones)     │ (ENT-NNNNNN-AAAA, real del sistema);
 *  │                                          │                                    │ recepciones históricas sin número →
 *  │                                          │                                    │ línea en blanco. JAMÁS el nombre del
 *  │                                          │                                    │ proveedor ni el uuid interno
 *  │ 6. Transportador (nombre, carné, chapa,  │ receipts no lo gestiona (opcional  │ Dentro del bloque FIRMA DEL
 *  │    casilla o guía aérea)                 │ source.transportador)              │ TRANSPORTADOR (§6 de la misión);
 *  │                                          │                                    │ vacíos con línea de cumplimentación
 *  │ 7. Código, descripción, UM, cantidad,    │ receipt_items + products           │ Automático; SALDO EN EXISTENCIA =
 *  │    precio unitario total, importe y      │ (sku, name, unit_of_measure,       │ saldo posterior histórico del
 *  │    saldo en existencia según almacén     │  quantity, unit_cost, moneda)      │ almacén tras contabilizar la
 *  │                                          │                                    │ recepción (lib/inventory/
 *  │                                          │                                    │ saldo-posterior.ts; ledger real
 *  │                                          │                                    │ stock_movements; proyección si la
 *  │                                          │                                    │ recepción está pendiente; «s/d» +
 *  │                                          │                                    │ nota si el historial es insuficiente)
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
import { resolveScLogoDataUrl } from './sc-logo';
import {
  calcularSaldoPosterior,
  fetchMovimientosPorProducto,
  movimientosDeRecepcion,
  type SaldoPosteriorMovement,
  type SaldoPosteriorResultado,
} from '@/lib/inventory/saldo-posterior';
import {
  RES11_BLANK_LINE,
  drawRes11DataBlock,
  drawRes11Header,
  drawRes11SignatureFooter,
  measureRes11DataBlockHeight,
} from './res11-shared';
import { logger } from '@/lib/logger';

// ────────────────────────────────────────────────────────────────────────────
// Tipos de datos
// ────────────────────────────────────────────────────────────────────────────

/** Línea de producto tal como se lee de la BD (join products incluido). */
export interface Sc204SourceItem {
  /** Producto de la línea (enlace con el ledger de inventario). */
  product_id?: string | null;
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
  /**
   * CP-DOC-SC-DATA-MAPPING-006: código documental de la entidad receptora —
   * consecutivo persistente stores.store_code (NUNCA el uuid interno).
   */
  entidadCodigo?: string | null;
  /** logo_url de la tienda receptora (multitienda); null → identificador CP. */
  logoUrl?: string | null;
  /** Recepción que se formaliza. */
  receipt: Pick<Receipt, 'id' | 'reference_doc' | 'supplier' | 'reception_date' | 'status'> & {
    store_id?: string | null;
    /** Número documental real de la ENTRADA (ENT-NNNNNN-AAAA); '' si histórica. */
    document_number?: string | null;
    /** NIT/CI del proveedor congelado al recibir = «Código del proveedor». */
    supplier_tax_id?: string | null;
  };
  /**
   * Fallback del código de proveedor (NIT/CI de la ficha suppliers) cuando la
   * recepción no trae el snapshot — resuelto en el fetch, nunca en el render.
   */
  proveedorTaxId?: string | null;
  /** Datos del transportador (§6): se dibujan DENTRO de su bloque de firma. */
  transportador?: {
    nombre?: string | null;
    carne?: string | null;
    chapa?: string | null;
    casilla?: string | null;
    guiaAerea?: string | null;
  } | null;
  /** Líneas de la recepción (receipt_items + products). */
  items: Sc204SourceItem[];
  /**
   * Saldo posterior histórico por producto (Σ líneas del mismo SKU agregadas),
   * derivado del ledger real de stock_movements. Opcional: si falta, las
   * líneas quedan con «s/d» (jamás una cifra inventada).
   */
  saldosPorProducto?: Record<string, SaldoPosteriorResultado>;
  /** Fecha de emisión del modelo (momento de generación). */
  emissionDate: Date;
}

/**
 * Estructura del modelo SC-2-04. Los campos no gestionados por COSTPRO son
 * cadenas vacías: se representan en el PDF como espacios para cumplimentar
 * a mano (nunca «N/A», ceros ni guiones).
 */
export interface Sc204ModelData {
  // Marca del documento: logo de la tienda receptora o identificador
  // monocromático CP cuando no tiene logo propio (nunca el logo de la app)
  logoUrl?: string | null;
  // 1. Entidad receptora (nombre + consecutivo persistente store_code)
  entidadNombre: string;
  entidadCodigo: string;
  // 2. Almacén receptor: identificación de la entidad receptora (regla del modelo)
  almacenNombre: string;
  almacenCodigo: string;
  // 3. Fecha de emisión (dd/mm/aaaa)
  fechaEmision: string;
  // 4. Proveedor (código = NIT/CI; blanco si la ficha no tiene)
  proveedorNombre: string;
  proveedorCodigo: string;
  // 5. Documento que ampara: tipo «Entrada» + número real de la entrada
  documentoNombre: string;
  documentoNumero: string;
  // Trazabilidad COSTPRO (dato real de la recepción; complementa el dato 3)
  fechaRecepcion: string;
  // 6. Transportador — datos integrados en su bloque de firma (misión §6)
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
  /**
   * Nota al pie sobre el saldo en existencia ('' si todo se pudo derivar del
   * ledger): documenta limitaciones de historial o la proyección aplicada.
   */
  saldoNota?: string;
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

/**
 * Clasificación documental del documento que ampara la recepción (misión
 * CP-DOC-SC-DATA-MAPPING-006 §5): la entrada de almacén. Constante del
 * dominio — jamás un texto comercial del proveedor.
 */
export const SC204_TIPO_DOC_AMPARA = 'Entrada';

/** Celda «Saldo en existencia» del modelo: cifra del ledger o «s/d» (sin dato). */
export function formatSc204Saldo(saldo: SaldoPosteriorResultado | undefined): string {
  if (!saldo || !Number.isFinite(saldo.saldoPosterior)) return 's/d';
  return formatSc204Quantity(saldo.saldoPosterior);
}

export function buildSc204ModelData(source: Sc204SourceData): Sc204ModelData {
  const lineas = (source.items || []).map((item) => {
    const importe = (item.quantity || 0) * (item.unit_cost || 0);
    const moneda = lineCurrency(item);
    // Dato 7 (saldo en existencia según almacén): saldo posterior histórico
    // tras contabilizar la recepción — derivado del ledger real
    // stock_movements por (producto, almacén). Varias líneas del mismo SKU
    // comparten el saldo del documento (Σ cantidades ya agregadas).
    const saldo = item.product_id ? source.saldosPorProducto?.[item.product_id] : undefined;
    return {
      // Código del producto: SKU gestionado por COSTPRO (blanco si no existe)
      codigo: item.products?.sku || '',
      descripcion: item.products?.name || '',
      unidadMedida: item.products?.unit_of_measure || '',
      cantidad: formatSc204Quantity(item.quantity),
      precioUnitario: `${formatSc204Money(item.unit_cost)} ${moneda}`.trim(),
      importe: `${formatSc204Money(importe)} ${moneda}`.trim(),
      saldoExistencia: formatSc204Saldo(saldo),
    };
  });

  // Nota al pie del saldo: explica la fuente y documenta limitaciones —
  // jamás se inventa una cifra cuando el historial no alcanza.
  const conLimitacion = (source.items || []).some(
    (i) => i.product_id && source.saldosPorProducto?.[i.product_id]?.fuente === 'limitacion',
  );
  const conProyeccion = (source.items || []).some(
    (i) => i.product_id && source.saldosPorProducto?.[i.product_id]?.fuente === 'proyeccion',
  );
  let saldoNota = '';
  if (conLimitacion) {
    saldoNota =
      'Saldo en existencia: «s/d» — el historial de movimientos disponible no permite determinar el saldo de ese producto en el almacén (no se inventa cifra).';
  } else if (conProyeccion) {
    saldoNota =
      'Saldo en existencia: proyección del saldo posterior (recepción pendiente de contabilizar = saldo actual del almacén + cantidad recibida).';
  }

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
    label: `IMPORTE TOTAL DEL MODELO (${moneda}):`,
    importe: `${formatSc204Money(totalsByCurrency.get(moneda) || 0)} ${moneda}`.trim(),
  }));

  return {
    logoUrl: source.logoUrl ?? null,
    // 1. Entidad receptora: nombre + código consecutivo persistente de la
    //    tienda (CP-DOC-SC-DATA-MAPPING-006 §3.1). Nunca el uuid interno.
    entidadNombre: source.entidadNombre || '',
    entidadCodigo: (source.entidadCodigo || '').trim(),
    // 2. Almacén receptor (§3.2): ambos campos toman la identificación de la
    //    entidad receptora — regla funcional del modelo SC-2-04. COSTPRO no
    //    gestiona almacenes con identificación independiente en recepciones.
    almacenNombre: source.entidadNombre || '',
    almacenCodigo: (source.entidadCodigo || '').trim(),
    // 3. Fecha de emisión del modelo
    fechaEmision: formatSc204Date(source.emissionDate),
    // 4. Proveedor: nombre real + código = NIT/CI (snapshot congelado al
    //    recibir; fallback ficha suppliers resuelto en el fetch). Sin NIT/CI
    //    → línea en blanco: no se usa el nombre ni el id interno como código.
    proveedorNombre: source.receipt.supplier || '',
    proveedorCodigo: (source.receipt.supplier_tax_id || source.proveedorTaxId || '').trim(),
    // 5. Documento que ampara la recepción: la clasificación documental de
    //    las recepciones de COSTPRO es la ENTRADA de almacén; el número es el
    //    documental real de la entrada (ENT-NNNNNN-AAAA). Las recepciones
    //    históricas sin número conservan la línea en blanco (misión §5.7).
    //    PROHIBIDO usar el nombre del proveedor ni el uuid interno: el valor
    //    «Almacen Lari» observado en producción era reference_doc mal
    //    capturado (texto libre de factura externa), no un número documental.
    documentoNombre: SC204_TIPO_DOC_AMPARA,
    documentoNumero: (source.receipt.document_number || '').trim(),
    // Trazabilidad: fecha real de la recepción gestionada por COSTPRO
    fechaRecepcion: formatSc204Date(source.receipt.reception_date),
    // 6. Transportador (§6): sus datos viven en su BLOQUE DE FIRMA; la fuente
    //    es la que entrega el caller (COSTPRO no gestiona transportadores en
    //    recepciones → vacíos con línea de cumplimentación, sin inventar).
    transportadorNombre: (source.transportador?.nombre || '').trim(),
    transportadorCarne: (source.transportador?.carne || '').trim(),
    transportadorChapa: (source.transportador?.chapa || '').trim(),
    transportadorCasilla: (source.transportador?.casilla || '').trim(),
    transportadorGuiaAerea: (source.transportador?.guiaAerea || '').trim(),
    lineas,
    importesTotales,
    // 13. Número consecutivo: no gestionado por COSTPRO
    numeroConsecutivo: '',
    identificadorRecepcion: source.receipt.id?.split('-')[0] || '',
    saldoNota,
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
 * del producto), el nombre y logo de la tienda, y el SALDO POSTERIOR
 * histórico por producto derivado del ledger real stock_movements (enlace
 * documental notes=receipt_id; proyección si la recepción está pendiente).
 * Todas las lecturas usan el cliente Supabase autenticado (RLS activa) — el
 * usuario solo puede leer su tienda. No modifica ningún registro.
 */
export async function fetchSc204SourceData(
  receipt: Sc204SourceData['receipt'],
  activeStoreId?: string | null,
): Promise<Pick<Sc204SourceData, 'entidadNombre' | 'entidadCodigo' | 'logoUrl' | 'items' | 'saldosPorProducto' | 'proveedorTaxId'>> {
  const storeId = receipt.store_id || activeStoreId || null;
  const { data: items, error } = await supabase
    .from('receipt_items')
    .select(
      'id, receipt_id, product_id, quantity, unit_cost, moneda_recepcion, products(name, sku, unit_of_measure)',
    )
    .eq('receipt_id', receipt.id)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const sourceItems = (items as unknown as Sc204SourceItem[]) || [];

  let entidadNombre = '';
  let entidadCodigo = '';
  let logoUrl: string | null = null;
  if (storeId) {
    // CP-DOC-SC-DATA-MAPPING-006: store_code = código documental de la
    // entidad receptora (consecutivo persistente por tenant del trigger).
    const { data: storeRow, error: storeError } = await supabase
      .from('stores')
      .select('name, logo_url, store_code')
      .eq('id', storeId)
      .maybeSingle();
    if (storeError) {
      // El nombre de la entidad no bloquea el informe: queda en blanco.
      logger.warn('DATABASE', 'SC204_STORE_NAME_READ_FAILED', { data: storeError });
    } else {
      const row = storeRow as { name?: string | null; logo_url?: string | null; store_code?: number | string | null } | null;
      entidadNombre = row?.name || '';
      entidadCodigo = row?.store_code === null || row?.store_code === undefined ? '' : String(row.store_code);
      logoUrl = row?.logo_url || null;
    }
  }

  // ── Código del proveedor (NIT/CI) — fuente única: la ficha real ──
  // 1º snapshot congelado al recibir (supplier_tax_id, fiel a la operación);
  // 2º ficha suppliers de la tienda cuando la recepción histórica no trae el
  // snapshot (match por nombre; solo si el match es inequívoco). Nunca el
  // nombre del proveedor ni el id interno como código.
  let proveedorTaxId = (receipt.supplier_tax_id || '').trim();
  if (!proveedorTaxId && storeId && (receipt.supplier || '').trim()) {
    try {
      const escaped = receipt.supplier!.trim().replace(/([%_\\])/g, '\\$1');
      const { data: supplierRows, error: supplierError } = await supabase
        .from('suppliers')
        .select('tax_id')
        .eq('store_id', storeId)
        .ilike('name', escaped)
        .limit(2);
      if (!supplierError && supplierRows && supplierRows.length === 1) {
        proveedorTaxId = (supplierRows[0] as { tax_id?: string | null }).tax_id || '';
      }
    } catch (e) {
      // El código del proveedor no bloquea el informe: línea en blanco.
      logger.warn('DATABASE', 'SC204_SUPPLIER_TAX_ID_READ_FAILED', { error: e });
    }
  }

  // ── Saldo posterior histórico por producto (Σ líneas del mismo SKU) ──
  const saldosPorProducto: Record<string, SaldoPosteriorResultado> = {};
  const productIds = Array.from(
    new Set(sourceItems.map((i) => i.product_id).filter((id): id is string => !!id)),
  );
  if (storeId && productIds.length > 0) {
    try {
      const ledger = await fetchMovimientosPorProducto(supabase, productIds, storeId);
      // Σ cantidades recibidas por producto (varias líneas del mismo SKU)
      const deltaPorProducto: Record<string, number> = {};
      for (const it of sourceItems) {
        if (!it.product_id) continue;
        deltaPorProducto[it.product_id] = (deltaPorProducto[it.product_id] || 0) + (it.quantity || 0);
      }
      const pendiente = receipt.status === 'pending';
      for (const pid of productIds) {
        const movs: SaldoPosteriorMovement[] = ledger[pid] || [];
        saldosPorProducto[pid] = calcularSaldoPosterior({
          movimientos: movs,
          movimientosPropios: movimientosDeRecepcion(movs, receipt.id),
          deltaDocumento: deltaPorProducto[pid] || 0,
          pendienteContabilizar: pendiente,
        });
      }
    } catch (e) {
      // El saldo no bloquea el informe: las líneas quedan «s/d» y el pie lo documenta.
      logger.warn('DATABASE', 'SC204_SALDO_POSTERIOR_READ_FAILED', { error: e });
    }
  }

  return {
    entidadNombre,
    entidadCodigo,
    logoUrl,
    proveedorTaxId,
    items: sourceItems,
    saldosPorProducto,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

/**
 * CP-DOC-PDF-UX-004 — ENCABEZADO DE DATOS EN BLOQUES INDEPENDIENTES (§3):
 * A entidad receptora · B almacén receptor · C proveedor · D documento que
 * ampara · E fechas. Cada campo con su ETIQUETA COMPLETA (nunca «Código:»
 * genérico cuando conviven varios códigos) y su valor en la misma celda — la
 * asociación etiqueta→dato es inequívoca sin interpretación. Campos vacíos
 * conservan la línea de cumplimentación del modelo (sin N/A, ceros ni valores
 * inventados); cada código sale EXCLUSIVAMENTE de su campo de origen
 * (entidad/almacén/proveedor/documento).
 * CP-DOC-SC-DATA-MAPPING-006 §6: el bloque «Datos del transportador» ya NO
 * se dibuja aquí — sus datos forman parte del bloque FIRMA DEL TRANSPORTADOR
 * (drawRes11SignatureBlocks), evitando la duplicación del transportador.
 */
function drawSc204HeaderBlocks(model: Sc204ModelData, doc: Awaited<ReturnType<typeof createPDFDocument>>, startY: number): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const contentWidth = pageWidth - marginX * 2;
  const halfW = (contentWidth - 4) / 2;
  let y = startY; // bajo el encabezado institucional compacto (CP-DOC-SC-HEADER-UX-005)

  // Fila 1 — BLOQUE A (izquierda) + BLOQUE B (derecha): ambos a la misma
  // altura (la mayor necesaria si un nombre largo envuelve a varias líneas).
  const fieldsA = [
    { label: 'Nombre de la entidad:', value: model.entidadNombre },
    { label: 'Código de la entidad receptora:', value: model.entidadCodigo },
  ];
  const fieldsB = [
    { label: 'Nombre del almacén:', value: model.almacenNombre },
    { label: 'Código del almacén receptor:', value: model.almacenCodigo },
  ];
  const hRow1 = Math.max(
    measureRes11DataBlockHeight(doc, { w: halfW, fields: fieldsA }),
    measureRes11DataBlockHeight(doc, { w: halfW, fields: fieldsB }),
  );
  drawRes11DataBlock(doc, { x: marginX, y, w: halfW, h: hRow1, title: 'Entidad receptora', fields: fieldsA });
  drawRes11DataBlock(doc, { x: marginX + halfW + 4, y, w: halfW, h: hRow1, title: 'Almacén receptor', fields: fieldsB });
  y += hRow1 + 2;

  // Fila 2 — BLOQUE C (izquierda) + BLOQUE D (derecha, independiente)
  const fieldsC = [
    { label: 'Nombre o razón social:', value: model.proveedorNombre },
    { label: 'Código del proveedor:', value: model.proveedorCodigo },
  ];
  const fieldsD = [
    { label: 'Nombre o tipo de documento:', value: model.documentoNombre },
    { label: 'Número del documento:', value: model.documentoNumero },
  ];
  const hRow2 = Math.max(
    measureRes11DataBlockHeight(doc, { w: halfW, fields: fieldsC }),
    measureRes11DataBlockHeight(doc, { w: halfW, fields: fieldsD }),
  );
  drawRes11DataBlock(doc, { x: marginX, y, w: halfW, h: hRow2, title: 'Proveedor', fields: fieldsC });
  drawRes11DataBlock(doc, { x: marginX + halfW + 4, y, w: halfW, h: hRow2, title: 'Documento que ampara la recepción', fields: fieldsD });
  y += hRow2 + 2;

  // Fila 3 — BLOQUE E: fechas, cada una con su etiqueta completa (la fecha de
  // recepción es el dato real del modelo; la de emisión es la de generación).
  const fieldsE = [
    { label: 'Fecha de la recepción:', value: model.fechaRecepcion },
    { label: 'Fecha de emisión del modelo:', value: model.fechaEmision },
  ];
  const hRow3 = measureRes11DataBlockHeight(doc, { w: contentWidth, fields: fieldsE, columns: 2 });
  drawRes11DataBlock(doc, { x: marginX, y, w: contentWidth, h: hRow3, title: 'Fechas', columns: 2, fields: fieldsE });
  // CP-DOC-SC-DATA-MAPPING-006 §6: sin bloque «Datos del transportador» —
  // sus datos acompañan a la firma del transportador en la cuadrícula final.
  return y + hRow3 + 4; // Y de arranque de la tabla de productos
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

  // ── Encabezado institucional (CP-DOC-SC-HEADER-UX-005) ──
  // Misma plantilla reutilizable de la familia SC-2-xx: logo a la IZQUIERDA,
  // nombre de la entidad receptora CENTRADO y la identificación documental a
  // la DERECHA. La fecha sigue siendo dinámica (momento de generación) y el
  // consecutivo conserva su comportamiento: valor cuando existe, línea de
  // cumplimentación manual cuando no (COSTPRO no lo gestiona).
  const logo = await resolveScLogoDataUrl(model.logoUrl);
  const headerEndY = drawRes11Header(doc, {
    modelo: 'SC-2-04',
    titulo: 'INFORME DE RECEPCIÓN',
    nombreInstitucional: model.entidadNombre,
    notaLegal: 'Uso obligatorio — Res. No. 11/2007 MFP',
    numeroConsecutivo: model.numeroConsecutivo,
    lineaDerecha: `Fecha de emisión: ${model.fechaEmision || RES11_BLANK_LINE}`,
    logoDataUrl: logo.dataUrl,
    logoSource: logo.source,
  });

  // ── Bloques de datos generales (A–F) — CP-DOC-PDF-UX-004 ──
  const tableStartY = drawSc204HeaderBlocks(model, doc, headerEndY + 4);

  // ── Dato 7: tabla de productos ──
  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    startY: tableStartY,
    head: [
      [
        'Código',
        'Descripción',
        'U.M.',
        'Cantidad',
        'Precio unitario',
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
      6: { cellWidth: 30, halign: 'right' },
    },
    margin: { left: marginX, right: marginX },
  });

  // ── Dato 8: Importe Total del modelo ──
  // Etiqueta + valor como una sola línea alineada a la derecha (evita
  // superposición cuando la etiqueta es larga por el nombre de la moneda).
  const docAny = doc as unknown as { lastAutoTable?: { finalY: number } };
  let finalY = docAny.lastAutoTable?.finalY || tableStartY;
  finalY += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  for (const total of model.importesTotales) {
    doc.text(`${total.label} ${total.importe}`, pageWidth - marginX, finalY, {
      align: 'right',
    });
    finalY += 5.5;
  }

  // ── Datos 9–12: firmas — PIE UNIFICADO (referencia de diseño 2026-11-09) ──
  // Fila superior: las TRES firmas de empleados (recepciona, contabiliza,
  // anota en el Control de Inventario) — espacios ABIERTOS con la línea de
  // rúbrica arriba y el cargo centrado en MAYÚSCULAS debajo, sin marcos.
  // Sección inferior: TRANSPORTADOR con título y regla, y su cuadrícula de
  // identificación en dos columnas (Nombre/Chapa · Carné/Casilla ·
  // Firma/Guía aérea) — la firma manuscrita del transportador es un campo
  // más del bloque, conforme a la referencia; sus datos dinámicos se escriben
  // SOBRE su línea y los vacíos conservan la línea de cumplimentación.
  // Todas las áreas se mueven SIEMPRE juntas (ninguna firma queda sola en
  // otra página).
  drawRes11SignatureFooter(
    doc,
    {
      signatures: [
        { role: 'Firma del empleado que recepciona' },
        { role: 'Firma del empleado que contabiliza' },
        { role: 'Firma del empleado que anota en el Control de Inventario' },
      ],
      columns: 3,
      fieldsSection: {
        title: 'Transportador',
        columns: 2,
        fields: [
          { label: 'Nombre:', value: model.transportadorNombre },
          { label: 'Chapa:', value: model.transportadorChapa },
          { label: 'Carné de identidad:', value: model.transportadorCarne },
          { label: 'Casilla:', value: model.transportadorCasilla },
          { label: 'Firma:', value: '' },
          { label: 'Guía aérea:', value: model.transportadorGuiaAerea },
        ],
      },
    },
    finalY + 10,
  );

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
  // Nota sobre el saldo en existencia (fuente/limitación) — solo cuando aplica.
  if (model.saldoNota) {
    doc.text(model.saldoNota, marginX, pageHeight - 5.5, { maxWidth: contentWidth });
  }

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
  const { entidadNombre, entidadCodigo, logoUrl, proveedorTaxId, items, saldosPorProducto } =
    await fetchSc204SourceData(receipt, activeStoreId);
  const model = buildSc204ModelData({
    entidadNombre,
    entidadCodigo,
    logoUrl,
    proveedorTaxId,
    receipt,
    items,
    saldosPorProducto,
    emissionDate: new Date(),
  });
  try {
    await generateSc204Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC204_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
