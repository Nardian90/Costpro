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
    const base = body.error || body.message || `HTTP ${res.status}`;
    // MISIÓN CUERPO INVÁLIDO (2026-10-24): las rutas devuelven `details`
    // (issues de Zod) junto al mensaje genérico; descartarlas ocultaba la
    // causa real (p. ej. «Cuerpo inválido» sin saber qué campo falló). Se
    // añaden hasta 3 detalles textuales al mensaje lanzado — aditivo y
    // seguro para todos los módulos que usan apiFetch.
    const details = Array.isArray(body.details)
      ? body.details.filter((d: unknown): d is string => typeof d === 'string').slice(0, 3)
      : [];
    throw new Error(details.length > 0 ? `${base} (${details.join(' · ')})` : base);
  }

  return res.json();
}
