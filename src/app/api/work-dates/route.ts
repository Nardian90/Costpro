/**
 * GET /api/work-dates — MISIÓN FECHAS DE TRABAJO (2026-10-18).
 *
 * Devuelve los datos REALES de la política temporal del PR #1422 para la
 * matriz de la vista «Fechas de trabajo»:
 *
 *   - today: día de negocio ACTUAL (America/Havana) calculado EN EL SERVIDOR
 *     (autoridad de la fecha máxima — misión §6: el frontend presenta los
 *     límites calculados por la lógica autorizada).
 *   - storeMinDate: fecha operativa máxima de la tienda (RPC
 *     get_global_max_operation_date, política forward-only per-store),
 *     normalizada a día de negocio. null si la tienda no tiene documentos.
 *   - floorDate: piso histórico absoluto (hoy − 6 meses, gate canónico).
 *   - types[]: por cada tipo del registro canónico, la ÚLTIMA fecha operativa
 *     registrada (de las tablas reales — sin tablas paralelas) y el conteo
 *     aproximado de documentos.
 *
 * Autorización: sesión NextAuth + acceso a la tienda (withStoreAccess).
 * Consultas con el cliente autenticado del usuario → RLS aplicado (misma
 * superficie de datos que el resto de vistas de operación). Sin service_role.
 *
 * Nota: la «última fecha operativa» de cada tipo es informativa/consultiva;
 * el MÍNIMO real de la política es el MAX global de la tienda (storeMinDate)
 * porque todos los documentos comparten la secuencia forward-only per-store.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseAuthClient } from "@/lib/supabaseClient";
import { withStoreAccess, AuthenticatedSession } from "@/lib/auth-middleware";
import { withTracing } from "@/lib/observability";
import { MOVEMENT_TYPES } from "@/config/work-dates/movement-types";
import { rateLimit } from "@/lib/rate-limit";

// Zona horaria de negocio del proyecto (misma fuente que period-attribution).
const BUSINESS_TZ = "America/Havana";

function businessDayOfIso(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    // date-only entra tal cual; ISO datetime → día de negocio en Habana.
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
    return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(new Date(iso));
  } catch {
    return null;
  }
}

function todayBusinessDayServer(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: BUSINESS_TZ }).format(new Date());
}

/** Una fila {fecha, conteo} por tipo, derivada de la tabla real. */
interface TypeRow {
  type: string;
  lastOperativeDate: string | null; // ISO timestamptz (o DATE para service_date)
  lastOperativeDay: string | null;  // día de negocio YYYY-MM-DD (display)
  documentCount: number | null;     // conteo exacto cuando la tabla lo permite
}

async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const clientId = req.headers.get("x-forwarded-for") || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const url = new URL(req.url);
  const storeId = url.searchParams.get("store_id") || url.searchParams.get("storeId");
  if (!storeId) {
    return NextResponse.json(
      { error: "Solicitud inválida", message: "Se requiere store_id" },
      { status: 400 }
    );
  }

  const authClient = getSupabaseAuthClient(session.token);
  if (!authClient) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Sesión no válida" },
      { status: 401 }
    );
  }

  const today = todayBusinessDayServer();

  // ── Mínimo de la política: MAX operativo per-store (RPC del PR #1422) ──
  const { data: maxDate, error: rpcErr } = await authClient.rpc("get_global_max_operation_date", {
    p_store_id: storeId,
  });
  if (rpcErr) {
    console.error("[work-dates] get_global_max_operation_date:", rpcErr);
    return NextResponse.json(
      { error: "RPC Error", message: rpcErr.message },
      { status: 500 }
    );
  }
  const storeMinDay = businessDayOfIso(maxDate as string | null);

  // ── Última fecha operativa por tipo (tablas reales, RLS activo) ──
  // Cada query es top-1 desc + count exacto: barata e índice-friendly.
  const top1 = async (
    table: string,
    orderCol: string,
    eqFilters: Record<string, string> | null,
    orFilter: string | null,
    coalesceCol?: string,
  ): Promise<{ iso: string | null; count: number | null }> => {
    // Top-1 por fecha desc (índice-friendly) + conteo exacto con head:true
    // en una petición paralela — dos consultas livianas por tabla.
    let q = authClient.from(table).select(coalesceCol ? `${orderCol},${coalesceCol}` : orderCol);
    let cq = authClient.from(table).select("id", { count: "exact", head: true });
    if (eqFilters) {
      for (const [k, v] of Object.entries(eqFilters)) {
        q = q.eq(k, v);
        cq = cq.eq(k, v);
      }
    }
    if (orFilter) {
      q = q.or(orFilter);
      cq = cq.or(orFilter);
    }
    const [topRes, countRes] = await Promise.all([
      q.order(orderCol, { ascending: false, nullsFirst: false }).limit(1),
      cq,
    ]);
    const count = countRes.count ?? null;
    if (topRes.error) {
      console.error(`[work-dates] ${table}:`, topRes.error.message);
      return { iso: null, count };
    }
    const row = topRes.data?.[0] as unknown as Record<string, unknown> | undefined;
    if (!row) return { iso: null, count };
    const primary = row[orderCol] as string | null;
    const coalesced = coalesceCol ? (row[coalesceCol] as string | null) : null;
    return { iso: primary ?? coalesced, count };
  };

  const [
    saleRow,
    receptionRow,
    valeRow,
    serviceRow,
    devolutionRow,
    adjustmentRow,
    transferRow,
    poRow,
    cashRow,
    paymentRow,
  ] = await Promise.all([
    top1("transactions", "created_at", { store_id: storeId, status: "completed" }, null),
    // receipts / inventory_adjustments: la vista canónica filtra status IS NOT
    // NULL; register_reception/process_adjustment siempre estampan status →
    // sin filtro equivalente en la práctica (cualquier fila con fecha cuenta).
    top1("receipts", "reception_date", { store_id: storeId }, null, "created_at"),
    top1("issue_slips", "created_at", { store_id: storeId }, null),
    top1("received_services", "service_date", { store_id: storeId }, null),
    top1("devolutions", "created_at", { store_id: storeId }, null),
    top1("inventory_adjustments", "created_at", { store_id: storeId }, null),
    top1("transfers", "created_at", null, `origin_store_id.eq.${storeId},destination_store_id.eq.${storeId}`),
    top1("purchase_orders", "created_at", { store_id: storeId }, null),
    top1("cash_closures", "created_at", { store_id: storeId }, null),
    top1("payment_transactions", "payment_date", { store_id: storeId }, null),
  ]);

  // receipts con status cualquiera (IS NOT NULL en la vista canónica): filtro
  // null no aplica → la query de arriba ya consultó sin filtro de status.
  const byType: Record<string, { iso: string | null; count: number | null }> = {
    sale: saleRow,
    reception: receptionRow,
    vale_salida: valeRow,
    received_service: serviceRow,
    cash_shift: cashRow,
    devolution: devolutionRow,
    inventory_adjustment: adjustmentRow,
    transfer: transferRow,
    catalog_sale: saleRow, // mismo documento (transactions) — misma última fecha
    purchase_order: poRow,
    supplier_payment: paymentRow,
  };

  const types: TypeRow[] = MOVEMENT_TYPES.map((t) => {
    const row = byType[t.id] ?? { iso: null, count: null };
    return {
      type: t.id,
      lastOperativeDate: row.iso,
      lastOperativeDay: businessDayOfIso(row.iso),
      documentCount: row.count,
    };
  });

  return NextResponse.json(
    {
      today,
      storeMinDate: storeMinDay,
      floorDate: (() => {
        const d = new Date(`${today}T12:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - 6);
        return d.toISOString().slice(0, 10);
      })(),
      timezone: BUSINESS_TZ,
      types,
    },
    { status: 200 }
  );
}

export const GET = withTracing(withStoreAccess(getHandler) as any, "GET /api/work-dates");
