/**
 * collection-currency.ts — FUENTE ÚNICA de la reconstrucción de la MONEDA REAL
 * DE COBRO de las ventas para el Reporte de Entrega.
 *
 * INCIDENTE 2026-10-16 (ENERVIDA-VITALLCONS):
 *   El reporte clasificaba los cobros por `sale_currency` de la transacción.
 *   El modelo canónico de create_sale_v2 (usePOSCheckout.ts L129-182) guarda los
 *   pools de la transacción (cash_amount/transfer_amount/zelle_amount) en CUP
 *   canónico — convertidos a la tasa del cobro — y `sale_currency='USD'` SOLO
 *   cuando hay Zelle. Por eso un cobro hecho en efectivo USD (p. ej. 40 USD ×
 *   tasa 790 = 31 600) quedaba clasificado como CUP: la columna USD del reporte
 *   quedaba vacía y el importe USD desaparecía dentro del efectivo CUP.
 *
 *   Además, cuando la línea tiene total 0 (precio histórico 0 con sobrepago
 *   documentado, p. ej. SKU 108: total 0 pero cash_amount=12 000 + incidencia),
 *   el reparto proporcional por valor de línea daba 0 a todo: la venta real de
 *   12 000 CUP se mostraba en cero.
 *
 * Reglas de reconstrucción (deterministas, sin inventar importes):
 *
 *   1. VERDAD A NIVEL ÍTEM (ventas V2): si el ítem registró la fila de pago
 *      (`cash_paid`/`cash_currency`, `transfer_paid`/`transfer_currency`,
 *      `zelle_paid`/`zelle_currency`), esa es la moneda real del cobro y se usa
 *      tal cual (sin conversión).
 *   2. LEGADO (filas de pago NULL): los pools de la transacción están en CUP
 *      canónico. Para cada método con pool > 0:
 *        - zelle → el cobro es USD (Zelle es un riel USD por diseño): USD =
 *          pool / tasa, usando la tasa válida del contexto (sale_exchange_rate
 *          de la venta o la tasa de la línea). Sin tasa válida → se mantiene en
 *          CUP (no se inventa conversión).
 *        - cash/transfer → si TODAS las líneas del cobro son de moneda original
 *          USD y el pool coincide EXACTAMENTE con el valor canónico CUP de esas
 *          líneas (|pool − ΣlíneaCUP| ≤ 0,01), el cobro se hizo en USD (la
 *          conversión exacta es la marca del RPC): USD = Σ valor original de
 *          las líneas. Cualquier residual ≠ 0 evidencia un cobro en CUP
 *          (los sobrepagos/diferencias se documentan en CUP —
 *          payment_incidents.received_cup) y el importe CUP real del pool es el
 *          que se reporta (incluye el sobrepago recibido).
 *   3. Transacciones con líneas de monedas originales mezcladas y filas de pago
 *      NULL: indistinguibles a nivel de pool → se reportan en CUP canónico
 *      (conservador, sin duplicar) y se marcan `mixedUnresolved` para auditoría.
 *   4. REPARTO por ítem: proporcional al valor CUP de la línea; si la suma de
 *      líneas es 0 pero hay cobro (sobrepago con precio 0), el cobro se asigna
 *      por partes iguales (con 1 ítem: el cobro completo — caso SKU 108).
 *   5. NUNCA se suma CUP + USD: buckets separados por moneda en todo el módulo.
 *
 * MISIÓN PAGOS MIXTOS MULTIMONEDA (2026-10-24) — fuente LEDGER autoritativa:
 *   Las ventas creadas con `payment_components` (create_sale_v2 §13.7, migración
 *   20261024150000) persisten en payment_transactions UNA FILA POR COMPONENTE
 *   con su moneda real y la TASA DE LA OPERACIÓN. Para esas ventas la
 *   reconstrucción heurística NO se usa: el ledger es la verdad directa
 *   (marcador: filas cash/transfer en USD — imposibles en el flujo previo,
 *   que solo insertaba CUP canónico para esos métodos; o venta zelle pura,
 *   donde ambas fuentes coinciden). Ventas históricas: reconstrucción previa.
 *
 * REGLA DE MONEDA PREDOMINANTE (misión §2 — clasificación del Reporte
 * Entrega): la venta completa se asigna al reporte de la moneda cuyo
 * componente de pago tenga MAYOR PESO ECONÓMICO convertido a base común
 * (CUP) con la TASA PERSISTIDA de la operación:
 *   · equivalente_cup_usd = importe_usd × tasa_operación
 *   · predomina USD ⇔ equivalente_cup_usd > importe_cup + 0,01
 *   · predomina CUP ⇔ importe_cup > equivalente_cup_usd + 0,01
 *   · EMPATE (±0,01) ⇒ CUP — regla determinista documentada: CUP es la moneda
 *     de cuenta interna del sistema (§ 20260702000003); evita clasificar
 *     arbitrariamente en puntos distintos del sistema.
 * Las UNIDADES FÍSICAS van TODAS al reporte de la moneda predominante; el
 * reporte de la moneda secundaria refleja SOLO su componente monetario
 * cobrado, con cantidad CERO (sin duplicar unidades ni ingreso — misión §4).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * MISIÓN CP-FIX-DELIVERY-REPORT-AND-LANDING-RESPONSIVE-001 (2026-11-20) —
 * SEPARACIÓN NIVEL ÍTEM / NIVEL TRANSACCIÓN (incidente ENERVIDA 19/11/2026):
 *
 *   Incidente: venta 40 USD @930 (barilla, cobro efectivo USD) + 1.800 CUP
 *   (escoba, transferencia) + 800 CUP (detergente, efectivo) = 39.800 CUP.
 *   Con componentes (§13.7) el ledger es autoritativo y la rama ledger-directo
 *   repartía CADA bucket proporcionalmente entre TODOS los artículos,
 *   ignorando las filas de pago explícitas por ítem → la escoba recibía
 *   cash_usd ≈ 1,81 USD artificial (hoja USD + asterisco falso).
 *
 *   NIVEL 1 — ARTÍCULO (atribución por ítem): cuando el ítem registró su fila
 *   de pago (cash_paid/cash_currency, transfer_paid/…, zelle_paid/…), esa fila
 *   es la verdad documental de SU cobro y se usa TAL CUAL. La moneda de
 *   clasificación del artículo procede de SU moneda de venta registrada
 *   (currency), no de la moneda predominante de la transacción.
 *   NIVEL 2 — TRANSACCIÓN (totales): el ledger (payment_transactions) sigue
 *   siendo la autoridad de los BUCKETS por (método, moneda), de sales_split,
 *   de los grupos `sales` y de la conciliación total. No se sacrifica el
 *   ledger para corregir la presentación individual.
 *
 *   Residual controlado: si el bucket (método, moneda) excede lo declarado en
 *   filas explícitas, el residual se prorratea SOLO entre los ítems SIN fila
 *   explícita de ese método, proporcional al valor CUP de línea (Σ=0 → partes
 *   iguales), y queda MARCADO como estimado (cupEstimated/usdEstimated +
 *   attribution.proratedBuckets). Si las filas explícitas contradicen al
 *   ledger (exceden el bucket, o declaran un bucket inexistente), se conserva
 *   el desglose documental, el bucket del ledger y se señala
 *   attribution.ledgerMismatch — jamás se silencia ni se convierte en una
 *   asignación aparentemente exacta.
 *
 *   CANTIDADES (§2.5): la cantidad de cada artículo se atribuye por SU cobro:
 *   ítem cobrado en UNA moneda → esa moneda (= su moneda de venta en el caso
 *   normal); ítem con cobro mixto → moneda predominante DEL ÍTEM (peso
 *   económico, empate ⇒ CUP); ítem sin cobro atribuido → SU moneda de venta.
 *   Invariante: qty_cup + qty_usd = total_quantity por ítem.
 *   DISCREPANCIA DOCUMENTADA con la regla histórica: la misión 2026-10-24
 *   atribuía TODAS las unidades de la venta a la moneda predominante de la
 *   TRANSACCIÓN (tests mixed-payments-predominant G1) y la auditoría
 *   2026-10-19 atribuía la cantidad por moneda de COBRO por línea (SKU 128:
 *   1u CUP + 2u USD — regla de negocio exigida que SE CONSERVA para cobros
 *   cruzados). La regla actual sigue el criterio de la misión 2026-11-20
 *   (§2.5): la clasificación por artículo, no por venta.
 *
 *   INCIDENCIAS (§2.4 — has_payment_incident): comparación NATIVA cuando el
 *   ítem se cobró íntegramente en SU moneda (USD cobrado vs valor USD de la
 *   línea — las diferencias de TASA entre la línea y el cobro no son
 *   incidencia, son conversión); comparación en equivalente CUP a la TASA DEL
 *   COBRO cuando el cobro es cruzado o mixto; la incidencia a nivel venta
 *   (Σcobrado ≠ Σvalor de líneas) sigue marcando sus líneas (trazabilidad).
 *   Los prorrateos estimados NO son incidencia por sí mismos (se auditan por
 *   attribution), pero sus diferencias monetarias reales sí se señalan.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Consumidores:
 *   - /api/cash-report           → sales_split + grupos `sales` por (método, moneda)
 *   - /api/cash-report/items-summary → tabla por producto + clasificación por venta
 *   - /api/cash-report/payment-totals → fuente 2 de computeDailySummary
 *   - /api/cash-report/details   → pertenencia de cada venta al grupo (método, moneda)
 */

import { lineTotalCup } from './summary';

export const COLLECTION_EPS = 0.01;

/**
 * Fila de payment_transactions (ref_type='sale') de UNA venta — la fuente
 * autoritativa del cobro cuando la venta se creó con componentes (v2.25.0).
 */
export interface LedgerPayment {
  payment_method: string;
  currency: string;
  /** Importe REAL en la moneda de la fila (sin convertir). */
  amount: number;
  /** Tasa de la operación persistida en la fila (USD > 1; CUP = 1). */
  exchange_rate: number;
}

/**
 * ¿El ledger de esta venta es autoritativo para la moneda real de cobro?
 * Marcadores del flujo con componentes (create_sale_v2 §13.7):
 *   · cualquier fila cash/transfer en USD — el flujo previo SOLO insertaba
 *     CUP canónico para esos métodos (la USD era invisible);
 *   · venta zelle pura (todas las filas zelle-USD): ambas fuentes producen
 *     el mismo resultado, se usa la directa (tasa exacta persistida).
 */
export function ledgerIsAuthoritative(payments: LedgerPayment[]): boolean {
  if (payments.length === 0) return false;
  const hasCashOrTransferUsd = payments.some(
    p => (p.payment_method === 'cash' || p.payment_method === 'transfer') && normCur(p.currency) === 'USD',
  );
  if (hasCashOrTransferUsd) return true;
  // CP-FIN-004: exterior en cualquiera de sus dos identificadores.
  const nonExterior = payments.filter(p => !isExteriorPayMethod(p.payment_method));
  return nonExterior.length === 0 && payments.every(p => normCur(p.currency) === 'USD');
}

export interface CollectionTx {
  id?: string;
  cash_amount?: number | string | null;
  transfer_amount?: number | string | null;
  zelle_amount?: number | string | null;
  /** CP-FIN-004: pool canónico de Transf. Exterior (suma con zelle_amount heredada). */
  external_transfer_amount?: number | string | null;
  sale_currency?: string | null;
  sale_exchange_rate?: number | string | null;
}

export interface CollectionItem {
  id?: string;
  transaction_id?: string;
  product_id?: string;
  product_name?: string | null;
  sku?: string | null;
  quantity?: number | string | null;
  price_at_sale?: number | string | null;
  price_at_sale_cup?: number | string | null;
  /** Moneda ORIGINAL de la línea (USD/CUP) — no `price_currency` (legacy). */
  currency?: string | null;
  exchange_rate?: number | string | null;
  cash_paid?: number | string | null;
  cash_currency?: string | null;
  transfer_paid?: number | string | null;
  transfer_currency?: string | null;
  zelle_paid?: number | string | null;
  zelle_currency?: string | null;
  /** CP-FIN-004: atribución canónica del exterior (suma con zelle_paid heredada). */
  external_transfer_paid?: number | string | null;
  external_transfer_currency?: string | null;
}

/** CP-FIN-004: lectura DUAL del pool/atribución del exterior (heredado + canónico). */
const exteriorPoolOf = (tx: CollectionTx): number =>
  num(tx.zelle_amount) + num(tx.external_transfer_amount);
const exteriorPaidOf = (it: CollectionItem): number =>
  num(it.zelle_paid) + num(it.external_transfer_paid);

export type PayMethod = 'cash' | 'transfer' | 'zelle';
export const PAY_METHODS: PayMethod[] = ['cash', 'transfer', 'zelle'];

// CP-FIN-004: el bucket interno 'zelle' agrega el medio «Transf. Exterior»
// en CUALQUIERA de sus dos identificadores (canónico 'external_transfer' +
// heredado 'zelle'). Normalización de INGESTA en un solo punto.
export function toPayMethod(raw: string | null | undefined): PayMethod {
  const m = (raw || 'cash') as string;
  if (m === 'external_transfer' || m === 'zelle') return 'zelle';
  if (m === 'transfer') return 'transfer';
  return 'cash';
}
export const isExteriorPayMethod = (raw: string | null | undefined): boolean =>
  raw === 'external_transfer' || raw === 'zelle';

export interface MethodAmounts { cash: number; transfer: number; zelle: number }
export interface ItemCollections {
  cup: MethodAmounts;
  usd: MethodAmounts;
  /**
   * Equivalente CUP del lado USD atribuido a ESTE ítem, calculado con la tasa
   * DEL COBRO (tasa persistida del bucket del ledger, o la tasa de la línea en
   * filas explícitas) — nunca la tasa global vigente. Base de la conciliación
   * por artículo y de la regla de incidencias §2.4 (CP-FIX 2026-11-20).
   */
  usdCupEquiv?: number;
  /** Porción del cobro CUP atribuida por PRORRATEO estimado (no documental). */
  cupEstimated?: MethodAmounts;
  /** Porción del cobro USD atribuida por PRORRATEO estimado (no documental). */
  usdEstimated?: MethodAmounts;
}

export interface CollectionBucket {
  method: PayMethod;
  currency: string;
  /** Importe en la MONEDA del cobro (original, sin convertir). */
  amount: number;
  /** Equivalente CUP del importe (tasa del contexto) para conciliación. */
  amountCup: number;
  origin: 'explicit-row' | 'legacy-exact-usd' | 'legacy-cup' | 'zelle-usd' | 'zelle-no-rate-cup';
}

export interface TxCollectionResult {
  /** Buckets (método, moneda) de la transacción — fuente de sales_split y grupos. */
  buckets: CollectionBucket[];
  /** Colecciones por ítem (índice de entrada) para la tabla por producto. */
  perItem: ItemCollections[];
  /** Líneas de monedas originales mezcladas reconstruidas como CUP (limitación). */
  mixedUnresolved: boolean;
  /** MISIÓN PAGOS MIXTOS: 'ledger' cuando la moneda real vino de las filas de
   * payment_transactions (flujo con componentes); 'reconstruction' para el
   * análisis heurístico previo (ventas históricas). */
  source: 'ledger' | 'reconstruction';
  /**
   * CP-FIX 2026-11-20 (§2.3): evidencia auditable de la atribución por ítem —
   * distingue cobros EXPLÍCITOS (filas del ítem, Nivel 1) de cobros ESTIMADOS
   * (prorrateo de residual, fallback controlado) y señala contradicciones
   * entre el desglose individual y el ledger sin silenciarlas.
   */
  attribution: TxAttributionInfo;
}

export interface TxAttributionInfo {
  /** Ítems con ≥1 fila de pago explícita usada tal cual (Nivel 1). */
  explicitItems: number;
  /** Buckets cuyo residual se prorrateó entre ítems sin fila (estimado). */
  proratedBuckets: number;
  /** Filas explícitas que contradicen al ledger (auditable — no se silencia). */
  ledgerMismatch: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const normCur = (c: unknown): string => String(c || 'CUP').trim().toUpperCase() || 'CUP';

/** Valor CUP canónico de la línea (misma fórmula centralizada del reporte). */
export function lineCupOf(item: CollectionItem): number {
  return lineTotalCup(item.price_at_sale_cup, item.price_at_sale, item.exchange_rate, num(item.quantity));
}

/**
 * Valor ORIGINAL USD de la línea (solo si la línea se vendió en USD).
 * Guarda de consistencia: `price_at_sale × exchange_rate` debe reproducir
 * `price_at_sale_cup`; si el triple es inconsistente se deriva del canónico
 * (líneaCUP / tasa) en vez de inventar un importe.
 */
export function lineUsdOf(item: CollectionItem): number {
  if (normCur(item.currency) !== 'USD') return 0;
  const rate = num(item.exchange_rate);
  const qty = num(item.quantity);
  if (rate <= 0) return 0;
  // Comparación a nivel UNITARIO: price_at_sale y price_at_sale_cup son precios
  // unitarios (lineTotalCup multiplica por cantidad) — mismo plano, sin el sesgo de qty.
  const unitCandidate = num(item.price_at_sale);
  const unitCanonical = num(item.price_at_sale_cup);
  if (unitCanonical > 0 && Math.abs(unitCandidate * rate - unitCanonical) > Math.max(COLLECTION_EPS, unitCanonical * 0.01)) {
    return (unitCanonical / rate) * qty; // derivado del canónico, no inventado
  }
  return unitCandidate * qty;
}

const emptyAmounts = (): MethodAmounts => ({ cash: 0, transfer: 0, zelle: 0 });
const emptyCollections = (): ItemCollections => ({ cup: emptyAmounts(), usd: emptyAmounts() });

function addBucket(
  buckets: CollectionBucket[],
  method: PayMethod,
  currency: string,
  amount: number,
  amountCup: number,
  origin: CollectionBucket['origin'],
): void {
  if (!(Math.abs(amount) > COLLECTION_EPS) && !(Math.abs(amountCup) > COLLECTION_EPS)) return;
  const existing = buckets.find(b => b.method === method && b.currency === currency);
  if (existing) {
    existing.amount += amount;
    existing.amountCup += amountCup;
  } else {
    buckets.push({ method, currency, amount, amountCup, origin });
  }
}

/**
 * Reconstruye las colecciones reales (método × moneda) de UNA transacción.
 * `items` deben ser los transaction_items de ESA transacción (puede ser vacío:
 * los buckets quedan a nivel transacción y perItem queda vacío).
 *
 * MISIÓN PAGOS MIXTOS (2026-10-24): si `payments` (filas de payment_transactions
 * ref_type='sale') es autoritativo (ver ledgerIsAuthoritative), los buckets
 * se toman DIRECTO del ledger — moneda real y tasa persistida por fila, sin
 * heurística. El reparto por ítem (tabla por producto) de cada moneda es
 * proporcional al valor CUP de la línea (Σ=0 → partes iguales), documentado.
 */
export function reconstructTxCollections(
  tx: CollectionTx,
  items: CollectionItem[],
  payments?: LedgerPayment[],
): TxCollectionResult {
  const buckets: CollectionBucket[] = [];
  const perItem = items.map(() => emptyCollections());
  let mixedUnresolved = false;

  // ── 0. LEDGER autoritativo (ventas con componentes, v2.25.0) ──
  if (payments && payments.length > 0 && ledgerIsAuthoritative(payments)) {
    const byKey = new Map<string, CollectionBucket & { amountCupRaw: number }>();
    for (const p of payments) {
      // CP-FIN-004: normalización dual del exterior al bucket interno.
      const method = toPayMethod(p.payment_method);
      if (!PAY_METHODS.includes(method)) continue;
      const cur = normCur(p.currency);
      const amount = num(p.amount);
      const rate = num(p.exchange_rate) > 0 ? num(p.exchange_rate) : (cur === 'USD' ? num(tx.sale_exchange_rate) || 1 : 1);
      const amountCup = cur === 'USD' ? amount * rate : amount;
      const key = `${method}|${cur}`;
      const b = byKey.get(key);
      if (b) {
        b.amount += amount;
        b.amountCup += amountCup;
      } else {
        byKey.set(key, { method, currency: cur, amount, amountCup, origin: 'explicit-row', amountCupRaw: amountCup });
      }
    }
    for (const b of byKey.values()) {
      if (Math.abs(b.amount) > COLLECTION_EPS || Math.abs(b.amountCup) > COLLECTION_EPS) {
        buckets.push({ method: b.method, currency: b.currency, amount: b.amount, amountCup: b.amountCup, origin: 'explicit-row' });
      }
    }

    // ── NIVEL 1 (CP-FIX 2026-11-20): atribución por artículo ──
    // Las filas de pago explícitas del ítem (cash_paid/cash_currency, …) son
    // la verdad documental de SU cobro y se usan TAL CUAL. El bucket del
    // ledger (Nivel 2) NO se toca: sigue siendo la autoridad de los totales.
    const lineCupLed = items.map(lineCupOf);
    const lineRateLed = items.map(it => (num(it.exchange_rate) > 0 ? num(it.exchange_rate) : 1));
    const explicitItems = new Set<number>();
    const explicitSum = new Map<string, number>(); // `${method}|${currency}` → Σ filas explícitas
    for (const method of PAY_METHODS) {
      // CP-FIN-004: atribución dual del exterior (heredado + canónico).
      const paidOf = (it: CollectionItem): number =>
        method === 'zelle' ? exteriorPaidOf(it) : num(it[`${method}_paid` as keyof CollectionItem]);
      const curField = `${method}_currency` as keyof CollectionItem;
      items.forEach((it, idx) => {
        const amt = paidOf(it);
        if (amt <= 0) return; // sin fila explícita de este método (escoba cash_paid=0 no es fila)
        explicitItems.add(idx);
        const cur = normCur(it[curField]);
        const key = `${method}|${cur}`;
        explicitSum.set(key, (explicitSum.get(key) ?? 0) + amt);
        // Tasa del cobro: la del bucket del ledger (tasa persistida de la
        // operación); si el bucket no existe (contradicción), la tasa de la línea.
        const bucket = byKey.get(key);
        const rate = bucket && bucket.amount > COLLECTION_EPS && bucket.amountCup > 0
          ? bucket.amountCup / bucket.amount
          : (cur === 'USD' ? lineRateLed[idx] : 1);
        if (cur === 'USD') {
          perItem[idx].usd[method] += amt;
          perItem[idx].usdCupEquiv = (perItem[idx].usdCupEquiv ?? 0) + amt * rate;
        } else {
          perItem[idx].cup[method] += amt;
        }
      });
    }

    // ── Fallback controlado: residual del bucket (ledger − explícito) ──
    // Se prorratea SOLO entre los ítems SIN fila explícita de ese método,
    // proporcional al valor CUP de línea (Σ=0 → partes iguales), y queda
    // marcado como ESTIMADO. Con filas explícitas completas (caso 19/11) el
    // residual es 0 y NO hay prorrateo: atribución exacta y documental.
    let proratedBuckets = 0;
    let ledgerMismatch = false;
    for (const b of buckets) {
      const key = `${b.method}|${b.currency}`;
      const residual = b.amount - (explicitSum.get(key) ?? 0);
      if (Math.abs(residual) <= COLLECTION_EPS) continue; // desglose exacto — sin prorrateo
      if (residual < 0) {
        // Las filas explícitas EXCEDEN el ledger: contradicción documental.
        // Se conserva el desglose del ítem (Nivel 1) y el bucket (Nivel 2);
        // la diferencia queda señalada para auditoría (no se silencia).
        ledgerMismatch = true;
        continue;
      }
      const paidField = `${b.method}_paid` as keyof CollectionItem;
      const candidates = items.map((_, idx) => idx).filter(idx => num(items[idx][paidField]) <= 0);
      const target = candidates.length > 0 ? candidates : items.map((_, idx) => idx);
      proratedBuckets++;
      const sumTargetCup = target.reduce((s, idx) => s + lineCupLed[idx], 0);
      const rate = b.amount > COLLECTION_EPS && b.amountCup > 0 ? b.amountCup / b.amount : 1;
      for (const idx of target) {
        const share = sumTargetCup > 0 ? residual * (lineCupLed[idx] / sumTargetCup) : residual / target.length;
        if (b.currency === 'USD') {
          perItem[idx].usd[b.method] += share;
          perItem[idx].usdCupEquiv = (perItem[idx].usdCupEquiv ?? 0) + share * rate;
          perItem[idx].usdEstimated = perItem[idx].usdEstimated ?? emptyAmounts();
          perItem[idx].usdEstimated![b.method] += share;
        } else {
          perItem[idx].cup[b.method] += share;
          perItem[idx].cupEstimated = perItem[idx].cupEstimated ?? emptyAmounts();
          perItem[idx].cupEstimated![b.method] += share;
        }
      }
    }
    // Contradicción documento↔ledger: filas explícitas en (método, moneda)
    // para los que el ledger NO tiene bucket. Se conservan (verdad documental
    // del ítem) y se señalan — condiciones inciertas auditables (§2.3).
    for (const [key, sum] of explicitSum) {
      if (sum > COLLECTION_EPS && !byKey.has(key)) ledgerMismatch = true;
    }
    return {
      buckets, perItem, mixedUnresolved: false, source: 'ledger',
      attribution: { explicitItems: explicitItems.size, proratedBuckets, ledgerMismatch },
    };
  }

  const lineCup = items.map(lineCupOf);
  const lineUsd = items.map(lineUsdOf);
  const lineRate = items.map(it => (num(it.exchange_rate) > 0 ? num(it.exchange_rate) : 1));
  const origCurs = items.map(it => normCur(it.currency));
  // CP-FIX 2026-11-20: evidencia de atribución (§2.3) también en la vía histórica.
  const heuristicExplicit = new Set<number>();
  let heuristicProrated = 0;
  const markEstimated = (idx: number, side: 'cup' | 'usd', method: PayMethod, share: number): void => {
    if (side === 'cup') {
      perItem[idx].cupEstimated = perItem[idx].cupEstimated ?? emptyAmounts();
      perItem[idx].cupEstimated![method] += share;
    } else {
      perItem[idx].usdEstimated = perItem[idx].usdEstimated ?? emptyAmounts();
      perItem[idx].usdEstimated![method] += share;
    }
  };

  for (const method of PAY_METHODS) {
    // CP-FIN-004: pool dual del exterior (zelle_amount heredada +
    // external_transfer_amount canónica) y atribución dual por ítem.
    const pool = method === 'zelle' ? exteriorPoolOf(tx) : num(tx[`${method}_amount` as keyof CollectionTx]);
    const paidOf = (it: CollectionItem): number =>
      method === 'zelle' ? exteriorPaidOf(it) : num(it[`${method}_paid` as keyof CollectionItem]);
    const curField = `${method}_currency` as keyof CollectionItem;

    // ── 1. Filas de pago explícitas a nivel ítem (ventas V2): verdad del cobro ──
    const explicitIdx = new Set<number>();
    let explicitEquivCup = 0;
    items.forEach((it, idx) => {
      const amt = paidOf(it);
      if (amt > 0) {
        explicitIdx.add(idx);
        heuristicExplicit.add(idx);
        const cur = normCur(it[curField]);
        if (cur === 'USD') {
          perItem[idx].usd[method] += amt;
          perItem[idx].usdCupEquiv = (perItem[idx].usdCupEquiv ?? 0) + amt * lineRate[idx];
          addBucket(buckets, method, 'USD', amt, amt * lineRate[idx], 'explicit-row');
          explicitEquivCup += amt * lineRate[idx];
        } else {
          perItem[idx].cup[method] += amt;
          addBucket(buckets, method, cur, amt, amt, 'explicit-row');
          explicitEquivCup += amt;
        }
      }
    });

    // ── 2. Legado: residual del pool sin filas explícitas (pools en CUP canónico) ──
    const residual = pool - explicitEquivCup;
    if (residual <= COLLECTION_EPS) continue; // pool cubierto por filas explícitas (o pool 0)
    const legacyIdx = items.map((_, idx) => idx).filter(idx => !explicitIdx.has(idx));

    if (legacyIdx.length === 0) {
      // Pool con filas explícitas + residual (sobrepago documentado del pool):
      // se atribuye como CUP a nivel transacción, repartido por valor de línea.
      const sumLineCup = lineCup.reduce((s, v) => s + v, 0);
      addBucket(buckets, method, 'CUP', residual, residual, 'legacy-cup');
      heuristicProrated++;
      if (sumLineCup > 0) {
        items.forEach((_, idx) => {
          const share = residual * (lineCup[idx] / sumLineCup);
          perItem[idx].cup[method] += share;
          markEstimated(idx, 'cup', method, share);
        });
      } else if (items.length > 0) {
        items.forEach((_, idx) => {
          const share = residual / items.length;
          perItem[idx].cup[method] += share;
          markEstimated(idx, 'cup', method, share);
        });
      }
      continue;
    }

    const sumLineCup = legacyIdx.reduce((s, idx) => s + lineCup[idx], 0);
    const sumLineUsd = legacyIdx.reduce((s, idx) => s + lineUsd[idx], 0);
    const allUsd = legacyIdx.every(idx => origCurs[idx] === 'USD');
    const anyUsd = legacyIdx.some(idx => origCurs[idx] === 'USD');

    if (method === 'zelle') {
      // Zelle es un riel USD: la moneda del cobro es USD si hay tasa válida.
      const txRate = num(tx.sale_exchange_rate);
      const itemRate = Math.max(...legacyIdx.map(idx => num(items[idx].exchange_rate) || 0), 0);
      const rate = txRate > 1 ? txRate : itemRate;
      if (rate > 1) {
        const usdAmt = residual / rate;
        addBucket(buckets, method, 'USD', usdAmt, residual, 'zelle-usd');
        heuristicProrated++;
        distribute(perItem, legacyIdx, method, 'usd', usdAmt, lineCup, sumLineCup, { estimated: true, cupEquivTotal: residual });
      } else {
        // Sin tasa válida en el contexto: NO se inventa conversión → CUP canónico.
        addBucket(buckets, method, 'CUP', residual, residual, 'zelle-no-rate-cup');
        heuristicProrated++;
        distribute(perItem, legacyIdx, method, 'cup', residual, lineCup, sumLineCup, { estimated: true });
      }
    } else if (allUsd && sumLineCup > 0 && Math.abs(residual - sumLineCup) <= COLLECTION_EPS) {
      // Conversión exacta del RPC: el cobro se hizo en USD (monto original de las líneas).
      const usdAmt = sumLineUsd > 0 ? sumLineUsd : residual / (lineRate[legacyIdx[0]] || 1);
      addBucket(buckets, method, 'USD', usdAmt, residual, 'legacy-exact-usd');
      heuristicProrated++;
      distribute(perItem, legacyIdx, method, 'usd', usdAmt, lineCup, sumLineCup, { estimated: true, cupEquivTotal: residual });
    } else {
      // Cobro en CUP (incluye sobrepagos documentados en CUP y el caso línea 0
      // con cobro real — SKU 108). Monedas originales mezcladas: limitación.
      if (anyUsd && !allUsd) mixedUnresolved = true;
      addBucket(buckets, method, 'CUP', residual, residual, 'legacy-cup');
      heuristicProrated++;
      distribute(perItem, legacyIdx, method, 'cup', residual, lineCup, sumLineCup, { estimated: true });
    }
  }

  return {
    buckets, perItem, mixedUnresolved, source: 'reconstruction',
    attribution: { explicitItems: heuristicExplicit.size, proratedBuckets: heuristicProrated, ledgerMismatch: false },
  };
}

// ── REGLA DE MONEDA PREDOMINANTE (misión §2 — 2026-10-24) ─────────────────────

export interface PredominantClassification {
  /** Moneda cuyo componente tiene mayor peso económico (empate ⇒ CUP). */
  currency: 'CUP' | 'USD';
  /** Importe efectivamente cobrado en CUP (buckets CUP). */
  cupCollected: number;
  /** Importe efectivamente cobrado en USD (buckets USD). */
  usdCollected: number;
  /** Equivalente CUP del componente USD con la TASA PERSISTIDA de la operación. */
  usdCollectedCup: number;
  /** Tasa de la operación (usdCollectedCup / usdCollected; 0 sin componente USD). */
  rate: number;
  /** Empate económico exacto (±0.01) — la regla determinista asignó CUP. */
  tie: boolean;
}

/**
 * Clasifica una venta por MONEDA PREDOMINANTE con la tasa persistida de la
 * operación (misión §2): comparación del peso económico en base común CUP.
 * Empate (±0.01) ⇒ CUP (moneda de cuenta interna — determinista, documentada).
 */
export function resolvePredominantCurrency(result: TxCollectionResult): PredominantClassification {
  let cupCollected = 0;
  let usdCollected = 0;
  let usdCollectedCup = 0;
  for (const b of result.buckets) {
    if (b.currency === 'USD') {
      usdCollected += b.amount;
      usdCollectedCup += b.amountCup;
    } else {
      cupCollected += b.amount;
    }
  }
  const rate = usdCollected > COLLECTION_EPS ? usdCollectedCup / usdCollected : 0;
  const tie = Math.abs(usdCollectedCup - cupCollected) <= COLLECTION_EPS && usdCollected > COLLECTION_EPS && cupCollected > COLLECTION_EPS;
  const currency: 'CUP' | 'USD' = usdCollectedCup > cupCollected + COLLECTION_EPS ? 'USD' : 'CUP';
  return { currency, cupCollected, usdCollected, usdCollectedCup, rate, tie };
}

/** Reparto por ítem: proporcional al valor de línea; si Σlínea=0, partes iguales.
 * CP-FIX 2026-11-20: `opts.estimated` marca la porción como PRORRATEO estimado
 * (fallback controlado — distinto del cobro explícito documental) y
 * `opts.cupEquivTotal` acumula el equivalente CUP del lado USD a la tasa del
 * cobro (base de la conciliación e incidencias por artículo). */
function distribute(
  perItem: ItemCollections[],
  idxs: number[],
  method: PayMethod,
  side: 'cup' | 'usd',
  amount: number,
  lineCup: number[],
  sumLineCup: number,
  opts?: { estimated?: boolean; cupEquivTotal?: number },
): void {
  if (idxs.length === 0 || amount === 0) return;
  const share = (total: number, idx: number): number =>
    sumLineCup > 0 ? total * (lineCup[idx] / sumLineCup) : total / idxs.length;
  for (const idx of idxs) {
    const part = share(amount, idx);
    perItem[idx][side][method] += part;
    if (opts?.estimated) {
      if (side === 'cup') {
        perItem[idx].cupEstimated = perItem[idx].cupEstimated ?? emptyAmounts();
        perItem[idx].cupEstimated![method] += part;
      } else {
        perItem[idx].usdEstimated = perItem[idx].usdEstimated ?? emptyAmounts();
        perItem[idx].usdEstimated![method] += part;
      }
    }
    if (side === 'usd' && opts?.cupEquivTotal != null) {
      perItem[idx].usdCupEquiv = (perItem[idx].usdCupEquiv ?? 0) + share(opts.cupEquivTotal, idx);
    }
  }
}

// ── sales_split por moneda (consumido por computeDailySummary) ──────────────

export interface SalesSplitAccum { [currency: string]: { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number } }

/**
 * Acumula los buckets de colección por MONEDA (nunca mezcla CUP y USD).
 * `mixedUnsplit` queda 0: la reconstrucción resuelve cada cobro a su moneda;
 * los casos indistinguibles (monedas originales mezcladas sin filas de pago)
 * permanecen en CUP canónico — igual que el comportamiento previo del pool —
 * sin sacarlos del efectivo esperado (evita regresiones en otros días).
 */
export function accumulateSalesSplit(acc: SalesSplitAccum, result: TxCollectionResult): void {
  for (const b of result.buckets) {
    if (!acc[b.currency]) acc[b.currency] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
    acc[b.currency][b.method] += b.amount;
    acc[b.currency].total += b.amount;
  }
}

/** Grupos `sales` (método × moneda) coherentes con la reconstrucción. */
export function buildSalesGroups(
  results: Array<{ tx: CollectionTx; result: TxCollectionResult }>,
): Array<{ payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }> {
  const map = new Map<string, { payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }>();
  for (const { result } of results) {
    for (const b of result.buckets) {
      const k = `${b.method}|${b.currency}`;
      const g = map.get(k) ?? { payment_method: b.method, currency: b.currency, transaction_count: 0, total: 0, total_cup: 0 };
      g.transaction_count += 1;
      g.total += b.amount;
      g.total_cup += b.amountCup;
      map.set(k, g);
    }
  }
  return [...map.values()].sort((a, b) => a.payment_method.localeCompare(b.payment_method) || a.currency.localeCompare(b.currency));
}

// ── Tabla por producto (items-summary) ──────────────────────────────────────

export interface ProductCollectionRow {
  product_id: string;
  product_name: string;
  sku: string;
  /** Cantidad FÍSICA total (Σ quantity de todas las líneas, ambas monedas). */
  total_quantity: number;
  /**
   * Cantidad atribuida a la sección CUP de la tabla por producto. CP-FIX
   * 2026-11-20 (§2.5): atribución POR ÍTEM según su cobro — ítem cobrado en
   * una sola moneda → esa moneda; cobro mixto → predominante del ÍTEM; sin
   * cobro → moneda de venta del artículo. Sustituye la regla de moneda
   * predominante de la VENTA (2026-10-24) que clasificaba TODAS las unidades
   * de la venta en una sola sección. Invariante: qty_cup + qty_usd =
   * total_quantity (nunca se duplica la cantidad física).
   */
  qty_cup: number;
  /** Cantidad atribuible a la sección USD (mismas reglas que qty_cup). */
  qty_usd: number;
  /** Total histórico CUP de las líneas (precio de venta histórico — NUNCA recalculado). */
  total_cup: number;
  /** Cobros en CUP por método (la moneda del cobro, no la del precio). */
  cash_cup: number;
  transfer_cup: number;
  zelle_cup: number;
  /** Cobros en USD por método (monto original, sin convertir). */
  cash_usd: number;
  transfer_usd: number;
  zelle_usd: number;
  usd_total: number;
  transactions_count: number;
  /** El cobro difiere del total histórico (incidencia de pago documentada). */
  has_payment_incident: boolean;
}

export interface ItemsSummaryResult {
  items: ProductCollectionRow[];
  totals: {
    total_quantity: number;
    qty_cup: number;
    qty_usd: number;
    total_cup: number;
    cash_cup: number;
    transfer_cup: number;
    zelle_cup: number;
    cash_usd: number;
    transfer_usd: number;
    zelle_usd: number;
    usd_total: number;
  };
  /**
   * MISIÓN PAGOS MIXTOS (2026-10-24): clasificación por MONEDA PREDOMINANTE de
   * cada venta del periodo — evidencia de la regla §2 (componentes cobrados,
   * tasa persistida, clasificación y empates) para el Reporte Entrega y las
   * pruebas de cuadre.
   */
  sales_classification: Array<{
    txId: string;
    predominant: 'CUP' | 'USD';
    cup_collected: number;
    usd_collected: number;
    usd_collected_cup: number;
    rate: number;
    tie: boolean;
    source: 'ledger' | 'reconstruction';
    total_cup: number;
    /** CP-FIX 2026-11-20: evidencia de la atribución por artículo (§2.3). */
    attribution: TxAttributionInfo;
  }>;
}

interface AggState extends Omit<ProductCollectionRow, 'transactions_count' | 'usd_total'> {
  txs: Set<string>;
}

/**
 * Atribución de la CANTIDAD de un artículo a las secciones CUP/USD por SU
 * COBRO (CP-FIX 2026-11-20 §2.5 — sustituye la atribución por moneda
 * PREDOMINANTE DE LA VENTA de la misión 2026-10-24):
 *   · ítem cobrado en UNA moneda → esa moneda (en el caso normal coincide con
 *     la moneda de VENTA del artículo; en cobros cruzados preserva la regla de
 *     negocio 2026-10-19 «cantidad por moneda de cobro», p. ej. SKU 128:
 *     1u cobrada en CUP + 2u cobradas en USD);
 *   · ítem con cobro MIXTO → moneda predominante DEL ÍTEM (peso económico en
 *     CUP con la tasa del cobro; empate ⇒ CUP — misma política determinista
 *     documentada para la venta);
 *   · ítem SIN cobro atribuido (líneas 0 sin pago) → SU moneda de venta.
 * Determinista y sin duplicar: qtyCup + qtyUsd = cantidad física del ítem.
 */
function attributeQuantityByItemCollections(
  item: CollectionItem,
  col: ItemCollections,
): { qtyCup: number; qtyUsd: number } {
  const qty = num(item.quantity);
  const cupVal = col.cup.cash + col.cup.transfer + col.cup.zelle;
  const usdVal = col.usdCupEquiv ?? 0; // equivalente CUP del USD cobrado (tasa del cobro)
  if (cupVal <= COLLECTION_EPS && usdVal <= COLLECTION_EPS) {
    return normCur(item.currency) === 'USD' ? { qtyCup: 0, qtyUsd: qty } : { qtyCup: qty, qtyUsd: 0 };
  }
  if (usdVal <= COLLECTION_EPS) return { qtyCup: qty, qtyUsd: 0 }; // cobrado todo en CUP
  if (cupVal <= COLLECTION_EPS) return { qtyCup: 0, qtyUsd: qty }; // cobrado todo en USD
  return usdVal > cupVal + COLLECTION_EPS ? { qtyCup: 0, qtyUsd: qty } : { qtyCup: qty, qtyUsd: 0 };
}

/**
 * Agrega filas (transaction_items ⨝ transactions ⨝ products) a UNA fila por
 * producto con los cobros por moneda y las CANTIDADES atribuidas por COBRO DE
 * CADA ÍTEM (qty_cup/qty_usd — CP-FIX 2026-11-20 §2.5). La cantidad física
 * (total_quantity) y los importes NO cambian. `rows` puede llevar las filas de
 * payment_transactions (ref_type='sale') de cada venta — cuando son
 * autoritativas (ledgerIsAuthoritative) los BUCKETS se leen directo del ledger
 * (Nivel 2) y la atribución POR ÍTEM usa las filas explícitas de cada
 * transaction_item (Nivel 1), con prorrateo solo como fallback controlado.
 */
export function buildItemsSummary(
  rows: Array<{ item: CollectionItem; tx: CollectionTx; txId: string; payments?: LedgerPayment[] }>,
): ItemsSummaryResult {
  // Agrupar por transacción y reconstruir una vez por transacción (sin duplicar).
  const byTx = new Map<string, { tx: CollectionTx; items: CollectionItem[]; payments?: LedgerPayment[] }>();
  for (const r of rows) {
    const g = byTx.get(r.txId);
    if (g) g.items.push(r.item);
    else byTx.set(r.txId, { tx: r.tx, items: [r.item], payments: r.payments });
  }

  const agg = new Map<string, AggState>();
  const salesClassification: ItemsSummaryResult['sales_classification'] = [];
  for (const { tx, items, payments } of byTx.values()) {
    const result = reconstructTxCollections(tx, items, payments);
    const predominant = resolvePredominantCurrency(result);
    salesClassification.push({
      txId: String(tx.id || items[0]?.transaction_id || ''),
      predominant: predominant.currency,
      cup_collected: predominant.cupCollected,
      usd_collected: predominant.usdCollected,
      usd_collected_cup: predominant.usdCollectedCup,
      rate: predominant.rate,
      tie: predominant.tie,
      source: result.source,
      total_cup: items.reduce((s, it) => s + lineCupOf(it), 0),
      attribution: result.attribution,
    });
    // Incidencia a nivel VENTA: el cobro total (a tasa de la operación)
    // difiere del total histórico CUP de las líneas.
    const saleCupEquiv = predominant.cupCollected + predominant.usdCollectedCup;
    const saleLineCup = items.reduce((s, it) => s + lineCupOf(it), 0);
    const saleIncident = Math.abs(saleCupEquiv - saleLineCup) > COLLECTION_EPS;
    items.forEach((item, idx) => {
      const pid = String(item.product_id || '');
      if (!pid) return;
      const col = result.perItem[idx];
      let a = agg.get(pid);
      if (!a) {
        a = {
          product_id: pid,
          product_name: item.product_name || 'Producto',
          sku: item.sku || '—',
          total_quantity: 0,
          qty_cup: 0,
          qty_usd: 0,
          total_cup: 0,
          cash_cup: 0, transfer_cup: 0, zelle_cup: 0,
          cash_usd: 0, transfer_usd: 0, zelle_usd: 0,
          has_payment_incident: false,
          txs: new Set<string>(),
        };
        agg.set(pid, a);
      }
      const cupCollected = col.cup.cash + col.cup.transfer + col.cup.zelle;
      const usdCollected = col.usd.cash + col.usd.transfer + col.usd.zelle;
      // CANTIDAD por cobro del ÍTEM (CP-FIX §2.5) — ya no por moneda
      // predominante de la venta (ver discrepancia documentada en el encabezado).
      const { qtyCup, qtyUsd } = attributeQuantityByItemCollections(item, col);
      // Incidencia por ítem (CP-FIX §2.4 — regla documentada): comparación
      // NATIVA cuando el ítem se cobró íntegramente en SU moneda (una
      // diferencia de TASA entre línea y cobro es conversión, no incidencia);
      // comparación en equivalente CUP a la TASA DEL COBRO cuando el cobro es
      // cruzado o mixto. El prorrateo estimado NO es incidencia por sí mismo:
      // solo lo es su diferencia monetaria real. La incidencia a nivel venta
      // sigue marcando sus líneas (trazabilidad de diferencias documentadas).
      const itemCur = normCur(item.currency);
      const itemLineCup = lineCupOf(item);
      const itemLineUsd = lineUsdOf(item);
      const usdEquiv = col.usdCupEquiv ?? usdCollected * (num(item.exchange_rate) > 0 ? num(item.exchange_rate) : 1);
      let itemIncident: boolean;
      if (usdCollected > COLLECTION_EPS && cupCollected > COLLECTION_EPS) {
        // cobro mixto: conciliación en base común CUP a la tasa del cobro
        itemIncident = Math.abs(cupCollected + usdEquiv - itemLineCup) > COLLECTION_EPS;
      } else if (usdCollected > COLLECTION_EPS) {
        itemIncident = itemCur === 'USD'
          ? Math.abs(usdCollected - itemLineUsd) > COLLECTION_EPS // nativo USD vs USD
          : Math.abs(usdEquiv - itemLineCup) > COLLECTION_EPS;    // cruzado: equiv CUP
      } else {
        itemIncident = Math.abs(cupCollected - itemLineCup) > COLLECTION_EPS; // CUP (nativo o cruzado)
      }
      const incident = saleIncident || itemIncident;
      a.total_quantity += num(item.quantity);
      a.qty_cup += qtyCup;
      a.qty_usd += qtyUsd;
      a.total_cup += lineCupOf(item);
      a.cash_cup += col.cup.cash;
      a.transfer_cup += col.cup.transfer;
      a.zelle_cup += col.cup.zelle;
      a.cash_usd += col.usd.cash;
      a.transfer_usd += col.usd.transfer;
      a.zelle_usd += col.usd.zelle;
      if (incident) a.has_payment_incident = true;
      const txId = String(item.transaction_id || tx.id || '');
      if (txId) a.txs.add(txId);
    });
  }

  const items: ProductCollectionRow[] = [...agg.values()].map(a => ({
    product_id: a.product_id,
    product_name: a.product_name,
    sku: a.sku,
    total_quantity: a.total_quantity,
    qty_cup: a.qty_cup,
    qty_usd: a.qty_usd,
    total_cup: a.total_cup,
    cash_cup: a.cash_cup,
    transfer_cup: a.transfer_cup,
    zelle_cup: a.zelle_cup,
    cash_usd: a.cash_usd,
    transfer_usd: a.transfer_usd,
    zelle_usd: a.zelle_usd,
    usd_total: a.cash_usd + a.transfer_usd + a.zelle_usd,
    transactions_count: a.txs.size,
    has_payment_incident: a.has_payment_incident,
  })).sort((x, y) => y.total_cup - x.total_cup);

  const totals = items.reduce((s, i) => ({
    total_quantity: s.total_quantity + i.total_quantity,
    qty_cup: s.qty_cup + i.qty_cup,
    qty_usd: s.qty_usd + i.qty_usd,
    total_cup: s.total_cup + i.total_cup,
    cash_cup: s.cash_cup + i.cash_cup,
    transfer_cup: s.transfer_cup + i.transfer_cup,
    zelle_cup: s.zelle_cup + i.zelle_cup,
    cash_usd: s.cash_usd + i.cash_usd,
    transfer_usd: s.transfer_usd + i.transfer_usd,
    zelle_usd: s.zelle_usd + i.zelle_usd,
    usd_total: s.usd_total + i.usd_total,
  }), {
    total_quantity: 0, qty_cup: 0, qty_usd: 0, total_cup: 0, cash_cup: 0, transfer_cup: 0, zelle_cup: 0,
    cash_usd: 0, transfer_usd: 0, zelle_usd: 0, usd_total: 0,
  });

  return { items, totals, sales_classification: salesClassification };
}
