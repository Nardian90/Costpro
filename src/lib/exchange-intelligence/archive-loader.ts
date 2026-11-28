/**
 * archive-loader.ts — Consulta COMPARTIDA del histórico informal unificado.
 *
 * MISIÓN IC-UX-HISTORY-004 (2026-10-26) §3 (rendimiento: «sin solicitudes
 * duplicadas») y §4 (serie informal unificada): tanto la pestaña «Histórico»
 * como «Mi Producto» necesitan la serie completa de la base de datos
 * (BCC + Diviza + archivo elToque — GET /api/exchange-rates?days=all&source=all).
 *
 * Este módulo centraliza ESA consulta con:
 *   - caché en memoria por segmento (TTL corto: el archivo histórico casi no
 *     cambia; lo vivo ya lo refresca la vista cada 5 min por otra vía);
 *   - deduplicación de la petición en vuelo (si dos tabs se montan a la vez,
 *     o StrictMode remonta el efecto, sale UNA sola petición HTTP);
 *   - `force` para el botón «Reintentar archivo» (ignora caché y revalida).
 *
 * La selección de la tasa VIGENTE (fuente activa Diviza) NO pasa por aquí:
 * sigue siendo responsabilidad de la consulta por defecto de la vista y de
 * `source=informal` en la API (IC-DIVIZA-003) — el archivo jamás alimenta la
 * tarjeta vigente.
 */

'use client';

/** TTL de la caché del archivo: 2 minutos. El histórico es cuasi-estático;
 * capturas nuevas llegan por la consulta activa de la vista, no por esta. */
const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  rows: any[];
  fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any[]>>();

/** Caché fresca para pintar sin petición (carga inicial de un segundo tab). */
export function getCachedArchiveRows(segment: string): any[] | undefined {
  const hit = cache.get(segment);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS) return hit.rows;
  return undefined;
}

/**
 * CP-FX-UX-002 (FASE 2): metadatos de frescura de la caché — momento de la
 * última respuesta aceptada y mayor rate_date REAL (sin virtuales de
 * arrastre) presente en ella. El tab Histórico los usa para (a) mostrar
 * «Datos actualizados a las HH:MM» y (b) converger con la consulta activa
 * de la vista cuando esta trajo filas más nuevas (p. ej. tras una captura).
 */
export function getArchiveMeta(segment: string): { fetchedAt: number; newestRateDate: string | null } | null {
  const hit = cache.get(segment);
  if (!hit) return null;
  let newest: string | null = null;
  for (const r of hit.rows) {
    // Los virtuales carry-forward (id cf-*) replican la fecha operativa en
    // el momento de la consulta: no cuentan como dato nuevo.
    if (typeof r?.id === 'string' && r.id.startsWith('cf-')) continue;
    if (r?.capture_method === 'carry_forward') continue;
    if (typeof r?.rate_date === 'string' && (newest === null || r.rate_date > newest)) {
      newest = r.rate_date;
    }
  }
  return { fetchedAt: hit.fetchedAt, newestRateDate: newest };
}

/**
 * Trae TODA la serie disponible (days=all&source=all) para el segmento BCC
 * consultado. Devuelve las filas crudas con su procedencia — la serie diaria
 * unificada se construye con buildUnifiedHistorySeries (src/lib/exchange-history).
 */
export function loadExchangeArchive(segment: string, opts?: { force?: boolean }): Promise<any[]> {
  if (!opts?.force) {
    const cached = getCachedArchiveRows(segment);
    if (cached) return Promise.resolve(cached);
    const pending = inflight.get(segment);
    if (pending) return pending;
  }
  const p = (async () => {
    const { useAuthStore } = await import('@/store');
    const token = useAuthStore.getState().token;
    const res = await fetch(
      `/api/exchange-rates?days=all&source=all&segment=${encodeURIComponent(segment)}`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.rates)) throw new Error('Respuesta sin serie de tasas');
    cache.set(segment, { rows: json.rates as any[], fetchedAt: Date.now() });
    return json.rates as any[];
  })();
  inflight.set(segment, p);
  // Limpiar el inflight al asentarse (éxito o fallo) para permitir reintentos.
  void p.finally(() => {
    inflight.delete(segment);
  });
  return p;
}
