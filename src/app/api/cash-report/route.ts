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
    // MISIÓN PERSONALIZACIÓN REPORTE ENTREGA (2026-10-25): filas de venta
    // INDIVIDUALES con su composición real de pagos (buckets por método ×
    // moneda) — misma reconstrucción que sales_split. Soporta la selección de
    // ventas en pantalla/PDF/Excel SIN migraciones (capa de presentación).
    let salesRows: Array<Record<string, unknown>> = [];
    let salesRowsTruncated = false;
    const SALES_ROWS_CAP = 1000;
    // MISIÓN DEFINITIVA (2026-10-24): equivalencias canónicas de la MISMA
    // reconstrucción (se rellenan junto a salesGroups; 0 si la reconstrucción falla).
    let equivFields: { sales_equiv_cash_other_cup: number; sales_equiv_voucher_other_cup: number } = { sales_equiv_cash_other_cup: 0, sales_equiv_voucher_other_cup: 0 };
    try {
      // 1) Transacciones del periodo (nivel cabecera — cubre ventas sin ítems).
      //    PERSONALIZACIÓN: created_at/customer_name/notes/sale_exchange_rate
      //    alimentan las filas individuales (solo lectura, sin migraciones).
      let txQuery = supabase
        .from('transactions')
        .select('id, created_at, customer_name, notes, sale_currency, sale_exchange_rate, cash_amount, transfer_amount, zelle_amount')
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
          .select('transaction_id, quantity, price_at_sale, price_at_sale_cup, currency, exchange_rate, cash_paid, cash_currency, transfer_paid, transfer_currency, zelle_paid, zelle_currency, product_id, products (name, sku)')
          .in('transaction_id', chunk);
        if (itemErr) throw itemErr;
        for (const it of itemRows || []) {
          const k = (it as { transaction_id: string }).transaction_id;
          if (!itemsByTx.has(k)) itemsByTx.set(k, []);
          itemsByTx.get(k)!.push(it as Record<string, unknown>);
        }
      }

      // 2b) MISIÓN PAGOS MIXTOS (2026-10-24): filas de payment_transactions
      // (ref_type='sale') de esas ventas — moneda REAL por componente y tasa
      // de la operación persistida. Cuando son autoritativas (flujo con
      // componentes, v2.25.0) la reconstrucción las usa DIRECTO.
      const { fetchSalePaymentsByTx } = await import('@/lib/cash-report/fetch-sale-payments');
      const paymentsByTx = await fetchSalePaymentsByTx(
        ids => supabase
          .from('payment_transactions')
          .select('transaction_id, payment_method, currency, amount, exchange_rate')
          .eq('ref_type', 'sale')
          .in('transaction_id', ids),
        txIds,
      );

      const { accumulateSalesSplit, buildSalesGroups, reconstructTxCollections, normCur } = await import('@/lib/cash-report/collection-currency');

      // PERSONALIZACIÓN: fila de venta individual (misma reconstrucción que el
      // split). items/tx/payments son el input EXACTO de buildItemsSummary para
      // que el cliente recalibre la tabla por producto con la MISMA función.
      const toSaleRow = (tx: Record<string, unknown>, result: { buckets: Array<{ method: string; currency: string; amount: number; amountCup: number }>; source: string }, items: Array<Record<string, unknown>>, payments: Array<Record<string, unknown>> | undefined): Record<string, unknown> => ({
        id: String(tx.id ?? ''),
        created_at: String(tx.created_at ?? ''),
        customer_name: (tx.customer_name as string | null) ?? null,
        reference: (tx.notes as string | null) ?? null,
        status: 'completed',
        source: result.source === 'ledger' ? 'ledger' : 'reconstruction',
        buckets: (result.buckets || []).map(b => ({ method: b.method, currency: normCur(b.currency), amount: Number(b.amount) || 0, amount_cup: Number(b.amountCup) || 0 })),
        tx: {
          id: tx.id ?? undefined,
          cash_amount: tx.cash_amount ?? 0,
          transfer_amount: tx.transfer_amount ?? 0,
          zelle_amount: tx.zelle_amount ?? 0,
          sale_currency: tx.sale_currency ?? null,
          sale_exchange_rate: tx.sale_exchange_rate ?? null,
        },
        items: items.map(it => ({
          transaction_id: it.transaction_id,
          product_id: String(it.product_id ?? ''),
          product_name: ((it.products as Record<string, unknown> | null)?.name as string) || 'Producto',
          sku: ((it.products as Record<string, unknown> | null)?.sku as string) || '—',
          quantity: it.quantity ?? 0,
          price_at_sale: it.price_at_sale ?? 0,
          price_at_sale_cup: it.price_at_sale_cup ?? 0,
          currency: it.currency ?? null,
          exchange_rate: it.exchange_rate ?? null,
          cash_paid: it.cash_paid ?? null,
          cash_currency: it.cash_currency ?? null,
          transfer_paid: it.transfer_paid ?? null,
          transfer_currency: it.transfer_currency ?? null,
          zelle_paid: it.zelle_paid ?? null,
          zelle_currency: it.zelle_currency ?? null,
        })),
        payments: (payments || []).map(p => ({ payment_method: p.payment_method, currency: p.currency, amount: p.amount, exchange_rate: p.exchange_rate })),
      });

      const results: Array<{ tx: Parameters<typeof reconstructTxCollections>[0]; result: ReturnType<typeof reconstructTxCollections> }> = [];
      const txWithoutItems: Array<Record<string, unknown>> = [];
      for (const tx of txRows || []) {
        const items = itemsByTx.get(tx.id) || [];
        const payments = paymentsByTx.get(tx.id);
        // Ventas CON ítems: reconstrucción con ledger si está disponible
        // (ventas con componentes) o heurística previa (históricas).
        if (items.length === 0) {
          // Sin ítems solo el ledger puede hablar: si la venta tiene filas de
          // pago autoritativas se reconstruye igual (buckets a nivel venta).
          if (payments && payments.length > 0) {
            results.push({
              tx: tx as unknown as Parameters<typeof reconstructTxCollections>[0],
              result: reconstructTxCollections(
                tx as unknown as Parameters<typeof reconstructTxCollections>[0],
                [],
                payments as Parameters<typeof reconstructTxCollections>[2],
              ),
            });
          } else {
            txWithoutItems.push(tx as Record<string, unknown>);
          }
          continue;
        }
        results.push({
          tx: tx as unknown as Parameters<typeof reconstructTxCollections>[0],
          result: reconstructTxCollections(
            tx as unknown as Parameters<typeof reconstructTxCollections>[0],
            items as unknown as Parameters<typeof reconstructTxCollections>[1],
            payments as Parameters<typeof reconstructTxCollections>[2] | undefined,
          ),
        });
      }
      for (const { result } of results) accumulateSalesSplit(salesSplit as Record<string, { cash: number; transfer: number; zelle: number; mixedUnsplit: number; total: number }>, result);

      // PERSONALIZACIÓN: filas individuales de las ventas reconstruidas (con
      // ítems o con ledger). El split/los grupos se calculan SIEMPRE sobre el
      // universo completo; sales_rows solo acota el payload de selección.
      for (const { tx, result } of results) {
        const txRec = tx as Record<string, unknown>;
        salesRows.push(toSaleRow(
          txRec,
          result as unknown as { buckets: Array<{ method: string; currency: string; amount: number; amountCup: number }>; source: string },
          (itemsByTx.get(String(txRec.id)) || []).map(x => x as Record<string, unknown>),
          (paymentsByTx.get(String(txRec.id)) || []).map(x => x as unknown as Record<string, unknown>),
        ));
      }

      // 3) Transacciones SIN ítems (defensiva): comportamiento previo (pool →
      //    sale_currency), sin romper días históricos sin ítems. También se
      //    exponen como filas (buckets sintéticos del pool) para que la
      //    selección cubra TODO el universo del split.
      for (const tx of txWithoutItems) {
        const cur = normCur((tx.sale_currency as string) || 'CUP');
        if (cur === 'MIXED') continue; // indistinguible sin ítems (raro) — como antes
        if (!salesSplit[cur]) salesSplit[cur] = { cash: 0, transfer: 0, zelle: 0, mixedUnsplit: 0, total: 0 };
        const cash = Number(tx.cash_amount || 0), tr = Number(tx.transfer_amount || 0), ze = Number(tx.zelle_amount || 0);
        salesSplit[cur].cash += cash;
        salesSplit[cur].transfer += tr;
        salesSplit[cur].zelle += ze;
        salesSplit[cur].total += cash + tr + ze;
        const synthBuckets: Array<{ method: string; currency: string; amount: number; amountCup: number }> = [];
        for (const [m, amt] of [['cash', cash], ['transfer', tr], ['zelle', ze]] as const) {
          if (amt > 0.01) {
            salesGroups.push({ payment_method: m, currency: cur, transaction_count: 1, total: amt, total_cup: amt });
            synthBuckets.push({ method: m, currency: cur, amount: amt, amountCup: amt });
          }
        }
        if (synthBuckets.length > 0) {
          salesRows.push({
            id: String(tx.id ?? ''),
            created_at: String(tx.created_at ?? ''),
            customer_name: (tx.customer_name as string | null) ?? null,
            reference: (tx.notes as string | null) ?? null,
            status: 'completed',
            source: 'no-items',
            buckets: synthBuckets.map(b => ({ method: b.method, currency: b.currency, amount: b.amount, amount_cup: b.amountCup })),
            tx: {
              id: tx.id ?? undefined,
              cash_amount: tx.cash_amount ?? 0,
              transfer_amount: tx.transfer_amount ?? 0,
              zelle_amount: tx.zelle_amount ?? 0,
              sale_currency: tx.sale_currency ?? null,
              sale_exchange_rate: tx.sale_exchange_rate ?? null,
            },
            items: [],
            payments: [],
          });
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

      // 5) MISIÓN DEFINITIVA (2026-10-24): equivalencia canónica CUP de los
      //    cobros de OTRA moneda — de la MISMA reconstrucción que produjo
      //    sales_split/grupos (buckets amountCup + grupos de ventas sin ítems).
      //    Efectivo a la consolidación del esperado (hoja CUP); vouchers solo
      //    informativos. JAMÁS vuelven a presentarse como una segunda venta.
      let equivCashOtherCup = 0;
      let equivVoucherOtherCup = 0;
      for (const g of salesGroups) {
        if (g.currency === 'CUP') continue;
        if (g.payment_method === 'cash') equivCashOtherCup += g.total_cup;
        else equivVoucherOtherCup += g.total_cup;
      }
      equivFields = { sales_equiv_cash_other_cup: equivCashOtherCup, sales_equiv_voucher_other_cup: equivVoucherOtherCup };

      // PERSONALIZACIÓN: tope defensivo del payload de filas (el split y los
      // grupos ya se calcularon sobre el universo COMPLETO — el reporte no
      // cambia; solo la selección quedaría limitada, y se señala explícitamente).
      if (salesRows.length > SALES_ROWS_CAP) {
        salesRows = salesRows.slice(0, SALES_ROWS_CAP);
        salesRowsTruncated = true;
      }
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

    // ── Ingresos/Egresos de caja documentados (ref_type='cash_flow' — MISIÓN
    //    2026-10-20). Filas del LEDGER por payment_date (fondo de cambio y
    //    otros; un anulado aporta original + contra). Mismo patrón de
    //    post-procesamiento que adjustments (degradación limpia si la
    //    migración 20261021000001 aún no se aplicó al entorno).
    let cashFlows: Array<{ id: string; direction: 'in' | 'out'; amount: number; currency: string; amount_cup: number; note: string; document_number: string | null; created_by: string | null; created_at: string }> = [];
    try {
      let cfQuery = supabase
        .from('payment_transactions')
        .select('id, direction, amount, currency, amount_cup, notes, paid_by, created_at, payment_date')
        .eq('store_id', userData.active_store_id)
        .eq('ref_type', 'cash_flow')
        .eq('payment_method', 'cash');
      if (!includeAllDates) {
        cfQuery = cfQuery.gte('payment_date', dateFilter.gte as string).lte('payment_date', dateFilter.lte as string);
      }
      const { data: cfRows, error: cfErr } = await cfQuery;
      if (cfErr) throw cfErr;
      cashFlows = (cfRows || []).map((r: { id: string; direction: string | null; amount: number | string | null; currency: string | null; amount_cup: number | string | null; notes: string | null; paid_by: string | null; created_at: string; payment_date?: string }) => ({
        id: r.id,
        direction: r.direction === 'in' ? 'in' : 'out',
        amount: Number(r.amount || 0),
        currency: r.currency || 'CUP',
        amount_cup: Number(r.amount_cup || 0),
        note: r.notes || '',
        document_number: (r.notes || '').split(' · ')[0] || null,
        created_by: r.paid_by,
        created_at: r.created_at,
      }));
    } catch (cfErr: unknown) {
      // ref_type='cash_flow' requiere migración 20261021000001; sin ella el
      // reporte sigue cuadrando sin estos movimientos.
      console.warn('[cash-report] ingresos/egresos de caja no disponibles:', (cfErr as { message?: string })?.message);
    }

    // ── Reembolsos de devoluciones comerciales (ref_type='devolution',
    //    direction='refund' — MISIÓN DE SEGUIMIENTO 2026-10-21, regla P1).
    //    TODOS los métodos (el desglose del reporte muestra por dónde salió
    //    el dinero); la fórmula del efectivo solo descuenta el tramo CASH
    //    (summary.ts). Ventana por payment_date. Degradación limpia: sin
    //    migración 20261021120000 el RPC aún no expone `refunds`, pero estas
    //    filas del ledger existen desde DF-03 y enriquecen el detalle.
    let refunds: Array<{ id: string; payment_method: string; currency: string; amount: number; amount_cup: number; devolution_id: string | null; transaction_id: string | null; note: string; payment_date: string }> = [];
    try {
      let rfQuery = supabase
        .from('payment_transactions')
        .select('id, payment_method, currency, amount, amount_cup, ref_id, transaction_id, notes, payment_date')
        .eq('store_id', userData.active_store_id)
        .eq('ref_type', 'devolution')
        .eq('direction', 'refund');
      if (!includeAllDates) {
        rfQuery = rfQuery.gte('payment_date', dateFilter.gte as string).lte('payment_date', dateFilter.lte as string);
      }
      const { data: rfRows, error: rfErr } = await rfQuery;
      if (rfErr) throw rfErr;
      refunds = (rfRows || []).map((r: { id: string; payment_method: string; currency: string | null; amount: number | string | null; amount_cup: number | string | null; ref_id: string | null; transaction_id: string | null; notes: string | null; payment_date: string }) => ({
        id: r.id,
        payment_method: r.payment_method || 'cash',
        currency: r.currency || 'CUP',
        amount: Number(r.amount || 0),
        amount_cup: Number(r.amount_cup || 0),
        devolution_id: r.ref_id,
        transaction_id: r.transaction_id,
        note: r.notes || '',
        payment_date: r.payment_date,
      }));
    } catch (rfErr: unknown) {
      // direction='refund' existe desde DF-03; si el entorno es anterior,
      // el reporte sigue cuadrando sin reembolsos (degradación limpia).
      console.warn('[cash-report] reembolsos de devoluciones no disponibles:', (rfErr as { message?: string })?.message);
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
    const enrichedReport = { ...reportData, sales_split: salesSplit, adjustments, cash_flows: cashFlows, refund_rows: refunds, sales_rows: salesRows, sales_rows_truncated: salesRowsTruncated, ...equivFields };
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
