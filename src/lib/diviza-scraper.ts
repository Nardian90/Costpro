/**
 * diviza-scraper.ts — Adaptador de la fuente informal cubadivisas.com (Diviza).
 *
 * CONTEXTO (verificado 2026-10-26):
 *   - solucionescuba.com CAÍDO: el dominio ahora sirve un panel de hosting con
 *     certificado TLS de otro nombre (CN=panel-b.hostingcuba.net) — el fetch
 *     falla en TLS y la página de cotizaciones ya no existe. La tasa informal
 *     de COSTPRO quedó congelada el 2026-07-28.
 *   - cubadivisas.com OPERATIVO: HTTP 200, HTML estático (Astro) con las tasas
 *     del mercado informal/publicadas en un JSON embebido legible:
 *       <script type="application/json" id="conv-data">
 *         {"informal":[{"code":"USD","label":"USD","rate":839},
 *                      {"code":"ECU","label":"EUR","rate":930},
 *                      {"code":"MLC","label":"MLC","rate":691.62}, ...],
 *          "formal":[...]}
 *       </script>
 *     Metodología declarada (https://cubadivisas.com/sobre-nosotros/metodologia-tasas):
 *     mediana de referencias del mercado informal (grupos, operadores), tasa
 *     formal = CADECA/bancos estatales, actualización cada 30 minutos con hora
 *     visible junto al precio.
 *
 * MÉTODO DE CAPTURA ELEGIDO (orden de preferencia de la misión):
 *   1. API pública documentada → NO existe.
 *   2. Endpoint público de datos → /partials/feed existe pero devuelve vacío
 *      sin los parámetros internos del sitio; NO es una API documentada.
 *   3. Lectura server-side del HTML público → VIABLE: el HTML estático publica
 *      el JSON "conv-data" legible. Sin CAPTCHA, sin auth, sin mecanismos
 *      antibots. Se lee 1 vez por captura (cron 2×/día o botón manual), con
 *      timeout y cero reintentos agresivos.
 *
 * Decisiones de diseño:
 *   - NO se inventan rutas API ni se simulan JSON.
 *   - Timeout 12s, fetch único, sin reintentos.
 *   - Headers realistas en español de Cuba (Accept-Language es-CU).
 *   - Cada moneda (USD, EUR, MLC) se valida POR SEPARADO: si no aparece o no
 *     supera las validaciones, se reporta como null — JAMÁS se fabrica su valor
 *     a partir de otra moneda (ni EUR=BCC×1.15 ni MLC=USD).
 *   - El momento de actualización de la fuente ("Actualizado el ...") se
 *     extrae y se distingue del momento de captura de COSTPRO.
 *   - Detección de página de error/mantenimiento/HTML sin cotizaciones:
 *     HTTP no-2xx, HTML < 200 chars, sin bloque conv-data, o sin USD válido.
 *   - Funciones puras exportadas para tests con fixtures de HTML real.
 *
 * Estructura de retorno:
 *   - Success → { usd, eur, mlc, sourceUpdatedAt, capturedAt, sourceUrl, strategy }
 *     eur/mlc son null si Diviza no los publicó (no 0, no estimados).
 *   - Failure → null (sin lanzar; el caller decide carry-forward).
 */

/** Shape devuelto por el adaptador cuando la captura es exitosa. */
export interface DivizaRates {
  /** Tasa informal USD → CUP (obligatoria; sin ella la captura falla). */
  usd: number;
  /** Tasa informal EUR → CUP, o null si la fuente no la publicó. */
  eur: number | null;
  /** Tasa informal MLC → CUP, o null si la fuente no la publicó. */
  mlc: number | null;
  /**
   * Timestamp ISO del momento en que DIVIZA actualizó la cotización
   * (parseado del texto visible "Actualizado el ..."). null si no se pudo
   * extraer. Es la fecha DEL PROVEEDOR, distinta de `capturedAt` (cuando
   * COSTPRO hizo el fetch).
   */
  sourceUpdatedAt: string | null;
  /** ISO timestamp de cuándo COSTPRO ejecutó la captura. */
  capturedAt: string;
  /** URL canónica usada para el fetch (auditoría). */
  sourceUrl: string;
  /** Identifica qué estrategia de parseo funcionó (monitoreo). */
  strategy: string;
}

/** URL canónica del sitio (página pública con las cotizaciones). */
const DIVIZA_URL = 'https://cubadivisas.com/';

/** Timeout del fetch en ms (único intento, sin reintentos agresivos). */
const DIVIZA_TIMEOUT_MS = 12_000;

/** Headers realistas — sin spoofing agresivo, español de Cuba. */
const DIVIZA_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-CU,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * Rango de validez de una tasa informal CUP por divisa. Cuba informal ha
 * oscillado históricamente entre ~100 y ~1000 CUP por USD/EUR; usamos un
 * rango holgado (1 – 100 000) para atrapar valores absurdos (0.5, 999999)
 * sin rechazar valores legítimos si el mercado se dispara.
 */
const MIN_RATE = 1;
const MAX_RATE = 100_000;

/** Entrada del JSON conv-data (campos tal como los publica Diviza). */
interface DivizaConvEntry {
  code?: string;
  label?: string;
  rate?: number | string;
}

/**
 * Valida que un valor de tasa sea numérico, finito y esté dentro del rango.
 * Acepta number o string numérico ("839", "691.62"); rechaza 0, negativos,
 * NaN/Infinity y valores fuera de rango.
 */
export function validateRateValue(raw: unknown): number | null {
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    if (!Number.isFinite(parsed)) return null;
    return validateRateValue(parsed);
  }
  if (typeof raw !== 'number') return null;
  if (!Number.isFinite(raw)) return null;
  if (raw < MIN_RATE || raw > MAX_RATE) return null;
  return Math.round(raw * 100) / 100;
}

/**
 * Busca la entrada de una moneda en el array informal por code O label.
 * USD: code='USD'. EUR: code='ECU' con label='EUR' (Diviza usa 'ECU' como
 * code interno del euro informal). MLC: code='MLC'.
 * Devuelve la tasa validada o null si no aparece / no valida.
 */
function findInformalRate(
  informal: DivizaConvEntry[],
  codes: string[],
  labels: string[],
): number | null {
  for (const entry of informal) {
    const code = String(entry.code ?? '').trim();
    const label = String(entry.label ?? '').trim();
    const matches =
      (codes.length > 0 && codes.includes(code)) ||
      (labels.length > 0 && labels.includes(label));
    if (!matches) continue;
    const rate = validateRateValue(entry.rate);
    if (rate !== null) return rate;
  }
  return null;
}

/**
 * Parsea el timestamp visible del proveedor.
 * Formato real: "Actualizado el 25 de octubre de 2026, 5:30 p. m. (hora de Cuba) · se actualiza cada 30 minutos"
 * → 2026-10-25T17:30:00-04:00 (Cuba = America/Havana, UTC-5 en invierno / UTC-4 en verano).
 *
 * Se acepta "p. m." / "p.m." / "a. m." / "a.m." / AM / PM (con o sin espacios)
 * y horas 12h con minutos. Devuelve null si no se puede extraer (la captura
 * NO falla por esto — es metadato de frescura).
 */
export function parseDivizaUpdatedAt(text: string): string | null {
  if (!text) return null;
  const m = text.match(
    /Actualizado\s+el\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4}),?\s+(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)/i,
  );
  if (!m) return null;

  const day = parseInt(m[1], 10);
  const months: Record<string, number> = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12,
  };
  const month = months[m[2].toLowerCase()];
  const year = parseInt(m[3], 10);
  let hour = parseInt(m[4], 10);
  const minute = m[5] ? parseInt(m[5], 10) : 0;
  const meridiem = m[6].toLowerCase().replace(/[\s.]/g, '');

  if (!month || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  // 12 a.m. = 00h, 12 p.m. = 12h
  if (meridiem === 'am') {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  // Cuba (America/Havana): UTC-5 (nov–mar) / UTC-4 (mar–nov). Aproximación
  // estándar DST del hemisferio norte: segundo domingo de marzo → primer
  // domingo de noviembre.
  const isDST = isCubaDST(year, month, day);
  const offset = isDST ? '-04:00' : '-05:00';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}:00${offset}`;
}

/** ¿Está la fecha en horario de verano de Cuba (2º dom. marzo → 1º dom. noviembre)? */
function isCubaDST(year: number, month: number, day: number): boolean {
  const secondSundayMarch = nthSundayOfMonth(year, 3, 2);
  const firstSundayNovember = nthSundayOfMonth(year, 11, 1);
  const date = new Date(Date.UTC(year, month - 1, day));
  const march = new Date(Date.UTC(year, 2, secondSundayMarch));
  const november = new Date(Date.UTC(year, 10, firstSundayNovember));
  return date >= march && date < november;
}

/** Día del mes del N-ésimo domingo de un mes (1-indexado). */
function nthSundayOfMonth(year: number, month: number, n: number): number {
  // getUTCDay() del día 1 del mes; 0=domingo
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const firstSunday = first === 0 ? 1 : 8 - first;
  return firstSunday + (n - 1) * 7;
}

/**
 * Parsea el HTML público de cubadivisas.com extrayendo las tasas informales
 * del bloque JSON "conv-data". Exportada para tests (mock del HTML).
 *
 * Reglas:
 *   - USD es OBLIGATORIA: sin USD válido → null (captura fallida).
 *   - EUR y MLC opcionales: null si no aparecen (NUNCA fabricadas).
 *   - HTML < 200 chars, sin bloque conv-data, o JSON malformado → null.
 */
export function parseDivizaHtml(html: string): DivizaRates | null {
  if (!html || html.length < 200) return null;

  const blockMatch = html.match(
    /<script[^>]*type=["']application\/json["'][^>]*id=["']conv-data["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!blockMatch) return null;

  let data: { informal?: DivizaConvEntry[]; formal?: DivizaConvEntry[] };
  try {
    data = JSON.parse(blockMatch[1].trim());
  } catch {
    return null;
  }

  const informal = Array.isArray(data.informal) ? data.informal : [];
  if (informal.length === 0) return null;

  // USD se valida por code 'USD' (la fuente usa este code exacto).
  const usd = findInformalRate(informal, ['USD'], []);
  if (usd === null) return null; // USD obligatoria

  // EUR informal: Diviza usa code 'ECU' con label 'EUR' — se busca por
  // cualquiera de las dos claves para robustez ante cambios menores.
  const eur = findInformalRate(informal, ['ECU', 'EUR'], ['EUR']);
  // MLC informal: code/label 'MLC'.
  const mlc = findInformalRate(informal, ['MLC'], ['MLC']);

  // Momento de actualización declarado por la fuente (texto visible).
  const text = html.replace(/<[^>]+>/g, ' ');
  const updatedMatch = text.match(/Actualizado\s+el\s+[^<]{5,140}/i);
  const sourceUpdatedAt = updatedMatch ? parseDivizaUpdatedAt(updatedMatch[0]) : null;

  return {
    usd,
    eur,
    mlc,
    sourceUpdatedAt,
    capturedAt: new Date().toISOString(),
    sourceUrl: DIVIZA_URL,
    strategy: 'conv-data-json',
  };
}

/**
 * Punto de entrada principal. Hace fetch a cubadivisas.com y parsea el HTML
 * público. Retorna `null` en cualquier fallo (timeout, red, HTTP 4xx/5xx,
 * página de error/mantenimiento, HTML sin conv-data, sin USD válido).
 *
 * NO lanza excepciones — el caller hace `if (!rates) → carry-forward`.
 */
export async function fetchDivizaRates(): Promise<DivizaRates | null> {
  try {
    const response = await fetch(DIVIZA_URL, {
      headers: DIVIZA_HEADERS,
      signal: AbortSignal.timeout(DIVIZA_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(
        `[diviza-scraper] HTTP ${response.status} ${response.statusText} — fetch rechazado`,
      );
      return null;
    }

    const html = await response.text();

    const rates = parseDivizaHtml(html);
    if (!rates) {
      console.warn(
        '[diviza-scraper] HTML recibido pero sin cotizaciones válidas (USD no extraído o bloque conv-data ausente)',
      );
      return null;
    }

    console.info(
      `[diviza-scraper] Captura REAL exitosa (${rates.strategy}): ` +
        `USD=${rates.usd} EUR=${rates.eur ?? '—'} MLC=${rates.mlc ?? '—'} ` +
        `fuenteActualizada=${rates.sourceUpdatedAt ?? '—'}`,
    );
    return rates;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[diviza-scraper] fetch falló: ${msg}`);
    return null;
  }
}
