/**
 * REMEDIACIÓN fix/users-multistore-admin-password — Flujo A (seteo directo).
 *
 * Contract del endpoint /api/users/reset-password cuando se envía
 * `new_password`:
 *   - auth.admin.updateUserById SOLO en servidor (service_role).
 *   - Auditoría user_audit_log SIN contraseña (solo actor/objetivo/método).
 *   - 404 si el usuario objetivo no existe / está soft-deleted.
 *   - 400 si el actor intenta cambiar su propia contraseña.
 *   - 400 si la contraseña no cumple la política (mín. 8 — zod).
 *   - Flujo B (correo de recuperación) intacto cuando NO hay new_password.
 *   - La contraseña jamás aparece en logs.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/users/reset-password/route';

// vi.hoisted: el factory de logger necesita esta referencia antes de la
// inicialización del módulo de test.
const { mockLoggerError } = vi.hoisted(() => ({ mockLoggerError: vi.fn() }));

// ─── Mocks de la frontera server-side ───────────────────────────────────────

const currentSession = {
  token: 'admin-token',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'super.admin@costpro.dev', role: 'admin' },
};

vi.mock('@/lib/auth-middleware', () => ({
  withRole: (_role: unknown, fn: any) => async (req: any) => fn(req, currentSession),
}));

const calls = {
  updateUserById: [] as Array<{ userId: string; attrs: Record<string, unknown> }>,
  auditRows: [] as Array<Record<string, unknown>>,
  rpcCalls: [] as Array<{ name: string; params: unknown }>,
  generateLinkCalls: [] as unknown[],
};

const probe: {
  targetProfile: { data: { id: string } | null; error: { message: string } | null };
  updateUserByIdResult: { error: { message: string } | null };
  auditInsertResult: { error: { message: string } | null };
  rpcResult: { data: { email: string } | null; error: { message: string } | null };
} = {
  targetProfile: { data: { id: '22222222-2222-4222-8222-222222222222' }, error: null },
  updateUserByIdResult: { error: null },
  auditInsertResult: { error: null },
  rpcResult: { data: { email: 'target@costpro.dev' }, error: null },
};

function makeAdminMock() {
  return {
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                single: async () => probe.targetProfile,
              }),
            }),
          }),
        };
      }
      if (table === 'user_audit_log') {
        return {
          insert: async (row: Record<string, unknown>) => {
            calls.auditRows.push(row);
            return probe.auditInsertResult;
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
    rpc: async (name: string, params: unknown) => {
      calls.rpcCalls.push({ name, params });
      return probe.rpcResult;
    },
    auth: {
      admin: {
        updateUserById: async (userId: string, attrs: Record<string, unknown>) => {
          calls.updateUserById.push({ userId, attrs });
          return probe.updateUserByIdResult;
        },
        generateLink: async (args: unknown) => {
          calls.generateLinkCalls.push(args);
          return { data: {}, error: null };
        },
      },
    },
  };
}

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => makeAdminMock(),
}));

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('@/lib/csrf', () => ({
  validateOrigin: () => true,
}));

vi.mock('@/lib/observability', () => ({
  withTracing: (fn: any) => fn,
}));

vi.mock('@/lib/logger', () => ({
  logger: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() },
}));

function makeRequest(body: unknown): any {
  return {
    method: 'POST',
    headers: new Map(),
    json: async () => body,
    url: 'http://localhost:3000/api/users/reset-password',
  } as any;
}

const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '22222222-2222-4222-8222-222222222222';
const NEW_PASSWORD = 'NuevaClaveSegura99';

beforeEach(() => {
  calls.updateUserById.length = 0;
  calls.auditRows.length = 0;
  calls.rpcCalls.length = 0;
  calls.generateLinkCalls.length = 0;
  mockLoggerError.mockClear();
  probe.targetProfile = { data: { id: TARGET_ID }, error: null };
  probe.updateUserByIdResult = { error: null };
  probe.auditInsertResult = { error: null };
  probe.rpcResult = { data: { email: 'target@costpro.dev' }, error: null };
});

describe('POST /api/users/reset-password — Flujo A: seteo directo (new_password)', () => {
  it('happy path: updateUserById server-side con la contraseña + respuesta sanitizada', async () => {
    const res = await POST(makeRequest({ user_id: TARGET_ID, new_password: NEW_PASSWORD }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(calls.updateUserById).toHaveLength(1);
    expect(calls.updateUserById[0].userId).toBe(TARGET_ID);
    expect(calls.updateUserById[0].attrs.password).toBe(NEW_PASSWORD);
    // El flujo de correo NO se ejecuta en seteo directo.
    expect(calls.rpcCalls).toHaveLength(0);
    expect(calls.generateLinkCalls).toHaveLength(0);
  });

  it('audita PASSWORD_SET_BY_ADMIN con actor/objetivo/método y SIN la contraseña', async () => {
    const res = await POST(makeRequest({ user_id: TARGET_ID, new_password: NEW_PASSWORD }));
    expect(res.status).toBe(200);

    expect(calls.auditRows).toHaveLength(1);
    const row = calls.auditRows[0];
    expect(row.performed_by).toBe(ADMIN_ID);
    expect(row.target_user_id).toBe(TARGET_ID);
    expect(row.action).toBe('PASSWORD_SET_BY_ADMIN');
    expect(row.metadata).toEqual({ method: 'admin_direct_set' });
    // NUNCA persistir la contraseña (ni en metadata, ni old/new_values).
    const serialized = JSON.stringify(row);
    expect(serialized).not.toContain(NEW_PASSWORD);
    expect(serialized).not.toContain('password');
  });

  it('la contraseña jamás llega a los logs del servidor', async () => {
    await POST(makeRequest({ user_id: TARGET_ID, new_password: NEW_PASSWORD }));
    // Happy path: ningún log de error; y si los hubiera, jamás con el valor.
    expect(mockLoggerError).not.toHaveBeenCalled();
    for (const call of mockLoggerError.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(NEW_PASSWORD);
    }
  });

  it('404 cuando el usuario objetivo no existe o está soft-deleted', async () => {
    probe.targetProfile = { data: null, error: { message: 'no rows' } };
    const res = await POST(makeRequest({ user_id: TARGET_ID, new_password: NEW_PASSWORD }));
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toBe('Usuario no encontrado');
    expect(calls.updateUserById).toHaveLength(0);
    expect(calls.auditRows).toHaveLength(0);
  });

  it('400 cuando el actor intenta cambiar su propia contraseña', async () => {
    const res = await POST(makeRequest({ user_id: ADMIN_ID, new_password: NEW_PASSWORD }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('propia contraseña');
    expect(calls.updateUserById).toHaveLength(0);
  });

  it('400 cuando la contraseña no cumple la política (menos de 8 caracteres)', async () => {
    const res = await POST(makeRequest({ user_id: TARGET_ID, new_password: 'corta' }));
    expect(res.status).toBe(400);
    expect(calls.updateUserById).toHaveLength(0);
    expect(calls.auditRows).toHaveLength(0);
  });

  it('400 sanitizado si Supabase rechaza la operación (sin exponer la contraseña)', async () => {
    probe.updateUserByIdResult = { error: { message: 'Password should be at least 8 characters' } };
    const res = await POST(makeRequest({ user_id: TARGET_ID, new_password: NEW_PASSWORD }));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toContain('8 characters');
    expect(JSON.stringify(json)).not.toContain(NEW_PASSWORD);
    // El fallo queda logueado server-side SIN el valor de la contraseña.
    expect(mockLoggerError).toHaveBeenCalled();
    expect(JSON.stringify(mockLoggerError.mock.calls)).not.toContain(NEW_PASSWORD);
    expect(calls.auditRows).toHaveLength(0); // no se audita un cambio fallido
  });

  it('sin new_password: flujo B preexistente intacto (RPC + correo, sin updateUserById)', async () => {
    const res = await POST(makeRequest({ user_id: TARGET_ID }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.message).toContain('correo de recuperación');
    expect(calls.rpcCalls).toHaveLength(1);
    expect(calls.rpcCalls[0].name).toBe('managed_reset_password');
    expect(calls.generateLinkCalls).toHaveLength(1);
    expect(calls.updateUserById).toHaveLength(0);
    expect(calls.auditRows).toHaveLength(0); // auditoría del flujo B vive en el RPC
  });

  it('400 explícito si send_reset_email=false sin new_password', async () => {
    const res = await POST(makeRequest({ user_id: TARGET_ID, send_reset_email: false }));
    expect(res.status).toBe(400);
    expect(calls.rpcCalls).toHaveLength(0);
    expect(calls.generateLinkCalls).toHaveLength(0);
  });
});
