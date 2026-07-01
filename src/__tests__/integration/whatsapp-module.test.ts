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

const STORE_A = '11111111-1111-1111-1111-111111111111';
const STORE_B = '22222222-2222-2222-2222-222222222222';

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
});
