/**
 * service-concept-breakdown.ts — Desglose por CONCEPTO de los Servicios
 * Recibidos pagados en EFECTIVO (MISIÓN 2026-11-11 · Reporte Entrega).
 *
 * OBJETIVO (§2-§6 del brief): explicar de qué se compone la deducción
 * «Servicios recibidos pagados en efectivo» del Resumen del Día del PDF,
 * SIN alterar la contabilidad: el desglose es presentación pura — el total
 * global y el efectivo esperado NO cambian (el desglose NO vuelve a restarse).
 *
 * FUENTE DE LOS CONCEPTOS: la clasificación que ya existe en COSTPRO — el
 * catálogo `service_types` (global) con el SNAPSHOT `service_type_name`
 * guardado en cada `received_services` (renombrar/desactivar un tipo no
 * reescribe el histórico; el snapshot es la verdad auditable del documento).
 *
 * CONTRATO DE CONCILIACIÓN (§6): los importes del desglose provienen de
 * EXACTAMENTE las mismas filas que el grupo `payments` del RPC
 * get_cash_report (migración 20261024400000) — los mismos criterios que
 * produce `serviciosRecibidosCash` en src/lib/cash-report/summary.ts:
 *
 *   payment_transactions
 *   WHERE store_id = :store
 *     AND ref_type = 'service'          (grupo del RPC: IN ('receipt','service'))
 *     AND payment_method = 'cash'       (computeDailySummary: isCash)
 *     AND [payment_date ∈ ventana]      (idéntica ventana del RPC)
 *
 *   → agrupadas por concepto vía ref_id → received_services.service_type_name
 *   → Σ amount (moneda NATIVA de la fila, como el RPC: total por (método,
 *     moneda, ref_type)) redondeada a 2 decimales.
 *
 * La suma algebraica de los conceptos de una moneda coincide EXACTAMENTE con
 * el total global de esa hoja — POR CONSTRUCCIÓN (mismas filas, mismo
 * conjunto, sin criterios paralelos §7 del brief):
 *   Σ conceptos(cur) == Σ filas(cash, cur, service) == serviciosRecibidosCash
 *
 * PAGOS MIXTOS (§5.B): cada fila de payment_transactions es un COMPONENTE de
 * un solo método (register_supplier_payment persiste una fila por método del
 * bloque mixto) — el componente en efectivo es exactamente la fila cash; las
 * filas transfer/zelle de un pago dividido quedan FUERA de esta consulta y
 * jamás se contabilizan dos veces.
 *
 * SERVICIOS SIN CONCEPTO (§5.C): nombre vacío/espacios, ref_id nulo o un
 * ref_id sin fila en received_services NO se excluyen — agrupados bajo
 * SIN_CONCEPTO_LABEL («Sin concepto») para que el desglose siga conciliando.
 *
 * CONCEPTOS SIN MOVIMIENTOS (§5.D): un concepto con total 0 no se expone.
 *
 * DEGRADACIÓN LIMPIA (patrón adjustments/cash_flows/refunds de la ruta):
 * si la consulta falla (entorno sin received_services, permisos, red), el
 * helper devuelve null y el reporte se genera SIN desglose — nunca rompe el
 * Reporte Entrega ni inventa importes.
 */

/** Total por concepto (importe en la moneda NATIVA de la hoja). */
export interface ServiceConceptTotal {
  /** Nombre del concepto (snapshot `service_type_name` o «Sin concepto»). */
  concept: string;
  /** Σ de los pagos en efectivo del concepto — positivo (deducción al mostrarse). */
  total: number;
  /** Cantidad de filas de pago agrupadas (trazabilidad). */
  count: number;
}

/** Desglose por moneda (claves presentes según filas; CUP/USD siempre). */
export type ServicesConceptBreakdown = Partial<Record<string, ServiceConceptTotal[]>>;

/** Denominación canónica de los servicios cuyo concepto no puede identificarse. */
export const SIN_CONCEPTO_LABEL = 'Sin concepto';

/** Fila de pago mínima necesaria (moneda NATIVA — mismo importe que agrupa el RPC). */
export interface ServicePaymentRow {
  ref_id?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  /** Defensa en profundidad (§5.B): la consulta ya filtra cash; si la fila
   *  trae el método, se re-verifica aquí — el tramo transfer/zelle de un pago
   *  mixto JAMÁS entra al desglose (no se contabiliza dos veces). */
  payment_method?: string | null;
}

const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);

/** Normaliza el nombre del concepto (trim + colapsar espacios, como el catálogo). */
function normalizeConceptName(raw: string | null | undefined): string {
  const name = String(raw ?? '').trim().replace(/\s+/g, ' ');
  return name || SIN_CONCEPTO_LABEL;
}

/**
 * Agrupa filas de pago (pre-filtradas por el llamador: ref_type='service' ∧
 * payment_method='cash') por concepto para UNA moneda. Pura — sin E/S.
 *
 * @param rows            filas del ledger (cada una = un componente de método)
 * @param conceptByRefId  mapa ref_id → service_type_name (ausencia = «Sin concepto»)
 * @param currency        moneda NATIVA del desglose ('CUP' | 'USD' | …)
 */
export function groupServiceCashByConcept(
  rows: ServicePaymentRow[],
  conceptByRefId: Map<string, string | null>,
  currency: string,
): ServiceConceptTotal[] {
  const acc = new Map<string, { total: number; count: number }>();
  for (const row of rows || []) {
    // Defensa en profundidad (§5.B): solo el componente EN EFECTIVO. La
    // consulta ya llega filtrada por método; si la fila trae el método,
    // re-verificarlo garantiza que un pago dividido (cash+transfer) aporte
    // ÚNICAMENTE su componente cash — sin doble contabilización.
    if (row.payment_method !== undefined && row.payment_method !== null && row.payment_method !== 'cash') continue;
    // Moneda NATIVA de la fila — la misma clasificación de la hoja del RPC
    // (computeDailySummary: isCur(p) con p.currency). Sin conversión: los
    // importes del desglose son los mismos billetes del total global.
    if (String(row.currency || 'CUP') !== currency) continue;
    const amount = n(row.amount);
    if (amount === 0 && !row.amount) continue; // fila sin importe usable — nada que agrupar
    const refId = row.ref_id ? String(row.ref_id) : '';
    const concept = refId && conceptByRefId.has(refId)
      ? normalizeConceptName(conceptByRefId.get(refId))
      : SIN_CONCEPTO_LABEL;
    const g = acc.get(concept) ?? { total: 0, count: 0 };
    g.total += amount;
    g.count += 1;
    acc.set(concept, g);
  }
  return [...acc.entries()]
    .map(([concept, g]) => ({
      concept,
      total: Math.round(g.total * 100) / 100,
      count: g.count,
    }))
    // §5.D: conceptos sin movimientos ni importes no se muestran (un concepto
    // con Σ 0 no aporta y su omisión NO altera la conciliación: 0 = 0).
    .filter(t => t.total !== 0)
    // Determinista: mayor impacto primero (deducciones grandes arriba),
    // desempate alfabético — orden estable para documento y pruebas.
    .sort((a, b) => b.total - a.total || a.concept.localeCompare(b.concept, 'es'));
}

/**
 * Desglose completo por moneda (CUP + USD + cualquier otra presente).
 * Conciliación por construcción: Σ conceptos(cur) == Σ filas(cur).
 */
export function buildServicesConceptBreakdown(
  rows: ServicePaymentRow[],
  conceptByRefId: Map<string, string | null>,
): ServicesConceptBreakdown {
  const out: ServicesConceptBreakdown = { CUP: [], USD: [] };
  for (const row of rows || []) {
    const cur = String(row.currency || 'CUP');
    if (!out[cur]) out[cur] = [];
  }
  for (const cur of Object.keys(out)) {
    out[cur] = groupServiceCashByConcept(rows, conceptByRefId, cur);
  }
  return out;
}

/* ── Cliente mínimo (estructura del builder PostgREST — para la ruta y los tests) ── */
export interface PostgrestLikeResult {
  data: unknown;
  error: { message?: string; code?: string } | null;
}
export interface SupabaseLikeQuery extends PromiseLike<PostgrestLikeResult> {
  eq(column: string, value: unknown): SupabaseLikeQuery;
  gte(column: string, value: unknown): SupabaseLikeQuery;
  lte(column: string, value: unknown): SupabaseLikeQuery;
  in(column: string, values: unknown[]): SupabaseLikeQuery;
}
export interface SupabaseLikeClient {
  from(table: string): { select(columns: string): SupabaseLikeQuery };
}

export interface ServiceConceptFetchParams {
  storeId: string;
  /** true = SIN ventana de fechas (idéntico a p_include_all_dates del RPC). */
  includeAllDates: boolean;
  /** Ventana del período (inclusive) sobre payment_date — la misma del RPC. */
  dateFrom?: string;
  dateTo?: string;
}

const CHUNK = 150;

/**
 * Consulta el desglose con LOS MISMOS CRITERIOS del grupo `payments` del RPC
 * get_cash_report (§7: jamás una consulta paralela con criterios distintos):
 *
 *   1. Filas: payment_transactions (ref_id, amount, currency) con
 *      store_id + ref_type='service' + payment_method='cash' + ventana
 *      payment_date (omitida si includeAllDates).
 *   2. Conceptos: received_services (id, service_type_name) de los ref_id —
 *      en lotes de 150 (mismo chunking del resto de la ruta). RLS vigente:
 *      se llama con el cliente de SESIÓN autenticada (no service_role) y el
 *      store_id sale del perfil del usuario — multitienda intacta.
 *
 * Degradación limpia: cualquier fallo → warn + null (el reporte continúa
 * sin desglose; el total global nunca depende de este helper).
 */
export async function fetchServiceConceptBreakdown(
  client: SupabaseLikeClient,
  params: ServiceConceptFetchParams,
): Promise<ServicesConceptBreakdown | null> {
  try {
    let query = client
      .from('payment_transactions')
      .select('ref_id, amount, currency, payment_method')
      .eq('store_id', params.storeId)
      .eq('ref_type', 'service')
      .eq('payment_method', 'cash');
    if (!params.includeAllDates) {
      if (params.dateFrom) query = query.gte('payment_date', params.dateFrom);
      if (params.dateTo) query = query.lte('payment_date', params.dateTo);
    }
    const res = (await query) as unknown as PostgrestLikeResult;
    if (res.error) throw new Error(res.error.message || 'error de consulta');
    const rows = (Array.isArray(res.data) ? res.data : []) as ServicePaymentRow[];

    const refIds = [...new Set((rows || []).map(r => (r.ref_id ? String(r.ref_id) : '')).filter(Boolean))];
    const conceptByRefId = new Map<string, string | null>();
    for (let i = 0; i < refIds.length; i += CHUNK) {
      const chunk = refIds.slice(i, i + CHUNK);
      const svcRes = (await client
        .from('received_services')
        .select('id, service_type_name')
        .in('id', chunk)) as unknown as PostgrestLikeResult;
      if (svcRes.error) throw new Error(svcRes.error.message || 'error de consulta');
      for (const svc of (Array.isArray(svcRes.data) ? svcRes.data : []) as Array<{ id: string; service_type_name?: string | null }>) {
        conceptByRefId.set(String(svc.id), svc.service_type_name ?? null);
      }
    }
    return buildServicesConceptBreakdown(rows, conceptByRefId);
  } catch (err: unknown) {
    console.warn('[cash-report] desglose de servicios por concepto no disponible:', (err as { message?: string })?.message);
    return null;
  }
}
