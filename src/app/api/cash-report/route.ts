import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { getSupabaseForSession } from '@/lib/supabase-session';
import { computeDailySummary, type SalesSplit } from '@/lib/cash-report/summary';

/**
 * GET /api/cash-report?start_date=ISO&end_date=ISO
 *
 * Reporte de caja para entrega de dinero.
 * Devuelve: ventas por método+moneda, pagos por método+moneda, balance,
 * desglose de billetes sugerido y (AUDITORÍA 2026-10):
 *   - sales_split: split REAL de ventas por moneda desde transactions
 *     (cash_amount/transfer_amount/zelle_amount) — corrige D4: cash_balance_cup
 *     ahora incluye el tramo efectivo de ventas mixed.
 *   - adjustments: ajustes extraordinarios del periodo (ref_type='adjustment',
 *     dirección in/out con importe y nota — ver /api/cash-report/adjustments).
 *   - cash_balance_cup: recalculado con la MISMA fórmula centralizada que
 *     pantalla y PDF (src/lib/cash-report/summary.ts).
 *
 * FIX (2026-07-14): reescrito con withAuth + getSupabaseForSession.
 * Antes usaba supabase.auth.getUser() sin sesión SSR → 401 siempre.
 */

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date') || new Date(Date.now() - 86400000).toISOString();
    const endDate = searchParams.get('end_date') || new Date().toISOString();
    // V2.12.37: soporte para incluir todos los pagos sin filtro de fecha
    const includeAllDates = searchParams.get('include_all_dates') === 'true';

    const supabase = getSupabaseForSession(session);

    // Obtener store_id
    const { data: userData, error: userError } = await supabase
      .from('profiles')
      .select('active_store_id')
      .eq('id', session.user.id)
      .single();

    if (userError || !userData?.active_store_id) {
      return NextResponse.json({ error: 'Tienda no configurada' }, { status: 400 });
    }

    // Iteración 11.4 (H-7): validar membresía del caller en el store
    const { canManageStore } = await import('@/lib/roles');
    if (!canManageStore(session.user, userData.active_store_id)) {
      return NextResponse.json({ error: 'No tienes acceso a esta tienda' }, { status: 403 });
    }

    // Llamar al RPC get_cash_report
    const { data: reportData, error: reportError } = await supabase.rpc('get_cash_report', {
      p_store_id: userData.active_store_id,
      p_start_date: startDate,
      p_end_date: endDate,
      p_include_all_dates: includeAllDates,
    });

    if (reportError) {
      console.error('[cash-report] Error RPC:', reportError);
      return NextResponse.json({ error: reportError.message }, { status: 500 });
    }

    // ── INCIDENTE 2026-10-16: split REAL de ventas por MONEDA DE COBRO ──
    // Los pools de transactions están en CUP canónico (usePOSCheckout L129-182):
    // clasificar por sale_currency escondía los cobros en USD (40 USD × tasa →
    // 31 600 "CUP") y excluía sale_currency='MIXED'. La reconstrucción única
    // vive en collection-currency.ts (filas de pago por ítem + legado exacto).
    const dateFilter = includeAllDates ? {} : { gte: startDate, lte: endDate };
    let salesSplit: SalesSplit = {};
    let salesGroups: Array<{ payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }> = [];
    try {
      // 1) Transacciones del periodo (nivel cabecera — cubre ventas sin ítems).
      let txQuery = supabase
        .from('transactions')
        .select('id, sale_currency, cash_amount, transfer_amount, zelle_amount')
        .eq('store_id', userData.active_store_id)
        .eq('status', 'completed');
      if (!includeAllDates) {
        txQuery = txQuery.gte('created_at', startDate).lte('created_at', endDate);
      }
      const { data: txRows, error: txErr } = await txQuery;
      if (txErr) throw txErr;

      // 2) Ítems de esas transacciones (mismo contrato que items-summary).
      const txIds = (txRows || []).map((t: { id: string }) => t.id);
      const itemsByTx = new Map<string, Array<Record<string, unknown>>>();
      const CHUNK = 150;
      for (let i = 0; i < txIds.length; i += CHUNK) {
        const chunk = txIds.slice(i, i + CHUNK);
        const { data: itemRows, error: itemErr } = await supabase
          .from('transaction_items')
          .select('transaction_id, quantity, price_at_sale, price_at_sale_cup, currency, exchange_rate, cash_paid, cash_currency, transfer_paid, transfer_currency, zelle_paid, zelle_currency')
          .in('transaction_id', chunk);
        if (itemErr) throw itemErr;
        for (const it of itemRows || []) {
          const k = (it as { transaction_id: string }).transaction_id;
          if (!itemsByTx.has(k)) itemsByTx.set(k, []);
          itemsByTx.get(k)!.push(it as Record<string, unknown>);
        }
      }

      const { accumulateSalesSplit, buildSalesGroups, reconstructTxCollections, normCur } = await import('@/lib/cash-report/collection-currency');

      const results: Array<{ tx: Parameters<typeof reconstructTxCollections>[0]; result: ReturnType<typeof reconstructTxCollections> }> = [];
      const txWithoutItems: Array<Record<string, unknown>> = [];
      for (const tx of txRows || []) {
        const items = itemsByTx.get(tx.id) || [];
        if (items.length === 0) { txWithoutItems.push(tx as Record<string, unknown>); continue; }
        results.push({
          tx: tx as unknown as Parameters<typeof reconstructTxCollections>[0],
          result: reconstructTxCollections(tx as unknown as Parameters<typeof reconstructTxCollections>[0], items as unknown as Parameters<typeof reconstructTxCollections>[1]),
        });
      }
      for (const { result } of results) accumulateSalesSplit(salesSplit as Record<string, { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number }>, result);

      // 3) Transacciones SIN ítems (defensiva): comportamiento previo (pool →
      //    sale_currency), sin romper días históricos sin ítems.
      for (const tx of txWithoutItems) {
        const cur = normCur((tx.sale_currency as string) || 'CUP');
        if (cur === 'MIXED') continue; // indistinguible sin ítems (raro) — como antes
        if (!salesSplit[cur]) salesSplit[cur] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
        const cash = Number(tx.cash_amount || 0), tr = Number(tx.transfer_amount || 0), ze = Number(tx.zelle_amount || 0);
        salesSplit[cur].cash += cash;
        salesSplit[cur].transfer += tr;
        salesSplit[cur].zelle += ze;
        salesSplit[cur].total += cash + tr + ze;
        for (const [m, amt] of [['cash', cash], ['transfer', tr], ['zelle', ze]] as const) {
          if (amt > 0.01) salesGroups.push({ payment_method: m, currency: cur, transaction_count: 1, total: amt, total_cup: amt });
        }
      }
      // 4) Grupos `sales` por (método, moneda de COBRO) — coherentes con el split
      //    (pantalla, acordeón y plantilla Estándar heredan la clasificación real).
      const reconGroups = buildSalesGroups(results);
      const merged = new Map<string, { payment_method: string; currency: string; transaction_count: number; total: number; total_cup: number }>();
      for (const g of [...reconGroups, ...salesGroups]) {
        const k = `${g.payment_method}|${g.currency}`;
        const prev = merged.get(k);
        if (prev) { prev.transaction_count += g.transaction_count; prev.total += g.total; prev.total_cup += g.total_cup; }
        else merged.set(k, { ...g });
      }
      salesGroups = [...merged.values()];
    } catch (splitErr: unknown) {
      // Sin split el módulo centralizado cae al fallback de grupos del RPC.
      console.warn('[cash-report] sales_split no disponible:', (splitErr as { message?: string })?.message);
    }

    // ── Ajustes extraordinarios del periodo (ref_type='adjustment') ──
    let adjustments: Array<{ id: string; direction: 'in' | 'out'; amount: number; note: string; created_by: string | null; created_at: string }> = [];
    try {
      let adjQuery = supabase
        .from('payment_transactions')
        .select('id, direction, amount, notes, paid_by, created_at')
        .eq('store_id', userData.active_store_id)
        .eq('ref_type', 'adjustment')
        .eq('payment_method', 'cash')
        .eq('currency', 'CUP');
      if (!includeAllDates) {
        adjQuery = adjQuery.gte('payment_date', dateFilter.gte as string).lte('payment_date', dateFilter.lte as string);
      }
      const { data: adjRows, error: adjErr } = await adjQuery;
      if (adjErr) throw adjErr;
      adjustments = (adjRows || []).map((r: { id: string; direction: string | null; amount: number; notes: string | null; paid_by: string | null; created_at: string }) => ({
        id: r.id,
        direction: r.direction === 'in' ? 'in' : 'out',
        amount: Number(r.amount || 0),
        note: r.notes || '',
        created_by: r.paid_by,
        created_at: r.created_at,
      }));
    } catch (adjErr: unknown) {
      // ref_type='adjustment' requiere migración 20261012000001; si el entorno
      // aún no la tiene, la consulta falla y seguimos sin ajustes (degradación
      // limpia, sin romper el reporte).
      console.warn('[cash-report] ajustes no disponibles:', (adjErr as { message?: string })?.message);
    }

    // ── FIX-RE-1510 v2 (ADENDA del negocio 2026-10-16): criterio canónico = FECHA DEL PAGO ──
    // El negocio define: el reporte SIEMPRE atribuye cada comisión al día de negocio en que
    // se CONFIRMÓ el pago (paid_at) — «aunque la comisión corresponda al 15/10, si no se
    // pagó ese día sino el 16, es correcto que se refleje en el reporte del 16». El periodo
    // de ventas es metadata informativa del detalle, nunca criterio de atribución.
    // La incidencia original era del DATO (pago 7374dfad… ejecutado realmente el 15/10
    // 17:00 Habana pero registrado el 16/10 por no existir selector de fecha — corregido
    // por orden del negocio + date picker nuevo en la confirmación de pagos).
    // Este override garantiza además ventana de negocio determinista (Habana) frente a la
    // ventana cruda del RPC. Mismo patrón de post-procesamiento que sales_split/adjustments (D4).
    // (Se consulta aquí y se aplica sobre enrichedReport justo tras declararlo.)
    let commissionsByPeriod: Array<{ payment_method: string; currency: string; commission_count: number; total: number; total_cup: number }> | null = null;
    try {
      const { commissionPaidAtFilter } = await import('@/lib/cash-report/period-attribution');
      const { data: cRows, error: cErr } = await supabase
        .from('commission_payments')
        .select('payment_method, currency, final_amount, amount_cup')
        .eq('store_id', userData.active_store_id)
        .eq('status', 'paid')
        .not('payment_method', 'is', null)
        .or(commissionPaidAtFilter(startDate, endDate));
      if (cErr) throw cErr;
      const groups = new Map<string, { payment_method: string; currency: string; commission_count: number; total: number; total_cup: number }>();
      for (const r of cRows || []) {
        const k = `${r.payment_method}|${r.currency}`;
        const g = groups.get(k) ?? { payment_method: r.payment_method, currency: r.currency, commission_count: 0, total: 0, total_cup: 0 };
        g.commission_count += 1;
        g.total += Number(r.final_amount || 0);
        g.total_cup += Number(r.amount_cup || 0);
        groups.set(k, g);
      }
      commissionsByPeriod = [...groups.values()];
    } catch (commErr: unknown) {
      console.warn('[cash-report] atribución de comisiones por fecha de pago no disponible:', (commErr as { message?: string })?.message);
    }

    // AUDITORÍA 2026-10 (D4): balance recalculado con la fórmula centralizada.
    // El valor antiguo ((cashCupSales?.total || 0) + prod − pagos − comisiones)
    // EXCLUIA el tramo efectivo de ventas mixed (p. ej. EnerVida 02/10: 2.600
    // en vez de 12.600). La fórmula única vive en src/lib/cash-report/summary.ts
    // y la consumen idénticamente vista, previsualización y PDF.
    const enrichedReport = { ...reportData, sales_split: salesSplit, adjustments };
    // INCIDENTE 2026-10-16: grupos `sales` por MONEDA DE COBRO (antes por
    // sale_currency — los cobros USD aparecían como CUP). La vista (acordeón),
    // el fallback de computeDailySummary y la plantilla Estándar heredan la
    // clasificación real coherente con sales_split.
    if (salesGroups.length > 0) {
      enrichedReport.sales = salesGroups;
    }
    // FIX-RE-1510 v2: override del grupo `commissions` (y totales dependientes) ANTES de
    // computeDailySummary — pantalla, desglose y PDF heredan el criterio por FECHA DE PAGO.
    if (commissionsByPeriod) {
      const oldCommissionsCup = Number(reportData?.totals?.commissions_total_cup || 0);
      const newCommissionsCup = commissionsByPeriod.reduce((s, g) => s + g.total_cup, 0);
      enrichedReport.commissions = commissionsByPeriod;
      if (reportData?.totals) {
        enrichedReport.totals = {
          ...reportData.totals,
          commissions_total_cup: newCommissionsCup,
          ...(typeof reportData.totals.balance_cup === 'number'
            ? { balance_cup: Number(reportData.totals.balance_cup) + (oldCommissionsCup - newCommissionsCup) }
            : {}),
        };
      }
    }
    const cupSummary = computeDailySummary(enrichedReport, 'CUP');
    const cashBalanceCup = cupSummary.efectivoEsperado;

    // Desglose óptimo (greedy) del balance de efectivo CUP
    const denominations = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
    let remaining = Math.max(0, cashBalanceCup);
    const breakdown = denominations.map(denom => {
      const count = Math.floor(remaining / denom);
      remaining -= count * denom;
      return { denom, count, total: count * denom };
    }).filter(b => b.count > 0);

    return NextResponse.json({
      ...enrichedReport,
      cash_breakdown: breakdown,
      cash_balance_cup: cashBalanceCup,
      period: { start: startDate, end: endDate },
    });
  } catch (error: any) {
    console.error('[cash-report] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export const GET = withAuth(getHandler);
