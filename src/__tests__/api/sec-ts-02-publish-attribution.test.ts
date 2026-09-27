import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as POST_WA } from '@/app/api/whatsapp/publish-product/route';
import { POST as POST_TG } from '@/app/api/telegram/publish-product/route';

/**
 * SEC-TS-02 · H5 — POST /api/{whatsapp,telegram}/publish-product
 *
 * Antes: `userId: userId || session.user.id` — el userId del body TOMABA
 * PRECEDENCIA sobre la identidad autenticada y terminaba en la columna
 * published_by de whatsapp_product_posts / telegram_product_posts
 * (auditoría falsificable: cualquier cliente podía atribuir la publicación
 * a otro usuario).
 *
 * Después: el actor SIEMPRE es session.user.id; el campo userId del body se
 * ignora por completo (los helpers solo usan userId para published_by —
 * no afecta autorización, selección de producto ni mensajería; el cron
 * legítimo pasa userId: null por su propia ruta protegida).
 */

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-8222-222222222222';
const REAL_USER = '9a111111-1111-4111-8111-999999999999';
const FORGED_USER = 'dead0000-0000-4000-8000-000000000000';

const mockSession = { value: null as any };

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, mockSession.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// Capturan el ctx completo que llega al helper de publicación
const waPublish = vi.fn();
const tgPublish = vi.fn();
vi.mock('@/lib/whatsapp/publish', () => ({
  publishProductToWhatsApp: (...args: any[]) => waPublish(...args),
}));
vi.mock('@/lib/telegram/publish', () => ({
  publishProductToTelegram: (...args: any[]) => tgPublish(...args),
}));

function makePost(body: unknown): any {
  return {
    method: 'POST',
    url: 'http://localhost:3000/api/whatsapp/publish-product',
    headers: new Map(),
    json: async () => body,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  waPublish.mockResolvedValue({ success: true, product: { id: 'p1', name: 'Prod' }, whatsapp_message_id: 'm1' });
  tgPublish.mockResolvedValue({ success: true, product: { id: 'p1', name: 'Prod' }, telegram_message_id: 'm1' });
});

describe.each([
  ['whatsapp', POST_WA, waPublish],
  ['telegram', POST_TG, tgPublish],
] as Array<[string, any, any]>)('SEC-TS-02 H5 · publish-product (%s) — actor no falsificable', (_name, POST, publishMock) => {
  it('userId forjado del body NO sobrescribe al actor autenticado', async () => {
    mockSession.value = {
      token: 'tok',
      user: {
        id: REAL_USER,
        email: 'real@t.co',
        role: 'manager',
        memberships: [{ store_id: STORE_A, role: 'manager', status: 'active' }],
      },
    };
    // El cliente intenta atribuir la publicación a otro usuario
    const res = await POST(makePost({ storeId: STORE_A, userId: FORGED_USER }));
    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalledTimes(1);
    const ctx = publishMock.mock.calls[0][0];
    expect(ctx.userId).toBe(REAL_USER);
    expect(ctx.userId).not.toBe(FORGED_USER);
  });

  it('sin userId en el body → actor = session.user.id (comportamiento legítimo preservado)', async () => {
    mockSession.value = {
      token: 'tok',
      user: {
        id: REAL_USER,
        email: 'real@t.co',
        role: 'manager',
        memberships: [{ store_id: STORE_A, role: 'manager', status: 'active' }],
      },
    };
    const res = await POST(makePost({ storeId: STORE_A }));
    expect(res.status).toBe(200);
    expect(publishMock.mock.calls[0][0].userId).toBe(REAL_USER);
  });

  it('store del body fuera de membresía → 403 (autorización de tienda intacta)', async () => {
    mockSession.value = {
      token: 'tok',
      user: {
        id: REAL_USER,
        email: 'real@t.co',
        role: 'clerk',
        memberships: [{ store_id: STORE_A, role: 'clerk', status: 'active' }],
      },
    };
    const res = await POST(makePost({ storeId: STORE_B, userId: FORGED_USER }));
    expect(res.status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('admin global publica en cualquier tienda (rol transversal por diseño)', async () => {
    mockSession.value = {
      token: 'tok',
      user: {
        id: REAL_USER,
        email: 'real@t.co',
        role: 'admin',
        memberships: [],
      },
    };
    const res = await POST(makePost({ storeId: STORE_B, userId: FORGED_USER }));
    expect(res.status).toBe(200);
    expect(publishMock.mock.calls[0][0].userId).toBe(REAL_USER);
  });

  it('storeId ausente → 400 sin publicar', async () => {
    mockSession.value = {
      token: 'tok',
      user: { id: REAL_USER, email: 'real@t.co', role: 'admin', memberships: [] },
    };
    const res = await POST(makePost({ userId: FORGED_USER }));
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });
});
