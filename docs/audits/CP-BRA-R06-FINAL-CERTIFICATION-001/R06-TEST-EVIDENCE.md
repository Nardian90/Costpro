# R-06 — EVIDENCIA DE PRUEBAS

## 1. Batería E2E conductual (BD aislada CostproE2E)

**Spec:** `e2e/creation/r06-reception-authorization.spec.ts` — ejecución 2026-11-28, `E2E_ALLOW_CREATION=1 E2E_ISOLATION=1 npm run test:e2e:creation`.

**Resultado: 40/40 PASS · guardrail `data-hygiene-guard` → «PASS — net delta = 0».**

Flujos reales: RPC con Bearer del usuario (navegador online), ruta POST `/api/inventory/receptions` (SyncEngine), PostgREST como el navegador (borradores), PATCH de items.

| Caso | Resultado |
|---|---|
| 1 encargado activo crea (RPC+ruta 201) | PASS |
| 2 encargado sin membresía → ERR_FORBIDDEN_ROLE | PASS |
| 3 almacenero → rechazo | PASS |
| 4 facturadora/clerk → rechazo (rol real clerk) | PASS |
| 5 clerk RPC+ruta 403 ERR_FORBIDDEN_ROLE | PASS |
| 6 manager → rechazo | PASS |
| 7 admin de tienda → rechazo | PASS |
| 7b admin de plataforma → rechazo (≠ superadmin) | PASS |
| 8 encargado de B creando en A → rechazo | PASS |
| 9 anónimo → rechazo | PASS |
| 10 superadmin crea global sin membresía (identidad propia) | PASS |
| 11 manipulación store_id → ERR_FORBIDDEN_ROLE | PASS |
| 12 p_user_id ajeno ignorado; creador = identidad autenticada | PASS |
| 13 cambio de creador → trigger ERR_CREATOR_IMMUTABLE; fila intacta | PASS |
| 14 creador confirma propia | PASS |
| 15 creador anula propia (void) | PASS |
| 16 otro encargado confirma ajena → ERR_UNAUTHORIZED; intacta | PASS |
| 17 admin de tienda anula ajena → rechazo | PASS |
| 18 manager confirma ajena → rechazo | PASS |
| 19 almacenero confirma ajena → rechazo | PASS |
| 20 clerk anula ajena → rechazo | PASS |
| 21 creador con membresía revocada → rechazo | PASS |
| 22 superadmin confirma ajena | PASS |
| 23 superadmin revierte ajena confirmada | PASS |
| 24 superadmin interviene otra tienda (B) | PASS |
| 25 anónimo RPC directo → rechazo | PASS |
| 26 suplantación p_user_id=creador por clerk → rechazo | PASS |
| 27 histórico sin creador (NULL) → solo superadmin | PASS |
| 28 confirmación concurrente: 1 gana, 1 movimiento | PASS |
| 29 anulación concurrente: 1 success + 1 idempotent | PASS |
| 30 reintento: ERR_RECEIPT_ALREADY_CONFIRMED / void idempotente | PASS |
| 31 pagos vivos → ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS | PASS |
| 32 pago sin reversión bloquea reversión | PASS |
| 33 anulada→confirmar rechazado | PASS |
| 34 active→void ERR_INVALID_STATUS (reversión obligatoria) | PASS |
| 35 re-confirmar no duplica movimientos | PASS |
| 36 doble confirmación rechazada | PASS |
| 37 CxP: contra-pago oficial → reversión limpia | PASS |
| 38 auditoría creador: RECEPTION_CONFIRMED_PENDING (creator_membership, creator_id, estados) | PASS |
| 39 auditoría superadmin: platform_superadmin + superadmin_global (confirm y void) | PASS |

## 2. Tests unitarios (contrato estático de la migración)

`src/__tests__/migrations/cpbra-r06-reception-authorization-migration.test.ts` — **14/14 PASS**: transaccionalidad, helpers (sin bypass admin en creación; centinela histórico; sin rol encargado sobre propia), gates nuevos presentes/viejos ausentes en los 10 RPC, mecánica certificada intacta (validate_operation_date, fn_recalc_wac, FOR UPDATE, guard de pagos vivos, ERR_ALREADY_VOIDED), trigger (identidad+inmutabilidad), RLS (4 políticas), ACL, manifiesto posición 225/total 225.

Afectados re-verificados: replay-unblock **7/7**, cpbra-pay-commission/tp/r26/r03 **60/60** totales, recepciones-borradores/cp-recep001/useReceptionState-tenant-rls **49/49**.

## 3. Regresión de specs históricos (adaptados a la política)

- `receipts-integrity` (13 escenarios de integridad económica) — adaptado al actor encargado.
- `cp-log-unification-receptions-pos` — adaptado.
- `master-catalog-receptions-sync` — **6/6 PASS** tras adaptar auditoría por acción+SKU (el actor de la recepción cambió de admin a encargado).
- `reception-import-name-authority`, `reception-master-catalog-integrity` — adaptados; el caso 18(c) del segundo (clerk creando con new_product) ahora es rechazado ANTES por `ERR_FORBIDDEN_ROLE` (gate de creación precede al permiso de crear maestros — el rechazo A5 del rol de maestro sigue demostrado en (a)/(b) y «nada se creó» en (d)).

## 4. Verificación de la barrera de BD (aislada)

- 10/10 RPC con gate nuevo, 0 residuales del viejo (`pg_get_functiondef` verificado).
- Trigger `trg_receipts_pin_creator` presente; políticas receipts (DELETE/INSERT/SELECT/UPDATE) endurecidas.
- `is_superadmin_uid`, `can_create_reception`, `can_manage_reception` presentes con ACL canónica.

## 5. Restricciones

- Los tests destructivos corrieron SOLO contra CostproE2E (guard `assert-isolated-db` fail-closed en todos los helpers).
- Higiene: net delta 0 en las corridas finales (limpieza canónica `e2e_hard_delete_user` + sweep global).
- Incidente documentado: CI del propietario (rama `srv-payment-date-delivery-report-filters`) ejecutó E2E Aislado CONCURRENTE sobre la misma BD aislada (19:14Z 2026-11-27) durante la ventana local; la limpieza de residuos propios pudo afectar 2 usuarios de ese run ajeno.
