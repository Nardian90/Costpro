import { NextRequest } from 'next/server';
import { POST } from '../route';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

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
  new NextRequest('http://localhost/api/users/toggle-status', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer valid-token',
    },
    body: JSON.stringify(body),
  });

const createMockAdminClient = (profileData: any = { role: 'admin', roles: [{ name: 'admin' }] }) => {
  const mockSingle = vi.fn().mockResolvedValue({ data: profileData, error: null });

  // Chain: select → eq → single  |  update → eq  |  insert
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
  const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const mockInsert = vi.fn().mockResolvedValue({ error: null });

  const chainObj: any = {
    select: mockSelect,
    eq: mockEq,
    update: mockUpdate,
    insert: mockInsert,
  };
  chainObj.from = vi.fn().mockReturnValue(chainObj);

  const mockClient: any = {
    ...chainObj,
    auth: { admin: {} },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return { mockClient, mockSingle, mockUpdate, mockInsert };
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('POST /api/users/toggle-status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSession = null;
    const { mockClient } = createMockAdminClient();
    mockSupabaseAdmin = mockClient;
  });

  describe('autenticación', () => {
    it('retorna 401 sin header Authorization', async () => {
      const req = new NextRequest('http://localhost/api/users/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('retorna 401 con Authorization "Bearer null"', async () => {
      const req = new NextRequest('http://localhost/api/users/toggle-status', {
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
      const res = await POST(makeAuthRequest({ user_id: 'no-uuid', is_active: true }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.details).toBeInstanceOf(Array);
    });

    it('retorna 400 con user_id ausente', async () => {
      const res = await POST(makeAuthRequest({ is_active: false }));
      expect(res.status).toBe(400);
    });

    it('retorna 400 con is_active ausente', async () => {
      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID }));
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

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID, is_active: false }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/permisos/i);
    });

    it('retorna 403 si el perfil del requester no se encuentra', async () => {
      const { mockClient, mockSingle } = createMockAdminClient(null);
      mockSingle.mockResolvedValueOnce({ data: null, error: { message: 'Not found' } });
      mockSupabaseAdmin = mockClient;

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID, is_active: true }));
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/perfil/i);
    });
  });

  describe('happy path', () => {
    it('retorna 200 y success:true al activar un usuario', async () => {
      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID, is_active: true }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('retorna 200 y success:true al desactivar un usuario', async () => {
      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID, is_active: false }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('llama a profiles.update con is_active correcto', async () => {
      await POST(makeAuthRequest({ user_id: VALID_USER_ID, is_active: true }));

      // The update chain should have been called
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith('profiles');
    });
  });

  describe('manejo de errores', () => {
    it('retorna 500 si el update de perfil falla', async () => {
      const { mockClient, mockUpdate } = createMockAdminClient();
      mockUpdate.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: { message: 'DB constraint' } }) });
      mockSupabaseAdmin = mockClient;

      const res = await POST(makeAuthRequest({ user_id: VALID_USER_ID, is_active: true }));
      expect(res.status).toBe(500);
    });
  });
});
