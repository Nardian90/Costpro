/**
 * REMEDIACIÓN fix/users-multistore-admin-password — FASE 12: autorización REAL.
 *
 * El middleware withRole('admin') NO se mockea aquí: se ejecuta el real
 * (src/lib/auth-middleware.ts) para demostrar el contract de seguridad:
 *   - No autenticado                → 401
 *   - Autenticado sin rol admin     → 403 (perfil clerk / encargado)
 *   - Super Admin (profiles.role)   → permitido (llega al handler)
 * La autorización se deriva de profiles.role (mecanismo canónico) — jamás de
 * un email hardcodeado. Solo se mockean las fronteras externas:
 * getServerSession (JWT → sesión), el cliente admin de Supabase y el flag
 * RLS best-effort.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '@/app/api/users/reset-password/route';

// ─── Frontera 1: sesión (getServerSession) controlada por cada caso ─────────
const sessionValue = { value: null as any };
vi.mock('@/lib/auth', () => ({
  getServerSession: async () => sessionValue.value,
}));

// ─── Frontera 2: cliente admin (service_role) ────────────────────────────────
const adminCalls = {
  profileRole: null as string | null,
  updateUserById: [] as unknown[],
  auditRows: [] as unknown[],
};

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({
    from: (table: string) => {
      if (table === 'profiles') {
        // Compatible con ambas cadenas reales:
        //  - withRole:  select().eq().single()
        //  - route:     select().eq().is('deleted_at', null).single()
        const afterEq: any = {};
        const singleImpl = async () =>
          adminCalls.profileRole
            ? { data: { role: adminCalls.profileRole, roles: [adminCalls.profileRole] }, error: null }
            : { data: null, error: { message: 'no rows' } };
        afterEq.is = () => ({ single: singleImpl });
        afterEq.single = singleImpl;
        return {
          select: () => ({
            eq: () => afterEq,
          }),
        };
      }
      if (table === 'user_store_memberships') {
        // Cadena select().eq().eq() del enrichment de withRole
        const chain: any = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.then = (res?: any, rej?: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
        return chain;
      }
      if (table === 'user_audit_log') {
        return {
          insert: async (row: unknown) => {
            adminCalls.auditRows.push(row);
            return { error: null };
          },
        };
      }
      return { insert: async () => ({ error: null }) };
    },
    rpc: async () => ({ data: { email: 'target@costpro.dev' }, error: null }),
    auth: {
      admin: {
        updateUserById: async (...args: unknown[]) => {
          adminCalls.updateUserById.push(args);
          return { error: null };
        },
        generateLink: async () => ({ data: {}, error: null }),
      },
    },
  }),
}));

// ─── Frontera 3: RLS best-effort del middleware (no aplica en test) ─────────
vi.mock('@/lib/rls-middleware', () => ({
  activateTenantRLS: async () => undefined,
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
const BODY = { user_id: TARGET_ID, new_password: 'NuevaClaveSegura99' };

beforeEach(() => {
  sessionValue.value = null;
  adminCalls.profileRole = 'admin';
  adminCalls.updateUserById.length = 0;
  adminCalls.auditRows.length = 0;
});

describe('Autorización real de POST /api/users/reset-password (withRole sin mockear)', () => {
  it('No autenticado → 401', async () => {
    sessionValue.value = null;
    const res = await POST(makeRequest(BODY));
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.error).toBe('No autorizado');
    expect(adminCalls.updateUserById).toHaveLength(0);
  });

  it('Autenticado con rol clerk (sin privilegio) → 403', async () => {
    sessionValue.value = {
      token: 'clerk-token',
      user: { id: '33333333-3333-4333-8333-333333333333', email: 'clerk@costpro.dev' },
    };
    adminCalls.profileRole = 'clerk';

    const res = await POST(makeRequest(BODY));
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error).toBe('Prohibido');
    expect(adminCalls.updateUserById).toHaveLength(0);
    expect(adminCalls.auditRows).toHaveLength(0);
  });

  it('Autenticado con rol encargado (gestión de tienda, no global) → 403', async () => {
    sessionValue.value = {
      token: 'enc-token',
      user: { id: '44444444-4444-4444-8444-444444444444', email: 'encargado@costpro.dev' },
    };
    adminCalls.profileRole = 'encargado';

    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(403);
    expect(adminCalls.updateUserById).toHaveLength(0);
  });

  it('Super Admin (profiles.role = admin) → PERMITIDO: operación + auditoría', async () => {
    sessionValue.value = {
      token: 'admin-token',
      user: { id: ADMIN_ID, email: 'super.admin@costpro.dev' },
    };
    adminCalls.profileRole = 'admin';

    const res = await POST(makeRequest(BODY));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(adminCalls.updateUserById).toHaveLength(1);
    expect(adminCalls.auditRows).toHaveLength(1);
    expect((adminCalls.auditRows[0] as any).action).toBe('PASSWORD_SET_BY_ADMIN');
    expect((adminCalls.auditRows[0] as any).performed_by).toBe(ADMIN_ID);
  });

  it('El endpoint NO autoriza por coincidencia de email — el rol viene de profiles', async () => {
    // Un usuario CUALQUIERA cuyo email coincida con un patrón conocido sigue
    // siendo 403 si su profile no es admin: la autorización es el rol real.
    sessionValue.value = {
      token: 'spoof-token',
      user: { id: '55555555-5555-4555-8555-555555555555', email: 'admin@demo.com' },
    };
    adminCalls.profileRole = 'clerk';

    const res = await POST(makeRequest(BODY));
    expect(res.status).toBe(403);
    expect(adminCalls.updateUserById).toHaveLength(0);
  });
});
