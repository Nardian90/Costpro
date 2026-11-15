# SQL_DB_GATE_FINAL_EVIDENCE.md — CP-FIN-T12-PR-CLOSE-007

Fecha: 2026-11-16 · Fase: resolución del único check pendiente del PR #1630 · Modo: **diagnóstico y corrección de configuración segura; ninguna operación de escritura en producción**

## 1. Veredicto

**El check «SQL DB Security Checks» del PR #1630 es GREEN en el SHA `f62a5114c1e6c645489dd63236188a35602210dc` (run 43749788398, job 132920985880).**

La hipótesis documentada en la misión 006 («falta de disponibilidad de `DATABASE_URL` en eventos `pull_request`») quedó **DESCREDITADA por la evidencia** de los runs de este PR: el fallo real era un hallazgo legítimo del gate (una función nueva sin clasificar), resuelto por el mecanismo de configuración previsto del repositorio (allowlist), sin desactivar ni degradar ningún control.

## 2. Corrección del diagnóstico (evidencia)

### 2.1 Lo que documentó la misión 006

`CP_FIN_T12_PRODUCTION_REPORT.md` §L clasificó el fallo como «preexistente: secret vacío» citando el run #264 (2026-11-14, PR ajeno) con el error idéntico «DATABASE_URL no está configurado». Ese precedente era real, pero **no era la causa del fallo en los runs de este PR**.

### 2.2 Evidencia directa de los dos runs fallidos del PR (2026-11-15)

| Run | SHA | Evento | Hora (UTC) | Evidencia clave |
|---|---|---|---|---|
| 43714964713 | `308b3a1ac` | pull_request | 12:39:32 | `DATABASE_URL: ***` enmascarado en el env del paso → el secret **existe y está disponible**; psql conectó y devolvió 116 hallazgos con canario |
| 43715439509 | `a0a17dbcb` | pull_request | 12:45:16 | idéntico: secret disponible, gate live ejecutado completo |

En ambos logs aparece el mismo resultado del evaluador:

```
❌ secdef_no_auth: 116 hallazgo(s), 115 en allowlist, 1 NO permitidos
     ❌ fin_entry_reversal_residual (p_entry_id uuid)
✅ secdef_public_grant: 0 hallazgo(s), 0 en allowlist, 0 NO permitidos
✅ tables_no_rls: 0 hallazgo(s), 0 en allowlist, 0 NO permitidos
```

Un resultado con 116 hallazgos parseados y canario presente **prueba que `psql "$DATABASE_URL" -f scripts/ci-gate-checks.sql` se ejecutó completo contra la BD** (con `ON_ERROR_STOP=1` cualquier error habría abortado antes del canario). El fallo no era de inyección de secretos: era de **clasificación**.

### 2.3 Causa raíz técnica

`fin_entry_reversal_residual(uuid)` — helper **SECURITY DEFINER STABLE** de solo lectura creado por la migración T12 `20261115100000_cp_fin_t12_partial_reversal_guard.sql`:

- Sin `auth.uid` por diseño: helper aritmético (diferencia CUP entre un asiento y sus reversiones enlazadas por `reversal_of`), invocado únicamente por la función motor `fin_post_document_annulment` (SECDEF con advisory lock) y por la función trigger `fin_t12_block_receipt_annulment` (excluida del check por ser función disparadora, no invocable directamente).
- ACL verificado en vivo (m057 B4): `postgres=EXECUTE, authenticated=EXECUTE, service_role=EXECUTE` — sin PUBLIC ni anon (REVOKE de la migración verificado).
- El check live (`scripts/ci-gate-sql-checks.js` → `pg_proc` + `pg_get_functiondef` NOT LIKE `auth.uid`) lo detecta porque T12 se aplicó a producción **después** del CI de #1628 (12:26Z vs CI previo) y la allowlist del PR no incluía la nueva función.

### 2.4 Respuestas a las preguntas §3 de la misión

1. **¿Existe el secret `DATABASE_URL`?** SÍ — visible (enmascarado) en el env del paso en todos los runs examinados.
2. **¿Está disponible en el contexto `pull_request`?** SÍ para este repo (mismo repo, no fork): ambos runs de `pull_request` ejecutaron el gate live completo contra PostgreSQL.
3. **¿Fallo de configuración o de seguridad?** De **seguridad bien funcionando**: el gate detectó una función SECURITY DEFINER sin auth-check no clasificada. No había ningún problema de configuración en estos runs.
4. **¿Puede ejecutarse por `workflow_dispatch` sobre el mismo SHA?** SÍ (disparador añadido en misión 005, commit `c87a69cf8`), pero **no fue necesario**: el push del fix re-disparó el evento `pull_request` (synchronize) sobre el mismo workflow, con las MISMAS validaciones.
5. **¿La ejecución alternativa ejecuta el mismo gate?** N/A — la ejecución definitiva fue el canal ordinario `pull_request` (mismo workflow, mismo SQL, mismo evaluador, misma allowlist). No se usó ninguna ejecución sustituta.
6. **¿Mecanismo seguro sin exponer credenciales?** El ya existente: `secrets.DATABASE_URL` inyectado server-side por Actions; el agente no accede ni imprime el valor. Complementariamente, la verificación independiente read-only `m057` (Management API, SELECT-only, guard de ref) confirma los cuerpos vivos sin exponer credenciales.

## 3. Resolución aplicada (configuración segura, sin debilitar seguridad)

- `ci-gate-allowlist.json`: entrada `fin_entry_reversal_residual` en `security_definer_without_auth_check`, con justificación completa (helper interno, solo lectura, STABLE, cero llamadas desde la app, ACL restringido) y **recomendación documentada de hardening**: restringir el GRANT a `service_role` en la siguiente migración FIN (rama de diagnóstico existente: `fix/fin-t12-privilege-hardening-20261116`, hallazgo EXECUTE authenticated vigente).
- La entrada es **idéntica verbatim** a la añadida por el PR #1631 (CP-VALUATION-NOMINAL-ACTIVATION-004, commit `2f2362498`, «gates verdes»), lo que hace el merge futuro de ambas ramas limpio (bloques idénticos).
- El check-writers del manifiesto: el nuevo script read-only `m057` quedó declarado como excepción justificada (Security Audit PASS en `f62a5114c`).

## 4. Pruebas de equivalencia (§4 de la misión)

1. **Simulación local del evaluador** (`node scripts/ci-gate-evaluate.js`):
   - con la allowlist de `main` (sin la entrada): `❌ secdef_no_auth … 1 NO permitidos → fin_entry_reversal_residual` — reproduce EXACTAMENTE el fallo de CI (exit 1);
   - con la allowlist corregida: `✅ Resultado: TODO PASS` (exit 0).
2. **CI real sobre el mismo SHA del PR**: run 43749788398 (evento `pull_request`, SHA `f62a5114c1e6c…`) → `✅ secdef_no_auth: 116 hallazgo(s), 116 en allowlist, 0 NO permitidos` · `✅ Resultado: TODO PASS — 3 checks ejecutados completos`.
3. **Mismo gate, mismas validaciones**: mismo workflow (`.github/workflows/sql-security-gate.yml`), mismo `ci-gate-checks.sql` generado, mismo evaluador, misma BD de destino — el resultado verde proviene del MISMO canal `pull_request`, no de una ejecución sustituta.

## 5. Cadena de evidencia

| # | Evidencia | Referencia |
|---|---|---|
| 1 | Log run fallido (12:45Z, hallazgo) | run 43715439509, job 132815843074 |
| 2 | Log run fallido (12:39Z, idéntico) | run 43714964713, job 132814388126 |
| 3 | Log run verde (mismas validaciones) | run 43749788398, job 132920985880 |
| 4 | Cuerpo vivo del helper = migración aprobada (hash) | `pr1630-premerge-evidence.json` B1-B4 (m057, 26/26 PASS) |
| 5 | Entrada de allowlist (texto y posición idénticos a #1631) | commit `f62a5114c`, diff de `ci-gate-allowlist.json` |
| 6 | Recomendación de hardening documentada | motivo de la entrada; rama `fix/fin-t12-privilege-hardening-20261116` |

## 6. Declaraciones

- No se utilizó `pull_request_target`; no se ampliaron privilegios de workflows; no se desactivó ninguna comprobación de seguridad.
- No se imprimió ni copió el contenido de `DATABASE_URL`; ningún secreto en este documento ni en el diff.
- No se ejecutó ninguna escritura contra producción en esta misión (m057 es SELECT-only; el único push fue código/docs).
