/**
 * F-01b: Tests del scraper de eltoque.com y de la integración con
 * `captureForDate` (fallback `BCC × 1.15` cuando el scraping falla).
 *
 * Cobertura:
 *   1. `parseRateNumber` — normalización de números en formatos es-CU y en-US.
 *   2. `parseElToqueHtml` — 5 estrategias de parseo (JSON-LD, JS hydration,
 *      data-attributes, tabla HTML, regex de texto).
 *   3. `fetchElToqueRatesReal` — fetch exitoso, 403 Cloudflare, timeout,
 *      error de red, HTML sin tasas.
 *   4. Integración `captureForDate` — cuando el scraper retorna null, el
 *      resultado se marca `capture_method: 'estimated'` y las tasas
 *      calculadas son `BCC_seg3 × 1.15`. Cuando el scraper retorna tasas,
 *      el resultado se marca `capture_method: 'real'`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  fetchElToqueRatesReal,
  parseElToqueHtml,
  parseRateNumber,
} from '@/lib/eltoque-scraper';
import { captureForDate } from '@/lib/exchange-capture';

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
  // `ok` es true para 200-299
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : status === 403 ? 'Forbidden' : 'Error',
    headers,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
  } as unknown as Response;
}

/** Cloudflare challenge response — fingerprint real observado en producción. */
function cloudflareChallengeResponse(): Response {
  return mockResponse(
    '<!DOCTYPE html><html lang="en-US"><head><title>Just a moment...</title>' +
      '<meta name="robots" content="noindex,nofollow"></head>' +
      '<body><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>',
    {
      status: 403,
      headers: {
        server: 'cloudflare',
        'cf-mitigated': 'challenge',
        'content-type': 'text/html; charset=UTF-8',
      },
    },
  );
}

// ────────────────────────────────────────────────────────────────────────────
// 1. parseRateNumber
// ────────────────────────────────────────────────────────────────────────────

describe('F-01b: parseRateNumber', () => {
  it('acepta número nativo positivo', () => {
    expect(parseRateNumber(720)).toBe(720);
    expect(parseRateNumber(720.5)).toBe(720.5);
  });

  it('rechaza número nativo <= 0 o no finito', () => {
    expect(parseRateNumber(0)).toBeNull();
    expect(parseRateNumber(-5)).toBeNull();
    expect(parseRateNumber(NaN)).toBeNull();
    expect(parseRateNumber(Infinity)).toBeNull();
  });

  it('parsea string entero puro', () => {
    expect(parseRateNumber('720')).toBe(720);
    expect(parseRateNumber(' 650 ')).toBe(650);
  });

  it('parsea formato en-US: "720.50"', () => {
    expect(parseRateNumber('720.50')).toBe(720.5);
  });

  it('parsea formato es-CU: "720,50"', () => {
    expect(parseRateNumber('720,50')).toBe(720.5);
  });

  it('parsea formato es-CU con miles: "1.234,56"', () => {
    expect(parseRateNumber('1.234,56')).toBe(1234.56);
  });

  it('parsea formato en-US con miles: "1,234.56"', () => {
    expect(parseRateNumber('1,234.56')).toBe(1234.56);
  });

  it('descarta sufijos de moneda ("720 CUP", "USD 720,50")', () => {
    expect(parseRateNumber('720 CUP')).toBe(720);
    expect(parseRateNumber('720,50 EUR')).toBe(720.5);
  });

  it('rechaza string vacío o sin dígitos', () => {
    expect(parseRateNumber('')).toBeNull();
    expect(parseRateNumber('   ')).toBeNull();
    expect(parseRateNumber('CUP')).toBeNull();
    expect(parseRateNumber(null)).toBeNull();
    expect(parseRateNumber(undefined)).toBeNull();
  });

  it('rechaza número parseado <= 0', () => {
    expect(parseRateNumber('0')).toBeNull();
    expect(parseRateNumber('-720')).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 2. parseElToqueHtml — estrategias individuales
// ────────────────────────────────────────────────────────────────────────────

describe('F-01b: parseElToqueHtml — estrategias', () => {
  it('estrategia 1 (json-ld): extrae tasas de un bloque application/ld+json', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@context":"https://schema.org","@type":"ExchangeRate",
         "USD":720,"EUR":780,"MLC":720,"datePublished":"2026-07-03"}
        </script>
      </head><body>Tasas de hoy</body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(720);
    expect(r!.eur).toBe(780);
    expect(r!.mlc).toBe(720);
    expect(r!.strategy).toBe('json-ld');
  });

  it('estrategia 2 (js-hydration): extrae de window.__INITIAL_STATE__', () => {
    const html = `
      <html><body>
        <script>window.__INITIAL_STATE__ = {"rates":{"USD":725,"EUR":785,"MLC":725}};</script>
      </body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(725);
    expect(r!.eur).toBe(785);
    expect(r!.mlc).toBe(725);
    expect(r!.strategy).toBe('js-hydration');
  });

  it('estrategia 2 (js-hydration): extrae de var tasas = {...}', () => {
    const html = `
      <html><body><script>
        var tasas = {"USD":730,"EUR":790,"MLC":730};
      </script></body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(730);
    expect(r!.strategy).toBe('js-hydration');
  });

  it('estrategia 3 (data-attributes): extrae de data-usd/data-eur/data-mlc', () => {
    const html = `
      <html><body>
        <div class="tasa-widget" data-usd="735" data-eur="795" data-mlc="735"></div>
      </body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(735);
    expect(r!.eur).toBe(795);
    expect(r!.mlc).toBe(735);
    expect(r!.strategy).toBe('data-attributes');
  });

  it('estrategia 4 (html-table): extrae de tabla <td>USD</td><td>740</td>', () => {
    const html = `
      <html><body><table>
        <tr><td>USD</td><td>740</td></tr>
        <tr><td>EUR</td><td>800</td></tr>
        <tr><td>MLC</td><td>740</td></tr>
      </table></body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(740);
    expect(r!.eur).toBe(800);
    expect(r!.mlc).toBe(740);
    expect(r!.strategy).toBe('html-table');
  });

  it('estrategia 5 (text-regex): fallback con texto visible suelto', () => {
    const html = `
      <html><body>
        <p>Tasa del dólar (USD): 745 CUP</p>
        <p>EUR: 805</p>
        <p>MLC: 745</p>
      </body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(745);
    expect(r!.eur).toBe(805);
    expect(r!.mlc).toBe(745);
    expect(r!.strategy).toBe('text-regex');
  });

  it('prioridad: JSON-LD gana sobre las demás estrategias si está presente', () => {
    const html = `
      <html><head>
        <script type="application/ld+json">{"USD":700,"EUR":760,"MLC":700}</script>
      </head><body>
        <div data-usd="999" data-eur="999" data-mlc="999"></div>
      </body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.strategy).toBe('json-ld');
    expect(r!.usd).toBe(700);
  });

  it('retorna null si el HTML no contiene tasas reconocibles', () => {
    const html = '<html><body><h1>Bienvenido a elToque</h1><p>Noticias de Cuba</p></body></html>';
    expect(parseElToqueHtml(html)).toBeNull();
  });

  it('retorna null si el HTML es muy corto (< 50 chars)', () => {
    expect(parseElToqueHtml('')).toBeNull();
    expect(parseElToqueHtml('short')).toBeNull();
  });

  it('MLC faltante usa USD como fallback (cuando MLC no aparece en el HTML)', () => {
    const html = `
      <html><body><table>
        <tr><td>USD</td><td>750</td></tr>
        <tr><td>EUR</td><td>810</td></tr>
      </table></body></html>
    `;
    const r = parseElToqueHtml(html);
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(750);
    expect(r!.mlc).toBe(750); // MLC = USD
  });

  it('EUR faltante retorna null (necesitamos al menos USD + EUR)', () => {
    const html = `
      <html><body><table>
        <tr><td>USD</td><td>750</td></tr>
      </table></body></html>
    `;
    expect(parseElToqueHtml(html)).toBeNull();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 3. fetchElToqueRatesReal — fetch + Cloudflare detection
// ────────────────────────────────────────────────────────────────────────────

describe('F-01b: fetchElToqueRatesReal', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('retorna tasas cuando el fetch es 200 y el HTML contiene JSON-LD', async () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"@type":"ExchangeRate","USD":760,"EUR":820,"MLC":760}
        </script>
      </head><body>Tasas</body></html>
    `;
    global.fetch = vi.fn().mockResolvedValue(mockResponse(html));

    const r = await fetchElToqueRatesReal();
    expect(r).not.toBeNull();
    expect(r!.usd).toBe(760);
    expect(r!.eur).toBe(820);
    expect(r!.mlc).toBe(760);
    expect(r!.strategy).toBe('json-ld');
    expect(r!.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('retorna null cuando Cloudflare devuelve 403 con cf-mitigated: challenge', async () => {
    global.fetch = vi.fn().mockResolvedValue(cloudflareChallengeResponse());

    const r = await fetchElToqueRatesReal();
    expect(r).toBeNull();
    expect(console.warn).toHaveBeenCalled();
  });

  it('retorna null cuando Cloudflare devuelve 200 pero el body es challenge', async () => {
    // Caso edge: Cloudflare a veces devuelve 200 con HTML del challenge
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse(
        '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',
        {
          status: 200,
          headers: { server: 'cloudflare' },
        },
      ),
    );

    const r = await fetchElToqueRatesReal();
    expect(r).toBeNull();
  });

  it('retorna null cuando fetch lanza AbortError (timeout)', async () => {
    const err = new Error('The operation was aborted due to timeout');
    err.name = 'AbortError';
    global.fetch = vi.fn().mockRejectedValue(err);

    const r = await fetchElToqueRatesReal();
    expect(r).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('fetch falló: The operation was aborted due to timeout'),
    );
  });

  it('retorna null cuando fetch lanza TypeError (DNS / red caída)', async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError('fetch failed'));

    const r = await fetchElToqueRatesReal();
    expect(r).toBeNull();
  });

  it('retorna null cuando la respuesta es 200 pero el HTML no tiene tasas', async () => {
    const html =
      '<html><body><h1>elToque</h1><p>Noticias, no tasas en esta página</p></body></html>';
    global.fetch = vi.fn().mockResolvedValue(mockResponse(html));

    const r = await fetchElToqueRatesReal();
    expect(r).toBeNull();
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('no se pudieron extraer tasas'),
    );
  });

  it('retorna null cuando la respuesta es HTTP 500', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      mockResponse('Internal Server Error', { status: 500 }),
    );

    const r = await fetchElToqueRatesReal();
    expect(r).toBeNull();
  });

  it('usa headers realistas (User-Agent, Accept-Language es-CU)', async () => {
    let capturedInit: RequestInit | undefined;
    global.fetch = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      capturedInit = init;
      return Promise.resolve(
        mockResponse(
          '<html><head><script type="application/ld+json">{"USD":760,"EUR":820,"MLC":760}</script></head></html>',
        ),
      );
    });

    await fetchElToqueRatesReal();
    expect(capturedInit).toBeDefined();
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers['User-Agent']).toMatch(/Chrome/);
    expect(headers['Accept-Language']).toMatch(/es-CU/);
    expect(capturedInit!.signal).toBeDefined(); // timeout aplicado
  });
});

// ────────────────────────────────────────────────────────────────────────────
// 4. Integración: captureForDate respeta capture_method según scraper
// ────────────────────────────────────────────────────────────────────────────

describe('F-01b: captureForDate integra scraper con fallback', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  /**
   * Mock de fetch que discrimina por URL:
   *   - URL contiene "bc.gob.cu" → respuesta BCC (3 segmentos)
   *   - URL contiene "eltoque.com" → respuesta configurable (HTML o error)
   *   - URL contiene supabase → respuesta upsert OK
   */
  function buildFetchMock(opts: {
    eltoqueHtml?: string | null; // null = simular 403 Cloudflare
    eltoqueStatus?: number;
    eltoqueHeaders?: Record<string, string>;
  }) {
    return vi.fn().mockImplementation((url: string | URL) => {
      const urlStr = typeof url === 'string' ? url : url.toString();

      // BCC — simula respuesta con 3 segmentos para USD y EUR.
      // El endpoint /historico filtra por codigoMoneda en la API real del BCC,
      // así que el mock también filtra para que captureForDate no duplique.
      if (urlStr.includes('bc.gob.cu')) {
        const allRates = [
          {
            codigoMoneda: 'USD',
            tasaOficial: 24,
            tasaPublica: 120,
            tasaEspecial: 574,
          },
          {
            codigoMoneda: 'EUR',
            tasaOficial: 26,
            tasaPublica: 130,
            tasaEspecial: 653,
          },
        ];
        let tasas = allRates;
        try {
          const parsed = new URL(urlStr);
          const currency = parsed.searchParams.get('codigoMoneda');
          if (currency) {
            tasas = allRates.filter(r => r.codigoMoneda === currency);
          }
        } catch {
          // URL inválida — devolver todas
        }
        return Promise.resolve(mockResponse(JSON.stringify({ tasas })));
      }

      // eltoque.com — configurable
      if (urlStr.includes('eltoque.com')) {
        if (opts.eltoqueHtml === null || opts.eltoqueStatus === 403) {
          return Promise.resolve(cloudflareChallengeResponse());
        }
        return Promise.resolve(
          mockResponse(opts.eltoqueHtml ?? '', {
            status: opts.eltoqueStatus ?? 200,
            headers: opts.eltoqueHeaders,
          }),
        );
      }

      // Supabase upsert — siempre OK
      return Promise.resolve(mockResponse('{}', { status: 201 }));
    });
  }

  it('scraper falla (Cloudflare) → capture_method=estimated, tasas = BCC×1.15', async () => {
    global.fetch = buildFetchMock({ eltoqueHtml: null });

    const result = await captureForDate(
      '2099-01-01', // fecha futura → usa /activas (no /historico)
      'https://supabase.example.com',
      'fake-service-key',
    );

    // Sin errores
    expect(result.errors).toEqual([]);

    // BCC: 6 capturas (USD×3 segs + EUR×3 segs), todas 'real'
    const bccCaptured = result.captured.filter(c => c.source === 'BCC');
    expect(bccCaptured).toHaveLength(6);
    bccCaptured.forEach(c => {
      expect(c.capture_method).toBe('real');
    });

    // elToque: 3 capturas (USD, EUR, MLC), todas 'estimated'
    const etCaptured = result.captured.filter(c => c.source === 'elToque');
    expect(etCaptured).toHaveLength(3);
    etCaptured.forEach(c => {
      expect(c.capture_method).toBe('estimated');
    });

    // Tasas calculadas = BCC_seg3 × 1.15:
    //   USD = 574 × 1.15 = 660.1 → Math.round(66010)/100 = 660.1
    //   EUR = 653 × 1.15 = 750.95
    //   MLC = USD
    const usdEt = etCaptured.find(c => c.currency === 'USD');
    const eurEt = etCaptured.find(c => c.currency === 'EUR');
    const mlcEt = etCaptured.find(c => c.currency === 'MLC');
    expect(usdEt!.rate).toBeCloseTo(660.1, 2);
    expect(eurEt!.rate).toBeCloseTo(750.95, 2);
    expect(mlcEt!.rate).toBeCloseTo(660.1, 2);

    // Log de advertencia emitido
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('elToque scraping falló'),
    );
  });

  it('scraper exitoso → capture_method=real, tasas = scrapedas', async () => {
    const html = `
      <html><head>
        <script type="application/ld+json">
        {"USD":700,"EUR":760,"MLC":700}
        </script>
      </head><body>Tasas reales de eltoque</body></html>
    `;
    global.fetch = buildFetchMock({ eltoqueHtml: html });

    const result = await captureForDate(
      '2099-01-01',
      'https://supabase.example.com',
      'fake-service-key',
    );

    expect(result.errors).toEqual([]);

    // BCC: 6 capturas 'real'
    const bccCaptured = result.captured.filter(c => c.source === 'BCC');
    expect(bccCaptured).toHaveLength(6);
    bccCaptured.forEach(c => {
      expect(c.capture_method).toBe('real');
    });

    // elToque: 3 capturas 'real' con tasas scrapedas (700, 760, 700)
    const etCaptured = result.captured.filter(c => c.source === 'elToque');
    expect(etCaptured).toHaveLength(3);
    etCaptured.forEach(c => {
      expect(c.capture_method).toBe('real');
    });
    expect(etCaptured.find(c => c.currency === 'USD')!.rate).toBe(700);
    expect(etCaptured.find(c => c.currency === 'EUR')!.rate).toBe(760);
    expect(etCaptured.find(c => c.currency === 'MLC')!.rate).toBe(700);

    // Log de info emitido
    expect(console.info).toHaveBeenCalledWith(
      expect.stringContaining('elToque REAL capturado'),
    );
  });

  it('scraper devuelve 200 pero HTML sin tasas → fallback estimated', async () => {
    global.fetch = buildFetchMock({
      eltoqueHtml: '<html><body><h1>Sitio en mantenimiento</h1></body></html>',
    });

    const result = await captureForDate(
      '2099-01-01',
      'https://supabase.example.com',
      'fake-service-key',
    );

    const etCaptured = result.captured.filter(c => c.source === 'elToque');
    expect(etCaptured).toHaveLength(3);
    etCaptured.forEach(c => {
      expect(c.capture_method).toBe('estimated');
    });
  });
});
