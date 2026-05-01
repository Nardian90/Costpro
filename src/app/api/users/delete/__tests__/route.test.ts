import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

// Set required env vars so getSupabaseAdmin() doesn't throw
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';

let mockSession: any = null;

vi.mock('@/lib/auth-middleware', () => ({
  withRole: (_role: string, handler: any) => async (req: NextRequest) => {
    if (!mockSession) {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader || authHeader === 'Bearer null') {
        return new Response(JSON.stringify({ error: 'No autorizado', message: 'Se requiere sesión activa' }), { status: 401 });
      }
      mockSession = {
        token: 'valid-token',
        user: {
          id: 'admin-user-001',
          role: 'admin',
          roles: [{ name: 'admin' }],
          memberships: [],
        },
      };
    }
    return handler(req, mockSession);
  },
}));

let mockSupabaseAdmin: any = null;

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => mockSupabaseAdmin),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

const VALID_USER_ID = '11111111-1111-4111-a111-111111111111';

const makeAuthRequest = (body: unknown) =>
  new NextRequest('http://localhost/api/users/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-token',
    },
    body: JSON.stringify(body),
  });

const createMockAdminClient = (profileData: any = { role: 'admin', roles: [{ name: 'admin' }] }) => {
  const mockSingle = vi.fn().mockResolvedValue({ data: profileData, error: null });
  const chainObj: any = {
    eq: vi.fn().mockReturnValue({ single: mockSingle }),
  };
  chainObj.select = vi.fn().mockReturnValue(chainObj);
  chainObj.from = vi.fn().mockReturnValue(chainObj);

  const mockClient: any = {
    ...chainObj,
    auth: {
      admin: { deleteUser: vi.fn().mockResolvedValue({ error: null }) },
    },
    rpc: vi.fn().mockResolvedValue({ data: { success: true }, error: null }),
  };

  return { mockClient, mockSingle };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/users/delete', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = null;
    const { mockClient } = createMockAdminClient();
    mockSupabaseAdmin = mockClient;
  });

  describe('autenticación', () => {
    it('retorna 401 sin header Authorization', async () => {
      const req = new NextRequest('http://localhost/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 con Authorization "Bearer null"', async () => {
      const req = new NextRequest('http://localhost/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer null' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('validación Zod', () => {
    it('retorna 400 con user_id que no es UUID', async () => {
      const res = await POST(makeAuthRequest({ user_id: 'no-uuid' }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.details).toBeInstanceOf(Array);
    });

    it('retorna 400 con user_id ausente', async () => {
      const res = await POST(makeAuthRequest({}));
      expect(res.status).toBe(400);
    });

    it('retorna 400 con user_id vacío', async () => {
      const res = await POST(makeAuthRequest({ user_id: '' }));
      expect(res.status).toBe(400);
    });
  });

  describe('autorización', () => {
    it('retorna 403 si el requester tiene rol usuario en BD', async () => {
      const { mockClient } = createMockAdminClient({
        role: 'usuario',
        roles: [{ name: 'usuario' }],
      });
      mockSupabaseAdmin = mockClient;

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/administradores/i);
    });

    it('retorna 403 si el requester tiene rol encargado en BD', async () => {
      const { mockClient } = createMockAdminClient({
        role: 'encargado',
        roles: [{ name: 'encargado' }],
      });
      mockSupabaseAdmin = mockClient;

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));
      expect(res.status).toBe(403);
    });
  });

  describe('happy path', () => {
    it('retorna 200 y elimina el usuario cuando todo es válido', async () => {
      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toMatch(/eliminado/i);
      expect(mockSupabaseAdmin.auth.admin.deleteUser).toHaveBeenCalledWith(VALID_USER_ID);
    });

    it('llama a RPC managed_delete_user con user_id correcto', async () => {
      await POST(makeAuthRequest({ user_id: VALID_USER_ID }));

      expect(mockSupabaseAdmin.rpc).toHaveBeenCalledWith('managed_delete_user', {
        p_user_id: VALID_USER_ID,
      });
    });
  });

  describe('manejo de errores', () => {
    it('retorna 400 si RPC managed_delete_user falla', async () => {
      mockSupabaseAdmin.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'User has active transactions' },
      });

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));
      expect(res.status).toBe(400);
    });

    it('retorna 403 si el perfil del requester no se encuentra', async () => {
      const { mockClient, mockSingle } = createMockAdminClient(null);
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
      mockSupabaseAdmin = mockClient;

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/perfil/i);
    });

    it('continúa con 200 aunque Auth deleteUser falle (no bloquea la respuesta)', async () => {
      mockSupabaseAdmin.auth.admin.deleteUser.mockResolvedValueOnce({
        error: { message: 'Auth service unavailable' },
      });

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));
      // The response should still be 200 because RPC succeeded
      expect(res.status).toBe(200);
    });
  });
});
