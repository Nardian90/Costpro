/**
 * eltoque-scraper.ts — RED FLAG F-01b: scraping real de eltoque.com.
 *
 * Objetivo: reemplazar la estimación `BCC_seg3 × 1.15` por la tasa real
 * publicada en eltoque.com. Esta función es **best-effort**: si el sitio
 * bloquea el fetch (Cloudflare, 403, timeout, parse error), retorna `null`
 * sin lanzar, y el caller (`exchange-capture.ts`) cae al fallback
 * `BCC × 1.15` con `capture_method = 'estimated'`.
 *
 * Estado actual (verificado 2026-07-03):
 *   - eltoque.com está detrás de Cloudflare con challenge managed
 *     ("Just a moment..."). El fetch simple recibe HTTP 403 con
 *     header `cf-mitigated: challenge` desde cualquier entorno del agente.
 *   - NO hay API pública documentada (/wp-json/ también recibe 403).
 *   - El sitio renderiza las tasas vía JavaScript; el HTML crudo no las
 *     contiene. Pero el scraper se diseñó para detectar tasas embebidas
 *     en JSON-LD, data-attributes, JS hydration blobs y tablas HTML,
 *     por si Cloudflare relaja la regla o el cron corre desde otra IP.
 *
 * Decisiones de diseño:
 *   - Fetch directo (sin Playwright/Puppeteer). Razones:
 *       1. La regla del task prohibe añadir Playwright al runtime.
 *       2. La captura corre en cron server-side, no en browser.
 *       3. ~300MB extra + browsers en Docker no se justifican para un
 *          sitio que actualmente bloquea todos los entornos de captura.
 *   - NO reintentos agresivos. Cloudflare puede banear la IP del cron.
 *   - Timeout de 10s (igual que BCC) para no penalizar el cron.
 *   - Headers realistas pero NO spoofing agresivo (no rotación de UA,
 *     no proxies). Si el sitio bloquea, aceptamos el fallback.
 *   - Función pura, sin side effects, exportable para tests.
 *
 * Estructura de retorno:
 *   - Success → `{ usd, eur, mlc, capturedAt }` (todas > 0, numéricas).
 *   - Failure → `null` (sin lanzar excepción; log interno).
 *
 * Estrategias de parseo (en orden de preferencia):
 *   1. JSON-LD `<script type="application/ld+json">` con tasas.
 *   2. JS hydration blob: `window.__NUXT__`, `window.__INITIAL_STATE__`,
 *      `window.tasas`, `var tasas = {...}`.
 *   3. Tabla HTML con celdas etiquetadas "USD"/"EUR"/"MLC" y números.
 *   4. Data attributes: `data-usd`, `data-eur`, `data-mlc`.
 *   5. Regex de texto visible (último recurso, más frágil).
 */

/** Shape devuelto por el scraper cuando la captura es exitosa. */
export interface ElToqueRealRates {
  usd: number;
  eur: number;
  mlc: number;
  /** ISO timestamp de cuándo se capturó (para trazabilidad en BD). */
  capturedAt: string;
  /** Identifica qué estrategia de parseo funcionó (para monitoreo). */
  strategy: string;
}

/** URL canónica del sitio (sin /wp-json/ ni /feed — esos también reciben 403). */
const ELTOQUE_URL = 'https://eltoque.com';

/** Timeout del fetch en ms (igual que BCC, 10s). */
const ELTOQUE_TIMEOUT_MS = 10_000;

/** Headers realistas — sin spoofing agresivo. */
const ELTOQUE_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-CU,es;q=0.9,en;q=0.8',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
};

/**
 * Detecta si una respuesta HTTP es un challenge de Cloudflare.
 * Cloudflare manda el header `cf-mitigated: challenge` en 403/503
 * cuando decide mostrar el "Just a moment..." intersticial.
 */
function isCloudflareChallenge(
  status: number,
  headers: Headers,
  body: string,
): boolean {
  const mitigated = headers.get('cf-mitigated');
  if (mitigated && mitigated.toLowerCase().includes('challenge')) {
    return true;
  }
  // Fingerprint del HTML del challenge de Cloudflare
  if (body.includes('Just a moment...') || body.includes('cf-browser-verification')) {
    return true;
  }
  // Cloudflare devuelve 403/503 para challenges
  if ((status === 403 || status === 503) && headers.get('server') === 'cloudflare') {
    return true;
  }
  return false;
}

/**
 * Normaliza un número que puede venir en formato "720", "720,00", "720.50",
 * "720,50 CUP" o con separadores de miles. Retorna `null` si no se puede
 * parsear a un número positivo.
 *
 * Lógica:
 *   1. Strip de todo lo que no sea dígito, coma, punto, signo.
 *   2. Si hay coma y punto, asumir coma = miles y punto = decimal (formato es-CU).
 *   3. Si solo hay coma y parece decimal (2 dígitos después), usar coma como decimal.
 *   4. Sino, eliminar comas (miles).
 *   5. Parsear como float.
 */
export function parseRateNumber(raw: string | number | undefined | null): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }
  // Si es string numérico puro, parse directo
  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  // Extraer primer grupo numérico (con coma/punto/signo) — descarta " CUP", " USD", etc.
  const match = trimmed.match(/-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,4})?|-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  let num = match[0];

  // Si hay ambos separadores, asumir formato es-CU: 1.234,56
  if (num.includes(',') && num.includes('.')) {
    // El último separador es el decimal
    const lastComma = num.lastIndexOf(',');
    const lastDot = num.lastIndexOf('.');
    if (lastComma > lastDot) {
      // Coma es decimal, punto es miles → "1.234,56" → "1234.56"
      num = num.replace(/\./g, '').replace(',', '.');
    } else {
      // Punto es decimal, coma es miles → "1,234.56" → "1234.56"
      num = num.replace(/,/g, '');
    }
  } else if (num.includes(',')) {
    // Solo coma: si son 1-2 dígitos después → decimal, sino → miles
    const after = num.split(',')[1] ?? '';
    if (after.length <= 2) {
      num = num.replace(',', '.');
    } else {
      num = num.replace(/,/g, '');
    }
  }
  // Solo punto o sin separadores: float directo

  const value = parseFloat(num);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

/**
 * Busca un número asociado a una moneda en un blob de texto.
 * Patrones soportados (separator class `["':)=<>\\s]`):
 *   "USD: 720", "USD 720", "USD = 720", "USD: 720,50"
 *   '"USD":700' (JSON), "(USD): 745" (paréntesis), "USD</td><td>720" (tags stripped)
 *   "Dólar (USD) 720", "Tasa USD: 720 CUP"
 *
 * El `\b` (word boundary) previene falsos positivos como "MLCUSD" matcheando USD.
 * El límite `{0,10}` en el separador evita capturar números muy lejanos.
 */
function findRateForCurrency(text: string, currency: string): number | null {
  const re = new RegExp(
    `${currency}\\b["':)=<>\\s]{0,10}(\\d{1,4}(?:[.,]\\d{1,4})?)`,
    'i',
  );
  const m = text.match(re);
  if (!m) return null;
  return parseRateNumber(m[1]);
}

/**
 * Estrategia 1: JSON-LD `<script type="application/ld+json">`.
 * El sitio puede exponer tasas como Schema.org自定义 type. Buscamos
 * cualquier objeto JSON con keys USD/EUR/MLC (case-insensitive).
 */
function parseJsonLd(html: string): ElToqueRealRates | null {
  const blocks = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  if (!blocks) return null;

  for (const block of blocks) {
    const jsonMatch = block.match(/>([\s\S]*?)<\/script>/);
    if (!jsonMatch) continue;
    try {
      const data = JSON.parse(jsonMatch[1].trim());
      const flat = JSON.stringify(data).toLowerCase();
      if (flat.includes('usd') && flat.includes('eur')) {
        // Intentar extraer valores; JSON.parse ya normalizó números
        const usd = findRateForCurrency(JSON.stringify(data), 'usd');
        const eur = findRateForCurrency(JSON.stringify(data), 'eur');
        const mlc = findRateForCurrency(JSON.stringify(data), 'mlc') ?? usd;
        if (usd && eur) {
          return {
            usd,
            eur,
            mlc: mlc ?? usd,
            capturedAt: new Date().toISOString(),
            strategy: 'json-ld',
          };
        }
      }
    } catch {
      // JSON malformado — siguiente bloque
    }
  }
  return null;
}

/**
 * Estrategia 2: JS hydration blob. Eltoque usa WordPress con plugins que
 * pueden hidratar datos en `window.__INITIAL_STATE__`, `window.__NUXT__`,
 * `window.tasas` o `var tasas = {...}`. Buscamos el primer blob que
 * contenga las 3 monedas.
 */
function parseJsHydration(html: string): ElToqueRealRates | null {
  const patterns = [
    /window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});/i,
    /window\.__NUXT__\s*=\s*(\{[\s\S]*?\});/i,
    /window\.tasas\s*=\s*(\{[\s\S]*?\});/i,
    /var\s+tasas\s*=\s*(\{[\s\S]*?\});/i,
    /const\s+tasas\s*=\s*(\{[\s\S]*?\});/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m) continue;
    const blob = m[1];
    const usd = findRateForCurrency(blob, 'usd');
    const eur = findRateForCurrency(blob, 'eur');
    const mlc = findRateForCurrency(blob, 'mlc') ?? usd;
    if (usd && eur) {
      return {
        usd,
        eur,
        mlc: mlc ?? usd,
        capturedAt: new Date().toISOString(),
        strategy: 'js-hydration',
      };
    }
  }
  return null;
}

/**
 * Estrategia 3: data-attributes. El sitio puede renderizar las tasas en
 * un widget del tipo `<div data-usd="720" data-eur="780" data-mlc="720">`.
 */
function parseDataAttributes(html: string): ElToqueRealRates | null {
  const usdMatch = html.match(/data-usd=["'](\d{1,4}(?:[.,]\d{1,4})?)["']/i);
  const eurMatch = html.match(/data-eur=["'](\d{1,4}(?:[.,]\d{1,4})?)["']/i);
  const mlcMatch = html.match(/data-mlc=["'](\d{1,4}(?:[.,]\d{1,4})?)["']/i);
  const usd = usdMatch ? parseRateNumber(usdMatch[1]) : null;
  const eur = eurMatch ? parseRateNumber(eurMatch[1]) : null;
  const mlc = mlcMatch ? parseRateNumber(mlcMatch[1]) : usd;
  if (usd && eur) {
    return {
      usd,
      eur,
      mlc: mlc ?? usd,
      capturedAt: new Date().toISOString(),
      strategy: 'data-attributes',
    };
  }
  return null;
}

/**
 * Estrategia 4: tabla HTML. Busca patrones `<td>USD</td><td>720</td>`
 * o `<th>USD</th><td>720</td>`. Es robusta porque WordPress usa tablas
 * para mostrar datos tabulares.
 */
function parseHtmlTable(html: string): ElToqueRealRates | null {
  // Busca <td>USD</td> (con posible whitespace/tags intermedios) y captura el siguiente <td>
  const findInTable = (currency: string): number | null => {
    const re = new RegExp(
      `<t[dh][^>]*>\\s*${currency}\\s*</t[dh]>\\s*<t[dh][^>]*>\\s*(\\d{1,4}(?:[.,]\\d{1,4})?)\\s*</t[dh]>`,
      'i',
    );
    const m = html.match(re);
    return m ? parseRateNumber(m[1]) : null;
  };
  const usd = findInTable('USD');
  const eur = findInTable('EUR');
  const mlc = findInTable('MLC') ?? usd;
  if (usd && eur) {
    return {
      usd,
      eur,
      mlc: mlc ?? usd,
      capturedAt: new Date().toISOString(),
      strategy: 'html-table',
    };
  }
  return null;
}

/**
 * Estrategia 5 (fallback): regex sobre texto visible. Última opción, más
 * propensa a falsos positivos, pero atrapa casos donde el sitio cambia
 * la estructura y las estrategias 1-4 no aplican.
 */
function parseTextRegex(html: string): ElToqueRealRates | null {
  // Strip tags para quedarnos con texto visible
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const usd = findRateForCurrency(text, 'USD');
  const eur = findRateForCurrency(text, 'EUR');
  const mlc = findRateForCurrency(text, 'MLC') ?? usd;
  if (usd && eur) {
    return {
      usd,
      eur,
      mlc: mlc ?? usd,
      capturedAt: new Date().toISOString(),
      strategy: 'text-regex',
    };
  }
  return null;
}

/**
 * Aplica las 5 estrategias en orden y retorna la primera que funcione.
 * Exportada para tests (mock del HTML) — el caller normal usa
 * `fetchElToqueRatesReal` que hace fetch + `parseElToqueHtml`.
 */
export function parseElToqueHtml(html: string): ElToqueRealRates | null {
  if (!html || html.length < 50) return null;
  return (
    parseJsonLd(html) ??
    parseJsHydration(html) ??
    parseDataAttributes(html) ??
    parseHtmlTable(html) ??
    parseTextRegex(html)
  );
}

/**
 * Punto de entrada principal. Hace fetch a eltoque.com y, si la respuesta
 * es HTML legible (no Cloudflare challenge), lo parsea buscando tasas.
 *
 * Retorna `null` en cualquier caso de fallo:
 *   - Timeout / error de red
 *   - HTTP 403, 503, 5xx
 *   - Cloudflare challenge detectado
 *   - HTML sin tasas extraíbles
 *
 * NO lanza excepciones — el caller debe poder hacer `if (!rates) fallback()`.
 */
export async function fetchElToqueRatesReal(): Promise<ElToqueRealRates | null> {
  try {
    const response = await fetch(ELTOQUE_URL, {
      headers: ELTOQUE_HEADERS,
      signal: AbortSignal.timeout(ELTOQUE_TIMEOUT_MS),
      // No seguir redirects a challenges de Cloudflare
      redirect: 'follow',
    });

    if (!response.ok) {
      // 403/503 con Cloudflare es esperado en este entorno
      console.warn(
        `[eltoque-scraper] HTTP ${response.status} ${response.statusText} — fetch rechazado`,
      );
      return null;
    }

    const html = await response.text();

    // Doble check: incluso con 200, Cloudflare puede inyectar el challenge
    if (isCloudflareChallenge(response.status, response.headers, html)) {
      console.warn('[eltoque-scraper] Cloudflare challenge detectado en respuesta 200 — abortando');
      return null;
    }

    const rates = parseElToqueHtml(html);
    if (!rates) {
      console.warn(
        '[eltoque-scraper] HTML recibido pero no se pudieron extraer tasas — estrategias 1-5 fallaron',
      );
      return null;
    }

    console.info(
      `[eltoque-scraper] Captura REAL exitosa vía estrategia "${rates.strategy}": ` +
        `USD=${rates.usd} EUR=${rates.eur} MLC=${rates.mlc}`,
    );
    return rates;
  } catch (error: unknown) {
    // AbortError (timeout), TypeError (DNS), etc.
    const msg = error instanceof Error ? error.message : String(error);
    console.warn(`[eltoque-scraper] fetch falló: ${msg}`);
    return null;
  }
}
