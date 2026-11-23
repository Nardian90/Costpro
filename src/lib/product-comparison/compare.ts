/**
 * ADNEGOCIO-UI 2026-11-23 · Comparación comercial de productos entre el mes
 * en curso (acumulado) y el mismo tramo del mes anterior.
 *
 * LÓGICA PURA (sin I/O): la vista ProductComparisonView y sus tests consumen
 * estas funciones. Los datos SIEMPRE provienen de las fuentes oficiales:
 *  · Ventas por producto: RPC get_sales_dashboard_analytics (top_net /
 *    top_units de CADA período) — el agregado canónico que ya usa el sistema
 *    (neto de descuento de línea y de devoluciones, CUP contable a la tasa
 *    de cada venta). El ranking por ingresos usa la valoración canónica
 *    autorizada: NO mezcla nominales CUP/USD ni aplica tasas propias.
 *  · Existencias y unidad de medida: catálogo de productos (useProducts).
 *
 * Reglas de clasificación (misión §5.3) — distinguir SIEMPRE «no tuvo ventas
 * en el período» de «salió del Top»:
 *  · lidera:      está en el Top de ambos períodos.
 *  · crece:       está en el Top actual y mejora posición o ventas.
 *  · desciende:   está en el Top actual y empeora posición o ventas.
 *  · nuevo:       ventas actuales > 0 y SIN ventas comparables antes.
 *  · dejo_de_venderse: ventas en el período anterior y CERO en el actual.
 *  · sale_del_top:     sigue vendiendo pero salió del Top actual.
 */

// ── Entradas (espejo del RPC, solo lo necesario) ────────────────────────────

export interface PeriodProductRow {
  product_id: string | null;
  name: string | null;
  sku: string | null;
  units_sold: number;
  units_returned?: number;
  net_cup: number;
  participation_pct?: number;
}

export interface ProductCatalogRow {
  id: string;
  name: string;
  sku?: string | null;
  stock_current: number;
  unit_of_measure?: string | null;
  min_stock?: number | null;
}

// ── Clasificación ────────────────────────────────────────────────────────────

export type Evolucion =
  | 'lidera'
  | 'crece'
  | 'desciende'
  | 'nuevo'
  | 'dejo_de_venderse'
  | 'sale_del_top';

export const EVOLUCION_LABEL: Record<Evolucion, string> = {
  lidera: 'Continúa liderando',
  crece: 'En crecimiento',
  desciende: 'En descenso',
  nuevo: 'Nuevo en el ranking',
  dejo_de_venderse: 'Dejó de venderse',
  sale_del_top: 'Sale del Top',
};

/** Un producto fue «principal» el mes anterior si quedó dentro de este puesto. */
export const TOP_PRINCIPAL_ANTERIOR = 5;
/** Caída fuerte: pierde al menos este % de sus ventas o queda en cero. */
export const CAIDA_FUERTE_PCT = 50;

export interface ComparisonRow {
  productId: string;
  name: string;
  sku: string | null;
  /** Puesto 1-based en el Top actual; null si no está. */
  posActual: number | null;
  /** Puesto 1-based en el Top anterior; null si no está. */
  posAnterior: number | null;
  ventasActuales: number;
  ventasAnteriores: number;
  unidadesActuales: number;
  unidadesAnteriores: number;
  /** Devoluciones del período actual (contexto de ventas netas). */
  devolucionesActuales: number;
  devolucionesAnteriores: number;
  /** Diferencia absoluta de ingresos (actual − anterior), CUP contable. */
  difCup: number;
  /** Variación % — null cuando no hay base válida (anterior = 0). */
  varPct: number | null;
  stockActual: number | null;
  unidadMedida: string | null;
  evolucion: Evolucion;
}

export interface ComparisonResumen {
  liderActual: { name: string; ventas: number } | null;
  liderAnterior: { name: string; ventas: number } | null;
  mayorCrecimiento: { name: string; difCup: number; varPct: number | null } | null;
  mayorCaída: { name: string; difCup: number; varPct: number | null } | null;
  dejaronDeVenderse: string[];
  /** Productos nuevos que entran fuerte al Top actual. */
  nuevos: string[];
  /** Texto del cambio de líder, o null si el líder se mantiene. */
  cambioLider: string | null;
}

const posicion = (rows: PeriodProductRow[], productId: string): number | null => {
  const idx = rows.findIndex((r) => r.product_id === productId);
  return idx === -1 ? null : idx + 1;
};

/**
 * Construye la comparación. `topActual` y `topAnterior` son los listados
 * oficiales del RPC para CADA período (misma moneda canónica, mismas reglas
 * de validez — anulados/devoluciones ya excluidos por el agregado). El
 * ranking reúne la UNIÓN de ambos Tops: un líder anterior con ventas cero
 * hoy permanece visible (misión §5.2).
 *
 * `ventasEnPeriodoActual` (opcional): producto_ids CON salidas por venta
 * (movement_type='sale') en el mayor de inventario durante el período
 * actual — evidencia REAL de que un producto ausente del Top actual sigue
 * vendiéndose. Los ausentes SIN esa evidencia se clasifican «dejó de
 * venderse»; los CON ella, «salen del Top». Sin el parámetro, el
 * clasificador es conservador y usa «salen del Top» (no inventa ceros).
 */
export function buildComparison(
  topActual: PeriodProductRow[],
  topAnterior: PeriodProductRow[],
  catalogo: ProductCatalogRow[],
  ventasEnPeriodoActual?: Set<string> | null,
): { rows: ComparisonRow[]; resumen: ComparisonResumen } {
  // Índice del catálogo por id (identificador canónico, nunca el nombre).
  const cat = new Map(catalogo.map((p) => [p.id, p]));

  // Unión preservando orden: primero el Top actual, luego el anterior que
  // no esté (los líderes anteriores con cero ventas quedan al final del
  // bloque de union pero visibles).
  const ids: string[] = [];
  for (const r of topActual) if (r.product_id && !ids.includes(r.product_id)) ids.push(r.product_id);
  for (const r of topAnterior) if (r.product_id && !ids.includes(r.product_id)) ids.push(r.product_id);

  const rows: ComparisonRow[] = ids.map((productId) => {
    const cur = topActual.find((r) => r.product_id === productId) ?? null;
    const prev = topAnterior.find((r) => r.product_id === productId) ?? null;
    const catalogRow = cat.get(productId) ?? null;

    const ventasActuales = cur?.net_cup ?? 0;
    const ventasAnteriores = prev?.net_cup ?? 0;
    const posActual = posicion(topActual, productId);
    const posAnterior = posicion(topAnterior, productId);

    const difCup = Math.round((ventasActuales - ventasAnteriores) * 100) / 100;
    // Sin dividir entre cero: sin ventas anteriores no hay variación %.
    const varPct = ventasAnteriores > 0 ? Math.round((difCup / ventasAnteriores) * 1000) / 10 : null;

    let evolucion: Evolucion;
    if (posActual !== null && posAnterior !== null) {
      // En ambos Tops: mejora o empeora por posición Y por importe. Un líder
      // que pierde ventas se clasifica «desciende» — el puesto no perdona la caída.
      const mejorPos = posActual < posAnterior;
      const mejorVentas = difCup > 0;
      const peorPos = posActual > posAnterior;
      const peorVentas = difCup < 0;
      if (mejorPos || mejorVentas) evolucion = 'crece';
      else if (peorPos || peorVentas) evolucion = 'desciende';
      else evolucion = 'lidera';
    } else if (posActual !== null && posAnterior === null) {
      // Ventas actuales, sin registro anterior en el Top: nuevo (el RPC solo
      // lista productos CON movimientos; sin fila previa ⇒ sin ventas comparables).
      evolucion = 'nuevo';
    } else if (posActual === null && posAnterior !== null) {
      // Fuera del Top actual. DISTINCIÓN exigida por la misión §5.3:
      //  · «dejó de venderse» — el mayor de inventario NO registra salidas
      //    por venta del producto en el período actual (evidencia real).
      //  · «sale del Top» — sigue registrando salidas por venta (o sin
      //    evidencia disponible: conservador, nunca se inventa el cero).
      const sigueVendiendo = ventasEnPeriodoActual?.has(productId) ?? true;
      evolucion = ventasAnteriores > 0 && !sigueVendiendo ? 'dejo_de_venderse' : 'sale_del_top';
    } else {
      evolucion = 'lidera'; // nunca ocurre: la unión garantiza una posición
    }

    return {
      productId,
      name: cur?.name ?? prev?.name ?? catalogRow?.name ?? '(producto sin nombre)',
      sku: cur?.sku ?? prev?.sku ?? catalogRow?.sku ?? null,
      posActual,
      posAnterior,
      ventasActuales,
      ventasAnteriores,
      unidadesActuales: cur?.units_sold ?? 0,
      unidadesAnteriores: prev?.units_sold ?? 0,
      devolucionesActuales: cur?.units_returned ?? 0,
      devolucionesAnteriores: prev?.units_returned ?? 0,
      difCup,
      varPct,
      stockActual: catalogRow ? catalogRow.stock_current : null,
      unidadMedida: catalogRow?.unit_of_measure ?? null,
      evolucion,
    };
  });

  return { rows, resumen: buildResumen(rows, topActual, topAnterior) };
}

function buildResumen(
  rows: ComparisonRow[],
  topActual: PeriodProductRow[],
  topAnterior: PeriodProductRow[],
): ComparisonResumen {
  const liderActualRow = rows.find((r) => r.posActual === 1) ?? null;
  const liderAnteriorRow = rows.find((r) => r.posAnterior === 1) ?? null;

  // Mayor crecimiento / caída: solo filas con base válida (anterior > 0).
  const conBase = rows.filter((r) => r.ventasAnteriores > 0);
  const mayorCrecimiento =
    conBase.filter((r) => r.difCup > 0).sort((a, b) => b.difCup - a.difCup)[0] ?? null;
  const mayorCaída =
    conBase.filter((r) => r.difCup < 0).sort((a, b) => a.difCup - b.difCup)[0] ?? null;

  const dejaronDeVenderse = rows.filter((r) => r.evolucion === 'dejo_de_venderse').map((r) => r.name);
  const nuevos = rows.filter((r) => r.evolucion === 'nuevo').map((r) => r.name);

  let cambioLider: string | null = null;
  if (liderActualRow && liderAnteriorRow && liderActualRow.productId !== liderAnteriorRow.productId) {
    const nombreLiderActual = liderActualRow.name;
    const salio = topActual.every((r) => r.product_id !== liderAnteriorRow?.productId);
    cambioLider = salio
      ? `${liderAnteriorRow.name} dejó la cima: ${nombreLiderActual} pasa al primer lugar`
      : `${nombreLiderActual} desplaza a ${liderAnteriorRow.name} del primer lugar`;
  }

  return {
    liderActual: liderActualRow ? { name: liderActualRow.name, ventas: liderActualRow.ventasActuales } : null,
    liderAnterior: liderAnteriorRow ? { name: liderAnteriorRow.name, ventas: liderAnteriorRow.ventasAnteriores } : null,
    mayorCrecimiento: mayorCrecimiento
      ? { name: mayorCrecimiento.name, difCup: mayorCrecimiento.difCup, varPct: mayorCrecimiento.varPct }
      : null,
    mayorCaída: mayorCaída
      ? { name: mayorCaída.name, difCup: mayorCaída.difCup, varPct: mayorCaída.varPct }
      : null,
    dejaronDeVenderse,
    nuevos,
    cambioLider,
  };
}

// ── Diagnóstico de inventario (misión §5.4) ─────────────────────────────────

export type StockSituation =
  | 'sigue_vendiendose'
  | 'sin_ventas_periodo'
  | 'stock_agotado'
  | 'stock_disponible'
  | 'posible_abastecimiento'
  | 'sin_informacion_suficiente';

/**
 * Clasificación de stock para la tabla. Etiquetas honestas: el stock actual
 * cero NO demuestra por sí solo un agotamiento durante el período comparado —
 * la evidencia de agotamiento vive en el kardex (ver evaluarEvidenciaKardex).
 */
export function situacionStock(row: ComparisonRow): StockSituation {
  if (row.stockActual === null) return 'sin_informacion_suficiente';
  const sinVentas = row.ventasActuales <= 0;
  if (sinVentas && row.stockActual <= 0) return 'stock_agotado';
  if (sinVentas && row.stockActual > 0) return 'sin_ventas_periodo';
  if (row.evolucion === 'dejo_de_venderse' && row.stockActual <= 0) return 'posible_abastecimiento';
  return row.stockActual > 0 ? 'stock_disponible' : 'stock_agotado';
}

export const SITUACION_LABEL: Record<StockSituation, string> = {
  sigue_vendiendose: 'Sigue vendiéndose',
  sin_ventas_periodo: 'Sin ventas en el período actual',
  stock_agotado: 'Stock actual agotado',
  stock_disponible: 'Stock disponible',
  posible_abastecimiento: 'Posible problema de abastecimiento',
  sin_informacion_suficiente: 'Sin información histórica suficiente',
};

/** Datos derivados del kardex de un producto (via useProductKardex). */
export interface KardexEvidenceInput {
  saldoInicial: number;
  /** Movimientos del período con saldo corrido derivado (created_at ASC). */
  movimientos: Array<{ created_at: string; quantity_change: number; saldo: number; movement_type: string; reference_type?: string | null; reference_doc?: string | null }>;
  isTruncated: boolean;
  /** Σ de TODO el ledger del producto (null si no se pudo computar). */
  sumaTotal: number | null;
  stockAutoritativo: number;
}

export interface KardexEvidence {
  /** true SOLO si el ledger cubre el período sin huecos ni truncado. */
  historicoConfiable: boolean;
  /** Saldo mínimo corrido dentro del período (≤ 0 ⇒ estuvo agotado). */
  saldoMinimo: number | null;
  /** Momento en que el saldo llegó a su mínimo (agotamiento), si hubo. */
  momentoAgotamiento: string | null;
  /** Último movimiento registrado del producto. */
  ultimoMovimiento: { fecha: string; quantity_change: number; movement_type: string; reference_type?: string | null; reference_doc?: string | null } | null;
  /** Motivo del nivel de confianza, para mostrarlo tal cual. */
  nota: string;
}

/**
 * Evidencia histórica de agotamiento a partir del ledger REAL. Regla crítica
 * (misión §5.4): no se concluye «se agotó» salvo que el saldo corrido del
 * ledger llegue a ≤ 0 dentro del período Y el histórico sea confiable
 * (sin truncado y conciliado contra la existencia autoritativa).
 */
export function evaluarEvidenciaKardex(input: KardexEvidenceInput): KardexEvidence {
  const movs = input.movimientos;
  const ultimo = movs.length > 0 ? movs[movs.length - 1] : null;

  const conciliado =
    input.sumaTotal !== null &&
    Math.abs(input.sumaTotal - input.stockAutoritativo) < 0.0001;
  const historicoConfiable = !input.isTruncated && conciliado;

  if (movs.length === 0) {
    return {
      historicoConfiable: false,
      saldoMinimo: null,
      momentoAgotamiento: null,
      ultimoMovimiento: null,
      nota: 'Sin movimientos registrados en el período consultado: no hay información histórica suficiente para determinar la causa.',
    };
  }

  const saldos = movs.map((m) => m.saldo);
  const minSaldo = Math.min(...saldos);
  const idxMin = saldos.indexOf(minSaldo);
  const agotadoEnPeriodo = minSaldo <= 0;

  let nota: string;
  if (!historicoConfiable) {
    nota = input.isTruncated
      ? 'El histórico del producto excede el límite de consulta: no hay información suficiente para confirmar cuándo (o si) se agotó.'
      : 'El mayor de inventario no concilia con la existencia autoritativa: la evidencia histórica no es concluyente sobre la causa de la caída.';
  } else if (agotadoEnPeriodo && input.saldoInicial > 0) {
    nota = 'El saldo corrido llegó a cero (o negativo) durante el período: existe evidencia de agotamiento en el mayor de inventario.';
  } else if (agotadoEnPeriodo) {
    nota = 'El saldo del período inicia y permanece en cero o negativo, con movimientos que lo confirman.';
  } else {
    nota = 'El saldo corrido del mayor se mantuvo por encima de cero todo el período: no hay evidencia de agotamiento.';
  }

  return {
    historicoConfiable,
    saldoMinimo: minSaldo,
    momentoAgotamiento: agotadoEnPeriodo && historicoConfiable ? movs[idxMin]?.created_at ?? null : null,
    ultimoMovimiento: ultimo
      ? {
          fecha: ultimo.created_at,
          quantity_change: ultimo.quantity_change,
          movement_type: ultimo.movement_type,
          reference_type: ultimo.reference_type ?? null,
          reference_doc: ultimo.reference_doc ?? null,
        }
      : null,
    nota,
  };
}
