# PRODUCTION-APPLICATION — Aplicación productiva gobernada §11g

**Misión:** CP-BRA-R06-FINAL-CERTIFICATION-001 · **Producción:** CostproBD `wthkddeleylijmonclxg`
**Migración:** `20261128120000_cpbra_r06_reception_authorization.sql` · sha256 `be4a4c8d77bfbfa5442e6bc31f8d1ef42071c35ec816abeac70bab301476d575`

## Orden de la misión (FASE 7)

Validada primero en la BD aislada CostproE2E (FASES 2-6: verificación 10/10 gates + 40/40 batería + net delta 0). La aplicación productiva sigue el orden prescrito: **CI verde + revisión de diff → fusión del PR → hash PRE → migración §11g UNA SOLA VEZ → verificación POST → recarga PostgREST → re-exportación de superficie → registro de divergencia cero.** El expediente se completa con los resultados POST tras la ejecución.

## Canal gobernado

| Elemento | Valor |
|---|---|
| Script | `scripts/cpbra-r06-apply-prod.mjs` (guardProtected en `scripts/lib/writers.manifest.json`, `check-writers` OK) |
| Guard | `scripts/lib/assert-not-production.mjs` — doble flag: `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND` |
| Idempotencia | verificación PREVIA de marcas: si helpers + trigger están, SE SALTA (re-ejecutable con `--check`) |
| Recarga | `NOTIFY pgrst, 'reload schema'` tras aplicar (mecanismo canónico) |

## PRE (capturado 2026-11-28, read-only contra producción)

```
helpers_presentes:        0   (is_superadmin_uid / can_create_reception / can_manage_reception NO existen)
policy_tenant_update:    1   (la política permisiva receipts_tenant_update sigue VIVA)
body_hash_register_prev: 716f53d45efd75ce0f229c32ba37ed58
gate_previo_register:    true (register_reception aún usa has_store_access_as — membresía cualquiera)
trigger_previo:          0   (trg_receipts_pin_creator NO existe)
--check:                 23 marcas evaluadas → 21 FAIL (2 OK incidentales: la política update
                         vigente ya contenía 'user_id = auth.uid()' y la delete 'pending' como
                         sustrcadena) → migración NO aplicada (estado pre-R-06 confirmado)
```

## POST (marcas obligatorias tras la aplicación — re-ejecutables con `--check`)

`helper_superadmin_uid` · `helper_can_create` · `helper_can_manage` · `acl_helpers_sin_public` · `gate_register` · `gate_receive_against_po` · `gate_confirm` · `audit_confirm_en_bd` · `gate_void` · `gate_reverse` · `gate_delete_draft` · `gate_save_draft` · `gate_add_items` · `gate_update_items` · `gate_tasa` · `viejo_gate_register_retirado` · `trigger_pin_creator` · `trigger_inmutable` · `policy_insert_encargado` · `policy_update_creador` · `policy_tenant_update_retirada` · `policy_delete_pendiente` · `policy_items_insert_encargado` — **23/23**.

## Evidencia de aislamiento previa (CostproE2E)

- Aplicación aislada verificada (FASE 2-4): 10/10 RPC con gate nuevo, 0 residuales del viejo (`pg_get_functiondef`), trigger presente, 4 políticas endurecidas, ACL canónica.
- Batería E2E 40/40 PASS + guardrail `PASS — net delta = 0` (R06-TEST-EVIDENCE.md).

## Resultado de la ejecución productiva

_(se consigna tras la ejecución §11g: fecha/hora UTC, body_hash POST de `register_reception`, marcas 23/23, superficie re-exportada + divergencia cero)_
