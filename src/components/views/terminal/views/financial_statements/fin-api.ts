/**
 * CP-FIN · Vista B — Estados Financieros: capa de fetch.
 *
 * Patrón canónico del repo (ReceivedServicesView): Authorization Bearer con
 * el token de useAuthStore (el backend withAuth SOLO autentica por Bearer,
 * SEC-024 fail-closed). Los endpoints devuelven el JSON del RPC directamente;
 * los errores llegan como { error: string } → se convierten en excepción
 * para que las vistas los muestren con toast.error / StateRenderer.
 */
import type {
  BalanceSheetData,
  CategoryDetailData,
  DashboardData,
  IncomeStatementData,
} from './types';

/** Encabezados con sesión (idénticos al patrón authHeaders del repo). */
export function finAuthHeaders(token: string | null): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** GET + manejo uniforme de { error } del backend. */
async function finFetch<T>(url: string, token: string | null): Promise<T> {
  const res = await fetch(url, { headers: finAuthHeaders(token) });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : null) ?? `Error ${res.status} al consultar el motor financiero`;
    throw new Error(message);
  }
  return body as T;
}

/** Estado de Situación a una fecha de corte. */
export function fetchBalanceSheet(
  storeId: string,
  asOf: string,
  token: string | null,
): Promise<BalanceSheetData> {
  const params = new URLSearchParams({ type: 'balance', store_id: storeId, as_of: asOf });
  return finFetch<BalanceSheetData>(`/api/fin/statements?${params.toString()}`, token);
}

/** Estado de Rendimiento de un período. */
export function fetchIncomeStatement(
  storeId: string,
  from: string,
  to: string,
  token: string | null,
): Promise<IncomeStatementData> {
  const params = new URLSearchParams({ type: 'income', store_id: storeId, from, to });
  return finFetch<IncomeStatementData>(`/api/fin/statements?${params.toString()}`, token);
}

/** Dashboard ejecutivo de un período. */
export function fetchDashboard(
  storeId: string,
  from: string,
  to: string,
  token: string | null,
): Promise<DashboardData> {
  const params = new URLSearchParams({ type: 'dashboard', store_id: storeId, from, to });
  return finFetch<DashboardData>(`/api/fin/statements?${params.toString()}`, token);
}

/**
 * Drilldown: movimientos de una categoría con su documento de origen.
 * El balance usa from=1900-01-01 (todo el histórico hasta la fecha de corte);
 * el rendimiento usa el from/to del período.
 */
export function fetchCategoryDetail(
  storeId: string,
  category: string,
  from: string,
  to: string,
  limit: number,
  offset: number,
  token: string | null,
): Promise<CategoryDetailData> {
  const params = new URLSearchParams({
    store_id: storeId,
    category,
    from,
    to,
    limit: String(limit),
    offset: String(offset),
  });
  return finFetch<CategoryDetailData>(`/api/fin/statements/category-detail?${params.toString()}`, token);
}
