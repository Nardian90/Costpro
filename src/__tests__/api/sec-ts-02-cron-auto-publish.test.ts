import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET as GET_WA } from '@/app/api/cron/whatsapp-auto-publish/route';
import { GET as GET_TG } from '@/app/api/cron/telegram-auto-publish/route';
import { verifyCronAuthorization } from '@/lib/cron-auth';

/**
 * SEC-TS-02 · H3/H4 — GET /api/cron/{whatsapp,telegram}-auto-publish
 *
 * Antes: GET SIN ninguna autenticación → cualquier anónimo disparaba la
 * publicación con service-role para TODAS las tiendas y la respuesta filtraba
 * storeId, producto, messageId y errores por tienda.
 *
 * Después (fail-closed, patrón FIX C5+C6 de cron/usage-sync y
 * cron/exchange-rates):
 *   - sin secret ni firma  → 401
 *   - secret incorrecto   → 401
 *   - CRON_SECRET ausente en el server + sin firma JWT → 401 (NUNCA allow)
 *   - Bearer CRON_SECRET correcto → 200 con respuesta AGREGADA (sin results[])
 *   - JWT x-vercel-signature válido (con VERCEL_PROJECT_ID) → 200
 *   - JWT con VERCEL_PROJECT_ID ausente → 401 (fail-closed)
 *
 * La verificación usa el cron-auth REAL (solo se mockea jose para simular el
 * JWKS de Vercel) y las rutas REALES con el cliente service-role y los
 * helpers de publish mockeados.
 */

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';

// jose mock: controlamos si el "JWT de Vercel" verifica o no.
const jwtVerifyMock = vi.fn();
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: (...args: any[]) => jwtVerifyMock(...args),
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Helpers de publish mockeados — capturan el actor.
const waPublish = vi.fn();
const tgPublish = vi.fn();
vi.mock('@/lib/whatsapp/publish', () => ({
  publishProductToWhatsApp: (...args: any[]) => waPublish(...args),
}));
vi.mock('@/lib/telegram/publish', () => ({
  publishProductToTelegram: (...args: any[]) => tgPublish(...args),
}));

// Cliente service-role mockeado (createClient inline de las rutas cron).
const db = {
  waConfigs: [] as any[],
  tgConfigs: [] as any[],
};
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        not: () => chain,
        update: () => chain,
      };
      chain.then = (res?: any, rej?: any) =>
        Promise.resolve({ data: table === 'whatsapp_configs' ? db.waConfigs : db.tgConfigs, error: null }).then(res, rej);
      return chain;
    },
  }),
}));

function makeGetReq(headers: Record<string, string> = {}): any {
  return {
    method: 'GET',
    url: 'http://localhost:3000/api/cron/whatsapp-auto-publish',
    headers: new Map(Object.entries(headers)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  jwtVerifyMock.mockReset();
  delete process.env.CRON_SECRET;
  delete process.env.VERCEL_PROJECT_ID;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  db.waConfigs = [
    { store_id: STORE_A, auto_publish_interval_minutes: 360, last_publish_at: null, phone_number: '+53000000001' },
    { store_id: STORE_B, auto_publish_interval_minutes: 360, last_publish_at: null, phone_number: '+53000000002' },
  ];
  db.tgConfigs = [
    { store_id: STORE_A, auto_publish_interval_minutes: 360, last_publish_at: null, bot_token: 't1', group_chat_id: 'g1' },
    { store_id: STORE_B, auto_publish_interval_minutes: 360, last_publish_at: null, bot_token: 't2', group_chat_id: 'g2' },
  ];
  waPublish.mockResolvedValue({ skipped: true, reason: 'no_session' });
  tgPublish.mockResolvedValue({ skipped: true, reason: 'not_configured' });
});

describe('SEC-TS-02 · verifyCronAuthorization (helper puro, jose mockeado)', () => {
  it('sin headers y sin CRON_SECRET en server → NO autorizado (fail-closed: nunca allow por omisión)', async () => {
    const result = await verifyCronAuthorization(makeGetReq());
    expect(result.authorized).toBe(false);
  });

  it('CRON_SECRET configurado + Bearer correcto → autorizado vía cron-secret', async () => {
    process.env.CRON_SECRET = 'sekret';
    const result = await verifyCronAuthorization(makeGetReq({ authorization: 'Bearer sekret' }));
    expect(result).toEqual({ authorized: true, method: 'cron-secret' });
  });

  it('CRON_SECRET configurado + Bearer incorrecto → NO autorizado', async () => {
    process.env.CRON_SECRET = 'sekret';
    const result = await verifyCronAuthorization(makeGetReq({ authorization: 'Bearer wrong' }));
    expect(result.authorized).toBe(false);
  });

  it('JWT válido con VERCEL_PROJECT_ID → autorizado vía vercel-jwt', async () => {
    process.env.VERCEL_PROJECT_ID = 'proj_1';
    jwtVerifyMock.mockResolvedValueOnce({ payload: {} });
    const result = await verifyCronAuthorization(makeGetReq({ 'x-vercel-signature': 'sig.ok' }));
    expect(result).toEqual({ authorized: true, method: 'vercel-jwt' });
  });

  it('JWT inválido (verificación falla) → NO autorizado', async () => {
    process.env.VERCEL_PROJECT_ID = 'proj_1';
    jwtVerifyMock.mockRejectedValueOnce(new Error('bad signature'));
    const result = await verifyCronAuthorization(makeGetReq({ 'x-vercel-signature': 'sig.bad' }));
    expect(result.authorized).toBe(false);
  });

  it('JWT presente pero VERCEL_PROJECT_ID ausente → NO autorizado (fail-closed)', async () => {
    const result = await verifyCronAuthorization(makeGetReq({ 'x-vercel-signature': 'sig' }));
    expect(result.authorized).toBe(false);
    expect(jwtVerifyMock).not.toHaveBeenCalled();
  });

  it('timing-safe conceptual: secret ausente en server NO equipara Bearer undefined a autorización', async () => {
    // Bearer literal "null"/vacío nunca debe pasar aunque CRON_SECRET no exista
    const result = await verifyCronAuthorization(makeGetReq({ authorization: 'Bearer null' }));
    expect(result.authorized).toBe(false);
  });
});

describe.each([
  ['H3 whatsapp-auto-publish', GET_WA, waPublish, () => db.waConfigs],
  ['H4 telegram-auto-publish', GET_TG, tgPublish, () => db.tgConfigs],
] as Array<[string, any, any, () => any[]]>)('SEC-TS-02 · GET /api/cron/%s', (_name, GET, publishMock, getConfigs) => {
  it('anonymous sin secret → 401 y publish NUNCA se invoca (fail-closed)', async () => {
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('secret incorrecto → 401 y publish NUNCA se invoca', async () => {
    process.env.CRON_SECRET = 'sekret';
    const res = await GET(makeGetReq({ authorization: 'Bearer wrong-secret' }));
    expect(res.status).toBe(401);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('CRON_SECRET ausente en el server + sin JWT → 401 (el patrón if(!CRON_SECRET) allow está PROHIBIDO)', async () => {
    const res = await GET(makeGetReq());
    expect(res.status).toBe(401);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('secret correcto → 200, publish invocado por tienda y respuesta AGREGADA sin datos de tienda', async () => {
    process.env.CRON_SECRET = 'sekret';
    const res = await GET(makeGetReq({ authorization: 'Bearer sekret' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    // contrato agregado
    expect(json.success).toBe(true);
    expect(json.auth_method).toBe('cron-secret');
    expect(json.processed).toBe(getConfigs().length);
    expect(json.published).toBe(0);
    expect(json.skipped).toBe(getConfigs().length);
    expect(json.duration_ms).toBeGreaterThanOrEqual(0);
    // info-leak cerrado: sin results[] ni identificadores de tienda
    const body = JSON.stringify(json);
    expect(body).not.toContain('results');
    expect(body).not.toContain(STORE_A);
    expect(body).not.toContain(STORE_B);
    // la mensajería por tienda sí se disparó con el secret correcto
    expect(publishMock).toHaveBeenCalledTimes(getConfigs().length);
  });

  it('JWT de Vercel válido (VERCEL_PROJECT_ID) → 200 vía vercel-jwt', async () => {
    process.env.VERCEL_PROJECT_ID = 'proj_1';
    jwtVerifyMock.mockResolvedValueOnce({ payload: {} });
    const res = await GET(makeGetReq({ 'x-vercel-signature': 'sig.ok' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.auth_method).toBe('vercel-jwt');
  });

  it('JWT inválido → 401 (no cae al modo anónimo)', async () => {
    process.env.VERCEL_PROJECT_ID = 'proj_1';
    jwtVerifyMock.mockRejectedValueOnce(new Error('bad signature'));
    const res = await GET(makeGetReq({ 'x-vercel-signature': 'sig.bad' }));
    expect(res.status).toBe(401);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe('SEC-TS-02 · H3/H4 — actor del cron', () => {
  it('el cron publica con userId: null (automático, sin actor humano falsificable)', async () => {
    process.env.CRON_SECRET = 'sekret';
    await GET_WA(makeGetReq({ authorization: 'Bearer sekret' }));
    expect(waPublish).toHaveBeenCalled();
    const firstCall = waPublish.mock.calls[0][0];
    expect(firstCall.userId).toBeNull();
    expect(firstCall.publishType).toBe('automatic');
  });
});

// ── SEC-TS-02 · P2 — duration_ms determinista ─────────────────────────────
// P2 (detectado en la revisión del PR #1327): whatsapp-auto-publish
// calculaba `durationMs = Date.now()` (timestamp Unix absoluto) en el camino
// exitoso, en lugar de la duración transcurrida. Este test fija el reloj
// (vi.setSystemTime + toFake: ['Date']) y lo avanza DENTRO del mock de
// publish, exigiendo un elapsed EXACTO: el bug habría devuelto 1_000_123
// (y un timestamp real ~1.7e12), no 123.
describe.each([
  ['whatsapp-auto-publish (P2 corregido)', GET_WA, waPublish],
  ['telegram-auto-publish (guardia simétrica)', GET_TG, tgPublish],
] as Array<[string, any, any]>)(
  'SEC-TS-02 · P2 — GET /api/cron/%s: duration_ms es duración transcurrida, no timestamp Unix',
  (_name, GET, publishMock) => {
    afterEach(() => {
      // Restaurar reloj real — no filtrar fake Date a otras suites.
      vi.useRealTimers();
    });

    it('start=1_000_000, end=1_000_123 → duration_ms === 123 (elapsed, no epoch)', async () => {
      process.env.CRON_SECRET = 'sekret';
      // Solo se falsifica Date: promesas/microtasks siguen siendo reales,
      // el flujo async de la ruta no se altera.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(1_000_000);

      // El "trabajo" de publicación consume 123 ms de reloj simulado.
      publishMock.mockImplementation(async () => {
        vi.setSystemTime(1_000_123);
        return { skipped: true, reason: 'deterministic_clock' };
      });

      const res = await GET(makeGetReq({ authorization: 'Bearer sekret' }));
      expect(res.status).toBe(200);
      const json = await res.json();

      // Elapsed EXACTO. Con el bug P2 esto devolvía 1_000_123 (Date.now()
      // absoluto); un timestamp Unix real sería ~1.7e12.
      expect(json.duration_ms).toBe(123);
      expect(json.duration_ms).toBeGreaterThanOrEqual(0);
      // Jamás un epoch: una duración de tick no puede ser del orden de
      // 1970+milliseconds-since.
      expect(json.duration_ms).toBeLessThan(60_000);
    });
  },
);
