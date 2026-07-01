/**
 * apiFetch — Helper para fetch autenticado en el cliente.
 *
 * Obtiene el token JWT de useAuthStore y lo envía en el header Authorization.
 * Sin esto, las API routes con withAuth devuelven 401 "No autorizado".
 *
 * Uso:
 *   import { apiFetch } from '@/lib/api-fetch';
 *   const data = await apiFetch('/api/workers?store_id=...');
 *   const res = await apiFetch('/api/workers', { method: 'POST', body: JSON.stringify(payload) });
 */
import { useAuthStore } from '@/store';

export async function apiFetch<T = any>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const token = useAuthStore.getState().token;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(body.error || body.message || `HTTP ${res.status}`);
  }

  return res.json();
}
