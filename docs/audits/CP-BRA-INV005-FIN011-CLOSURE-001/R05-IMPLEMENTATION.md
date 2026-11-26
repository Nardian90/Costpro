# R05-IMPLEMENTATION — Implementación del primer incremento de la alternativa A (R-05/INV-005)

**Misión:** CP-BRA-INV005-FIN011-CLOSURE-001 (Línea A) · **Fecha:** 2026-11-26
**PR:** #1723 — `fix(inventory): enforce role-based adjustment confirmation` · **NO FUSIONADO** (pendiente de aprobación expresa del propietario)
**Base documental:** `docs/audits/CP-BRA-FINAL-VERIFICATION-AND-INV005-001/DECISION-R05.md` (alternativa A; umbrales/doble autorización/motivo obligatorio = incremento 2 de la opción C, decisiones reservadas al propietario — NO implementados aquí)

---

## 1. Roles válidos demostrados en el modelo real (misión §2.2)

| Fuente | Evidencia |
|---|---|
| BD — `user_store_memberships.role` | TEXT (sin enum); valores en operación: encargado (11), clerk (6), admin (4), usuario (1) en producción; admin/encargado/clerk en el aislado |
| BD — patrón canónico de gestión | `can_admin_reverse_transaction` (20261027120000): `is_admin_check(actor) OR membresía activa IN (admin,manager,encargado)` |
| BD — función granular existente reutilizada | `has_store_role_as(uid, store, roles[])` (20260807000002, STABLE SECURITY DEFINER): bypass `profiles.role IN (admin,superadmin)` + membresía activa con rol ∈ roles EN ESA tienda |
| Frontend — patrón `canManageStore` | `src/lib/roles.ts`: admin/superadmin global OR membresía activa `['encargado','manager','admin']` EN la tienda |
| Frontend — roles de ajustes | `DOCUMENT_REVERSE_ROLES.adjustment = ['admin','manager','encargado']` (`canReverseDocumentInStore`) — el gate que el botón Revertir YA tenía |

**Conclusión:** `encargado`, `manager` y `admin` son roles válidos con capacidad de gestión (confirmados en BD y en el modelo frontend; no se inventó ningún rol). `clerk`, `warehouse`, `usuario`, `costo` quedan fuera. El caso histórico del encargado permanece compatible.

## 2. Cambio server-side (migración `20261126170000_cpbra_r05_adjustment_confirmation_role_guard.sql`)

- `confirm_inventory_adjustment` reemitido con la MISMA firma `(uuid, uuid)` + `RETURNS JSONB` + SECURITY DEFINER + `search_path` + ACL certificada (REVOKE PUBLIC/anon; GRANT authenticated, service_role) — **el contrato de superficie no cambia de forma**.
- **Autorización (única variante):** sustituye `is_admin_check OR has_store_access_as` (cualquier membresía activa — el hueco) por:
  ```sql
  IF NOT public.has_store_role_as(v_caller_uid, v_adj.store_id, ARRAY['admin','manager','encargado']::text[]) THEN
    RAISE EXCEPTION 'ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED: ...';
  END IF;
  ```
  Una sola fuente de verdad (sin funciones paralelas). Fail-closed: NULL → rechazo; otra tienda → rechazo; clerk/warehouse/usuario/costo → rechazo.
- **Auditoría transaccional (misión §2.4):** `INSERT INTO audit_logs (user_id, action='ADJUSTMENT_CONFIRMED', table_name='inventory_adjustments', record_id, old_data={status pending}, new_data={status, items_applied, items[{product_id, expected, counted, deviation}], source_physical_inventory_id, kardex_reason}, store_id)` DENTRO de la misma transacción — un fallo del INSERT revierte TODA la confirmación (sin confirmación silenciosa). La fila es reconstruible: tienda, actor, ajuste, fecha (created_at), operación, resultado y contexto por ítem.
- **INVARIANTES preservados:** kardex verbatim (`movement_type='adjustment'`, `p_unit_cost := 0`), cálculo de diferencias verbatim, máquina de estados verbatim (`ERR_ADJUSTMENT_NOT_FOUND`, `ERR_NOT_PENDING`, `FOR UPDATE`), rama service_role verbatim.
- **Guards fail-closed de la propia migración:** `R05-GUARD` (exige firma previa) y `R05-VERIFY` (exige guard+auditoría en el cuerpo, detecta persistencia del hueco comparando CÓDIGO sin comentarios — lección del primer intento, que abortó con rollback atómico completo), verificación de ACL.
- **Contrato de superficie:** drift LIVE-vs-replay declarado en `ci-gate-allowlist.json` → `source_of_truth_baseline` `confirm_inventory_adjustment/2` (BODY_DRIFT_FROM_MIGRATION, expira 2026-12-31, patrón `register_supplier_payment/12`). Se RETIRA tras aprobación + deploy §11g + re-certificación del surface.

## 3. Alineación de interfaz (misión §2.5 — la UI no es el control)

| Vista | Cambio |
|---|---|
| `InventoryAdjustmentsView.tsx` (tarjetas) | Botón Confirmar: habilitado solo con `canConfirmAdj` (= `canReverseDocumentInStore(user, storeId, 'adjustment')`); deshabilitado con tooltip «No autorizado: la confirmación requiere rol de gestión…» y `aria-label` explícito — la consulta del ajuste permanece |
| `InventoryAdjustmentsView.tsx` (tabla) | Mismo gate en `TablaAjustes` (prop `canConfirmAdj` nueva) |
| `PhysicalInventoryDetail.tsx` (panel de ajustes PI) | El `canAuthorize` del padre (admin/manager/encargado) AHORA pasa al `AdjustmentsPanel` (`canConfirm`) y gatea el botón «Confirmar y aplicar»; estado alternativo visible «Confirmación restringida a gestión» |
| Handlers RPC | `ERR_ADJUSTMENT_CONFIRMATION_NOT_ALLOWED` mapeado a mensaje comprensible en ambos llamadores; `ERR_NOT_PENDING` con mensaje de refresco |

## 4. Pruebas (detalle en R05-TEST-EVIDENCE.md)

- Contrato de migración (Vitest estático): 15/15 PASS.
- Coherencia UI↔RPC (caso 14 de la misión): 5/5 PASS.
- Batería E2E de autorización en CostproE2E: 16/16 PASS (13 casos de misión §2.6 + integridad de stock/kardex/auditoría + limpieza baseline) — `scripts/e2e/cpbra-r05-authorization-battery-e2e.mjs`, re-ejecutable, con guard de aislamiento y limpieza canónica (RPC oficial `e2e_hard_delete_user`, triggers de auditoría desactivados/reactivados con verificación).
- Migración aplicada en la instancia aislada (PRE/POST verificados). **NO aplicada a producción.**

## 5. Límites respetados (misión §2.7)

- Sin umbral 15 % ni límite monetario; sin doble autorización automática; sin cambio del cálculo de diferencias ni del kardex; sin alterar ajustes históricos; sin eliminar capacidades legítimas (el único caso histórico fue hecho por `encargado`, que pasa el control).
