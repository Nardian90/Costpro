/**
 * supervisor-token.ts — REM-INV-4A-R (RC-1)
 *
 * Server-side binding between a validated supervisor authorization
 * (/api/auth/supervisor-check) and the sale that consumes it
 * (/api/pos/checkout -> create_sale_v2).
 *
 * Why this exists (REM-INV-4A F-04-A2, P1):
 *   The checkout route used to forward a client-supplied p_supervisor_user_id
 *   to the RPC. A client-supplied UUID is not proof of authorization: any
 *   authenticated user could satisfy the ≥15% discount supervisor gate by
 *   quoting an arbitrary admin UUID (cross-tenant included). The trust link
 *   required by the security doctrine is:
 *
 *     SUPERVISOR ID + AUTHENTICATED SESSION (operator) + VALID SUPERVISOR
 *     AUTHORIZATION (server-side credential check)
 *
 *   supervisor-check validates the supervisor's credentials server-side and
 *   issues a short-lived HMAC token bound to (supervisor, operator, store).
 *   The checkout route verifies the token before forwarding the supervisor
 *   identity to create_sale_v2 (which, after RC-1, only accepts foreign
 *   supervisor identities from service_role).
 *
 * Scope notes:
 *   - Tokens are stateless and expire after SUPERVISOR_TOKEN_TTL_SECONDS.
 *   - The secret reuses NEXTAUTH_SECRET (no new secret surface); rotating it
 *     invalidates outstanding tokens (max loss: the TTL window).
 *   - Residual (documented in REM-INV-4A-R 03-rc1-design.md): a token can be
 *     replayed by the SAME operator for another discounted sale in the SAME
 *     store within the TTL window — the industry-standard manager-approval
 *     caching model (P3 residual, registered for a future gate).
 */

import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const SUPERVISOR_TOKEN_TTL_SECONDS = 300; // 5 minutes

const TOKEN_VERSION = 'v1';

interface SupervisorTokenPayload {
  v: string; // token version
  sup: string; // supervisor user id (validated credentials)
  opr: string; // operator user id (authenticated session that requested the check)
  st: string; // store id the authorization applies to
  iat: number; // issued at (epoch seconds)
  exp: number; // expiry (epoch seconds)
  jti: string; // random token id
}

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.NEXTAUTH_SECRET_KEY;
  if (!secret) {
    throw new Error('SERVER_CONFIG: missing NEXTAUTH_SECRET for supervisor token signing');
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payloadStr: string): string {
  return createHmac('sha256', getSecret()).update(payloadStr).digest('base64url');
}

/** Issue a signed supervisor authorization token. */
export function issueSupervisorToken(
  supervisorUserId: string,
  operatorUserId: string,
  storeId: string
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SupervisorTokenPayload = {
    v: TOKEN_VERSION,
    sup: supervisorUserId,
    opr: operatorUserId,
    st: storeId,
    iat: now,
    exp: now + SUPERVISOR_TOKEN_TTL_SECONDS,
    jti: randomUUID(),
  };
  const payloadStr = JSON.stringify(payload);
  return `${b64url(payloadStr)}.${sign(payloadStr)}`;
}

export interface SupervisorTokenVerifyResult {
  valid: boolean;
  reason?:
    | 'MALFORMED'
    | 'BAD_SIGNATURE'
    | 'EXPIRED'
    | 'SUPERVISOR_MISMATCH'
    | 'OPERATOR_MISMATCH'
    | 'STORE_MISMATCH'
    | 'VERSION_MISMATCH';
}

/** Verify a supervisor token against the sale being authorized. */
export function verifySupervisorToken(
  token: string,
  expected: { supervisorUserId: string; operatorUserId: string; storeId: string }
): SupervisorTokenVerifyResult {
  const dot = token.indexOf('.');
  if (dot <= 0 || dot === token.length - 1) return { valid: false, reason: 'MALFORMED' };

  let payload: SupervisorTokenPayload;
  try {
    const payloadStr = Buffer.from(token.slice(0, dot), 'base64url').toString('utf-8');
    payload = JSON.parse(payloadStr) as SupervisorTokenPayload;
  } catch {
    return { valid: false, reason: 'MALFORMED' };
  }

  const expectedSig = sign(Buffer.from(token.slice(0, dot), 'base64url').toString('utf-8'));
  const providedSig = token.slice(dot + 1);
  const a = Buffer.from(expectedSig);
  const b = Buffer.from(providedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: 'BAD_SIGNATURE' };
  }

  if (payload.v !== TOKEN_VERSION) return { valid: false, reason: 'VERSION_MISMATCH' };
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return { valid: false, reason: 'EXPIRED' };
  if (payload.sup !== expected.supervisorUserId) return { valid: false, reason: 'SUPERVISOR_MISMATCH' };
  if (payload.opr !== expected.operatorUserId) return { valid: false, reason: 'OPERATOR_MISMATCH' };
  if (payload.st !== expected.storeId) return { valid: false, reason: 'STORE_MISMATCH' };

  return { valid: true };
}
