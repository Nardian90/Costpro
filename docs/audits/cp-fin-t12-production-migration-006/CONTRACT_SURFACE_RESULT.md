# CONTRACT_SURFACE_RESULT.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 · Mecanismo oficial: `scripts/export-contract-surface.cjs` (regeneración LIVE) + `scripts/security-contract-test-static.cjs` (replay CI-safe)

## 1. Excepción temporal aplicada en la misión 005

`ci-gate-allowlist.json` → `source_of_truth_baseline` contenía `fin_post_document_annulment/2` con la regla `BODY_DRIFT_FROM_MIGRATION`:

> «PR #1628 … migración 20261115100000 redefine fin_post_document_annulment con el guard T12 … CON AUTORIZACIÓN PENDIENTE — producción no se toca hasta que el propietario aplique la migración por el cauce normal. El replay del PR diverge del surface certificado (vivo) hasta esa aplicación; al aplicarla se REGENERARÁ el surface y se RETIRARÁ esta excepción…»

La aplicación de T12 en producción (misión 006) es exactamente el hecho que la excepción anticipaba.

## 2. Regeneración del surface (LIVE, solo lectura)

- Ejecutado `node scripts/export-contract-surface.cjs` contra producción (`wthkddeleylijmonclxg`): **208 funciones**, `sha256 = b15b9d2c85ee29fe918374ac10e473ff7410518d0d1fe399c0a529390585829f`.
- El surface vivo ahora certifica la versión **T12** de `fin_post_document_annulment` (la misma que el replay de `20261115100000`).

## 3. Comprobación de coincidencia código ↔ migración ↔ producción

| Comparación | Resultado |
|---|---|
| Definición viva (`pg_get_functiondef`) vs cuerpo del archivo `20261115100000` | **idéntica** (hash de cuerpo `$function$` — control B3 de m056: PASS) |
| Replay estático (Capa C) con surface regenerado | **208/208 representadas · 0 divergencias bloqueantes** · `CONTRATO OK` (exit 0) |
| Definición viva vs migración aplicada (ledger sha256) | idéntica por construcción (el cuerpo se aplicó verbatim del archivo con SHA aprobado) |

## 4. ¿Puede eliminarse la excepción temporal?

**SÍ.** Verificado en árbol de trabajo: con el surface regenerado, la eliminación de la entrada `fin_post_document_annulment/2` mantiene el replay en **0 divergencias bloqueantes** y el contrato en OK.

**Consumidores de la excepción**: uno solo — `scripts/security-contract-test-static.cjs` (Capa C). Ningún workflow ni otro script la consume.

**Acción ejecutada (rama de PR, no en `main`)**: `ci-gate-allowlist.json` — eliminada SOLO la entrada `fin_post_document_annulment/2`. La entrada `create_devolution_v2/12` del PR #1616 **NO se elimina** (no está justificada por esta migración; su retirada corresponde al flujo propio de esa migración/nota del propietario — se observa además que su migración `20261114140000` ya figura aplicada en el libro, por lo que su re-evaluación debería considerarse en una misión propia).

## 5. Estado final

- Excepción temporal de T12: **RETIRADA** en la rama del PR de esta misión (con la regeneración del surface en el mismo PR).
- El test estático local con la allowlist modificada: **CONTRATO OK, 0 divergencias** (2 warnings MEDIUM/LOW preexistentes de frescura de firmas sobre `cancel_transfer` y `reset_store_data` — idénticos antes y después de esta misión; no bloqueantes y ajenos a T12).
- CI del PR ejecutará el mismo replay sin secretos (Capa estática).
