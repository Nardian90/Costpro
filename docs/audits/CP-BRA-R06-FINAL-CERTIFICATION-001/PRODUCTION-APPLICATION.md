# PRODUCTION-APPLICATION — Aplicación productiva gobernada §11g

**Misión:** CP-BRA-R06-FINAL-CERTIFICATION-001 · **Producción:** CostproBD `wthkddeleylijmonclxg`
**Migración:** `20261128120000_cpbra_r06_reception_authorization.sql` · sha256 `be4a4c8d77bfbfa5442e6bc31f8d1ef42071c35ec816abeac70bab301476d575`

## Orden de la misión (FASE 7) — cumplido

Validada primero en la BD aislada CostproE2E (FASES 2-6: 10/10 gates + batería 40/40 + net delta 0). CI verde en PR #1739 (8/9; E2E Aislado PREEXISTING documentado) + revisión de diff sin secretos → **fusión `ebdce7ffa918c61c9ef404ac2cfc4a7de2c0194e`** → hash PRE → **aplicación §11g UNA SOLA VEZ** → POST → recarga PostgREST → re-exportación de superficie → divergencia cero.

## Canal gobernado

| Elemento | Valor |
|---|---|
| Script | `scripts/cpbra-r06-apply-prod.mjs` (guardProtected en `scripts/lib/writers.manifest.json`, `check-writers` OK) |
| Guard | `assert-not-production` con doble flag `ALLOW_PROD=read-only ALLOW_PROD_WRITE=I_UNDERSTAND` — autorización explícita impresa en la ejecución |
| Idempotencia | verificación PREVIA de marcas; re-ejecución posterior → «R-06 YA APLICADA en producción. Nada que hacer» + 23/23 marcas |
| Recarga | `NOTIFY pgrst, 'reload schema'` tras aplicar (mecanismo canónico) |

## PRE (capturado 2026-11-28, read-only contra producción)

```
helpers_presentes:        0   (is_superadmin_uid / can_create_reception / can_manage_reception NO existían)
policy_tenant_update:    1   (la política permisiva receipts_tenant_update VIVA)
body_hash_register_prev: 716f53d45efd75ce0f229c32ba37ed58
gate_previo_register:    true (register_reception usaba has_store_access_as — membresía cualquiera)
trigger_previo:          0   (trg_receipts_pin_creator NO existía)
--check:                 21/23 marcas ausentes (2 OK incidentales por sustrcadena) → migración NO aplicada
```

## EJECUCIÓN (UNA SOLA VEZ, post-fusión del PR #1739)

- **SQL ejecutado sin error** contra producción (Management API, canal gobernado).
- `NOTIFY pgrst 'reload schema'` enviado.
- **POST: 23/23 marcas OK** — helpers ×3, ACL sin PUBLIC/anon, gates ×10 RPC (register/ receive_against_po/ confirm/ void/ reverse/ delete/ save/ add_items/ update_items/ tasa), `RECEPTION_CONFIRMED_PENDING` en BD, viejo gate `has_store_access_as` RETIRADO, trigger `trg_receipts_pin_creator` + `ERR_CREATOR_IMMUTABLE`, políticas ×4 (insert encargado · update creador · tenant_update retirada · delete pendiente+creador · items insert encargado).
- **body_hash `register_reception`: PRE `716f53d45efd75ce0f229c32ba37ed58` → POST `defd4c2ad8406321705b1b9af86d26e0`** (evidencia del cambio de barrera).
- Re-ejecución `--check` posterior → «R-06 YA APLICADA… Nada que hacer» + 23/23 (idempotencia demostrada; PRE de la re-ejecución ya muestra `helpers_presentes: 1`, `policy_tenant_update: 0`, `gate_previo_register: false`, `trigger_previo: 1`).

## Superficie y contratos tras la aplicación

| Verificación | Resultado |
|---|---|
| `export-contract-surface.cjs` (LIVE) | **re-exportado: 233 funciones, sha256 `6a92596ef8a2c8ce405063f0d749cf89a7d1412b2be327a07e6c03f909b534b9`** |
| `security-contract-test-static.cjs` | **0 divergencias bloqueantes** (3 warnings MEDIUM/LOW preexistentes, semántica idéntica) |
| Allowlist | **10 entradas BODY_DRIFT RETIRADAS** (drift LIVE-vs-replay resuelto al aplicar + re-exportar; patrón pay_commission/7). Nueva entrada documentada: `create_sale_v2/36` (LIVE_FUNCTION_NOT_REPRESENTED) por trabajo CONCURRENTE del propietario sin fusionar (rama `fix/srv-payment-date-delivery-report-filters` — misma raíz de los fallos PREEXISTING de E2E Aislado); se retira al fusionar su rama |
| `build-migrations-replay.mjs --check` | **MATCH** (digest `d4cbb55512e35168…`, sin deriva; posición 225/225) |
| `check-writers.mjs` | OK (escritores declarados) |
| Guardrail E2E | `PASS — net delta = 0` (run CI del PR) |

## Evidencia de aislamiento previa (CostproE2E)

- Aplicación aislada verificada (FASE 2-4): 10/10 RPC con gate nuevo, 0 residuales del viejo (`pg_get_functiondef`), trigger presente, 4 políticas endurecidas, ACL canónica.
- Batería E2E 40/40 PASS + guardrail `PASS — net delta = 0` (R06-TEST-EVIDENCE.md).
