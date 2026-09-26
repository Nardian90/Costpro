/**
 * FASE E-SEC-FINAL (D3) — token de supervisor SINGLE-USE con scope firmado.
 *
 * La autorización delegada es de UN SOLO USO (el consumo ocurre server-side en
 * create_sale_v2 vía supervisor_token_usages). Este test cubre la capa
 * criptográfica: el scope (línea(s) autorizada(s) pid/vid/px) queda DENTRO del
 * payload firmado (HMAC — el cliente no puede alterarlo) y verifySupervisorToken
 * retorna { jti, scp } para que el checkout route los pase al RPC.
 *
 * La política vive en create_sale_v2 (migración
 * 20260927000001_esec_final_definitive_policy.sql) y se valida LIVE en
 * audit-evidence/FASE-E-SEC-FINAL/08-SECURITY-MATRIX.md.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// El firmante HMAC exige NEXTAUTH_SECRET (SERVER_CONFIG fail-closed). vi.hoisted
// garantiza que el env exista ANTES de la importación del módulo bajo test.
vi.hoisted(() => {
  process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || 'test-secret-e-sec-final';
});

vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminSafe: () => null }));

import {
  issueSupervisorToken,
  verifySupervisorToken,
  SUPERVISOR_TOKEN_TTL_SECONDS,
} from '@/lib/supervisor-token';

const SUP = '11111111-1111-4111-8111-111111111111';
const OPR = '22222222-2222-4222-8222-222222222222';
const ST = '33333333-3333-4333-8333-333333333333';
const SCOPE = [
  { pid: 'aaaa1111-0000-4000-8000-000000000001', vid: null, px: 240 },
  { pid: 'aaaa1111-0000-4000-8000-000000000002', vid: 'bbbb2222-0000-4000-8000-000000000009', px: 100 },
];

describe('E-SEC-FINAL D3 — issueSupervisorToken firma el scope autorizado', () => {
  it('TTL se mantiene en 300 segundos (decisión D3: mantener TTL, single-use)', () => {
    expect(SUPERVISOR_TOKEN_TTL_SECONDS).toBe(300);
  });

  it('verify retorna payload { jti, scp } cuando el token es válido y con scope', () => {
    const token = issueSupervisorToken(SUP, OPR, ST, SCOPE);
    const v = verifySupervisorToken(token, { supervisorUserId: SUP, operatorUserId: OPR, storeId: ST });
    expect(v.valid).toBe(true);
    expect(v.payload?.jti).toBeTruthy();
    expect(v.payload?.scp).toEqual(SCOPE);
  });

  it('sin scope → payload.scp = [] (compatibilidad con autorización de descuento global)', () => {
    const token = issueSupervisorToken(SUP, OPR, ST);
    const v = verifySupervisorToken(token, { supervisorUserId: SUP, operatorUserId: OPR, storeId: ST });
    expect(v.valid).toBe(true);
    expect(v.payload?.scp).toEqual([]);
  });

  it('jti es único por emisión (dos tokens → dos jti distintos; el consumo los distingue)', () => {
    const t1 = verifySupervisorToken(issueSupervisorToken(SUP, OPR, ST, SCOPE), {
      supervisorUserId: SUP, operatorUserId: OPR, storeId: ST,
    });
    const t2 = verifySupervisorToken(issueSupervisorToken(SUP, OPR, ST, SCOPE), {
      supervisorUserId: SUP, operatorUserId: OPR, storeId: ST,
    });
    expect(t1.payload?.jti).not.toBe(t2.payload?.jti);
  });

  it('el scope NO puede alterarse sin invalidar la firma (mutar scp → MALFORMED/BAD_SIGNATURE)', () => {
    const token = issueSupervisorToken(SUP, OPR, ST, SCOPE);
    const [payloadB64, sig] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    decoded.scp[0].px = 0; // atacante intenta autorizar 100% de descuento
    const forged = `${Buffer.from(JSON.stringify(decoded)).toString('base64url')}.${sig}`;
    const v = verifySupervisorToken(forged, { supervisorUserId: SUP, operatorUserId: OPR, storeId: ST });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('BAD_SIGNATURE');
  });

  it('bindings RC-1 intactos: otro operador / otra tienda / otro supervisor → DENIED', () => {
    const token = issueSupervisorToken(SUP, OPR, ST, SCOPE);
    expect(verifySupervisorToken(token, { supervisorUserId: SUP, operatorUserId: '44444444-4444-4444-8444-444444444444', storeId: ST }).reason).toBe('OPERATOR_MISMATCH');
    expect(verifySupervisorToken(token, { supervisorUserId: SUP, operatorUserId: OPR, storeId: '44444444-4444-4444-8444-444444444444' }).reason).toBe('STORE_MISMATCH');
    expect(verifySupervisorToken(token, { supervisorUserId: '44444444-4444-4444-8444-444444444444', operatorUserId: OPR, storeId: ST }).reason).toBe('SUPERVISOR_MISMATCH');
  });

  it('expiración intacta (TTL 300 s)', () => {
    vi.useFakeTimers();
    const token = issueSupervisorToken(SUP, OPR, ST, SCOPE);
    vi.setSystemTime(Date.now() + (SUPERVISOR_TOKEN_TTL_SECONDS + 1) * 1000);
    const v = verifySupervisorToken(token, { supervisorUserId: SUP, operatorUserId: OPR, storeId: ST });
    expect(v.valid).toBe(false);
    expect(v.reason).toBe('EXPIRED');
    vi.useRealTimers();
  });
});
