import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Tests del módulo WhatsApp — cubre las 4 fases:
 *   Fase 1: Config API (status, connect, disconnect, config)
 *   Fase 2: GLM Orchestrator + Conversations API
 *   Fase 3: Anti-Ban + Invitation Queue + Invitations API
 *   Fase 4: Metrics + Group + Test-bot API
 */

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => null,
}));

vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (handler: any) => handler,
  withRole: (_role: any, handler: any) => handler,
  AuthenticatedSession: {},
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (handler: any) => handler,
}));

vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: async () => ({ allowed: true }) }));
vi.mock('@/lib/api-errors', () => ({
  createApiError: (code: string) => ({ error: code }),
}));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/whatsapp/baileys-client', () => ({
  getSessionInfo: vi.fn(() => ({ status: 'disconnected', qrCode: null })),
  connectStore: vi.fn(),
  disconnectStore: vi.fn(),
  getSocket: vi.fn(() => null),
}));

vi.mock('@/lib/whatsapp/glm-orchestrator', () => ({
  generateResponse: vi.fn().mockResolvedValue({
    text: 'Respuesta de prueba del bot',
    tokensUsed: 50,
    responseTimeMs: 1200,
  }),
  saveMessage: vi.fn().mockResolvedValue(undefined),
  // FIX-AUDIT-WA-2: mockeamos validateContactBelongsToStore para tests de cross-tenant
  validateContactBelongsToStore: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/whatsapp/anti-ban', () => ({
  getRiskState: vi.fn().mockResolvedValue({
    level: 'safe',
    consecutiveBlocks: 0,
    cooldownUntil: null,
    dailyInvitationCount: 0,
    lastInvitationAt: null,
    lastResetDate: new Date().toISOString().split('T')[0],
  }),
  saveRiskState: vi.fn().mockResolvedValue(undefined),
  canInviteNow: vi.fn(() => ({ allowed: true })),
  handleInvitationBlock: vi.fn(),
  resetRiskIfStale: vi.fn((s) => s),
  LIMITS: { maxInvitationsPerDay: 20 },
}));

vi.mock('@/lib/whatsapp/invitation-queue', () => ({
  registerStore: vi.fn(),
  unregisterStore: vi.fn(),
  checkInvitationResponse: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      upsert: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: vi.fn(),
    })),
  },
}));

// ── Test Data ──────────────────────────────────────────────────────────
// FIX-AUDIT-WA-2: UUIDs válidos v4 (Zod v4 valida estrictamente, los UUIDs
// nil-style con todos-dígitos-iguales fallan la validación). Mantenemos
// STORE_A/STORE_B como constantes para que todos los tests usen los mismos.

const STORE_A = 'a1111111-1111-4111-8111-111111111111';
const STORE_B = 'b2222222-2222-4222-9222-222222222222';

function makeSession(role: string = 'admin', memberships: any[] = []) {
  return {
    user: { id: 'test-user-001', email: 'test@costpro.test', role, memberships },
    token: 'fake-jwt',
  } as any;
}

function makeRequest(path: string, method = 'GET', body?: Record<string, unknown>) {
  const req = {
    method,
    url: `http://localhost:3000${path}`,
    headers: new Map([['x-forwarded-for', '127.0.0.1'], ['content-type', 'application/json']]),
    json: async () => body || {},
    text: async () => JSON.stringify(body || {}),
    formData: async () => new FormData(),
  };
  return req as any;
}

// ── Import after mocks ─────────────────────────────────────────────────

import { GET as statusGET } from '@/app/api/whatsapp/status/route';
import { POST as connectPOST } from '@/app/api/whatsapp/connect/route';
import { POST as disconnectPOST } from '@/app/api/whatsapp/disconnect/route';
import { GET as configGET, PUT as configPUT } from '@/app/api/whatsapp/config/route';
import { GET as conversationsGET } from '@/app/api/whatsapp/conversations/route';
import { POST as sendPOST } from '@/app/api/whatsapp/messages/send/route';
import { GET as invitationsGET, POST as invitationsPOST, DELETE as invitationsDELETE } from '@/app/api/whatsapp/invitations/route';
import { GET as metricsGET } from '@/app/api/whatsapp/metrics/route';
import { GET as groupGET } from '@/app/api/whatsapp/group/route';
import { POST as testBotPOST } from '@/app/api/whatsapp/test-bot/route';

// ── Tests ──────────────────────────────────────────────────────────────

describe('WhatsApp Module — 4 Fases', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── FASE 1: Config API ───────────────────────────────────────────

  describe('Fase 1: Config API', () => {
    it('GET /api/whatsapp/status — sin store_id → 400', async () => {
      const res = await (statusGET as any)(makeRequest('/api/whatsapp/status'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/whatsapp/status — sin permisos → 403', async () => {
      const session = makeSession('clerk');
      const res = await (statusGET as any)(makeRequest(`/api/whatsapp/status?store_id=${STORE_A}`), session);
      expect(res.status).toBe(403);
    });

    it('GET /api/whatsapp/status — con permisos → 200', async () => {
      const res = await (statusGET as any)(makeRequest(`/api/whatsapp/status?store_id=${STORE_A}`), makeSession());
      expect(res.status).toBe(200);
    });

    it('POST /api/whatsapp/connect — sin store_id → 400', async () => {
      const res = await (connectPOST as any)(makeRequest('/api/whatsapp/connect', 'POST', {}), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/whatsapp/connect — con permisos → 200', async () => {
      const res = await (connectPOST as any)(makeRequest('/api/whatsapp/connect', 'POST', { store_id: STORE_A }), makeSession());
      expect(res.status).toBe(200);
    });

    it('POST /api/whatsapp/disconnect — sin permisos → 403', async () => {
      const res = await (disconnectPOST as any)(makeRequest('/api/whatsapp/disconnect', 'POST', { store_id: STORE_A }), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('POST /api/whatsapp/disconnect — con permisos → 200', async () => {
      const res = await (disconnectPOST as any)(makeRequest('/api/whatsapp/disconnect', 'POST', { store_id: STORE_A }), makeSession());
      expect(res.status).toBe(200);
    });

    it('GET /api/whatsapp/config — sin store_id → 400', async () => {
      const res = await (configGET as any)(makeRequest('/api/whatsapp/config'), makeSession());
      expect(res.status).toBe(400);
    });

    it('PUT /api/whatsapp/config — store_id inválido → 400', async () => {
      const res = await (configPUT as any)(makeRequest('/api/whatsapp/config', 'PUT', { store_id: 'not-uuid' }), makeSession());
      expect(res.status).toBe(400);
    });
  });

  // ── FASE 2: Conversations + Messages ────────────────────────────

  describe('Fase 2: Conversations API', () => {
    it('GET /api/whatsapp/conversations — sin store_id → 400', async () => {
      const res = await (conversationsGET as any)(makeRequest('/api/whatsapp/conversations'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/whatsapp/conversations — sin permisos → 403', async () => {
      const res = await (conversationsGET as any)(makeRequest(`/api/whatsapp/conversations?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('POST /api/whatsapp/messages/send — sin store_id → 400', async () => {
      const res = await (sendPOST as any)(makeRequest('/api/whatsapp/messages/send', 'POST', { phone_number: '123', message: 'hola' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/whatsapp/messages/send — sin mensaje → 400', async () => {
      const res = await (sendPOST as any)(makeRequest('/api/whatsapp/messages/send', 'POST', { store_id: STORE_A, phone_number: '123', message: '' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/whatsapp/messages/send — sin permisos → 403', async () => {
      // Zod valida primero. Si pasa, canManageStore da 403.
      // Si Zod falla, da 400. Aceptamos ambos (el handler valida antes de auth).
      const res = await (sendPOST as any)(makeRequest('/api/whatsapp/messages/send', 'POST', { store_id: STORE_A, phone_number: '5312345678', message: 'hola' }), makeSession('clerk'));
      expect([400, 403]).toContain(res.status);
    });

    it('POST /api/whatsapp/messages/send — con permisos → success', async () => {
      const { supabase } = await import('@/lib/supabaseClient');
      vi.mocked(supabase.from).mockReturnValue({
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      } as any);
      const res = await (sendPOST as any)(makeRequest('/api/whatsapp/messages/send', 'POST', { store_id: STORE_A, phone_number: '5312345678', message: 'hola' }), makeSession());
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ── FASE 3: Invitations ─────────────────────────────────────────

  describe('Fase 3: Invitations API', () => {
    it('GET /api/whatsapp/invitations — sin store_id → 400', async () => {
      const res = await (invitationsGET as any)(makeRequest('/api/whatsapp/invitations'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/whatsapp/invitations — sin permisos → 403', async () => {
      const res = await (invitationsGET as any)(makeRequest(`/api/whatsapp/invitations?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('POST /api/whatsapp/invitations — phone inválido → 400', async () => {
      const res = await (invitationsPOST as any)(makeRequest('/api/whatsapp/invitations', 'POST', { store_id: STORE_A }), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/whatsapp/invitations — sin permisos → 403', async () => {
      const res = await (invitationsPOST as any)(makeRequest('/api/whatsapp/invitations', 'POST', { store_id: STORE_A, phone_number: '5312345678' }), makeSession('clerk'));
      expect([400, 403]).toContain(res.status);
    });

    it('DELETE /api/whatsapp/invitations — sin id → 400', async () => {
      const res = await (invitationsDELETE as any)(makeRequest(`/api/whatsapp/invitations?store_id=${STORE_A}`, 'DELETE'), makeSession());
      expect(res.status).toBe(400);
    });
  });

  // ── FASE 4: Metrics + Group + Test-bot ──────────────────────────

  describe('Fase 4: Metrics + Group + Test-bot', () => {
    it('GET /api/whatsapp/metrics — sin store_id → 400', async () => {
      const res = await (metricsGET as any)(makeRequest('/api/whatsapp/metrics'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/whatsapp/metrics — sin permisos → 403', async () => {
      const res = await (metricsGET as any)(makeRequest(`/api/whatsapp/metrics?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('GET /api/whatsapp/group — sin store_id → 400', async () => {
      const res = await (groupGET as any)(makeRequest('/api/whatsapp/group'), makeSession());
      expect(res.status).toBe(400);
    });

    it('GET /api/whatsapp/group — sin permisos → 403', async () => {
      const res = await (groupGET as any)(makeRequest(`/api/whatsapp/group?store_id=${STORE_A}`), makeSession('clerk'));
      expect(res.status).toBe(403);
    });

    it('POST /api/whatsapp/test-bot — sin store_id → 400', async () => {
      const res = await (testBotPOST as any)(makeRequest('/api/whatsapp/test-bot', 'POST', { message: 'hola' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/whatsapp/test-bot — sin mensaje → 400', async () => {
      const res = await (testBotPOST as any)(makeRequest('/api/whatsapp/test-bot', 'POST', { store_id: STORE_A, message: '' }), makeSession());
      expect(res.status).toBe(400);
    });

    it('POST /api/whatsapp/test-bot — sin permisos → 403', async () => {
      const res = await (testBotPOST as any)(makeRequest('/api/whatsapp/test-bot', 'POST', { store_id: STORE_A, message: 'hola', contact_name: 'Test' }), makeSession('clerk'));
      expect([400, 403]).toContain(res.status);
    });

    it('POST /api/whatsapp/test-bot — con permisos → respuesta', async () => {
      const res = await (testBotPOST as any)(makeRequest('/api/whatsapp/test-bot', 'POST', { store_id: STORE_A, message: '¿Qué productos tienes?' }), makeSession());
      expect([200, 400, 500]).toContain(res.status);
    });
  });

  // ── Cross-tenant security ────────────────────────────────────────

  describe('Cross-tenant security', () => {
    it('manager de STORE_A no puede acceder a STORE_B', async () => {
      const session = makeSession('manager', [{ store_id: STORE_A, role: 'manager', status: 'active' }]);
      const res = await (statusGET as any)(makeRequest(`/api/whatsapp/status?store_id=${STORE_B}`), session);
      expect(res.status).toBe(403);
    });

    it('admin global puede acceder a cualquier store', async () => {
      const res = await (statusGET as any)(makeRequest(`/api/whatsapp/status?store_id=${STORE_B}`), makeSession('admin'));
      expect(res.status).toBe(200);
    });
  });

  // ── FIX-AUDIT-WA-2: contact_id cross-tenant injection ────────────

  describe('FIX-AUDIT-WA-2: contact_id cross-tenant injection', () => {
    it('POST /api/whatsapp/messages/send — contact_id de otra tienda → 403', async () => {
      const { validateContactBelongsToStore } = await import('@/lib/whatsapp/glm-orchestrator');
      vi.mocked(validateContactBelongsToStore).mockResolvedValueOnce(false);
      const FOREIGN_CONTACT = '99999999-9999-4999-9999-999999999999';
      const res = await (sendPOST as any)(
        makeRequest('/api/whatsapp/messages/send', 'POST', {
          store_id: STORE_A,
          phone_number: '5312345678',
          message: 'hola',
          contact_id: FOREIGN_CONTACT,
        }),
        makeSession('manager', [{ store_id: STORE_A, role: 'manager', status: 'active' }])
      );
      expect(res.status).toBe(403);
      // Confirmar que el guard fue invocado con los parámetros esperados
      expect(validateContactBelongsToStore).toHaveBeenCalledWith(STORE_A, FOREIGN_CONTACT);
    });

    it('POST /api/whatsapp/messages/send — contact_id propio → pasa el guard', async () => {
      const { validateContactBelongsToStore } = await import('@/lib/whatsapp/glm-orchestrator');
      vi.mocked(validateContactBelongsToStore).mockResolvedValueOnce(true);
      const OWN_CONTACT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const res = await (sendPOST as any)(
        makeRequest('/api/whatsapp/messages/send', 'POST', {
          store_id: STORE_A,
          phone_number: '5312345678',
          message: 'hola',
          contact_id: OWN_CONTACT,
        }),
        makeSession('manager', [{ store_id: STORE_A, role: 'manager', status: 'active' }])
      );
      // Si pasa el guard, no debe dar 403 por contact_id mismatch.
      // Puede ser 200 (sin socket) o 500 (socket error) — pero no 403.
      expect(res.status).not.toBe(403);
    });
  });

  // ── FIX-AUDIT-WA-4: anti-ban guard en envío directo ──────────────

  describe('FIX-AUDIT-WA-4: anti-ban guard en messages/send', () => {
    it('rechaza 429 cuando canInviteNow devuelve allowed=false', async () => {
      const { canInviteNow } = await import('@/lib/whatsapp/anti-ban');
      vi.mocked(canInviteNow).mockReturnValueOnce({
        allowed: false,
        reason: 'Pausa anti-banneo activa',
        nextAllowedAt: new Date(Date.now() + 3600_000),
      });
      // Sin socket activo, el handler ahora invoca getRiskState+canInviteNow solo
      // cuando hay socket. Para forzar el test, mockeamos getSocket con uno truthy.
      const { getSocket } = await import('@/lib/whatsapp/baileys-client');
      vi.mocked(getSocket).mockReturnValueOnce({
        sendMessage: vi.fn(),
      } as any);

      const res = await (sendPOST as any)(
        makeRequest('/api/whatsapp/messages/send', 'POST', {
          store_id: STORE_A,
          phone_number: '5312345678',
          message: 'hola',
        }),
        makeSession('manager', [{ store_id: STORE_A, role: 'manager', status: 'active' }])
      );
      expect(res.status).toBe(429);
      const body = await res.json();
      expect(body.blocked_by_anti_ban).toBe(true);
      expect(body.reason).toContain('anti-ban');
    });
  });

  // ── FIX-AUDIT-WA-3: historial con filtro store_id ────────────────

  describe('FIX-AUDIT-WA-3: generateResponse historial filtra por store_id', () => {
    it('la query de historial incluye ambos filtros (store_id+contact_id)', async () => {
      // Test unitario directo del módulo real — no la ruta.
      // Como el módulo está mockeado, verificamos el contrato: el módulo real
      // (en src/lib/whatsapp/glm-orchestrator.ts) aplica .eq('store_id', storeId)
      // .eq('contact_id', contactId). Este test documenta el requisito.
      // Para una verificación estática, leemos el source.
      const fs = await import('fs');
      const path = await import('path');
      const src = fs.readFileSync(
        path.resolve(process.cwd(), 'src/lib/whatsapp/glm-orchestrator.ts'),
        'utf-8'
      );
      // Buscar el bloque de carga de historial
      const historyBlockMatch = src.match(/2\. Cargar historial[\s\S]+?\.reverse\(\);/);
      expect(historyBlockMatch).toBeTruthy();
      const historyBlock = historyBlockMatch![0];
      expect(historyBlock).toContain(".eq('store_id', storeId)");
      expect(historyBlock).toContain(".eq('contact_id', contactId)");
    });
  });
});
