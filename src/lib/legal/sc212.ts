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
 * CP-SALES-024 (2026-11-04) — integración con la configuración de la tienda:
 *  - El dato 2 (proveedor: nombre, dirección, código, cuenta bancaria y NIT)
 *    y los datos de contacto se obtienen de la CONFIGURACIÓN PERSISTIDA de
 *    la tienda a la que pertenece la venta (relación real
 *    `transactions.store_id → stores`), NO de la tienda seleccionada en el
 *    menú global: una venta histórica siempre muestra los datos de SU tienda.
 *  - Mapeo (campos reales de Gestión de Tiendas → SC-2-12):
 *      stores.name          → PROVEEDOR — Nombre
 *      stores.address       → Dirección
 *      stores.reeup         → Código (código/REEUP de la entidad, 11 dígitos)
 *      stores.nit           → NIT (identificador tributario)
 *      stores.bank_account  → Cuenta bancaria (dígitos y espacios intactos)
 *      stores.phone         → Teléfono (dato de contacto, banda proveedor)
 *      stores.email         → Correo (dato de contacto, banda proveedor)
 *    «Sucursal bancaria» sigue EN BLANCO: `stores` no la gestiona y la
 *    misión prohíbe inventar o duplicar datos (p. ej. usar el NIT ahí).
 *  - La leyenda del dato 8 es la etiqueta GENÉRICA constante
 *    «Entrega los productos (nombre y firma)» — CP-SALES-024 §5: sin nombres
 *    personales del vendedor ni del usuario autenticado en el documento.
 *  - Los campos de identificación admiten personalización de PRESENTACIÓN
 *    (ver sc212-config/fields.ts): mostrar/ocultar, etiqueta y —solo en
 *    campos no oficiales— sustitución puntual. La fuente de verdad de los
 *    DATOS sigue siendo `stores`; la personalización jamás escribe allí.
 *
 * Matriz de correspondencia (campos reales de COSTPRO):
 *  ┌ Dato oficial (Res. 11/2007)                 ┬ Fuente COSTPRO                     ┬ Tratamiento
 *  │ 1. Fecha de emisión del modelo              │ transactions.completed_at          │ Automática (dd/mm/aaaa; fallback
 *  │                                             │ (fallback created_at)              │ created_at)
 *  │ 2. Nombre, dirección, código del proveedor, │ stores (config. de la tienda de    │ Automáticos desde la configuración
 *  │    cuenta/sucursal bancaria y NIT           │ la venta: name/address/reeup/nit/  │ persistida; SUCURSAL en blanco
 *  │                                             │ bank_account)                      │ (no gestionada)
 *  │ 3. Nombre, dirección y código del comprador │ transactions.customer_name;        │ Nombre automático (si existe);
 *  │                                             │ dirección y código no gestionados  │ DIRECCIÓN y CÓDIGO en blanco
 *  │ 4. Espacio para especificar la operación    │ la transacción del Historial de    │ «Venta» (naturaleza real del
 *  │                                             │ Ventas es una venta                │ documento); estado anotado si no
 *  │                                             │                                    │ está completada
 *  │    (contacto) Teléfono y correo del provee- │ stores.phone / stores.email        │ Automáticos desde la configuración
 *  │    dor (añadidos por COSTPRO)               │                                    │ (ocultables por preferencia)
 *  │ 5. Datos del transportista                  │ (no gestionado)                    │ En blanco
 *  │ 6. Código, descripción, UM, cantidad,       │ transaction_items + products       │ Automáticos (UM desde products);
 *  │    precio unitario total, importe y saldo   │ (sku, name, unit_of_measure,       │ importe = cantidad × precio a la
 *  │    en existencia según almacén              │  quantity, price_at_sale,          │ venta (misma base del modal);
 *  │                                             │  price_currency)                   │ SALDO EN EXISTENCIA en blanco
 *  │ 7. Total de la Factura                      │ transactions.total_amount          │ Automático (almacenado; moneda de
 *  │                                             │ + sale_currency                    │ la venta)
 *  │ 8. Nombre y firma del que entrega + fecha   │ etiqueta genérica constante        │ «Entrega los productos (nombre y
 *  │                                             │ (CP-SALES-024: sin nombre de       │ firma)» — FIRMA en blanco
 *  │                                             │ vendedor en el documento)          │
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
 *  - Lecturas con el cliente Supabase del usuario (RLS activa). La tienda se
 *    resuelve por el `store_id` REAL de la venta — sin cruce entre tiendas.
 *  - Valores vacíos: cadena vacía → el PDF dibuja la línea de cumplimentación
 *    manual (nunca «undefined» ni valores inventados). Teléfonos, correos,
 *    identificadores y cuentas bancarias se dibujan TAL CUAL están
 *    persistidos — sin recortar ceros iniciales ni reordenar espacios.
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
import {
  SC212_FIELDS,
  DEFAULT_SC212_FIELDS_PREFS,
  resolveSc212Field,
  type Sc212FieldsPrefs,
} from './sc212-config/fields';

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
  /** Nombre de la entidad vendedora (tienda de la venta, bajo RLS). */
  entidadNombre: string;
  /** Nombre real del vendedor (si es legible bajo RLS). */
  vendedorNombre?: string | null;
  /**
   * CP-SALES-024: configuración de la tienda a la que pertenece la venta
   * (lectura de `stores`). Campo opcional por compatibilidad con los tests
   * del modelo — si falta, los datos de identificación quedan en blanco
   * (línea de cumplimentación manual), como antes de esta misión.
   */
  storeConfig?: {
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    reeup?: string | null;
    nit?: string | null;
    bank_account?: string | null;
  } | null;
}

export interface Sc212ModelData {
  fechaEmision: string;
  proveedorNombre: string;
  proveedorDireccion: string;
  proveedorCodigo: string;
  proveedorCuentaBancaria: string;
  proveedorSucursalBancaria: string; // no gestionado → ''
  proveedorNIT: string;
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

/** Valor persistido → texto del modelo: null/undefined → '' (nunca «null»). */
function asText(value: string | null | undefined): string {
  return typeof value === 'string' ? value : '';
}

// ────────────────────────────────────────────────────────────────────────────
// Constructor del modelo (función pura — testeable)
// ────────────────────────────────────────────────────────────────────────────

export function buildSc212ModelData(
  source: Sc212SourceData,
  prefs: Sc212FieldsPrefs = DEFAULT_SC212_FIELDS_PREFS,
): Sc212ModelData {
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

  // CP-SALES-024: configuración de la tienda de la venta (puede no venir en
  // fuentes legacy — el modelo degrada a línea de cumplimentación manual).
  const cfg = source.storeConfig || {};
  const storeValues: Record<string, string> = {
    proveedorDireccion: asText(cfg.address),
    proveedorCodigo: asText(cfg.reeup),
    proveedorNIT: asText(cfg.nit),
    proveedorCuentaBancaria: asText(cfg.bank_account),
    proveedorSucursalBancaria: '', // stores no gestiona la sucursal bancaria
    proveedorTelefono: asText(cfg.phone),
    proveedorEmail: asText(cfg.email),
  };

  // Resolución de cada campo con la preferencia de presentación. Los campos
  // OCULTOS se omiten del modelo como cadena vacía marcada — el render los
  // salta sin dejar hueco (sc212RenderFields expone la decisión final).
  const resolved = {} as Record<string, { visible: boolean; label: string; value: string }>;
  for (const field of SC212_FIELDS) {
    resolved[field.id] = resolveSc212Field(prefs, field, storeValues[field.id] || '');
  }

  return {
    fechaEmision: formatDateRes11(transaction.completed_at || transaction.created_at),
    proveedorNombre: source.entidadNombre || '',
    proveedorDireccion: resolved.proveedorDireccion.value,
    proveedorCodigo: resolved.proveedorCodigo.value,
    proveedorCuentaBancaria: resolved.proveedorCuentaBancaria.value,
    proveedorSucursalBancaria: resolved.proveedorSucursalBancaria.value,
    proveedorNIT: resolved.proveedorNIT.value,
    compradorNombre: transaction.customer_name || '',
    compradorDireccion: '',
    compradorCodigo: '',
    tipoOperacion: 'Venta',
    transportadorNombre: '',
    transportadorCarne: '',
    transportadorChapa: '',
    lineas,
    importesTotales,
    // CP-SALES-024 §5: el documento lleva la leyenda GENÉRICA — el nombre del
    // vendedor ya NO se imprime (antes «Entrega los productos — <vendedor>»).
    entregaNombre: '',
    estado: estadoDocumentoLabel(transaction.status),
    numeroConsecutivo: transaction.invoice_number || '',
    identificadorVenta: transaction.id?.split('-')[0] || '',
    // Metadatos de presentación (no forman parte del modelo oficial; el
    // render los consume y los tests los ignoran en las igualdades).
    ...({
      __sc212Presentation: resolved,
    } as object),
  } as Sc212ModelData & { __sc212Presentation: Record<string, { visible: boolean; label: string; value: string }> };
}

/** Nombre del archivo generado (número real de factura o identificador). */
export function sc212FileName(transaction: Pick<Sc212SourceData['transaction'], 'invoice_number' | 'id'>): string {
  return res11FileName(
    'SC-2-12',
    'Factura',
    transaction.invoice_number || transaction.id?.split('-')[0] || '',
  );
}

/**
 * Presentación resuelta de los campos personalizables para un modelo dado
 * (uso interno del render y de la vista previa del panel de configuración).
 */
export function sc212PresentationOf(
  model: Sc212ModelData,
): Record<string, { visible: boolean; label: string; value: string }> {
  const withPres = model as Sc212ModelData & {
    __sc212Presentation?: Record<string, { visible: boolean; label: string; value: string }>;
  };
  return withPres.__sc212Presentation || {};
}

// ────────────────────────────────────────────────────────────────────────────
// Lectura de datos bajo RLS (solo lectura, tienda de la VENTA)
// ────────────────────────────────────────────────────────────────────────────

const STORE_CONFIG_COLUMNS = 'name, address, phone, email, reeup, nit, bank_account';

/**
 * Cliente de lectura opcional para los fetch del SC-2-12. En el browser es
 * el singleton autenticado (RLS activa). Los tests live pueden inyectar un
 * cliente con sesión real (mismo contrato) — ver setSc212Client().
 */
let sc212Client: typeof supabase | null = null;

/** Test seam: inyecta el cliente Supabase (nunca se usa en producción). */
export function setSc212Client(client: typeof supabase | null): void {
  sc212Client = client;
}

function sc212Supabase(): typeof supabase {
  return sc212Client ?? supabase;
}

/**
 * Lee las líneas de la venta con unidad de medida (fuente real: products),
 * la configuración de la tienda vendedora y el nombre del vendedor.
 *
 * CP-SALES-024: la tienda se resuelve por `transactions.store_id` (relación
 * REAL de la venta) — `activeStoreId` queda solo como fallback defensivo
 * para filas históricas sin store_id, nunca como fuente indiscriminada.
 * Lecturas con el cliente Supabase autenticado (RLS activa). No modifica
 * ningún registro.
 */
export async function fetchSc212SourceData(
  transaction: Sc212SourceData['transaction'],
  activeStoreId?: string | null,
): Promise<Sc212SourceData> {
  const db = sc212Supabase();
  const result: Sc212SourceData = {
    transaction,
    items: [],
    entidadNombre: '',
    vendedorNombre: '',
    storeConfig: null,
  };

  const storeIdForSale = transaction.store_id || activeStoreId || null;

  const [itemsRes, storeRes, sellerRes] = await Promise.all([
    db
      .from('transaction_items')
      .select('quantity, price_at_sale, price_currency, products(name, sku, unit_of_measure)')
      .eq('transaction_id', transaction.id)
      .order('created_at', { ascending: true }),
    storeIdForSale
      ? db.from('stores').select(STORE_CONFIG_COLUMNS).eq('id', storeIdForSale).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    transaction.seller_id
      ? db.from('profiles').select('full_name').eq('id', transaction.seller_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsRes.error) {
    logger.warn('DATABASE', 'SC212_ITEMS_READ_FAILED', { data: itemsRes.error });
  } else {
    result.items = (itemsRes.data as unknown as Sc212SourceItem[]) || [];
  }
  if (!storeRes.error && storeRes.data) {
    const store = storeRes.data as {
      name?: string | null;
      address?: string | null;
      phone?: string | null;
      email?: string | null;
      reeup?: string | null;
      nit?: string | null;
      bank_account?: string | null;
    } | null;
    result.entidadNombre = store?.name || '';
    result.storeConfig = {
      address: store?.address ?? null,
      phone: store?.phone ?? null,
      email: store?.email ?? null,
      reeup: store?.reeup ?? null,
      nit: store?.nit ?? null,
      bank_account: store?.bank_account ?? null,
    };
  }
  if (!sellerRes.error && sellerRes.data) {
    result.vendedorNombre = (sellerRes.data as { full_name?: string | null } | null)?.full_name || '';
  }

  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// Generación del PDF (jsPDF + autoTable — mismas librerías del proyecto)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Dibuja un par etiqueta-valor de la banda de identificación del proveedor.
 * El valor se dibuja TAL CUAL (dígitos y espacios de cuentas bancarias
 * intactos); si está vacío se imprime la línea de cumplimentación manual.
 * Devuelve la altura consumida (0 si el campo está oculto — sin hueco).
 */
function drawProviderField(
  doc: import('jspdf').jsPDF,
  x: number,
  y: number,
  maxWidth: number,
  label: string,
  value: string,
  opts: { valueAlign?: 'left' | 'right'; fixedBlank?: boolean } = {},
): number {
  doc.setFont('helvetica', 'bold');
  doc.text(`${label}:`, x, y);
  doc.setFont('helvetica', 'normal');
  if (value) {
    doc.text(value, x + 2, y, { maxWidth });
  } else if (opts.fixedBlank) {
    doc.text('__________', x + 2, y, { maxWidth });
  } else {
    doc.text(RES11_BLANK_LINE, x + 2, y, { maxWidth });
  }
  return 4.6;
}

export async function renderSc212Pdf(model: Sc212ModelData) {
  const doc = await createPDFDocument('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 12;
  const pres = sc212PresentationOf(model);
  const field = (id: string) =>
    pres[id] || { visible: true, label: id, value: (model as unknown as Record<string, string>)[id] || '' };

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

  // ── Dato 2: proveedor (entidad vendedora) — desde la configuración de la
  //    tienda de la venta (CP-SALES-024). El NIT comparte línea con el
  //    nombre; el resto fluye en la(s) línea(s) siguiente(s) SIN huecos
  //    cuando un campo está oculto o vacío.
  const nit = field('proveedorNIT');
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('PROVEEDOR (entidad vendedora) — Nombre:', marginX + 4, y);
  doc.setFont('helvetica', 'normal');
  doc.text(model.proveedorNombre || RES11_BLANK_LINE, marginX + 74, y, { maxWidth: 60 });
  if (nit.visible) {
    doc.setFont('helvetica', 'bold');
    doc.text(`${nit.label}:`, marginX + 140, y);
    doc.setFont('helvetica', 'normal');
    doc.text(nit.value || RES11_BLANK_LINE, marginX + 150, y, { maxWidth: 45 });
  }

  // Banda de identificación: solo los campos visibles, empaquetados sin
  // huecos. Máximos por campo para que textos largos no se solapen.
  const bandFields: Array<{ id: string; maxW: number; fixedBlank?: boolean }> = [
    { id: 'proveedorDireccion', maxW: 52 },
    { id: 'proveedorCodigo', maxW: 30 },
    { id: 'proveedorCuentaBancaria', maxW: 34, fixedBlank: true },
    { id: 'proveedorSucursalBancaria', maxW: 30, fixedBlank: true },
    { id: 'proveedorTelefono', maxW: 26 },
    { id: 'proveedorEmail', maxW: 58 },
  ];

  let cursorX = marginX + 4;
  y += 5;
  for (const bf of bandFields) {
    const f = field(bf.id);
    if (!f.visible) continue; // campo oculto → no dibuja ni deja hueco
    const labelW = doc.getTextWidth(`${f.label}:`) + 2;
    const valueW = f.value ? doc.getTextWidth(f.value) : doc.getTextWidth(bf.fixedBlank ? '__________' : RES11_BLANK_LINE);
    const needed = labelW + Math.min(valueW, bf.maxW);
    const fits = cursorX + needed <= pageWidth - marginX - 2;
    if (!fits && cursorX > marginX + 4) {
      // No cabe en esta línea → siguiente línea (wrap de banda)
      y += 4.6;
      cursorX = marginX + 4;
    }
    drawProviderField(doc, cursorX, y, bf.maxW, f.label, f.value, { fixedBlank: bf.fixedBlank });
    cursorX += needed + 6;
  }

  // ── Dato 3: comprador ──
  y += 8;
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
      // CP-SALES-024 §5: leyenda GENÉRICA constante — sin nombre del
      // vendedor ni del usuario (antes: «Entrega los productos — <nombre>»).
      'Entrega los productos (nombre y firma)',
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
 * venta ni ningún registro. Las lecturas respetan RLS; la tienda se resuelve
 * por el `store_id` de la venta (fallback defensivo: tienda activa solo si
 * la fila histórica carece de store_id).
 *
 * `prefs` (opcional): preferencias de presentación CP-SALES-024 — ver
 * sc212-config/fields.ts. Ausentes → documento con valores oficiales.
 */
export async function exportSc212ForTransaction(
  transaction: Sc212SourceData['transaction'],
  activeStoreId?: string | null,
  prefs?: Sc212FieldsPrefs,
): Promise<void> {
  const source = await fetchSc212SourceData(transaction, activeStoreId);
  const model = buildSc212ModelData(source, prefs);
  try {
    await generateSc212Pdf(model);
  } catch (error) {
    logger.error('SYSTEM', 'SC212_PDF_GENERATION_FAILED', { error });
    throw error;
  }
}
