# R-06 — IMPLEMENTACIÓN (FASES 2-4)

**Migración:** `supabase/migrations/20261128120000_cpbra_r06_reception_authorization.sql` (posición 225 del stream, manifiesto digest `d4cbb555…`).
**Rama:** `fix/receipts-encargado-creator-ownership-20261128` · **Técnica:** re-emisión programática de los cuerpos VIVOS (`pg_get_functiondef` de la BD aislada, espejo de producción) con reemplazo EXACTO del bloque de autorización — todo lo demás byte-idéntico (verificado por tests de contrato estáticos que exigen presencia del gate nuevo y ausencia del viejo SIN comentarios).

## Componentes

1. **Helpers canónicos** (única fuente de verdad R-06):
   - `is_superadmin_uid(uuid)` — variante por-uid del canónico `is_superadmin()` (misma tabla/predicado `profiles.role='superadmin'`), para contextos service_role.
   - `can_create_reception(uuid, uuid)` — encargado exacto con membresía activa \| superadmin (SIN bypass de admin).
   - `can_manage_reception(uuid, uuid, uuid)` — creador + membresía activa \| superadmin; NULL/centinela → solo superadmin.
   - ACL: REVOKE PUBLIC/anon + GRANT authenticated,service_role.
2. **Gates en 10 RPC** (ver R06-CREATION-PERMISSIONS.md / R06-CONFIRMATION-CANCELLATION.md).
3. **Trigger `receipts_pin_creator`** (BEFORE INSERT OR UPDATE OF user_id): identidad del servidor en INSERT de clientes autenticados; inmutabilidad total en UPDATE.
4. **RLS endurecida**: insert = encargado\|superadmin; update = creador\|superadmin (retirada la policy tenant-update permisiva); delete = creador\|superadmin + pending; receipt_items insert = encargado\|superadmin. SELECT sin cambios (lectura para miembros).
5. **Auditoría transaccional (§ FASE 5):**
   - `confirm_pending_reception` ahora escribe `RECEPTION_CONFIRMED_PENDING` (antes no dejaba entrada en BD): actor real, tienda, recepción, estados previo/nuevo, creador original, fuente de autorización (`creator_membership` \| `platform_superadmin`), bandera `superadmin_global`, fecha efectiva, conteo de líneas.
   - `void_pending_reception` / `reverse_receipt_v2` / `register_reception` extienden su entrada existente con `authorization_source`, `creator_id`, `superadmin_global` (y estados previo/nuevo en void).
   - Catálogo de acciones existente respetado (nomenclatura idéntica a `RECEPTION_VOIDED_PENDING`); consistencia transaccional (INSERT dentro de la transacción del propio RPC).
6. **Rutas** (`src/lib/reception-authorization.ts`): `sessionCanCreateReception` / `sessionCanManageReception` — 403 accionables; BD re-verifica.
7. **UI** (`src/lib/roles.ts` + vistas): `canCreateReceptionInStore`, `canManageOwnReception` (+ `RECEPTION_NULL_CREATOR_SENTINEL`); botones alineados; nota de contexto de tienda para superadmin; submit del formulario gated con mensaje claro.
8. **Compatibilidad:** manifiesto replay regenerado 224→225 (MATCH), tests de conteo/posición actualizados, 5 specs E2E históricos adaptados al actor encargado (la política cambia quién puede crear — documentado por caso).

## Restricciones respetadas

- Sin cambios de cálculo/imports/totales/estados/flujo financiero (cuerpos byte-idénticos).
- Sin segunda fuente de verdad de roles (helpers consumen profiles/user_store_memberships igual que los canónicos).
- Grants/SECURITY DEFINER/search path revisados; ACL idempotente (REVOKE antes de GRANT).
- La migración NO toca datos históricos (solo DDL de funciones/trigger/policies).
