/**
 * soluciones-cuba-scraper.ts — Scraping REAL de solucionescuba.com.
 *
 * CONTEXTO (verificado 2026-07-03):
 *   - El scraping de eltoque.com NO funciona: publican las tasas como imágenes
 *     + Cloudflare bloquea cualquier fetch del agente con 403 cf-mitigated.
 *   - solucionescuba.com SÍ funciona: responde HTTP 200 con HTML estático que
 *     contiene las tasas como TEXTO visible.
 *   - curl https://solucionescuba.com → 200 OK, ~60KB HTML con frases como:
 *       "dólar en Cuba se referencia en 640.00 CUP"
 *       "MLC desciende a 490 CUP"
 *       "euro... 720 CUP" / "euro sube a los 720"
 *
 * Esta función es **best-effort**: si el fetch falla (timeout, 4xx/5xx, parse
 * error), retorna `null` sin lanzar, y el caller (`exchange-capture.ts`)
 * cae al fallback `BCC × 1.15` con `capture_method='estimated'`.
 *
 * Decisiones de diseño:
 *   - Fetch directo (sin Playwright/Puppeteer). Razones:
 *       1. El sitio sirve HTML estático con tasas en texto — no hace falta JS.
 *       2. La captura corre en cron server-side y en API route, no en browser.
 *       3. Sin dependencias pesadas (~300MB extra de browsers).
 *   - NO reintentos agresivos para no impactar al sitio.
 *   - Timeout de 15s (3s más que BCC/elToque para tolerar HTML grande).
 *   - Headers realistas en español de Cuba (Accept-Language es-CU).
 *   - Función pura, sin side effects, exportable para tests.
 *   - Estrategias de parseo múltiples (regex sobre texto visible + data-attrs)
 *     para tolerar cambios menores de redacción del sitio.
 *
 * Estructura de retorno:
 *   - Success → `{ usd, eur, mlc, capturedAt, sourceUrl }` (todas > 0, numéricas).
 *     USD es obligatoria; si EUR o MLC no se encuentran, se reportan como 0.
 *   - Failure → `null` (sin lanzar excepción; log interno).
 */

/** Shape devuelto por el scraper cuando la captura es exitosa. */
export interface CubaRates {
  usd: number;
  eur: number;
  mlc: number;
  /** ISO timestamp de cuándo se capturó (para trazabilidad en BD). */
  capturedAt: string;
  /** URL canónica usada para el fetch (para auditoría en BD). */
  sourceUrl: string;
}

/** URL canónica del sitio. */
const SOLUCIONES_CUBA_URL = 'https://solucionescuba.com';

/** URL de la página de histórico (bolsa-divisas.php) con JSON embebido. */
const SOLUCIONES_CUBA_HISTORICAL_URL = 'https://solucionescuba.com/bolsa-divisas.php';

/** Timeout del fetch en ms (3s más que BCC/elToque para tolerar HTML grande). */
const SOLUCIONES_CUBA_TIMEOUT_MS = 15_000;

/** Headers realistas — sin spoofing agresivo, en español de Cuba. */
const SOLUCIONES_CUBA_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-CU,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * Normaliza un número que puede venir como "640", "640.00", "640,00", "640 CUP".
 * Retorna el valor float o `null` si no se puede parsear a un número positivo.
 *
 * Lógica:
 *   1. Si hay coma y punto, asumir coma = miles y punto = decimal (es-CU).
 *   2. Si solo hay coma y parece decimal (≤2 dígitos), coma = decimal.
 *   3. Si solo hay coma (más de 2 dígitos), coma = miles (eliminar).
 *   4. Sino, float directo.
 */
function parseRateNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let num = trimmed;
  if (num.includes(',') && num.includes('.')) {
    // Asumir formato es-CU: 1.234,56 → 1234.56
    num = num.replace(/\./g, '').replace(',', '.');
  } else if (num.includes(',')) {
    const after = num.split(',')[1] ?? '';
    if (after.length <= 2) {
      // "720,50" → decimal
      num = num.replace(',', '.');
    } else {
      // "1,234" → miles
      num = num.replace(/,/g, '');
    }
  }

  const value = parseFloat(num);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Busca la tasa de una moneda aplicando una lista de patrones regex en orden.
 * Devuelve el primer match exitoso (parseado a número) o `null`.
 */
function findRate(html: string, patterns: RegExp[]): number | null {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const value = parseRateNumber(m[1]);
      if (value !== null) return value;
    }
  }
  return null;
}

/**
 * Patrones de parseo para USD. Cobertura verificada con frases reales del sitio:
 *   - "dólar en Cuba se referencia en 640.00 CUP"
 *   - "dólar ... 640 CUP"
 *   - "dólar alcanza los 640 CUP"
 *   - "USD 640 CUP"
 *   - "USD: 640"
 *   - data-usd="640"
 */
const USD_PATTERNS: RegExp[] = [
  // "dólar" (con o sin acento) seguido de hasta 50 chars no numéricos, luego número + "CUP"
  /d[óo]lar[^0-9]{0,50}?(\d{2,4}(?:[.,]\d{1,2})?)\s*CUP/i,
  // "dólar" + connector ("en", "alcanza los", "se referencia en", etc.) + número
  /d[óo]lar\s+(?:se\s+referencia\s+en|alcanza\s+(?:el|los)?|est[aá]\s+en|sube\s+a(?:\s+los)?|baja\s+a(?:\s+los)?|cotiza\s+en|llega\s+a(?:\s+los)?)\s*(\d{2,4}(?:[.,]\d{1,2})?)/i,
  // "USD" como etiqueta + número + "CUP"
  /\bUSD\b[^0-9]{0,15}?(\d{2,4}(?:[.,]\d{1,2})?)\s*CUP/i,
  // "USD: 640" o "USD = 640"
  /\bUSD\b["':=\s)]{1,5}(\d{2,4}(?:[.,]\d{1,2})?)/i,
  // data-usd="640"
  /data-usd=["'](\d{2,4}(?:[.,]\d{1,2})?)["']/i,
];

/**
 * Patrones de parseo para EUR. Cobertura:
 *   - "euro... 720 CUP"
 *   - "euro sube a los 720"
 *   - "euro se referencia en 720.00 CUP"
 *   - "EUR 720 CUP"
 *   - "EUR: 720"
 *   - data-eur="720"
 */
const EUR_PATTERNS: RegExp[] = [
  /euro[^0-9]{0,50}?(\d{2,4}(?:[.,]\d{1,2})?)\s*CUP/i,
  /euro\s+(?:se\s+referencia\s+en|alcanza\s+(?:el|los)?|est[aá]\s+en|sube\s+a(?:\s+los)?|baja\s+a(?:\s+los)?|cotiza\s+en|llega\s+a(?:\s+los)?)\s*(\d{2,4}(?:[.,]\d{1,2})?)/i,
  /\bEUR\b[^0-9]{0,15}?(\d{2,4}(?:[.,]\d{1,2})?)\s*CUP/i,
  /\bEUR\b["':=\s)]{1,5}(\d{2,4}(?:[.,]\d{1,2})?)/i,
  /data-eur=["'](\d{2,4}(?:[.,]\d{1,2})?)["']/i,
];

/**
 * Patrones de parseo para MLC. Cobertura:
 *   - "MLC desciende a 490 CUP"
 *   - "MLC... 490 CUP"
 *   - "MLC se ubica en 490"
 *   - "MLC: 490"
 *   - data-mlc="490"
 *
 * Nota: usamos `\bMLC\b` para evitar falsos positivos con palabras que
 * contengan "MLC" como substring.
 */
const MLC_PATTERNS: RegExp[] = [
  /\bMLC\b[^0-9]{0,50}?(\d{2,4}(?:[.,]\d{1,2})?)\s*CUP/i,
  /\bMLC\b\s+(?:desciende\s+a|asciende\s+a|se\s+ubica\s+en|est[aá]\s+en|sube\s+a(?:\s+los)?|baja\s+a(?:\s+los)?|cotiza\s+en|llega\s+a(?:\s+los)?)\s*(\d{2,4}(?:[.,]\d{1,2})?)/i,
  /\bMLC\b["':=\s)]{1,5}(\d{2,4}(?:[.,]\d{1,2})?)/i,
  /data-mlc=["'](\d{2,4}(?:[.,]\d{1,2})?)["']/i,
];

/**
 * Parsea el HTML de solucionescuba.com buscando tasas de USD, EUR y MLC.
 * Exportada para tests (mock del HTML). El caller normal usa
 * `fetchSolucionesCubaRates` que hace fetch + `parseSolucionesCubaHtml`.
 *
 * Reglas:
 *   - USD es OBLIGATORIA. Si no se encuentra, retorna `null`.
 *   - EUR y MLC son opcionales: si no se encuentran, se reportan como 0
 *     (no como null) — el caller decide si usarlas o caer al fallback.
 *   - Si el HTML es muy corto (< 200 chars), retorna `null` (probablemente
 *     página de error vacía o redirect sin body).
 */
export function parseSolucionesCubaHtml(html: string): CubaRates | null {
  if (!html || html.length < 200) return null;

  const usd = findRate(html, USD_PATTERNS);
  if (usd === null) return null; // USD obligatoria

  const eur = findRate(html, EUR_PATTERNS) ?? 0;
  const mlc = findRate(html, MLC_PATTERNS) ?? 0;

  return {
    usd,
    eur,
    mlc,
    capturedAt: new Date().toISOString(),
    sourceUrl: SOLUCIONES_CUBA_URL,
  };
}

/**
 * Punto de entrada principal. Hace fetch a solucionescuba.com y, si la
 * respuesta es HTML legible, lo parsea buscando tasas.
 *
 * Retorna `null` en cualquier caso de fallo:
 *   - Timeout / error de red
 *   - HTTP 4xx, 5xx
 *   - HTML sin tasas extraíbles (USD no encontrada)
 *
 * NO lanza excepciones — el caller debe poder hacer `if (!rates) fallback()`.
 */
export async function fetchSolucionesCubaRates(): Promise<CubaRates | null> {
  try {
    const response = await fetch(SOLUCIONES_CUBA_URL, {
      headers: SOLUCIONES_CUBA_HEADERS,
      signal: AbortSignal.timeout(SOLUCIONES_CUBA_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(
        `[soluciones-cuba-scraper] HTTP ${response.status} ${response.statusText} — fetch rechazado`,
      );
      return null;
    }

    const html = await response.text();

    const rates = parseSolucionesCubaHtml(html);
    if (!rates) {
      console.warn(
        '[soluciones-cuba-scraper] HTML recibido pero no se pudo extraer tasa USD — patrones fallaron',
      );
      return null;
    }

    console.info(
      `[soluciones-cuba-scraper] Captura REAL exitosa: ` +
        `USD=${rates.usd} EUR=${rates.eur} MLC=${rates.mlc}`,
    );
    return rates;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[soluciones-cuba-scraper] fetch falló: ${msg}`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// HISTÓRICO — bolsa-divisas.php
// ═══════════════════════════════════════════════════════════════════════

/**
 * Entrada histórica: timestamp Unix + tasas de cada moneda.
 * Solo se usan USD, EUR, MLC. Las demás (BTC, TRX, USDT_TRC20, ECU, BNB) se ignoran.
 */
export interface HistoricalRateEntry {
  /** Timestamp Unix (segundos). */
  ts: number;
  /** Fecha ISO (YYYY-MM-DD) derivada del timestamp. */
  date: string;
  usd: number;
  eur: number;
  mlc: number;
}

/**
 * Parsea el HTML de bolsa-divisas.php extrayendo el histórico embebido como JSON.
 *
 * La página contiene bloques como:
 *   {"ts":1766714346,"rates":{"USD":435,"BTC":463,"MLC":410,"ECU":480,"TRX":130,"USDT_TRC20":485,"EUR":480}}
 *
 * Esta función extrae todos esos bloques y devuelve una lista ordenada por timestamp ascendente.
 *
 * Reglas:
 *   - Solo se incluyen entradas con USD presente y > 0.
 *   - Si hay múltiples entradas para la misma fecha (YYYY-MM-DD), se conserva
 *     solo la ÚLTIMA del día (la más reciente) — el BCC publica 1 tasa/día.
 *   - EUR y MLC pueden ser 0 si no están en el bloque (se reportan como 0).
 */
export function parseHistoricalHtml(html: string): HistoricalRateEntry[] {
  if (!html) return [];

  // Patrón: "ts":NNNNNNNNNN,"rates":{...}
  const pattern = /"ts":(\d+),"rates":\{([^}]+)\}/g;
  const rawEntries: { ts: number; rates: Record<string, number> }[] = [];

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const ts = parseInt(match[1], 10);
    if (!Number.isFinite(ts) || ts <= 0) continue;

    // Parsear el objeto de rates: "USD":435,"BTC":463,...
    const ratesStr = match[2];
    const rates: Record<string, number> = {};
    const ratePattern = /"(\w+)":(\d+(?:\.\d+)?)/g;
    let rateMatch: RegExpExecArray | null;
    while ((rateMatch = ratePattern.exec(ratesStr)) !== null) {
      const currency = rateMatch[1];
      const value = parseFloat(rateMatch[2]);
      if (Number.isFinite(value)) {
        rates[currency] = value;
      }
    }

    rawEntries.push({ ts, rates });
  }

  // Agrupar por fecha (YYYY-MM-DD) y conservar la última entrada del día
  const byDate = new Map<string, HistoricalRateEntry>();
  for (const entry of rawEntries) {
    const date = new Date(entry.ts * 1000).toISOString().split('T')[0];
    const usd = entry.rates.USD;
    if (!usd || usd <= 0) continue; // USD obligatoria

    const existing = byDate.get(date);
    if (!existing || entry.ts > existing.ts) {
      byDate.set(date, {
        ts: entry.ts,
        date,
        usd,
        eur: entry.rates.EUR ?? 0,
        mlc: entry.rates.MLC ?? 0,
      });
    }
  }

  // Ordenar por fecha ascendente
  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Hace fetch a bolsa-divisas.php y extrae el histórico completo.
 *
 * Retorna array vacío si:
 *   - Fetch falla (timeout, 4xx, 5xx)
 *   - HTML sin bloques JSON extraíbles
 *
 * NO lanza excepciones.
 */
export async function fetchHistoricalRates(): Promise<HistoricalRateEntry[]> {
  try {
    const response = await fetch(SOLUCIONES_CUBA_HISTORICAL_URL, {
      headers: SOLUCIONES_CUBA_HEADERS,
      signal: AbortSignal.timeout(SOLUCIONES_CUBA_TIMEOUT_MS),
      redirect: 'follow',
    });

    if (!response.ok) {
      console.warn(
        `[soluciones-cuba-scraper] Historical HTTP ${response.status} — fetch rechazado`,
      );
      return [];
    }

    const html = await response.text();
    const entries = parseHistoricalHtml(html);

    console.info(
      `[soluciones-cuba-scraper] Histórico: ${entries.length} entradas ` +
        `(${entries[0]?.date ?? '—'} → ${entries[entries.length - 1]?.date ?? '—'})`,
    );
    return entries;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[soluciones-cuba-scraper] Historical fetch falló: ${msg}`);
    return [];
  }
}
