/**
 * ============================================================================
 * CP-AP-FORENSIC-RECONCILIATION-001 — Calculador de Cuentas por Pagar
 * ============================================================================
 * Fuente Única de Verdad (misión §4.2) para TODAS las vistas de Cuentas por
 * Pagar: indicadores superiores, «Por proveedor» (agrupada) y «Detalles»
 * (lista), y para la exportación Excel. Función PURA (sin I/O) → auditable y
 * testeable (FASE 8 A-E).
 *
 * DEFINICIONES CONTABLES CANÓNICAS (misión §4.1):
 *   Total   = importe original reconocido de las obligaciones incluidas en el filtro.
 *   Pagado  = Σ de los pagos APLICADOS a esas mismas obligaciones a la fecha de corte.
 *   Saldo   = Total − Pagado (por documento, por proveedor y global).
 *   Total pendiente = Σ de saldos de las obligaciones incluidas.
 *
 * FECHA DE CORTE (misión §6.2):
 *   corte = date_to ?? hoy(día de negocio America/Havana).
 *   - El período [date_from, date_to] selecciona DOCUMENTOS por su fecha contable
 *     (receipts.reception_date con fallback created_at; received_services.service_date;
 *     commission_payments.created_at).
 *   - Los pagos aplicados a docs incluidos cuentan SIEMPRE QUE su fecha-Habana ≤ corte,
 *     aunque sean anteriores a date_from (reconstrucción histórica).
 *   - Los pagos posteriores al corte NO afectan saldos ni antigüedad.
 *
 * ANTIGÜEDAD (misión §5) — sobre el SALDO (nunca el original), partición exacta:
 *   Corriente (vence > 7 días o sin vencimiento) · Próximos 7 días (vence hoy..+7) ·
 *   Vencido 1-30 · 31-60 · 61-90 · 91-120 · +120. Docs totalmente pagados a corte
 *   no generan saldo en ningún intervalo. Comparación de fechas como strings
 *   'YYYY-MM-DD' (sin aritmética UTC → sin desfases de un día).
 */

// ─────────────────────────────── Entradas ───────────────────────────────

export interface PayableReceiptRow {
  id: string;
  supplier: string | null;
  total_cost: number | string | null;
  paid_amount: number | string | null;
  payment_status: string | null;
  payment_method: string | null;
  reference_doc: string | null;
  due_date: string | null;
  reception_date: string | null;
  created_at: string | null;
}

export interface PayableServiceRow {
  id: string;
  supplier: string | null;
  total_amount: number | string | null;
  paid_amount: number | string | null;
  payment_status: string | null;
  payment_method: string | null;
  reference_doc: string | null;
  due_date: string | null;
  service_date: string | null;
  currency: string | null;
  exchange_rate: number | string | null;
  created_at: string | null;
}

export interface PayableCommissionRow {
  id: string;
  final_amount: number | string | null;
  status: string | null;
  due_date: string | null;
  paid_at: string | null;
  payment_method: string | null;
  period_start: string | null;
  period_end: string | null;
  worker_name: string | null;
  created_at: string | null;
}

export interface PayableTxnRow {
  ref_type: 'receipt' | 'service';
  ref_id: string;
  amount_cup: number | string;
  currency: string | null;
  payment_method: string | null;
  direction: string | null;
  payment_date: string;
  reference: string | null;
}

export interface AccountsPayableQuery {
  tab: 'all' | 'overdue' | '30' | '60' | '90' | '120' | 'paid';
  /** Categoría de documento (misión §6.3: Todos / Recepciones / Servicios / Comisiones). */
  category: 'all' | 'receipts' | 'services' | 'commissions';
  /** Métodos expandidos (zelle/external_transfer ya resueltos por la ruta). */
  method?: string[];
  currency?: string;
  search?: string;
  /** Proveedor EXACTO (drill-down Por proveedor → Detalles). */
  supplier?: string;
  /** Período de documentos (fecha contable), inclusivo. */
  date_from?: string;
  /** Fecha final del período = FECHA DE CORTE para saldos/antigüedad. */
  date_to?: string;
  /** Día de negocio Habana 'YYYY-MM-DD' (corte por defecto). */
  now: string;
}

// ─────────────────────────────── Salidas ───────────────────────────────

export type PayableAgingBucket =
  | 'current' | 'upcoming7' | '30' | '60' | '90' | '120' | '120+' | 'paid';

export interface NormalizedPayable {
  id: string;
  ref_type: 'receipt' | 'service' | 'commission';
  ref_id: string;
  supplier: string;
  /** Clave de agrupación literal (null/'' → 'Sin proveedor'). */
  supplier_key: string;
  reference: string | null;
  /** Fecha contable del documento 'YYYY-MM-DD'. */
  doc_date: string | null;
  due_date: string | null;
  total: number;
  total_cup: number;
  paid_amount: number;
  paid_cup: number;
  balance: number;
  balance_cup: number;
  currency: string;
  exchange_rate: number;
  payment_method: string | null;
  days_until_due: number | null;
  days_overdue: number | null;
  is_overdue: boolean;
  /** Totalmente pagado A LA FECHA DE CORTE (saldo ≤ tolerancia). */
  is_settled: boolean;
  aging_bucket: PayableAgingBucket;
  payment_status: 'unpaid' | 'partial' | 'paid';
  created_at: string | null;
}

export interface AccountsPayableKPIs {
  totalOverdue: number;
  totalUpcoming: number;
  totalPending: number;
  /** Σ pagos aplicados a las obligaciones INCLUIDAS en el filtro (misión §4.1). */
  totalPaid: number;
}

export interface AccountsPayableSummary {
  receipts: { count: number; total_cup: number; paid_cup: number; balance_cup: number };
  services: { count: number; total_cup: number; paid_cup: number; balance_cup: number };
  commissions: { count: number; total_cup: number; paid_cup: number; balance_cup: number };
}

export interface AgingBuckets {
  current: number;
  upcoming7: number;
  overdue: number;
  '30': number;
  '60': number;
  '90': number;
  '120': number;
  '120+': number;
}

export interface GroupedPayable {
  supplier: string;
  total_cup: number;
  paid_cup: number;
  balance_cup: number;
  aging: AgingBuckets;
  count: number;
}

export interface GroupedTotals {
  total_cup: number;
  paid_cup: number;
  balance_cup: number;
  aging: AgingBuckets;
}

export interface AccountsPayableMeta {
  cutoff: string;
  date_from: string | null;
  date_to: string | null;
}

export interface AccountsPayableResult {
  payables: NormalizedPayable[];
  kpis: AccountsPayableKPIs;
  summary: AccountsPayableSummary;
  grouped: GroupedPayable[];
  totals: GroupedTotals;
  meta: AccountsPayableMeta;
}

// ─────────────────────────── Utilidades de fecha ───────────────────────────

const HAVANA_TZ = 'America/Havana';

/** Día de negocio Habana 'YYYY-MM-DD' de un instante (o de ahora). */
export function havanaDate(instant?: string | Date): string {
  const d = instant === undefined ? new Date() : new Date(instant);
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('en-CA', { timeZone: HAVANA_TZ });
  return d.toLocaleDateString('en-CA', { timeZone: HAVANA_TZ });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** 'YYYY-MM-DD' de un valor de BD (date ya viene así; timestamptz → Habana). */
function toDateStr(value: string | null | undefined): string | null {
  if (!value) return null;
  if (DATE_RE.test(value)) return value;
  return havanaDate(value);
}

/** Días de diferencia b − a (fechas 'YYYY-MM-DD'; sin aritmética UTC). */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  // Date.UTC de componentes de calendario → diferencia pura de días
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

const num = (v: number | string | null | undefined): number => {
  const n = typeof v === 'string' ? Number(v) : (v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Tolerancia de centavos para «totalmente pagado». */
const SETTLED_EPS = 0.005;

// ─────────────────────────── Calculador principal ───────────────────────────

export function computeAccountsPayable(
  receipts: PayableReceiptRow[],
  services: PayableServiceRow[],
  commissions: PayableCommissionRow[],
  txns: PayableTxnRow[],
  query: AccountsPayableQuery,
): AccountsPayableResult {
  const cutoff = query.date_to || query.now;
  const dateFrom = query.date_from ?? null;
  const dateTo = query.date_to ?? null;

  // ── Pagos netos por documento a la fecha de corte (misión §4.3) ──
  // Clave: 'receipt:<id>' | 'service:<id>'. Las contra-filas (direction='reversal')
  // RESTAN; los pagos posteriores al corte NO cuentan (reconstrucción histórica).
  const paidByDoc = new Map<string, { paid: number; lastMethod: string | null }>();
  for (const t of txns) {
    if (!t.payment_date) continue;
    const txnDate = toDateStr(t.payment_date);
    if (!txnDate || txnDate > cutoff) continue; // posterior al corte → fuera
    const key = `${t.ref_type}:${t.ref_id}`;
    const entry = paidByDoc.get(key) ?? { paid: 0, lastMethod: null };
    const amt = num(t.amount_cup);
    if (t.direction === 'reversal') entry.paid -= amt;
    else {
      entry.paid += amt;
      entry.lastMethod = t.payment_method ?? entry.lastMethod;
    }
    paidByDoc.set(key, entry);
  }

  const payables: NormalizedPayable[] = [];

  const classify = (p: Omit<NormalizedPayable, 'is_overdue' | 'days_overdue' | 'aging_bucket' | 'payment_status' | 'is_settled'>): NormalizedPayable => {
    const isSettled = p.balance_cup <= SETTLED_EPS;
    let isOverdue = false;
    let daysOverdue: number | null = null;
    if (!isSettled && p.due_date && p.due_date < cutoff) {
      isOverdue = true;
      daysOverdue = diffDays(p.due_date, cutoff);
    }
    let bucket: PayableAgingBucket;
    if (isSettled) bucket = 'paid';
    else if (isOverdue) {
      const od = daysOverdue as number;
      if (od > 120) bucket = '120+';
      else if (od > 90) bucket = '120';
      else if (od > 60) bucket = '90';
      else if (od > 30) bucket = '60';
      else bucket = '30';
    } else if (p.days_until_due !== null && p.days_until_due >= 0 && p.days_until_due <= 7) {
      bucket = 'upcoming7'; // vence hoy (0) o en los próximos 7 días (7 incluido)
    } else bucket = 'current';
    return {
      ...p,
      is_overdue: isOverdue,
      days_overdue: daysOverdue,
      is_settled: isSettled,
      aging_bucket: bucket,
      payment_status: isSettled ? 'paid' : p.paid_cup > SETTLED_EPS ? 'partial' : 'unpaid',
    };
  };

  const inPeriod = (docDate: string | null): boolean => {
    if (!dateFrom && !dateTo) return true;
    if (!docDate) return false; // sin fecha contable + período activo → fuera (conservador)
    if (dateFrom && docDate < dateFrom) return false;
    if (dateTo && docDate > dateTo) return false;
    return true;
  };

  // ── Recepciones (CUP, tasa 1) ──
  for (const r of receipts) {
    const docDate = toDateStr(r.reception_date) ?? toDateStr(r.created_at);
    if (!inPeriod(docDate)) continue;
    const total = num(r.total_cost);
    const paid = paidByDoc.get(`receipt:${r.id}`)?.paid ?? 0;
    const dueDate = toDateStr(r.due_date);
    const daysUntilDue = dueDate ? diffDays(cutoff, dueDate) : null;
    payables.push(classify({
      id: `receipt-${r.id}`,
      ref_type: 'receipt',
      ref_id: r.id,
      supplier: r.supplier || 'Sin proveedor',
      supplier_key: r.supplier && r.supplier.trim() !== '' ? r.supplier : 'Sin proveedor',
      reference: r.reference_doc ?? null,
      doc_date: docDate,
      due_date: dueDate,
      total,
      total_cup: total,
      paid_amount: paid,
      paid_cup: paid,
      balance: total - paid,
      balance_cup: total - paid,
      currency: 'CUP',
      exchange_rate: 1,
      payment_method: r.payment_method ?? paidByDoc.get(`receipt:${r.id}`)?.lastMethod ?? null,
      days_until_due: daysUntilDue,
      created_at: r.created_at ?? null,
    }));
  }

  // ── Servicios recibidos (con moneda/tasa de header) ──
  for (const s of services) {
    const docDate = toDateStr(s.service_date) ?? toDateStr(s.created_at);
    if (!inPeriod(docDate)) continue;
    const total = num(s.total_amount);
    const exRate = num(s.exchange_rate) || 1;
    const cur = s.currency || 'CUP';
    const totalCup = cur === 'CUP' ? total : total * exRate;
    const paidCup = paidByDoc.get(`service:${s.id}`)?.paid ?? 0;
    const paidDocCur = cur === 'CUP' ? paidCup : exRate > 0 ? paidCup / exRate : paidCup;
    const dueDate = toDateStr(s.due_date);
    const daysUntilDue = dueDate ? diffDays(cutoff, dueDate) : null;
    payables.push(classify({
      id: `service-${s.id}`,
      ref_type: 'service',
      ref_id: s.id,
      supplier: s.supplier || 'Sin proveedor',
      supplier_key: s.supplier && s.supplier.trim() !== '' ? s.supplier : 'Sin proveedor',
      reference: s.reference_doc ?? null,
      doc_date: docDate,
      due_date: dueDate,
      total,
      total_cup: totalCup,
      paid_amount: paidDocCur,
      paid_cup: paidCup,
      balance: total - paidDocCur,
      balance_cup: totalCup - paidCup,
      currency: cur,
      exchange_rate: exRate,
      payment_method: s.payment_method ?? paidByDoc.get(`service:${s.id}`)?.lastMethod ?? null,
      days_until_due: daysUntilDue,
      created_at: s.created_at ?? null,
    }));
  }

  // ── Comisiones (canal propio: status/paid_at, sin payment_transactions) ──
  for (const c of commissions) {
    const docDate = toDateStr(c.created_at);
    if (!inPeriod(docDate)) continue;
    const total = num(c.final_amount);
    const paidAt = toDateStr(c.paid_at);
    const isPaidNow = c.status === 'paid' && paidAt !== null && paidAt <= cutoff;
    const paid = isPaidNow ? total : 0;
    const dueDate = toDateStr(c.due_date);
    const daysUntilDue = dueDate ? diffDays(cutoff, dueDate) : null;
    const ref =
      c.period_start && c.period_end
        ? `Comisión ${c.period_start} a ${c.period_end}`
        : 'Comisión';
    payables.push(classify({
      id: `commission-${c.id}`,
      ref_type: 'commission',
      ref_id: c.id,
      supplier: c.worker_name || 'Trabajador desconocido',
      supplier_key: c.worker_name || 'Trabajador desconocido',
      reference: ref,
      doc_date: docDate,
      due_date: dueDate,
      total,
      total_cup: total,
      paid_amount: paid,
      paid_cup: paid,
      balance: total - paid,
      balance_cup: total - paid,
      currency: 'CUP',
      exchange_rate: 1,
      payment_method: c.payment_method ?? null,
      days_until_due: daysUntilDue,
      created_at: c.created_at ?? null,
    }));
  }

  // ── Filtros de documento (misión §6.3: se combinan en TODAS las vistas) ──
  let selected = payables;

  if (query.category === 'receipts') selected = selected.filter(p => p.ref_type === 'receipt');
  else if (query.category === 'services') selected = selected.filter(p => p.ref_type === 'service');
  else if (query.category === 'commissions') selected = selected.filter(p => p.ref_type === 'commission');

  if (query.currency) {
    selected = selected.filter(p =>
      p.ref_type === 'commission'
        ? query.currency === 'CUP'            // comisiones siempre CUP
        : p.currency === query.currency,
    );
  }

  if (query.method && query.method.length > 0) {
    const methods = query.method;
    selected = selected.filter(p => {
      const pm = p.payment_method;
      if (p.ref_type === 'commission') {
        // 'mixed' (efectivo+transferencia) matchea cualquiera de ambos métodos
        return pm === 'mixed' || (pm !== null && methods.includes(pm));
      }
      return pm !== null && methods.includes(pm);
    });
  }

  if (query.search) {
    const q = query.search.toLowerCase();
    selected = selected.filter(p => p.supplier_key.toLowerCase().includes(q));
  }

  if (query.supplier) {
    selected = selected.filter(p => p.supplier_key === query.supplier);
  }

  // Tab de antigüedad — MISMA selección para grouped y list (defecto D4 corregido)
  if (query.tab === 'overdue') selected = selected.filter(p => p.is_overdue);
  else if (query.tab === 'paid') selected = selected.filter(p => p.is_settled);
  else if (query.tab === '30' || query.tab === '60' || query.tab === '90' || query.tab === '120') {
    selected = selected.filter(p => p.aging_bucket === query.tab);
  }
  // 'all' → TODAS las obligaciones del filtro (incluye totalmente pagadas:
  // es lo que hace verificable Total − Pagado = Saldo en la tabla y el KPI).

  // ── KPIs (misma selección; misión §10.E: Pagado = Σ aplicados incluidos) ──
  const kpis: AccountsPayableKPIs = {
    totalOverdue: selected.filter(p => p.is_overdue).reduce((s, p) => s + p.balance_cup, 0),
    totalUpcoming: selected
      .filter(p => !p.is_overdue && !p.is_settled && p.days_until_due !== null && p.days_until_due >= 0 && p.days_until_due <= 7)
      .reduce((s, p) => s + p.balance_cup, 0),
    totalPending: selected.filter(p => !p.is_settled).reduce((s, p) => s + p.balance_cup, 0),
    totalPaid: selected.reduce((s, p) => s + p.paid_cup, 0),
  };

  // ── Summary por tipo (saldos a corte) ──
  const sumBy = (t: NormalizedPayable['ref_type']) => {
    const rows = selected.filter(p => p.ref_type === t);
    return {
      count: rows.length,
      total_cup: rows.reduce((s, p) => s + p.total_cup, 0),
      paid_cup: rows.reduce((s, p) => s + p.paid_cup, 0),
      balance_cup: rows.reduce((s, p) => s + p.balance_cup, 0),
    };
  };
  const summary: AccountsPayableSummary = {
    receipts: sumBy('receipt'),
    services: sumBy('service'),
    commissions: sumBy('commission'),
  };

  // ── Agrupación por proveedor (INCLUYE pagados: Total−Pagado=Saldo) ──
  const supplierMap = new Map<string, GroupedPayable>();
  for (const p of selected) {
    let entry = supplierMap.get(p.supplier_key);
    if (!entry) {
      entry = {
        supplier: p.supplier_key,
        total_cup: 0, paid_cup: 0, balance_cup: 0, count: 0,
        aging: { current: 0, upcoming7: 0, overdue: 0, '30': 0, '60': 0, '90': 0, '120': 0, '120+': 0 },
      };
      supplierMap.set(p.supplier_key, entry);
    }
    entry.total_cup += p.total_cup;
    entry.paid_cup += p.paid_cup;
    entry.balance_cup += p.balance_cup;
    entry.count += 1;
    if (p.is_settled) continue; // sin saldo → no aporta a intervalos
    if (p.is_overdue) {
      entry.aging.overdue += p.balance_cup;
      if (p.aging_bucket === '30') entry.aging['30'] += p.balance_cup;
      else if (p.aging_bucket === '60') entry.aging['60'] += p.balance_cup;
      else if (p.aging_bucket === '90') entry.aging['90'] += p.balance_cup;
      else if (p.aging_bucket === '120') entry.aging['120'] += p.balance_cup;
      else if (p.aging_bucket === '120+') entry.aging['120+'] += p.balance_cup;
    } else if (p.aging_bucket === 'upcoming7') {
      entry.aging.upcoming7 += p.balance_cup;
    } else {
      entry.aging.current += p.balance_cup;
    }
  }
  const grouped = Array.from(supplierMap.values()).sort((a, b) => b.balance_cup - a.balance_cup);

  const totals: GroupedTotals = {
    total_cup: grouped.reduce((s, g) => s + g.total_cup, 0),
    paid_cup: grouped.reduce((s, g) => s + g.paid_cup, 0),
    balance_cup: grouped.reduce((s, g) => s + g.balance_cup, 0),
    aging: {
      current: grouped.reduce((s, g) => s + g.aging.current, 0),
      upcoming7: grouped.reduce((s, g) => s + g.aging.upcoming7, 0),
      overdue: grouped.reduce((s, g) => s + g.aging.overdue, 0),
      '30': grouped.reduce((s, g) => s + g.aging['30'], 0),
      '60': grouped.reduce((s, g) => s + g.aging['60'], 0),
      '90': grouped.reduce((s, g) => s + g.aging['90'], 0),
      '120': grouped.reduce((s, g) => s + g.aging['120'], 0),
      '120+': grouped.reduce((s, g) => s + g.aging['120+'], 0),
    },
  };

  // ── Orden determinista de la lista: vencimiento ↑, luego fecha contable ↑ ──
  const sorted = [...selected].sort((a, b) => {
    const da = a.due_date ?? '9999-12-31';
    const db = b.due_date ?? '9999-12-31';
    if (da !== db) return da < db ? -1 : 1;
    const ca = a.doc_date ?? '0000-00-00';
    const cb = b.doc_date ?? '0000-00-00';
    if (ca !== cb) return ca < cb ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });

  return {
    payables: sorted,
    kpis,
    summary,
    grouped,
    totals,
    meta: { cutoff, date_from: dateFrom, date_to: dateTo },
  };
}
