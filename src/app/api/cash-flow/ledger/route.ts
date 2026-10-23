import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { withTracing } from '@/lib/observability';
import { validateOrigin } from '@/lib/csrf';
import { rateLimit } from '@/lib/rate-limit';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { canManageStore } from '@/lib/roles';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import {
  buildCashLedger,
  applyLedgerDisplayFilters,
  balanceAtCutoff,
  resolveBalanceNow,
  cutoffNeedsSummary,
  type CashLedgerRowInput,
  type CashLedgerRow,
  type CashLedgerOpening,
} from '@/lib/cash-ledger/build-ledger';

/**
 * GET /api/cash-flow/ledger — MISIÓN CAJA v2.24.0 (§7)
 *
 * Libro mayor de caja: TODOS los movimientos persistidos que explican el
 * saldo físico por moneda (CUP/USD), con saldo corrido y saldo histórico a
 * fecha de corte reconstruible. Clasificación IDÉNTICA a get_cash_currency_summary
 * (única fuente de verdad del libro físico) — el espejo es verificable:
 *   Σ(entradas) − Σ(salidas) + apertura = net del libro.
 *
 * NO es efectivo: transferencias y zelle (informan el lado vouchers del
 * arqueo, no este libro). Los anulados aportan fila + contra ⇒ neto cero.
 * Los movimientos informativos (apertura/cierre de turno) no alteran saldo.
 *
 * Query: store_id, from?, to?, as_of?, type?, currency?, user?, q?, limit?
 */

const QUERY_SCHEMA = z.object({
  store_id: uuidLoose,
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  /** Fecha de corte para el saldo histórico (ISO). to se recorta a as_of. */
  as_of: z.string().datetime().optional(),
  type: z.string().max(40).optional(),
  currency: z.enum(['CUP', 'USD', 'all']).default('all'),
  user: z.string().max(200).optional(),
  q: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(50).max(5000).default(2000),
});

const r2 = (n: number): number => Math.round((Number(n) || 0) * 100) / 100;

/** Importes nativos de una venta con liquidación explícita (vuelto persistido). */
interface SaleLegs {
  receivedCup: number;
  receivedUsd: number;
  changeCup: number;
  changeUsd: number;
  settled: boolean;
}

function saleLegs(t: {
  cash_amount: number | null;
  cash_received_cup: number | null;
  cash_received_usd: number | null;
  change_given_cup: number | null;
  change_given_usd: number | null;
}): SaleLegs {
  const settled =
    t.cash_received_cup != null || t.cash_received_usd != null
    || t.change_given_cup != null || t.change_given_usd != null;
  return {
    receivedCup: settled ? Number(t.cash_received_cup ?? 0) : 0,
    receivedUsd: settled ? Number(t.cash_received_usd ?? 0) : 0,
    changeCup: settled ? Number(t.change_given_cup ?? 0) : 0,
    changeUsd: settled ? Number(t.change_given_usd ?? 0) : 0,
    settled,
  };
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { allowed } = await rateLimit(`cash-ledger:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const url = new URL(req.url);
  const parsed = QUERY_SCHEMA.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Parámetros inválidos', details: parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`) }, { status: 400 });
  }
  const p = parsed.data;

  if (!canManageStore(session.user, p.store_id)) {
    return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 });
  }

  const supabase = getSupabaseAdminSafe();
  if (!supabase) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  // Ventana contable. as_of recorta el extremo superior (saldo histórico).
  const from = p.from ?? '1970-01-01T00:00:00Z';
  const to = p.as_of ? (p.to && p.to < p.as_of ? p.to : p.as_of) : (p.to ?? new Date().toISOString());

  // ── 0. Saldo de apertura (libro físico ANTES de la ventana) ──
  const { data: openingData, error: openingErr } = await supabase.rpc('get_cash_currency_summary', {
    p_store_id: p.store_id,
    p_from: null,
    p_to: new Date(from).toISOString(),
  });
  if (openingErr) {
    return NextResponse.json({ error: openingErr.message }, { status: 400 });
  }
  const opening: CashLedgerOpening = {
    cup: Number((openingData as { net?: { CUP?: number } })?.net?.CUP ?? 0),
    usd: Number((openingData as { net?: { USD?: number } })?.net?.USD ?? 0),
  };

  // Libro físico VIGENTE (ahora) — fuente de los KPIs por moneda (misión §9).
  const { data: summaryNowData, error: summaryNowErr } = await supabase.rpc('get_cash_currency_summary', {
    p_store_id: p.store_id,
    p_from: null,
    p_to: null,
  });
  if (summaryNowErr) {
    return NextResponse.json({ error: summaryNowErr.message }, { status: 400 });
  }
  const currencySummaryNow = summaryNowData as {
    window: { from: string; to: string };
    terms: Record<string, { CUP: number; USD: number }>;
    net: { CUP: number; USD: number };
  } | null;

  const rows: CashLedgerRowInput[] = [];
  let truncated = false;

  // ── 1. Ventas con componente de efectivo (clasificación por moneda real) ──
  const { data: sales, error: salesErr } = await supabase
    .from('transactions')
    .select('id, cash_amount, cash_received_cup, cash_received_usd, change_given_cup, change_given_usd, change_currency, invoice_number, created_at, status, seller_id, notes')
    .eq('store_id', p.store_id)
    .eq('status', 'completed')
    .gt('created_at', from)
    .lte('created_at', to)
    .order('created_at', { ascending: true })
    .limit(p.limit);
  if (salesErr) return NextResponse.json({ error: salesErr.message }, { status: 500 });

  // Carve USD legacy: ítems cobrados en efectivo USD (sin liquidación explícita).
  const saleIds = (sales ?? []).map(s => s.id);
  const carveUsdBySale = new Map<string, { usd: number; cup: number; uncertain: boolean }>();
  if (saleIds.length) {
    const { data: usdItems, error: itemsErr } = await supabase
      .from('transaction_items')
      .select('transaction_id, cash_paid, exchange_rate')
      .in('transaction_id', saleIds)
      .eq('cash_currency', 'USD')
      .eq('currency', 'USD')
      .gt('cash_paid', 0);
    if (itemsErr) return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    for (const it of usdItems ?? []) {
      const acc = carveUsdBySale.get(it.transaction_id) ?? { usd: 0, cup: 0, uncertain: false };
      acc.usd = r2(acc.usd + Number(it.cash_paid ?? 0));
      // REVISIÓN FINAL v2.24.1: paridad EXACTA con el RPC — los ítems USD sin
      // tasa histórica registrada NO aportan al carve CUP (contribución 0; el
      // canónico queda en el balde CUP). Antes la ruta asumía tasa 1 y
      // divergía del espejo en ese borde.
      acc.cup = r2(acc.cup + Number(it.cash_paid ?? 0) * (it.exchange_rate == null ? 0 : Number(it.exchange_rate)));
      if (it.exchange_rate == null) acc.uncertain = true;
      carveUsdBySale.set(it.transaction_id, acc);
    }
  }

  const sellerIds = new Set<string>();
  for (const s of sales ?? []) {
    if (s.seller_id) sellerIds.add(s.seller_id);
    const legs = saleLegs(s as never);
    const carve = carveUsdBySale.get(s.id) ?? { usd: 0, cup: 0, uncertain: false };
    const ref = s.invoice_number || `Venta ${s.id.slice(0, 8)}`;
    if (legs.settled) {
      // Liquidación explícita (vuelto multimoneda persistido ENLAZADO a la venta).
      if (legs.receivedCup !== 0) {
        rows.push({
          id: `sale-cup-${s.id}`, effective_at: s.created_at,
          operational_date: s.created_at.slice(0, 10),
          movement_type: 'venta_efectivo', movement_label: 'Venta en efectivo',
          currency: 'CUP', amount_native: Math.abs(legs.receivedCup),
          amount_cup_signed: legs.receivedCup,
          reference: ref, description: `Cobro en efectivo CUP${legs.changeCup ? ` · vuelto CUP ${r2(legs.changeCup)}` : ''}`,
          user_name: null, status: 'completed', origin_view: 'sales', origin_id: s.id,
        });
      }
      if (legs.receivedUsd !== 0) {
        rows.push({
          id: `sale-usd-${s.id}`, effective_at: s.created_at,
          operational_date: s.created_at.slice(0, 10),
          movement_type: 'venta_efectivo', movement_label: 'Venta en efectivo',
          currency: 'USD', amount_native: Math.abs(legs.receivedUsd),
          amount_cup_signed: r2(legs.receivedUsd * 1),
          reference: ref, description: 'Cobro en efectivo USD',
          user_name: null, status: 'completed', origin_view: 'sales', origin_id: s.id,
        });
      }
      if (legs.changeCup !== 0) {
        rows.push({
          id: `sale-chg-cup-${s.id}`, effective_at: s.created_at,
          operational_date: s.created_at.slice(0, 10),
          movement_type: 'vuelto_venta', movement_label: 'Vuelto de venta',
          currency: 'CUP', amount_native: Math.abs(legs.changeCup),
          amount_cup_signed: -Math.abs(legs.changeCup),
          reference: ref, description: 'Vuelto entregado al cliente (CUP) — enlazado a la venta',
          user_name: null, status: 'completed', origin_view: 'pos', origin_id: s.id,
        });
      }
      if (legs.changeUsd !== 0) {
        rows.push({
          id: `sale-chg-usd-${s.id}`, effective_at: s.created_at,
          operational_date: s.created_at.slice(0, 10),
          movement_type: 'vuelto_venta', movement_label: 'Vuelto de venta',
          currency: 'USD', amount_native: Math.abs(legs.changeUsd),
          amount_cup_signed: 0,
          reference: ref, description: 'Vuelto entregado al cliente (USD) — enlazado a la venta',
          user_name: null, status: 'completed', origin_view: 'pos', origin_id: s.id,
        });
      }
    } else {
      // Venta legacy: canónico CUP menos el carve USD (reclasificado a USD).
      const legacyCup = r2(Number(s.cash_amount ?? 0) - carve.cup);
      if (legacyCup > 0.004) {
        rows.push({
          id: `sale-cup-${s.id}`, effective_at: s.created_at,
          operational_date: s.created_at.slice(0, 10),
          movement_type: 'venta_efectivo', movement_label: 'Venta en efectivo',
          currency: 'CUP', amount_native: legacyCup, amount_cup_signed: legacyCup,
          reference: ref, description: carve.usd > 0
            ? `Efectivo de la venta (canónico, excluye ${r2(carve.usd)} USD cobrados en USD${carve.uncertain ? ' · tasa histórica de algún ítem no registrada: su canónico permanece en CUP' : ''})`
            : 'Efectivo de la venta (canónico)',
          user_name: null, status: 'completed', origin_view: 'sales', origin_id: s.id,
        });
      }
      if (carve.usd > 0.004) {
        rows.push({
          id: `sale-usd-${s.id}`, effective_at: s.created_at,
          operational_date: s.created_at.slice(0, 10),
          movement_type: 'venta_efectivo', movement_label: 'Venta en efectivo',
          currency: 'USD', amount_native: carve.usd, amount_cup_signed: carve.cup,
          reference: ref, description: 'Efectivo USD cobrado (por ítems)',
          user_name: null, status: 'completed', origin_view: 'sales', origin_id: s.id,
        });
      }
    }
  }

  // ── 2. Ledger financiero (payment_transactions) — NO incluye ref_type='sale'
  //      (los cobros de ventas ya entraron por (1): evita doble contabilización).
  const PT_TYPES = ['production_order', 'work', 'receipt', 'service', 'cash_flow', 'devolution', 'adjustment'];
  const { data: pts, error: ptsErr } = await supabase
    .from('payment_transactions')
    .select('id, ref_type, ref_id, amount, amount_cup, currency, payment_date, direction, notes, paid_by, idempotency_key')
    .eq('store_id', p.store_id)
    .eq('payment_method', 'cash')
    .in('ref_type', PT_TYPES)
    .gt('payment_date', from)
    .lte('payment_date', to)
    .order('payment_date', { ascending: true })
    .limit(p.limit);
  if (ptsErr) return NextResponse.json({ error: ptsErr.message }, { status: 500 });

  const ptUserIds = new Set<string>();
  for (const pt of pts ?? []) {
    if (pt.paid_by) ptUserIds.add(pt.paid_by);
    const typeMap: Record<string, CashLedgerRowInput['movement_type']> = {
      production_order: 'anticipo_produccion',
      work: 'anticipo_produccion',
      receipt: 'pago_proveedor',
      service: 'pago_proveedor',
      cash_flow: (pt.direction === 'in') ? 'ingreso_caja'
        : (String(pt.notes ?? '').includes('entrega_efectivo') ? 'entrega_efectivo' : 'egreso_caja'),
      devolution: 'reembolso_devolucion',
      adjustment: 'ajuste_caja',
    };
    const isOut = pt.ref_type === 'receipt' || pt.ref_type === 'service'
      || (pt.ref_type === 'cash_flow' && pt.direction === 'out')
      || (pt.ref_type === 'devolution' && pt.direction === 'refund')
      || (pt.ref_type === 'adjustment' && pt.direction === 'out');
    const currency = pt.currency === 'USD' ? 'USD' : 'CUP';
    rows.push({
      id: `pt-${pt.id}`, effective_at: pt.payment_date,
      operational_date: pt.payment_date.slice(0, 10),
      movement_type: typeMap[pt.ref_type] ?? 'ajuste_caja',
      movement_label: typeMap[pt.ref_type] ?? 'Ajuste de caja',
      currency,
      amount_native: Math.abs(Number(pt.amount ?? 0)),
      amount_cup_signed: isOut ? -Math.abs(Number(pt.amount_cup ?? 0)) : Math.abs(Number(pt.amount_cup ?? 0)),
      reference: null,
      description: pt.notes || `${pt.ref_type} (${pt.direction ?? 'in'})`,
      user_name: null, status: 'confirmado',
      origin_view: 'cash_flow', origin_id: pt.ref_id ?? pt.id,
    });
  }

  // ── 3. Comisiones pagadas en efectivo ──
  const { data: commissions, error: commErr } = await supabase
    .from('commission_payments')
    .select('id, amount, amount_cup, currency, exchange_rate, payment_method, status, paid_at, paid_by, notes')
    .eq('store_id', p.store_id)
    .eq('status', 'paid')
    .eq('payment_method', 'cash')
    .gt('paid_at', from)
    .lte('paid_at', to)
    .order('paid_at', { ascending: true })
    .limit(p.limit);
  if (commErr) return NextResponse.json({ error: commErr.message }, { status: 500 });
  for (const c of commissions ?? []) {
    if (c.paid_by) ptUserIds.add(c.paid_by);
    const currency = c.currency === 'USD' ? 'USD' : 'CUP';
    const native = currency === 'USD'
      ? Math.abs(Number(c.amount_cup ?? 0) / Number(c.exchange_rate || 1))
      : Math.abs(Number(c.amount ?? c.amount_cup ?? 0));
    rows.push({
      id: `comm-${c.id}`, effective_at: c.paid_at,
      operational_date: c.paid_at.slice(0, 10),
      movement_type: 'comision', movement_label: 'Comisión pagada (efectivo)',
      currency, amount_native: native,
      amount_cup_signed: -Math.abs(Number(c.amount_cup ?? 0)),
      reference: null, description: c.notes || 'Comisión pagada en efectivo',
      user_name: null, status: 'paid', origin_view: 'commissions', origin_id: c.id,
    });
  }

  // ── 4. Movimientos informativos: apertura y cierre de turnos ──
  const { data: closures, error: closErr } = await supabase
    .from('cash_closures')
    .select('id, status, created_at, closed_at, opening_balance, opening_balance_usd, opening_difference_cup, opening_difference_usd, declared_cash, declared_cash_usd, declared_total, system_expected_total, difference, difference_usd, user_id, profile:profiles(full_name)')
    .eq('store_id', p.store_id)
    .or(`created_at.gt.${from},closed_at.gt.${from}`)
    .or(`created_at.lte.${to},closed_at.lte.${to}`)
    .order('created_at', { ascending: true })
    .limit(500);
  if (closErr) return NextResponse.json({ error: closErr.message }, { status: 500 });
  for (const c of closures ?? []) {
    if (c.user_id) { sellerIds.add(c.user_id); ptUserIds.add(c.user_id); }
    const openingNote = c.opening_difference_cup != null && Math.abs(Number(c.opening_difference_cup)) > 0.004
      ? ` (dif. apertura CUP ${r2(Number(c.opening_difference_cup))})` : '';
    rows.push({
      id: `open-${c.id}`, effective_at: c.created_at,
      operational_date: c.created_at.slice(0, 10),
      movement_type: 'apertura_turno', movement_label: 'Apertura de turno',
      currency: 'CUP', amount_native: 0, amount_cup_signed: 0,
      reference: `Turno ${c.id.slice(0, 8)}`,
      description: `Apertura · fondo CUP ${r2(Number(c.opening_balance ?? 0))} · USD ${r2(Number(c.opening_balance_usd ?? 0))}${openingNote}`,
      user_name: (c.profile as { full_name?: string } | null)?.full_name ?? null,
      status: c.status, origin_view: 'cash', origin_id: c.id,
    });
    if (c.closed_at && c.closed_at <= to) {
      const diffCup = Number(c.difference ?? 0);
      const diffUsd = c.difference_usd != null ? Number(c.difference_usd) : null;
      rows.push({
        id: `close-${c.id}`, effective_at: c.closed_at,
        operational_date: c.closed_at.slice(0, 10),
        movement_type: 'cierre_turno', movement_label: 'Cierre de turno',
        currency: 'CUP', amount_native: 0, amount_cup_signed: 0,
        reference: `Turno ${c.id.slice(0, 8)}`,
        description: `Cierre · esperado ${r2(Number(c.system_expected_total ?? 0))} · contado ${r2(Number(c.declared_total ?? 0))} · dif ${r2(diffCup)}${diffUsd != null ? ` · dif USD ${r2(diffUsd)}` : ''}`,
        user_name: (c.profile as { full_name?: string } | null)?.full_name ?? null,
        status: c.status, origin_view: 'cash', origin_id: c.id,
      });
    }
  }

  // ── 5. Nombres de usuario (profiles) ──
  const userIds = [...new Set([...sellerIds, ...ptUserIds])].filter(Boolean);
  const userNames = new Map<string, string>();
  if (userIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', userIds.slice(0, 500));
    for (const pr of profiles ?? []) userNames.set(pr.id, pr.full_name);
  }
  // Mapa id-fila → user id (reconstruido de los selects)
  const rowUserId = new Map<string, string>();
  for (const pt of pts ?? []) if (pt.paid_by) rowUserId.set(`pt-${pt.id}`, pt.paid_by);
  for (const c of commissions ?? []) if (c.paid_by) rowUserId.set(`comm-${c.id}`, c.paid_by);
  for (const s of sales ?? []) if (s.seller_id) {
    rowUserId.set(`sale-cup-${s.id}`, s.seller_id);
    rowUserId.set(`sale-usd-${s.id}`, s.seller_id);
    rowUserId.set(`sale-chg-cup-${s.id}`, s.seller_id);
    rowUserId.set(`sale-chg-usd-${s.id}`, s.seller_id);
  }
  for (const row of rows) {
    if (!row.user_name) {
      const uid = rowUserId.get(row.id);
      if (uid) row.user_name = userNames.get(uid) ?? null;
    }
  }

  // ── 6. Construcción del libro + saldo histórico a fecha de corte ──
  // REVISIÓN FINAL v2.24.1: truncamiento REAL por fuente (antes solo miraba
  // el total de filas, que puede superar p.limit con múltiples fuentes).
  if ((sales?.length ?? 0) >= p.limit || (pts?.length ?? 0) >= p.limit || (commissions?.length ?? 0) >= p.limit) truncated = true;
  const ledger = buildCashLedger(rows, opening);
  const allRows: CashLedgerRow[] = ledger.rows;

  const last = allRows[allRows.length - 1] ?? null;
  // REVISIÓN FINAL v2.24.1 (defecto ALTO): el saldo vigente de los KPIs es el
  // neto AUTORITATIVO del RPC (viaja en el mismo payload). La corrida local
  // truncada infraestimaba los KPIs físicos sin conciliar.
  const balanceNow = resolveBalanceNow({
    walkLast: last,
    opening,
    summaryNowNet: currencySummaryNow?.net ?? null,
  });

  // REVISIÓN FINAL v2.24.1 (defecto medio): corte ANTERIOR al inicio de la
  // ventana — la corrida local no alcanza; pedir el neto autoritativo al RPC
  // hasta as_of (antes devolvía el saldo de apertura de la ventana sin guard).
  let cutoff: { cup: number; usd: number; as_of: string; source: 'summary_rpc' | 'ledger_walk' } | null = null;
  if (p.as_of && cutoffNeedsSummary(p.as_of, from)) {
    const { data: cutData, error: cutErr } = await supabase.rpc('get_cash_currency_summary', {
      p_store_id: p.store_id,
      p_from: null,
      p_to: p.as_of,
    });
    if (cutErr) return NextResponse.json({ error: cutErr.message }, { status: 400 });
    const net = (cutData as { net?: { CUP?: number; USD?: number } } | null)?.net;
    cutoff = { cup: r2(Number(net?.CUP ?? 0)), usd: r2(Number(net?.USD ?? 0)), as_of: p.as_of, source: 'summary_rpc' };
  } else if (p.as_of) {
    const c = balanceAtCutoff(allRows, p.as_of, opening);
    if (c) cutoff = { cup: c.cup, usd: c.usd, as_of: p.as_of, source: 'ledger_walk' };
  }

  // Filtros de visualización DESPUÉS de la corrida (los saldos quedan reales).
  const displayRows = applyLedgerDisplayFilters(allRows, {
    currency: p.currency,
    movementType: (p.type && p.type !== 'all' ? p.type : 'all') as Parameters<typeof applyLedgerDisplayFilters>[1]['movementType'],
    userName: p.user || null,
    referenceQuery: p.q || null,
  });

  return NextResponse.json({
    opening,
    currency_summary_now: currencySummaryNow,
    rows: displayRows.slice().reverse(), // más reciente primero (voz de la casa)
    totals: ledger.totals,
    balance_now: balanceNow,
    balance_at_cutoff: cutoff,
    count: displayRows.length,
    truncated,
  });
}

export const GET = withTracing(
  withAuth(getHandler as unknown as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'GET /api/cash-flow/ledger',
);
