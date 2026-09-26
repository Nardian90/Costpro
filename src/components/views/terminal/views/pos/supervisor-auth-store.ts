/**
 * supervisor-auth-store.ts — REM-INV-4A-R (RC-1) client-side helper.
 *
 * Holds the supervisor authorization issued by /api/auth/supervisor-check
 * (supervisor_user_id + signed supervisor_token) until the checkout consumes it.
 * The token is bound server-side to (supervisor, operator, store) and expires
 * in SUPERVISOR_TOKEN_TTL_SECONDS (see src/lib/supervisor-token.ts).
 *
 * The POS flow (SupervisorAuthModal -> usePOSCheckout) previously dropped the
 * supervisor identity entirely, which left the ≥15% discount gate fail-closed
 * at the RPC while the RPC itself remained spoofable via direct calls
 * (REM-INV-4A F-04-A2). This module closes that wiring without touching the
 * modal consumers.
 *
 * E-SEC-FINAL (D2/D3 — decisión del responsable funcional):
 *   - `reason`: motivo obligatorio del descuento autorizado (texto controlado
 *     1..500). Viaja al checkout como `discount_reason`; el RPC lo valida
 *     server-side y lo persiste en la auditoría. El último motivo autorizado
 *     es el que viaja con la venta (campo único por operación).
 *   - `scope`: línea(s) autorizada(s) ({pid, vid, px}) acumuladas entre
 *     autorizaciones sucesivas (upsert por pid+vid, la última gana). Cada
 *     llamada a supervisor-check envía el scope acumulado + la entrada nueva;
 *     el token firmado porta el scope completo. El checkout envía el token y
 *     el create_sale_v2 verifica que cada línea con desvío ≥15% esté cubierta.
 *
 * Nota: esto es UX/higiene del cliente. La autoridad del single-use y del
 * scope es el SERVIDOR (jti consumido en supervisor_token_usages + scope
 * firmado dentro del HMAC).
 */

export interface SupervisorScopeEntry {
  pid: string; // product_id
  vid: string | null; // variant_id (null = unidad base)
  px: number; // unit price autorizado
}

interface SupervisorAuthState {
  userId: string;
  token: string;
  issuedAt: number;
  reason: string;
  scope: SupervisorScopeEntry[];
}

let supervisorAuth: SupervisorAuthState | null = null;

/** Upsert por (pid, vid): la última autorización de una misma línea gana. */
export function mergeScope(
  prev: SupervisorScopeEntry[] | undefined,
  incoming: SupervisorScopeEntry[]
): SupervisorScopeEntry[] {
  const merged = new Map<string, SupervisorScopeEntry>();
  for (const e of prev ?? []) {
    merged.set(`${e.pid}::${e.vid ?? ''}`, e);
  }
  for (const e of incoming) {
    merged.set(`${e.pid}::${e.vid ?? ''}`, e);
  }
  return Array.from(merged.values());
}

export function setSupervisorAuth(
  userId: string,
  token: string,
  reason: string = '',
  scope: SupervisorScopeEntry[] = []
): void {
  supervisorAuth = {
    userId,
    token,
    issuedAt: Date.now(),
    reason,
    // Acumula el scope de autorizaciones previas de la sesión (mismo userId).
    scope: mergeScope(supervisorAuth?.userId === userId ? supervisorAuth?.scope : [], scope),
  };
}

export function getSupervisorAuth(): SupervisorAuthState | null {
  return supervisorAuth;
}

export function clearSupervisorAuth(): void {
  supervisorAuth = null;
}
