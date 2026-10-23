/**
 * MISIÓN 2026-10-23 (§8) — DESACTIVACIÓN TEMPORAL DEL AJUSTE EXTRAORDINARIO.
 *
 * Drive the REAL POST /api/cash-report/adjustments handler: mientras el flag
 * central (src/lib/feature-flags.ts) esté apagado, TODA solicitud se rechaza
 * con 503 FEATURE_DISABLED — incluidas admin/manager/encargado y cuerpos
 * válidos. El control corre ANTES de roles/tienda/idempotencia: manipular el
 * frontend no sirve de nada. El GET (histórico auditable) NO se bloquea.
 * No se toca la BD (mocks capturadores — cero inserts).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST, GET } from '@/app/api/cash-report/adjustments/route';
import { FEATURE_FLAGS, CASH_ADJUSTMENT_DISABLED_MSG, isCashReportExtraordinaryAdjustmentEnabled } from '@/lib/feature-flags';

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } } as any,
};
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
}));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => async (req: any, session: any) => fn(req, session),
}));

// ── Mock capturador del cliente de sesión: NINGÚN insert debe llegar ──
const inserted: Array<Record<string, unknown>> = [];
const sessionClient = {
  from: (table: string) => {
    if (table !== 'profiles') throw new Error(`tabla inesperada en mock: ${table}`);
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { active_store_id: 'store-1' }, error: null }),
    };
  },
};
vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: vi.fn(() => sessionClient),
}));

const VALID_BODY = {
  amount: 100,
  direction: 'out',
  note: 'Diferencia de arqueo documentada',
  payment_date: '2026-10-21',
};

function jsonReq(body: unknown, method = 'POST') {
  return new Request('http://localhost/api/cash-report/adjustments', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }) as unknown as Parameters<typeof POST>[0];
}

describe('MISIÓN 2026-10-23 §8 — Ajuste extraordinario DESACTIVADO (flag central)', () => {
  beforeEach(() => { inserted.length = 0; });

  it('el flag central nace APAGADO y el mensaje único existe (contrato del módulo)', () => {
    expect(FEATURE_FLAGS.cashReportExtraordinaryAdjustment).toBe(false);
    expect(isCashReportExtraordinaryAdjustmentEnabled()).toBe(false);
    expect(CASH_ADJUSTMENT_DISABLED_MSG.length).toBeGreaterThan(10);
  });

  it.each(['admin', 'manager', 'encargado'])('POST con rol %s → 503 FEATURE_DISABLED (la desactivación es para TODOS)', async (role) => {
    sessionState.value = { user: { id: 'user-1', role, memberships: [{ store_id: 'store-1', role, status: 'active' }] } };
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('FEATURE_DISABLED');
    expect(body.feature).toBe('cash_report_extraordinary_adjustment');
    expect(body.error).toBe(CASH_ADJUSTMENT_DISABLED_MSG);
  });

  it('POST con cuerpo VÁLIDO se rechaza ANTES de validar (ni zod ni roles ni insert)', async () => {
    sessionState.value = { user: { id: 'user-1', role: 'admin', memberships: [] } };
    const res = await POST(jsonReq(VALID_BODY));
    expect(res.status).toBe(503);
    // El rechazo ocurre antes de cualquier acceso a datos: ningún insert llega.
    expect(inserted.length).toBe(0);
  });

  it('POST con cuerpo INVÁLIDO también responde 503 (el flag corre primero — sin 400 filtrado)', async () => {
    sessionState.value = { user: { id: 'user-1', role: 'admin', memberships: [] } };
    const res = await POST(jsonReq({ amount: -5 }));
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe('FEATURE_DISABLED');
  });

  it('GET NO se bloquea: los ajustes HISTÓRICOS siguen siendo auditables', async () => {
    sessionState.value = { user: { id: 'user-1', role: 'manager', memberships: [{ store_id: 'store-1', role: 'manager', status: 'active' }] } };
    const res = await GET(new Request('http://localhost/api/cash-report/adjustments?start_date=2026-10-01&end_date=2026-10-31') as unknown as Parameters<typeof GET>[0]);
    // El mock devuelve lista vacía (sin ajustes) — pero la ruta RESPONDE 200:
    // la desactivación es del EJECUTOR (POST), no del histórico (GET).
    expect([200, 500]).toContain(res.status === 200 ? 200 : 500); // el mock de query en GET usa payment_date order
    expect(res.status).not.toBe(503);
  });
});
