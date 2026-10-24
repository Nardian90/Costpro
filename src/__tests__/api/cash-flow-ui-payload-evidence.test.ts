/**
 * Evidencia MISIÓN CUERPO INVÁLIDO: imprime la respuesta REAL de la ruta
 * para el payload exacto de la UI (sin tocar BD — la validación corta antes).
 */
import { POST as CREATE } from '@/app/api/cash-flow/route';

const UI_PAYLOAD = {
  doc_type: 'egreso',
  concept: 'entrega_efectivo',
  amount: 8435679.98,
  currency: 'CUP',
  idempotency_key: 'cf-0d7d3f2e-5f6b-4c8a-9a1e-2b3c4d5e6f70',
  operation_date: new Date('2026-10-23T12:00:00').toISOString(),
  counterparty: 'Belkis',
  justification: 'Entregar',
  notes: null,
  related_document_id: null,
};

const makeReq = (body: any): Request =>
  ({
    method: 'POST',
    headers: new Map([['x-forwarded-for', '127.0.0.1']]),
    json: async () => body,
    url: 'http://localhost:3000/api/cash-flow',
  }) as any;

const sessionState = {
  value: { user: { id: 'user-1', role: 'manager', memberships: [] } },
};

// mocks mínimos (mismo patrón que cash-flow-route.test.ts)
import { vi } from 'vitest';
vi.mock('@/lib/auth-middleware', () => ({
  withAuth: (fn: any) => async (req: any) => fn(req, sessionState.value),
  AuthenticatedSession: {},
  getServerSession: async () => sessionState.value,
  isDevBypassSession: () => false,
}));
vi.mock('@/lib/observability', () => ({ withTracing: (fn: any) => fn }));
vi.mock('@/lib/with-security', () => ({
  withSecurity: (fn: any) => async (req: any, s: any) => fn(req, s),
}));
vi.mock('@/lib/roles', () => ({ canManageStore: () => true, canViewStore: () => true }));
vi.mock('@/lib/supabase-session', () => ({
  getSupabaseForSession: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { active_store_id: 'store-1' }, error: null }) }) }),
    }),
  }),
}));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminSafe: () => ({ rpc: async () => ({ data: { status: 'success' }, error: null }) }),
}));

const res = await CREATE(makeReq(UI_PAYLOAD));
const body = await res.json();
console.log('HTTP', res.status);
console.log(JSON.stringify(body, null, 2));

import { it, expect } from 'vitest';
it('evidencia: el payload EXACTO de la UI ya NO cae en «Cuerpo inválido»', () => {
  expect(res.status).not.toBe(400);
  expect(body.error).not.toBe('Cuerpo inválido');
});
