# REM-INV-4A — Security Classification (Gate I)

Fecha: 2026-09-13T15:45:21.943Z · Baseline: 5f927364 · Producción: READ-ONLY (zero-touch verificado) · Explotación: SOLO staging efímero PG17.6

## Resumen de clasificación

| ID | Finding | Clase | Severidad | Evidencia |
|----|---------|-------|-----------|-----------|
| F-04-A1 | `has_store_role` (2-arg y 3-arg): parámetros client-controlled (store_id, roles) NO influyen en identidad; identidad = `auth.uid()` (platform-controlled). Spoofing de usuario/tienda/rol/JWT NO alcanzable. | NO EXPLOITABLE | n/a | 07 §S-A..S-I; 08 |
| F-04-A2 | `create_sale_v2` §11: gate de supervisor (`has_store_role_as(p_supervisor_user_id, ...)`) con parámetro **client-supplied** + admin-bypass **tenant-blind** → descuento ≥15% aprobable sin credenciales de supervisor citando CUALQUIER UUID admin/superadmin (incluso cross-tenant). Requiere conocer un UUID admin (exposición vía UI/APIs de members) + ser usuario autenticado con membership de la tienda. | EXPLOITABLE (reproducida en staging) | **P1** — financial control bypass (discount approval); sin escalación de identidad completa ni cross-store write | 07 §D-SUPERVISOR-*; 08 D4/D5/D8 |
| F-04-A3 | `get_transferable_stores`: `p_user_id` client-supplied + `has_store_access_as` (admin bypass) → enumeración cross-user/cross-tenant de tiendas accesibles por otro usuario (filas `stores.*`). | EXPLOITABLE (reproducida en staging) | **P2** — information disclosure (metadata de tiendas), sin mutación | 07 §E-*; 08 E2/E3 |
| F-04-A4 | 4 RPCs de servicios (`distribute_service_cost_v2`, `link_receipts_to_service`, `set_received_service_status`, `void_received_service_with_reversal`): patrón `COALESCE(p_user_id, auth.uid())` SIN gate → `user_id` de audit_logs falsificable (atribución), pero autorización vía `has_store_access()` intacta. | EXPLOITABLE (attribution-only) | **P2** — falsificación de autoría en audit trail (no de autorización) | 04-auth-callers-live.txt; census-vuln-pattern.json |
| F-04-B1 | `audit_logs` ACL: anon+authenticated con `arwdDxtm` completo (DELETE/TRUNCATE/MAINTAIN incluidos). | PRIVILEGE EXISTS | P2 (hardening; explotabilidad limitada — ver B2) | 09-audit-logs-acl.tsv |
| F-04-B2 | Explotabilidad vía superficies cliente (PostgREST): DELETE/UPDATE **bloqueados por RLS** (sin policy → 0 filas); TRUNCATE **no expuesto** por PostgREST y 0 funciones lo ejecutan; MAINTAIN no expuesto. | BLOCKED (en superficie actual) | — | 12-audit-logs-staging-results.txt G5/G6/G7/G9 |
| F-04-B3 | **TRUNCATE**: el GRANT es el punto de control (RLS no cubre TRUNCATE — probado en staging G7/G9). Si cualquier ruta futura (nuevo RPC SECURITY INVOKER, insider SQL, trigger) ejecuta TRUNCATE como authenticated/anon → **destrucción completa del audit trail**. | LATENT (grant presente) | **P1-latent** (potencial pérdida total e irreversible del trail; no alcanzable hoy por cliente) | 12 G7/G9 |
| F-04-B4 | INSERT con `store_id` arbitrario (FK existe, sin check de membership) + action/metadata arbitrarios → **pollution** del audit trail (entradas falsas atribuidas al propio usuario). user_id foráneo sí bloqueado (WITH CHECK). | EXPLOITABLE (reproducida) | **P2** — integridad de autenticidad del trail (append-forgery) | 12 G2/G3/G4 |
| F-04-B5 | RLS SELECT: clerk no ve ni sus propias entradas (policies solo cubren admin/manager/encargado) — observación, no riesgo. | OBSERVATION | P3 | 12 G1 |
| F-04-A5 | Overload 3-arg `has_store_role`: EXECUTE concedido a PUBLIC/anon (REVOKE del fix H-7 no aplicado); cuerpo seguro (rama no-service usa auth.uid()) → exposición material nula. | HARDENING ONLY | P3 | 05-auth-grants.tsv; 08 S-A4 |

## Cadena de explotación demostrada (F-04-A2, §5)

```
ATTACKER: authenticated legítimo (clerk) de Store A, con membership válida
   ↓ CLIENT CONTROL
p_supervisor_user_id (parámetro del RPC create_sale_v2 — jamás verificado contra una sesión de supervisor)
   ↓ FUNCTION
has_store_role_as(p_supervisor_user_id, p_store_id, ['admin','manager'])
   → admin-bypass: profiles.role='admin' ⇒ TRUE sin membership y SIN filtro de tenant
   ↓ AUTHORIZATION DECISION
IF NOT has_store_role_as(...) → RAISE   →   con UUID admin: NO raise (falso positivo de autorización)
   ↓ DATABASE OPERATION
INSERT INTO transactions/sales con discount_pct ≥ 15% permitido
   ↓ BUSINESS IMPACT
Descuentos no autorizados por quien NO tiene autoridad de aprobación (control financiero evadido)
```

Cinco condiciones del §40: attacker controls input ✓ + input influences authorization ✓ + authorization false-positive ✓ + protected operation reachable ✓ + no downstream control blocks it ✓ (la app no re-verifica: checkout route pasa el UUID tal cual; zod solo valida formato UUID).

## P0 descartado
- No hay escalación de identidad completa (p_user_id de create_sale_v2 está gated; v_uid = auth.uid() en authenticated — probado D8).
- No hay cross-store WRITE (D7: ERR_UNAUTHORIZED en store ajena; §30 satisfecho).
- audit_logs: UPDATE/DELETE bloqueados por RLS hoy (G5/G6); TRUNCATE no alcanzable por cliente (PostgREST no lo expone; 0 RPCs). P0 requiere "irreversible destruction + reachable by unprivileged attacker" — reachability NO demostrada en superficie actual ⇒ F-04-B3 se clasifica P1-latent (control destruido si el grant persiste y aparece una ruta), no P0.
