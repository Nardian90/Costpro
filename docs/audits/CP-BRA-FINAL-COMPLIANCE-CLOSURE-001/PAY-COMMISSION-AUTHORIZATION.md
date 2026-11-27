# PAY-COMMISSION-AUTHORIZATION — Autorización de pagos de comisiones (§0.2)

**Misión:** CP-BRA-FINAL-COMPLIANCE-CLOSURE-001 · **Fecha:** 2026-11-27 · **Rama:** `fix/finance-commission-store-roles-20261127`
**Fuente normativa:** decisión expresa del propietario §0.2 (misión, vinculante) · Regla: FIN-014 · Familia HR (comisiones)

---

## 1. Decisión del propietario (§0.2 — vinculante)

> **AUTORIZADOS admin, manager y encargado.** Los roles `admin`, `manager` y `encargado` podrán pagar comisiones dentro de su tienda, siempre que se cumplan las demás condiciones de negocio. Los roles clerk y usuario ordinario no podrán hacerlo. La autorización debe verificarse en el servidor y en la barrera autoritativa de base de datos cuando corresponda. No basta con ocultar botones ni con validar roles exclusivamente en React. Conserva la coherencia con el modelo de permisos multitienda de COSTPRO (compat de administración de plataforma, sin privilegios implícitos).

## 2. Auditoría del flujo (§5.2) — todos los caminos que pueden pagar una comisión

| Camino | Estado previo | Veredicto |
|---|---|---|
| RPC `pay_commission` (ACL **authenticated** + SECURITY DEFINER) | gate interno `has_store_role_as(admin) OR has_store_role_as(manager)` — **sin encargado**; regla de actor `p_user_id` SOLO para `service_role` (anti-spoofing correcta) | **DEFECTO vs §0.2**: el encargado era rechazado por la barrera DB |
| `PATCH /api/commissions/payments/[id]` (action='pay') | gate por **rol GLOBAL** (`isAdminLevel(role) \|\| role==='manager'`) ANTES del RPC | **DEFECTO vs §0.2**: un encargado con membresía de tienda (rol global clerk) recibía 403 sin llegar a la barrera |
| `POST /api/accounts-payable/bulk-pay` (rama commission) | RPC vía cliente de sesión (actor preservado) + **fallback legacy a UPDATE directo** si el RPC no existe | **DEFECTO (FIN-014)**: bypass del protocolo del cajón (sin advisory ni guard físico; RLS de rol global) |
| Llamadas directas al RPC desde el cliente (Supabase REST) | ACL authenticated permite invocar; el cuerpo impone el gate de rol real | Barrera en BD — correcta por diseño (con el gate corregido) |
| Jobs/procesos internos | Ninguno identificado | — |

RLS `commission_payments` UPDATE: `is_admin() OR (membresía activa Y perfil rol global admin|manager)` — cubre approve/cancel (sin decisión del propietario: sin cambios).

## 3. Remediación (§5.3)

1. **Migración `20261127150000_cpbra_pay_commission_encargado.sql`** — re-emisión del RPC con cuerpo **byte-idéntico salvo el gate** (verificado programáticamente: 89 líneas de código vivo → 94 con el gate nuevo):
   - Gate nuevo (patrón canónico R-05, el MISMO helper que autoriza la confirmación de ajustes de inventario):
     `IF NOT public.has_store_role_as(v_uid, v_comm.store_id, ARRAY['admin', 'manager', 'encargado']::text[]) THEN RAISE EXCEPTION 'ERR_FORBIDDEN_ROLE: pagar comisiones requiere rol de gestión (admin, manager o encargado)';`
   - Intacto: actor (`auth.role()='service_role' → COALESCE(p_user_id, auth.uid()) ELSE auth.uid()`), advisory `pg_advisory_xact_lock(hashtext(tienda))`, guard físico de moneda para efectivo (`ERR_INSUFFICIENT_CURRENCY`), idempotencia natural (paid → `idempotent_replay:true`), gate de estado (`approved|draft` → paid; `ERR_COMMISSION_STATE_CHANGED`), fechas (`ERR_PAYMENT_DATE_FUTURE`), normalización zelle CP-FIN-004.
   - ACL invariante re-declarada: REVOKE PUBLIC/anon; GRANT authenticated, service_role.
   - Guards `PC-GUARD` (firma certificada 7 args) + `PC-VERIFY` fail-closed: gate de tres roles EN CÓDIGO (sin comentarios), rechazo, advisory, guard físico, idempotencia, gate de estado, regla de actor, ACL — **7/7 marcas**.
2. **`/api/commissions/payments/[id]`** — gate reubicado tras el contexto de tienda y **por acción**:
   - `action === 'pay'` → `canManageStore(session.user, storeId)` (membresía activa admin/manager/encargado en LA TIENDA + compat admin global — canon `roles.ts:137`).
   - `approve`/`cancel` → política vigente SIN cambios (FIX-C3 rol global + RLS) — sin decisión del propietario que los modifique.
   - La barrera final sigue siendo la BD: el RPC re-verifica rol, tienda, estado y cajón por sí mismo (SECURITY DEFINER con el gate).
3. **`/api/accounts-payable/bulk-pay`** — fallback legacy a UPDATE directo **eliminado** (FIN-014): un entorno sin el RPC es un fallo de despliegue que falla POR ÍTEM, jamás se consolida por la vía silenciosa.

## 4. Pruebas (§5.4) — batería E2E 15/15 vía API real en CostproE2E

| # | Caso | Resultado |
|---|---|---|
| A1 | Admin de tienda (membresía) paga | 200 + paid, paid_by = usuario real |
| A2 | Manager paga | 200 + paid |
| A3 | **ENCARGADO paga** (cierre §0.2) | 200 + paid (antes: 403/ERR_FORBIDDEN_ROLE) |
| R1 | Clerk | 403 sin pago |
| R2 | Usuario ordinario | 403 sin pago |
| R3 | Manager de otra tienda (activo en B, comisión en A) | 404 sin fuga |
| R4 | Sin sesión | 401 |
| N1 | Comisión inexistente | 404 |
| N2 | Comisión ya pagada | replay idempotente, paid_by original intacto |
| N3 | Reintento duplicado (dos PATCH) | UNA fila paid, paid_by del primer pago |
| C1 | Dos pagos simultáneos | advisory serializa, UNA fila paid |
| M1 | **Spoofing de actor**: clerk invoca el RPC directo con `p_user_id` del manager | `ERR_FORBIDDEN_ROLE` — `p_user_id` NO concede privilegios a authenticated |
| M2 | **Manipulación de tienda**: manager B vía RPC directo sobre comisión de A | `ERR_FORBIDDEN_ROLE` (barrera por membresía de tienda) |
| F1 | Guard físico: efectivo con caja vacía | 422 `ERR_INSUFFICIENT_CURRENCY` — protocolo del cajón intacto |
| AUD1 | Auditoría del actor real | paid_by = admin/manager/encargado reales + método registrado |

**Incidente de higiene resuelto:** 2 corridas con fixtures crasheados (índice único worker+período y constraint de exclusión NO OVERLAP) dejaron 18 usuarios residuales porque `setupFixtures()` lanzaba antes del `try` (teardown nunca ejecutado). Limpieza gobernada (comisiones por FK → `e2e_hard_delete_user` ×18) y batería corregida (teardown garantizado + borrado de comisiones por `approved_by/paid_by` + períodos escalonados sin solape). Guard final: **PASS — net delta = 0**.

**Contrato estático:** `cpbra-pay-commission-migration.test.ts` — 11 casos (gate tres roles EN CÓDIGO, cajón intacto, actor, ACL, único cambio vs cuerpo vivo, sin edición de histórico fuera del RPC, guards, replay 222). Suite local 43/43.

## 5. Reglas de negocio afectadas (CP-BRA-001)

`FIN-014` (certificada por decisión §0.2 — esta misión) · `SEC-002/SEC-003` (barrera server-side + DB con regla de actor anti-spoofing preservada) · `HR` (comisiones: política de roles decidida).

## 6. Aplicación y despliegue

- Aislada (CostproE2E): aplicada una vez (`scripts/e2e/cpbra-pc-apply-e2e.mjs`, guard aislamiento, NOTIFY pgrst, idempotente — POST **7/7 marcas**).
- Producción: **pendiente** — protocolo gobernado §11g tras revisión del PR, CI verde y verificación de contratos (script guardProtected + doble flag, misma mecánica R-05/R-26/R-03).

## 7. Riesgos residuales

1. `approve`/`cancel` conservan el gate por rol GLOBAL (sin decisión del propietario sobre esos actos; el RLS de `commission_payments` los cubre). Si el propietario decide autorizar encargado para aprobar/cancelar, es un cambio de una línea + batería.
2. `mixed` como método no participa del físico (gap contable PREEXISTENTE, documentado en el cuerpo del RPC — residual del módulo caja).
