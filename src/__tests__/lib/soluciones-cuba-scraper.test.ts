/**
 * Tests del scraper de solucionescuba.com (IC-SOLUCIONES-CUBA-SCRAPER).
 *
 * Cobertura:
 *   1. `parseSolucionesCubaHtml` — extrae USD, EUR, MLC de HTML real con
 *      frases verificadas en el sitio (3 julio 2026):
 *        "dólar en Cuba se referencia en 640.00 CUP"
 *        "MLC desciende a 490 CUP"
 *        "euro... 720 CUP" / "euro sube a los 720"
 *   2. `fetchSolucionesCubaRates` — fetch exitoso, 404, timeout, error de red,
 *      HTML sin tasas.
 *   3. Edge cases: HTML muy corto, EUR/MLC faltantes, formatos es-CU con coma.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchSolucionesCubaRates,
  parseSolucionesCubaHtml,
} from '@/lib/soluciones-cuba-scraper';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

/** Construye un Response mock con los headers y body dados. */
function mockResponse(
  body: string,
  init: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers);
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 404 ? 'Not Found' : 'Error',
    headers,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

/**
 * HTML real simplificado de solucionescuba.com (3 julio 2026).
 * Contiene las frases exactas verificadas en el sitio.
 */
function realHtmlFromSite(opts: {
  usd?: string;
  eur?: string | null;
  mlc?: string | null;
  usdPhrase?: string;
  eurPhrase?: string | null;
  mlcPhrase?: string | null;
} = {}): string {
  const usdPhrase =
    opts.usdPhrase ??
    `El dólar en Cuba se referencia en ${opts.usd ?? '640.00'} CUP este miércoles 3 de julio de 2026.`;
  const eurPhrase =
    opts.eurPhrase === null
      ? ''
      : opts.eurPhrase ??
        `Por su parte, el euro sube a los ${opts.eur ?? '720'} CUP en el mercado informal cubano.`;
  const mlcPhrase =
    opts.mlcPhrase === null
      ? ''
      : opts.mlcPhrase ??
        `El MLC desciende a ${opts.mlc ?? '490'} CUP, según el monitoreo diario.`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Tasas de cambio Cuba hoy 3 de julio de 2026 | SolucionesCuba</title>
  <meta name="description" content="Tasas de cambio informal en Cuba: dólar, euro, MLC">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header>
    <nav>... sitio ...</nav>
  </header>
  <main>
    <article>
      <h1>Tasa de cambio Cuba hoy</h1>
      <p> ${usdPhrase} </p>
      <p> ${eurPhrase} </p>
      <p> ${mlcPhrase} </p>
      <p>Estas tasas son referenciales y se actualizan diariamente con base en el monitoreo del mercado informal cubano. La información proviene de diversas fuentes del sector privado y estatal.</p>
      <p>Para más detalles sobre el comportamiento del mercado cambiario, consulte nuestras secciones especializadas.</p>
    </article>
    <aside>
      <h2>Otros indicadores</h2>
      <p>TC oficial BCC: 120 CUP/USD</p>
      <p>TC CADECA: 130 CUP/USD</p>
    </aside>
  </main>
  <footer>
    <p>&copy; 2026 SolucionesCuba. Todos los derechos reservados.</p>
  </footer>
</body>
</html>`;
}

// ────────────────────────────────────────────────────────────────────────────
// 1. parseSolucionesCubaHtml
// ────────────────────────────────────────────────────────────────────────────

describe('IC-SOLUCIONES-CUBA-SCRAPER: parseSolucionesCubaHtml', () => {
  it('extrae USD, EUR, MLC del HTML real del sitio (3 julio 2026)', () => {
    const html = realHtmlFromSite({ usd: '640.00', eur: '720', mlc: '490' });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
    expect(r!.eur).toBe(720);
    expect(r!.mlc).toBe(490);
    expect(r!.sourceUrl).toBe('https://solucionescuba.com');
    expect(r!.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('acepta variante "dólar... 640 CUP" sin "se referencia en"', () => {
    const html = realHtmlFromSite({
      usdPhrase: 'Hoy el dólar en Cuba se ubica en 640 CUP.',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
  });

  it('acepta variante "euro sube a los 720" sin "CUP" al final del número', () => {
    const html = realHtmlFromSite({
      eurPhrase: 'El euro sube a los 720 en el mercado informal.',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.eur).toBe(720);
  });

  it('acepta "MLC desciende a 490 CUP" (patrón con verbo + "a")', () => {
    const html = realHtmlFromSite({
      mlcPhrase: 'El MLC desciende a 490 CUP respecto a ayer.',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.mlc).toBe(490);
  });

  it('acepta formato es-CU con coma decimal: "640,50"', () => {
    const html = realHtmlFromSite({
      usdPhrase: 'El dólar se referencia en 640,50 CUP.',
      eurPhrase: 'El euro sube a los 720,00 CUP.',
      mlcPhrase: 'El MLC cotiza en 490,75 CUP.',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640.5);
    expect(r!.eur).toBe(720);
    expect(r!.mlc).toBe(490.75);
  });

  it('acepta data-attributes: data-usd="640" data-eur="720" data-mlc="490"', () => {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Tasas de cambio widget</title>
</head>
<body>
  <main>
    <section class="widget-container">
      <h2>Tasas de hoy — widget de datos</h2>
      <div class="tasas-widget" data-usd="640" data-eur="720" data-mlc="490"></div>
      <p>Widget de tasas actualizado diariamente desde multiples fuentes del mercado cubano.</p>
      <p>Para más información consulte nuestras secciones especializadas en economía cubana.</p>
      <p>Los datos se actualizan cada 24 horas en base a operaciones reales del mercado informal.</p>
    </section>
  </main>
</body>
</html>`;
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
    expect(r!.eur).toBe(720);
    expect(r!.mlc).toBe(490);
  });

  it('acepta "USD 640 CUP" como etiqueta directa en tabla HTML', () => {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Tabla de tasas de cambio</title>
</head>
<body>
  <main>
    <section>
      <h2>Tasas de cambio informales en Cuba</h2>
      <table border="1" cellpadding="5">
        <thead><tr><th>Moneda</th><th>Tasa (CUP)</th></tr></thead>
        <tbody>
          <tr><td>USD</td><td>640 CUP</td></tr>
          <tr><td>EUR</td><td>720 CUP</td></tr>
          <tr><td>MLC</td><td>490 CUP</td></tr>
        </tbody>
      </table>
      <p>Tabla de tasas actualizadas al cierre del día.</p>
      <p>Información referencial proveniente de operaciones del sector no estatal cubano.</p>
    </section>
  </main>
</body>
</html>`;
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
    expect(r!.eur).toBe(720);
    expect(r!.mlc).toBe(490);
  });

  it('retorna null si el HTML no contiene tasa USD', () => {
    const html = `<!DOCTYPE html>
<html><body>
  <h1>SolucionesCuba</h1>
  <p>Sitio en mantenimiento. Vuelve más tarde para ver las tasas de cambio.</p>
  <p>Disculpe las molestias técnicas.</p>
</body></html>`;
    expect(parseSolucionesCubaHtml(html)).toBeNull();
  });

  it('retorna null si el HTML es muy corto (< 200 chars)', () => {
    expect(parseSolucionesCubaHtml('')).toBeNull();
    expect(parseSolucionesCubaHtml('short')).toBeNull();
    expect(parseSolucionesCubaHtml('<html><body>Too short</body></html>')).toBeNull();
  });

  it('USD obligatoria — si falta, retorna null aunque EUR y MLC estén presentes', () => {
    const html = realHtmlFromSite({
      usdPhrase: 'No mencionamos el dólar hoy.',
    });
    expect(parseSolucionesCubaHtml(html)).toBeNull();
  });

  it('EUR faltante → retorna 0 (no null)', () => {
    const html = realHtmlFromSite({
      eurPhrase: null,
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
    expect(r!.eur).toBe(0);
    expect(r!.mlc).toBe(490);
  });

  it('MLC faltante → retorna 0 (no null)', () => {
    const html = realHtmlFromSite({
      mlcPhrase: null,
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
    expect(r!.mlc).toBe(0);
  });

  it('USD con valor 0 o negativo → retorna null (parseRateNumber rechaza)', () => {
    // El patrón captura "0" pero parseRateNumber lo rechaza (value <= 0)
    const html = realHtmlFromSite({
      usdPhrase: 'El dólar se referencia en 0 CUP por error técnico.',
    });
    const r = parseSolucionesCubaHtml(html);
    // "0" no pasa la validación de parseRateNumber (value <= 0),
    // pero el patrón fallback "USD..." tampoco está, así que es null
    expect(r).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. fetchSolucionesCubaRates — fetch + parse
// ────────────────────────────────────────────────────────────────────────────

describe('IC-SOLUCIONES-CUBA-SCRAPER: fetchSolucionesCubaRates', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('retorna tasas cuando el fetch es 200 y el HTML contiene las frases reales', async () => {
    const html = realHtmlFromSite({ usd: '640.00', eur: '720', mlc: '490' });
    global.fetch = vi.fn().mockResolvedValue(mockResponse(html));

    const r = await fetchSolucionesCubaRates();
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640);
    expect(r!.eur).toBe(720);
    expect(r!.mlc).toBe(490);
    expect(r!.sourceUrl).toBe('https://solucionescuba.com');
    expect(r!.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('Captura REAL exitosa'),
    );
  });

  it('retorna null cuando la respuesta es HTTP 404', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse('Not Found', { status: 404 }),
    );

    const r = await fetchSolucionesCubaRates();
    expect(r).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('HTTP 404'),
    );
  });

  it('retorna null cuando la respuesta es HTTP 500', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse('Internal Server Error', { status: 500 }),
    );

    const r = await fetchSolucionesCubaRates();
    expect(r).toBeNull();
  });

  it('retorna null cuando fetch lanza AbortError (timeout)', async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(err);

    const r = await fetchSolucionesCubaRates();
    expect(r).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('fetch falló: The operation was aborted due to timeout'),
    );
  });

  it('retorna null cuando fetch lanza TypeError (DNS / red caída)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const r = await fetchSolucionesCubaRates();
    expect(r).toBeNull();
  });

  it('retorna null cuando la respuesta es 200 pero el HTML no contiene tasa USD', async () => {
    const html = `<!DOCTYPE html>
<html><body>
  <h1>SolucionesCuba</h1>
  <p>Página sin tasas — sección de noticias del día.</p>
  <p>Para ver las tasas visite la página principal del portal.</p>
  <p>Otros artículos económicos disponibles en nuestra hemeroteca digital.</p>
</body></html>`;
    global.fetch = vi.fn().mockResolvedValue(mockResponse(html));

    const r = await fetchSolucionesCubaRates();
    expect(r).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no se pudo extraer tasa USD'),
    );
  });

  it('usa headers realistas (User-Agent Chrome, Accept-Language es-CU)', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(mockResponse(realHtmlFromSite()));
    });

    await fetchSolucionesCubaRates();
    expect(capturedInit).toBeDefined();
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/Chrome/);
    expect(headers['Accept-Language']).toMatch(/es-CU/);
    expect(capturedInit!.signal).toBeDefined(); // timeout aplicado
  });

  it('hace fetch a la URL canónica https://solucionescuba.com', async () => {
    let capturedUrl: string | URL | undefined;
    global.fetch = vi.fn().mockImplementation((url: string | URL) => {
      capturedUrl = url;
      return Promise.resolve(mockResponse(realHtmlFromSite()));
    });

    await fetchSolucionesCubaRates();
    expect(capturedUrl).toBe('https://solucionescuba.com');
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. Edge cases adicionales
// ────────────────────────────────────────────────────────────────────────────

describe('IC-SOLUCIONES-CUBA-SCRAPER: edge cases', () => {
  it('prioridad: "dólar" gana sobre "USD" si aparece primero en el HTML', () => {
    const html = realHtmlFromSite({
      usdPhrase: 'El dólar se referencia en 640.00 CUP. (USD oficial: 120)',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    // El patrón "dólar...640.00...CUP" debería atrapar 640 antes que "USD oficial: 120"
    expect(r!.usd).toBe(640);
  });

  it('no confunde "MLC" como substring de otra palabra (usa \\b)', () => {
    // "PIMLCXYZ" no debería matchear MLC — el \b evita falsos positivos
    const html = realHtmlFromSite({
      mlcPhrase: 'El PIMLCXYZ reporta 999. El MLC cotiza en 490 CUP.',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.mlc).toBe(490);
  });

  it('maneja formato es-CU con coma decimal en tasas de 3 dígitos: "640,50"', () => {
    // Caso realista: tasas cubanas están en 3 dígitos (640, 720, 490).
    // El parser solo admite "X,DD" (coma decimal con ≤2 decimales).
    const html = realHtmlFromSite({
      usdPhrase: 'El dólar se referencia en 640,50 CUP.',
      eurPhrase: 'El euro sube a los 720,75 CUP.',
      mlcPhrase: 'El MLC cotiza en 490,25 CUP.',
    });
    const r = parseSolucionesCubaHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(640.5);
    expect(r!.eur).toBe(720.75);
    expect(r!.mlc).toBe(490.25);
  });
});
