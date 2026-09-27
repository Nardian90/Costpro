import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as webhookPOST } from '@/app/api/telegram/webhook/route';

/**
 * SEC-TS-03 · H6 — POST /api/telegram/webhook?bot_id={id}
 *
 * Antes: fail-open CONDICIONAL — si el bot no tenía `webhook_secret`
 * configurado en telegram_configs (des-registrado vía setup 'remove' o
 * legacy), el update se ACEPTABA sin autenticar con solo un warning.
 * Cualquiera podía inyectar updates falsos y disparar sendMessage a
 * chats arbitrarios, addChatMember forzado a grupos privados y mutación
 * de telegram_invitations/telegram_configs.
 *
 * Después (fail-closed incondicional, patrón de billing/webhook con
 * STRIPE_WEBHOOK_SECRET y de cron-auth SEC-TS-02):
 *   - bot SIN webhook_secret        → 403 (H6 core)
 *   - bot sin secret + header cero  → 403 (el header no sustituye al
 *                                      secret almacenado)
 *   - secret configurado + header ausente/incorrecto → 403
 *   - secret correcto               → 200 y el update se procesa
 *
 * Se usa el validateWebhookSecret REAL (comparación timing-safe) y el
 * isTelegramIp/getRealClientIp REALES — solo se mockean el lookup de
 * config (findConfigByBotUserId), el dispatch (handleTelegramUpdate),
 * @vercel/functions y el logger.
 */

const BOT_USER_ID = 123456789;
const STORE_A = '00000000-0000-0000-0000-000000000001';
const WEBHOOK_SECRET = 'sec-ts-03-webhook-secret-abcdef';

const { mockFindConfigByBotUserId, mockHandleTelegramUpdate } = vi.hoisted(() => ({
  mockFindConfigByBotUserId: vi.fn(),
  mockHandleTelegramUpdate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/telegram/webhook-handler', () => ({
  findConfigByBotUserId: mockFindConfigByBotUserId,
  handleTelegramUpdate: mockHandleTelegramUpdate,
}));

vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

// waitUntil determinista: fire-and-forget inmediato (igual que el fallback
// Docker del route) — el IIFE ya arrancó sincrónicamente al crearse.
vi.mock('@vercel/functions', () => ({
  waitUntil: (p: Promise<unknown>) => {
    p.catch(() => {});
  },
}));

// Importar DESPUÉS de los mocks
import { validateWebhookSecret } from '@/lib/telegram/security';

function baseConfig(overrides: Record<string, unknown> = {}) {
  return {
    store_id: STORE_A,
    bot_user_id: BOT_USER_ID,
    bot_token: '123456789:fake-token',
    bot_username: 'testbot',
    webhook_secret: WEBHOOK_SECRET,
    webhook_url: `https://example.com/api/telegram/webhook?bot_id=${BOT_USER_ID}`,
    is_active: true,
    group_chat_id: -1001234,
    ...overrides,
  } as any;
}

function makeWebhookRequest(
  opts: {
    secretHeader?: string | null;
    body?: Record<string, unknown>;
  } = {}
) {
  const headers = new Headers();
  headers.set('x-forwarded-for', '149.154.167.99'); // IP oficial de Telegram
  if (opts.secretHeader != null) {
    headers.set('x-telegram-bot-api-secret-token', opts.secretHeader);
  }
  return {
    method: 'POST',
    url: `http://localhost:3000/api/telegram/webhook?bot_id=${BOT_USER_ID}`,
    headers,
    json: async () => opts.body || { update_id: 1, message: { text: '/help' } },
  } as any;
}

async function flushAsync() {
  // yield de event-loop para dejar correr el dispatch async del webhook
  await new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindConfigByBotUserId.mockReset();
  mockHandleTelegramUpdate.mockReset();
  mockHandleTelegramUpdate.mockResolvedValue(undefined);
});

describe('SEC-TS-03 · H6 — fail-closed incondicional del webhook', () => {
  it('H6 core: bot SIN webhook_secret (des-registrado/legacy) → 403, update NUNCA procesado', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig({ webhook_secret: null }));

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: null }));
    await flushAsync();

    expect(res.status).toBe(403);
    expect(mockHandleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('bot sin secret + header cualquiera → 403 (el header del cliente NO sustituye al secret almacenado)', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig({ webhook_secret: null }));

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: 'attacker-guess' }));
    await flushAsync();

    expect(res.status).toBe(403);
    expect(mockHandleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('secret configurado + header ausente → 403 (validateWebhookSecret REAL: null header = false)', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig());

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: null }));
    await flushAsync();

    expect(res.status).toBe(403);
    expect(mockHandleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('secret configurado + header incorrecto (misma longitud) → 403', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig());
    // misma longitud que WEBHOOK_SECRET — ejercita la comparación byte a byte
    const wrong = WEBHOOK_SECRET.slice(0, -1) + 'X';

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: wrong }));
    await flushAsync();

    expect(res.status).toBe(403);
    expect(mockHandleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('secret correcto → 200, update procesado una vez con la config resuelta (flujo legítimo intacto)', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig());

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: WEBHOOK_SECRET }));
    await flushAsync();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(mockHandleTelegramUpdate).toHaveBeenCalledTimes(1);
    // el dispatch recibe (update, config) — config resuelta por bot_id
    const [updateArg, configArg] = mockHandleTelegramUpdate.mock.calls[0];
    expect(updateArg.update_id).toBe(1);
    expect(configArg.store_id).toBe(STORE_A);
  });

  it('la respuesta de rechazo NUNCA revela material del secret', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig());

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: 'totally-wrong' }));
    const json = await res.json();

    expect(res.status).toBe(403);
    // el VALOR del secret jamás aparece en la respuesta
    expect(JSON.stringify(json)).not.toContain(WEBHOOK_SECRET);
    expect(json.error).toBeDefined();
  });

  it('bot sin secret: respuesta 403 con mensaje que no distingue material del secret', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig({ webhook_secret: null }));

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: null }));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Webhook no configurado');
    expect(JSON.stringify(json)).not.toContain(WEBHOOK_SECRET);
  });

  it('validateWebhookSecret REAL es timing-safe en forma (longitudes distintas → false inmediato)', () => {
    // sanity del helper real usado por la ruta (sin mocks)
    expect(validateWebhookSecret(null, WEBHOOK_SECRET)).toBe(false);
    expect(validateWebhookSecret('short', WEBHOOK_SECRET)).toBe(false);
    expect(validateWebhookSecret(WEBHOOK_SECRET, WEBHOOK_SECRET)).toBe(true);
    expect(validateWebhookSecret(WEBHOOK_SECRET + 'x', WEBHOOK_SECRET)).toBe(false);
  });

  it('payload inválido (sin update_id) con secret correcto → 400 (el fail-closed no relaja la validación)', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(baseConfig());

    const res = await webhookPOST(
      makeWebhookRequest({
        secretHeader: WEBHOOK_SECRET,
        body: { not_an_update: true },
      })
    );

    expect(res.status).toBe(400);
    expect(mockHandleTelegramUpdate).not.toHaveBeenCalled();
  });

  it('bot inexistente → 404 (comportamiento previo intacto, no revela secret)', async () => {
    mockFindConfigByBotUserId.mockResolvedValue(null);

    const res = await webhookPOST(makeWebhookRequest({ secretHeader: WEBHOOK_SECRET }));

    expect(res.status).toBe(404);
  });
});
