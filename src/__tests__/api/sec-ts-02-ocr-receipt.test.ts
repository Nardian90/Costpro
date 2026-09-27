import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/inventory/ocr-receipt/route';

/**
 * SEC-TS-02 · H1 — POST /api/inventory/ocr-receipt
 *
 * Antes: endpoint de mutación SIN autenticación (solo withTracing) con
 * validación startsWith('data:image/') — cualquier anónimo consumía el VLM
 * de pago sin límite de tamaño ni rate-limit.
 *
 * Después (cadena verificada con el withAuth REAL, sin mock del middleware):
 *   request → sesión (401 anónimo) → rate-limit 5/min (429) →
 *   Zod ocrReceiptSchema (400 inválido / 413 oversized) → VLM.
 *
 * El endpoint es stateless (no toca DB ni recursos de tienda) — la sesión
 * es la única autorización necesaria; el VLM se mockea para no consumir el
 * servicio de pago desde la suite.
 */

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const USER_X = '9a111111-1111-4111-8111-999999999999';

const sessionState = { value: null as any };

vi.mock('@/lib/auth', () => ({
  getServerSession: async () => sessionState.value,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));
vi.mock('@/lib/usage-tracker', () => ({
  usage: { apiRequest: vi.fn() },
  maybeFlush: vi.fn(),
}));
vi.mock('@vercel/functions', () => ({ waitUntil: vi.fn() }));
vi.mock('@/lib/rls-middleware', () => ({ activateTenantRLS: vi.fn() }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// VLM mock — el test no debe consumir el servicio de pago real.
const vlmProbe = { calls: 0, lastImage: null as string | null };
vi.mock('z-ai-web-dev-sdk', () => ({
  default: {
    create: async () => ({
      chat: {
        completions: {
          createVision: async ({ messages }: any) => {
            vlmProbe.calls += 1;
            vlmProbe.lastImage = messages[0]?.content?.find?.((c: any) => c.type === 'image_url')?.image_url?.url ?? null;
            return {
              choices: [
                {
                  message: {
                    content:
                      '{"items":[{"name":"Arroz 5kg","sku":null,"quantity":50,"unit_cost":12.5,"unit_of_measure":"unidad","sale_price":null}],"supplier":"PROV","invoice_number":"F-1","total_detected":625,"confidence":"high"}',
                  },
                },
              ],
            };
          },
        },
      },
    }),
  },
}));

// RBAC enrichment del withAuth REAL: profiles + memberships del usuario.
const enrichment = {
  profile: { role: 'clerk', roles: ['clerk'] } as any,
  memberships: [{ user_id: USER_X, store_id: STORE_A, role: 'clerk', status: 'active' }] as any[],
};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: async () => {
          if (table === 'profiles') return { data: enrichment.profile, error: null };
          return { data: null, error: { message: 'unexpected table ' + table } };
        },
      };
      chain.then = (res?: any, rej?: any) =>
        Promise.resolve({ data: table === 'user_store_memberships' ? enrichment.memberships : [], error: null }).then(res, rej);
      return chain;
    },
  }),
}));

const VALID_IMAGE = 'data:image/jpeg;base64,' + 'QUJD'.repeat(10);

function makeRequest(body: unknown, headers: Record<string, string> = {}): any {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/inventory/ocr-receipt',
    headers: new Map(Object.entries(headers)),
    json: async () => body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionState.value = null;
  vlmProbe.calls = 0;
  vlmProbe.lastImage = null;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
});

describe('SEC-TS-02 H1 · POST /api/inventory/ocr-receipt', () => {
  it('anonymous → 401 (fail-closed): el VLM ya no es consumible sin sesión', async () => {
    sessionState.value = null;
    const res = await POST(makeRequest({ image: VALID_IMAGE }));
    expect(res.status).toBe(401);
    expect(vlmProbe.calls).toBe(0);
  });

  it('authenticated → 200 y el VLM recibe la imagen validada', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const res = await POST(makeRequest({ image: VALID_IMAGE }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(vlmProbe.calls).toBe(1);
    expect(vlmProbe.lastImage).toBe(VALID_IMAGE);
  });

  it('payload inválido (no es data-URI de imagen) → 400 sin llamar al VLM', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const res = await POST(makeRequest({ image: 'https://evil.example/x.png' }));
    expect(res.status).toBe(400);
    expect(vlmProbe.calls).toBe(0);
  });

  it('payload inválido (MIME no-imagen en data-URI) → 400', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const res = await POST(makeRequest({ image: 'data:text/html;base64,PHNjcmlwdD4=' }));
    expect(res.status).toBe(400);
    expect(vlmProbe.calls).toBe(0);
  });

  it('payload oversized (data-URI > 14 MiB) → 413 sin llamar al VLM', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const oversized = 'data:image/jpeg;base64,' + 'A'.repeat(14 * 1024 * 1024 + 1);
    const res = await POST(makeRequest({ image: oversized }));
    expect(res.status).toBe(413);
    expect(vlmProbe.calls).toBe(0);
  });

  it('JSON body inválido → 400', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const req = {
      method: 'POST',
      url: 'http://localhost:3000/api/inventory/ocr-receipt',
      headers: new Map(),
      json: async () => {
        throw new Error('bad json');
      },
    };
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('rate-limit superado (6ª request en el minuto) → 429 sin consumir VLM', async () => {
    sessionState.value = { user: { id: USER_X, email: 'x@t.co' }, token: 'tok' };
    const { rateLimit } = await import('@/lib/rate-limit');
    // el limiter rechaza la request en curso (usuario sobre el umbral 5/min)
    (rateLimit as any).mockResolvedValueOnce({ allowed: false });
    const res = await POST(makeRequest({ image: VALID_IMAGE }));
    expect(res.status).toBe(429);
    expect(vlmProbe.calls).toBe(0);
    // el identificador del rate-limit es el usuario autenticado
    expect(rateLimit).toHaveBeenCalledWith(`ocr:${USER_X}`, expect.anything());
  });
});
