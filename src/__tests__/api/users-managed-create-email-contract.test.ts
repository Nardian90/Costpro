import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/users/managed-create/route';

/**
 * users-managed-create-email-contract.test.ts — MISIÓN CONTINUA 2026-10-21 (CP-SEC-018).
 *
 * Contrato del manejo de email duplicado en POST /api/users/managed-create
 * (DEFECT-003 de E2E-FIXTURE-REUSE §9.3, RBAC-008):
 *
 *   ANTES (2026-10-09): la ruta creaba el usuario correctamente pero
 *   respondía 400 ERR_EMAIL_ALREADY_EXISTS (doble verificación de email con
 *   mapeo incorrecto) → el cliente creía que falló y reintentaba, dejando
 *   estados ambiguos.
 *
 *   HOY (v2_16_1 + v2_16_0): el mapeo es 409 con mensaje claro en español y
 *   el rollback del auth user está verificado (soft-delete del perfil +
 *   reintento; si persiste, clasificado al panel de huérfanos). Este test
 *   BLINDA ese contrato para que no regrese:
 *
 *  1. Email nuevo → 2xx success:true (sin tocar el camino de duplicado).
 *  2. Duplicado detectado por GoTrue (auth level) → 409 «Ya existe un
 *     usuario con ese correo» SIN llamar al RPC (no se crea nada).
 *  3. Duplicado detectado por el RPC (perfil huérfano previo) → 409 Y
 *     rollback del auth user creado (deleteUser invocado).
 *  4. Otro error del RPC → 400 con mensaje del RPC y rollback igualmente
 *     invocado (no queda usuario a medias).
 */

vi.mock('@/lib/auth-middleware', () => ({
  withRole: (_role: string, fn: any) => async (req: any) =>
    fn(req, { token: 't', user: { id: 'u-admin-1', role: 'admin' } }),
}));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }));
vi.mock('@/lib/csrf', () => ({ validateOrigin: () => true }));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

// ── Mock del cliente admin ──
const createUserMock = vi.fn();
const deleteUserMock = vi.fn();
const generateLinkMock = vi.fn();
const rpcMock = vi.fn();
const profileSelectMock = vi.fn();

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    auth: {
      admin: {
        createUser: createUserMock,
        deleteUser: deleteUserMock,
        generateLink: generateLinkMock,
      },
    },
    rpc: rpcMock,
    from: (table: string) => {
      if (table !== 'profiles') throw new Error(`tabla inesperada: ${table}`);
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        single: () => profileSelectMock(),
        update: () => chain,
      };
      return chain;
    },
  }),
}));

const ADMIN_PROFILE = {
  id: 'u-admin-1',
  role: 'admin',
  roles: [{ name: 'admin' }],
};

const VALID_BODY = {
  p_email: 'nuevo.usuario@costpro.test',
  p_full_name: 'Nuevo Usuario',
  p_role: 'usuario',
  p_store_id: '11111111-1111-4111-8111-111111111111',
  p_password: 'PasswordSeguro123',
};

function jsonReq(payload: unknown) {
  return new Request('http://localhost/api/users/managed-create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }) as any;
}

beforeEach(() => {
  // mockReset (no solo clearAllMocks): vacía también la cola de
  // mockResolvedValueOnce — si un test aborta antes de consumir sus mocks
  // (p. ej. 400 de Zod), sus valores NO deben filtrarse al siguiente test.
  createUserMock.mockReset();
  deleteUserMock.mockReset();
  generateLinkMock.mockReset();
  rpcMock.mockReset();
  profileSelectMock.mockReset().mockResolvedValue({ data: ADMIN_PROFILE, error: null });
});

describe('POST /api/users/managed-create — contrato de email duplicado (CP-SEC-018)', () => {
  it('1 · email nuevo → 2xx success:true y user_id del auth user creado', async () => {
    createUserMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-1' } },
      error: null,
    });
    rpcMock.mockResolvedValueOnce({ data: { ok: true }, error: null });

    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.user_id).toBe('auth-user-1');
    expect(json.message).toContain('Usuario creado correctamente');
    expect(rpcMock).toHaveBeenCalledWith('managed_create_user_v2', expect.objectContaining({
      p_target_user_id: 'auth-user-1',
      p_creator_id: 'u-admin-1',
    }));
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('2 · duplicado detectado por GoTrue (auth) → 409 con mensaje claro, SIN llamar al RPC', async () => {
    createUserMock.mockResolvedValueOnce({
      data: { user: null },
      error: { message: 'User already registered', status: 400 },
    });

    const res = await POST(jsonReq({ ...VALID_BODY, p_email: 'duplicado@costpro.test' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Ya existe un usuario con ese correo electrónico');
    expect(rpcMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('3 · duplicado detectado por el RPC (perfil huérfano previo) → 409 Y rollback del auth user', async () => {
    createUserMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-2' } },
      error: null,
    });
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'ERR_EMAIL_ALREADY_EXISTS: el correo ya tiene perfil' },
    });
    deleteUserMock.mockResolvedValueOnce({ data: null, error: null });

    const res = await POST(jsonReq({ ...VALID_BODY, p_email: 'huerfano-previo@costpro.test' }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe('Ya existe un usuario con ese correo electrónico');
    // El auth user creado en el paso 4 se elimina (rollback) — no queda
    // usuario a medias tras el 409 (el defecto original dejaba uno vivo).
    expect(deleteUserMock).toHaveBeenCalledWith('auth-user-2');
  });

  it('4 · otro error del RPC → 400 con mensaje real y rollback igualmente ejecutado', async () => {
    createUserMock.mockResolvedValueOnce({
      data: { user: { id: 'auth-user-3' } },
      error: null,
    });
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'ERR_STORE_REQUIRED: tienda requerida' },
    });
    deleteUserMock.mockResolvedValueOnce({ data: null, error: null });

    const res = await POST(jsonReq({ ...VALID_BODY, p_email: 'x@costpro.test' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    // La ruta mapea el código del RPC a un mensaje claro (v2_16_1):
    // el admin ve la causa, no el prefijo técnico.
    expect(json.error).toBe('Tienda inválida o no especificada');
    expect(deleteUserMock).toHaveBeenCalledWith('auth-user-3');
  });
});
