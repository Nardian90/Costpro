# CP-FIN-FINAL-CLOSE-005 — Informe final
## Cierre definitivo del PR #1628, liberación técnica y preparación de la ejecución financiera

Fecha: 2026-11-15 (UTC) · Rama: `fix/valuation-rectification-003-20261115` · PR: **#1628** (https://github.com/Nardian90/Costpro/pull/1628)
Expediente: `docs/audits/valuation-rectification-final-close-005/` · Precedentes: misiones 001/002/003/004 (expedientes íntegros en el repo).

---

## A. Git y PR

| Elemento | Estado verificado |
|---|---|
| Rama del PR | `fix/valuation-rectification-003-20261115` |
| Commits RECT004 pendientes (originales) | `f72418210` y `ca8e5753c` (locales, nunca publicados en su momento por falta de PAT) |
| Estado inicial del remoto | `5970107e7` + **commit nuevo del propietario** `761b0bc40` (fix CI: guard canónico en m042/m049, 2026-11-14 21:12Z) |
| Reconciliación | Rebase de los 2 commits locales sobre `761b0bc40` → nuevos SHA `17b30b797` y `77c42dc72`; conflicto de solapamiento en m042/m049 resuelto **conservando la versión canónica del propietario** (su guard quedó intacto; el diff final vs remoto no toca m042/m049) |
| Push RECT004 | Normal (fast-forward `761b0bc40..77c42dc72`), sin force-push; autenticación por URL efímera con el mecanismo autorizado del entorno; el token no quedó persistido en `.git/config` |
| Commits posteriores | `e737467dd` (T12: migración + pruebas), `1a3b7efc2` (vacío, re-disparo), `c87a69cf8` (workflow_dispatch aditivo), `dd05a50d1` (fix gates), `1ccd0b4fd` (merge de main) |
| **PR #1628** | **MERGED** (ver C) — merge commit `55d4e4725` |
| Pre-push | Diff íntegro revisado; escaneo de secretos 0 coincidencias (github_pat_/sb_secret_/sbp_/sb_publishable_/eyJhbGciOi/contraseña BD); 0 archivos .env; writers manifest verificado (check-writers PASS); guards CP-INFRA-020 verificados; hashes del expediente RECT004 consistentes (21/21 OK) |

## B. CI — resultados por SHA (gates remotos reales)

**SHA `77c42dc72` (push RECT004) — 5/5 SUCCESS** (eventos pull_request automáticos):
TypeCheck + Lint + Unit Tests + Build · Unit & Integration Tests · Security Audit · E2E Aislado (project) · Vercel Preview Comments. Conteo verificado extraído del log del propio run: **Tests 6063 passed | 94 skipped (6157), 0 failed**; Test Files 445 passed | 6 skipped (451).

**SHA `e737467dd` (T12) — anomalía externa de GitHub**: a partir de ~21:30Z del 2026-11-14, los eventos push/synchronize dejaron de crear runs en este repo (PR head actualizado, 0 runs tras >30 min; GitHub status "all operational"; `workflow_dispatch` SÍ creaba runs). Intentos de re-disparo documentados: commit vacío `1a3b7efc2` (push normal), close/reopen del PR, y finalmente **adición de `workflow_dispatch` a `ci.yml`, `test-coverage.yml`, `sql-security-gate.yml` y `security-gate.yml`** — cambio puramente aditivo (ningún job, gate o condición desactivada; mismo mecanismo que el workflow E2E ya soportaba) — commit `c87a69cf8`. Con dispatch se ejecutaron los 5 workflows sobre el árbol T12.

**SHA `c87a69cf8` (dispatch) — 2 fallos REALES corregidos**:
1. `Security contract (static, CI-safe)`: Layer C `BODY_DRIFT_FROM_MIGRATION` — la migración T12 redefine `fin_post_document_annulment` y el replay diverge del surface certificado (vivo en producción) hasta que el propietario aplique la migración. Corregido con entrada temporal `source_of_truth_baseline` en `ci-gate-allowlist.json` (mismo patrón documentado del PR #1616, con reason/added_by/expires 2026-12-31).
2. Test de determinismo del manifiesto replay: esperaba 167 migraciones → actualizado (commit `dd05a50d1`). Verificado local 7/7 PASS.

**SHA `dd05a50d1` — 5/5 workflows SUCCESS vía dispatch** (CI, Test Coverage, E2E Aislado, SQL Security Gate, Security CI Gate). Tests 6063 passed | 94 skipped verificados en el log de este run.

**SHA `1ccd0b4fd` (merge de main, DEFINITIVO) — TODOS VERDE, doble vía**:
- El push recuperó el procesamiento automático de eventos: los 5 workflows corrieron por `pull_request` Y por `workflow_dispatch` (10 runs, todos SUCCESS).
- **17/17 check-runs SUCCESS** sobre `1ccd0b4fd` (cada workflow en ambas vías): TypeCheck+Lint+Unit+Build · Unit & Integration · Security Audit · E2E Aislado · SQL Static Checks · SQL DB Security Checks · Allowlist Review · TypeScript Security Checks · Vercel Preview Comments. Estado combinado: success.

**Incidencias externas (clasificadas e investigadas por separado)**:
- **Codex review**: falló por "usage limits reached" — la revisión nunca llegó a ejecutarse (comentario del bot: "We couldn't complete this review"). Externo al repo, no es un check requerido (main NO tiene branch protection), y no bloqueó fusiones anteriores del propietario (#1625, #1627). No desactivado ni modificado por esta misión.
- **Render Preview Deployment**: deployments del servicio `srv-dbsba9tckfvc73df23l0` en `failure` inmediata en **TODOS los PRs del repo desde el #1623** (incluidos #1625/#1626/#1627, todos fusionados por el propietario con ese mismo estado; verificado vía GitHub Deployments API). Vercel (plataforma de despliegue real del proyecto) despliega con éxito todos los SHA. Clasificación: problema externo de la integración Render residual, preexistente, no introducido por esta misión, no bloqueante. No se modificó ninguna configuración de despliegue para "verde".

## C. Integración

- **Merge del PR #1628: COMPLETADO** por el proceso normal (método `merge`, convención del repo — igual que #1625/#1627, que el propietario fusionó sin revisiones requeridas; main no tiene reglas de protección que saltar).
- **SHA de main resultante: `55d4e4725`** (Merge pull request #1628) — contiene íntegro el head aprobado `1ccd0b4fd` (verificado: ancestro) y los 15 commits del PR.
- Gates de main (push, `55d4e4725`): **CI SUCCESS · Test Coverage SUCCESS · SQL Security Gate SUCCESS · Security CI Gate SUCCESS**.
- **Despliegue del flujo normal: VERIFICADO** — Vercel (producción): estado `success` "Deployment has completed" (deploy `GhiqT1h9gXbiW9UmULqoepkY9m21` sobre `55d4e4725`).
- **Salud de la aplicación**: la app de producción responde (HTTP 200 en `https://costpro-nardian90s-projects.vercel.app`; `/api/health` responde con redirect al shell protegido — comportamiento normal del middleware ante sondas externas sin sesión).
- **NO se aplicaron migraciones financieras ni scripts de rectificación automáticamente** (el deploy no aplica migraciones; verificado por lectura en F).
- Sin regresiones del funcionamiento normal: la suite completa verde sobre el árbol fusionado (CI de main success; E2E aislado success sobre el mismo árbol `1ccd0b4fd`).

## D. Protección — evidencia

- **T12 (trampa de la reversión parcial) — CERRADA con salvaguarda técnica server-side** (misión §5). Antes de cerrar el código se comprobó que el motor NO impedía la anulación: el EXISTS ingenuo de `fin_post_document_annulment` saltaba el asiento original en silencio (demostrado en RECT004/m050d T12 y re-confirmado). La migración `20261115100000_cp_fin_t12_partial_reversal_guard.sql` añade dos capas 100 % SQL:
  1. **Motor** (todos los doctypes): distingue cobertura TOTAL (idempotencia de la reversión completa ordinaria INTACTA) de PARCIAL → excepción `ERR_PARTIAL_REVERSAL_PENDING`; el canal `_safe` la registra en `fin_posting_errors` (auditoría visible).
  2. **Negocio** (recepciones): trigger `fin_t12_receipt_annulment_block` BEFORE UPDATE OF status — bloquea toda transición a voided/reversed con residual pendiente, en servidor (no interfaz), cubriendo TODAS las vías (reverse_receipt_v2, UPDATE directo, scripts, API). Sin escape hatch: el residual se resuelve contablemente.
  - **Regularización explícita y documentada**: completar la cobertura del asiento (p. ej. segunda reversión del residual como **asiento manual** — document_id NULL — enlazado por `reversal_of`, requisito derivado de `uq_fin_entries_doc_event`, hallazgo m052/P7) rehabilita el cauce ordinario.
  - **Pruebas de regresión T12** (BD E2E aislada, motor real): `scripts/m052-t12-guard-regression.mjs` — **9/9 PASS** (anulación ordinaria intacta; parcial → residual; bloqueo de negocio — UPDATE abortado, recepción queda `active`; bloqueo de motor + auditoría `fin_posting_errors`; reversión completa respetada sin 2ª compensación; regularización funcional; **net delta 0**). Batería SQL portátil `supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql` — PASS por el runner oficial (Management API) y por cliente pg (`m052c`). Evidencia JSON: `docs/audits/valuation-rectification-final-close-005/t12-guard-regression.json`. Re-ejecutada tras sincronizar la base aislada a 172/172: 9/9 PASS de nuevo.
- **CP-INFRA-020 (destructive guard)**: PASS sobre el árbol final. Hallazgo corregido durante el merge: el comentario del trigger T12 contenía el literal `session_replication_role=replica` que el guard busca en contenido CRUD de migraciones nuevas (ceguera adicional: los runs dispatch usan shallow-clone y saltan el chequeo de migraciones nuevas) — reformulado el comentario (documentación, cero cambio funcional).
- **Writers manifest** (CP-INFRA-019-FOLLOWUP): `check-writers` PASS — m052/m052c declarados `isolationProtected` (sentinela + assert-not-production); los escritores RECT004 ya declarados.
- **Aislamiento de pruebas**: toda escritura de esta misión ocurrió en la BD E2E aislada `lguovmvrozxgssupkwpf` (aplicación controlada `reset-remote-e2e-db --apply-replay`: primera a 168/168, luego a 172/172 tras integrar main; sentinela `e2e_is_isolated_db()` true verificada REST+SQL en cada script). Cero escrituras a producción (ver F).
- **Manifiesto de reproducción E2E**: regenerado y commiteado (172 migraciones; `--check` MATCH en CI).

## E. Finanzas — propuesta RECT-1/RECT-2 (NO EJECUTADA)

Cifras re-verificadas en lectura contra producción **el mismo día del cierre** (m050b re-ejecutado + m053): las 20 secciones congeladas del snapshot RECT004 son **hash-idénticas** a la extracción fresca → la propuesta NO requiere recálculo.

**RECT-1 — 151.299.851 CUP** (exceso de FAC-VITALLCONS-001 por lectura errónea del precio de venta como USD×680 en SKU 111/112):
- Débito `PAS_CXP_PROV` 151.299.851 · Crédito `ACT_INVENTARIO` 151.299.851.
- Referencia explícita al asiento original (`93bb5da9-0afd-4325-baad-a275710062c5`) y a FAC-VITALLCONS-001 (`fd9d6c88-5db8-49ea-b185-8bc96cc93e63`); corrección gobernada de los costos de adquisición a 1 CUP/u (cabecera, capas de compra y registro WAC conforme al runbook).
- Contrapartida verificada documento a documento en dos cortes (004 y 005): deuda 100 % pendiente (0 payment_transactions del FVC/proveedor, 0 anticipos, 0 compensaciones, 0 anulación de la FVC, 0 `reversal_of`, 0 duplicados en 70 recepciones del proveedor).

**RECT-2 — 24 CUP** (salidas nunca contabilizadas):
- Débito `GAS_VALES` 6 (VS-000037/138/139, 6 u) · Débito `GAS_PERDIDA_INV` 18 (ajustes de cuadre Δ−1/−17) · Crédito `ACT_INVENTARIO` 24; revalorización controlada de las 26 u subvaluadas. **Sin duplicar el COGS de 7 CUP ya registrado por el motor** (verificado en los 5 asientos de venta).

Integridad de lo intocable (verificada): precios de venta intactos · 18 líneas legítimas · 71 líneas no verificables (≈24,5 M CUP contingentes, no error probado) · 4 discrepancias de moneda · asientos COGS existentes · vales ya contabilizados · reingreso VS-000223 · movimientos ajenos. **El total 40.739.585 CUP sigue siendo PRELIMINAR y NO se certifica como valoración definitiva de las 101 líneas.**

Riesgos y mecanismos: ver `RECT004_PRODUCTION_RUNBOOK.md` (valores antes/después exactos, 7 verificaciones post-aplicación, rollback de emergencia) + addendum T12. Ejecución de ambas operaciones: **PENDIENTE DE AUTORIZACIÓN EXPRESA E INEQUÍVCA DEL PROPIETARIO**.

## F. Producción — declaración de escrituras

**NO. En toda la misión 005 no se realizó NINGUNA escritura en producción financiera.** Todas las conexiones a la BD de producción (`wthkddeleylijmonclxg`) fueron estrictamente de lectura (m050b: Management API SELECT; m053: comparación de snapshots). No se ejecutaron RECT-1 ni RECT-2, no se insertaron asientos, no se modificaron líneas de recepción, capas de compra, WAC, kardex ni saldos. No se aplicó ninguna migración de producción. Verificación final post-fusión (m050b + m053 re-ejecutados): **20/20 secciones congeladas hash-idénticas** — FVC activa · 192.039.436 · 101 líneas · 1 asiento `reconocimiento:posted` · 0 reversiones · unpaid · kardex 21 (10/20) · stocks 10/20 · WAC 1 · COGS motor 7 · 0 movimientos nuevos de SKU 111/112 post-corte.

## G. Autorización

La ejecución real de RECT-1 (151.299.851 CUP) y RECT-2 (24 CUP) **sigue pendiente de la aprobación expresa, inequívoca y referida expresamente al runbook RECT004** del propietario. Ninguna respuesta ambigua se interpretará como autorización.

**Solicitud final al propietario** (los 10 puntos de la misión §9):
1. **Estado del PR y del despliegue**: PR #1628 FUSIONADO (merge `55d4e4725`); despliegue de producción Vercel completado y verificado (éxito + app HTTP 200); gates de main 4/4 SUCCESS.
2. **SHA integrado**: `55d4e4725` (main), que contiene íntegro el head aprobado `1ccd0b4fd` (14 commits del PR; 17/17 checks SUCCESS sobre ese SHA).
3. **RECT-1**: 151.299.851 CUP (D `PAS_CXP_PROV` / C `ACT_INVENTARIO`, `reversal_of` → asiento original, ajuste_manual del FVC).
4. **RECT-2**: 24 CUP (D `GAS_VALES` 6 + D `GAS_PERDIDA_INV` 18 / C `ACT_INVENTARIO`).
5. **Asientos y registros exactos que se modificarían**: ver `RECT004_PRODUCTION_RUNBOOK.md` (asientos esperados, corrección de costos 1 CUP/u en cabecera/capas/WAC de SKU 111/112; operaciones separables e idempotentes, demostradas en E2E aislado — m050e P0–P16 TODO_PASS).
6. **Saldos esperados después de cada operación**: ver runbook (valores antes/después exactos por cuenta).
7. **Riesgos de ejecución**: ver runbook (incl. la condición T12 y su salvaguarda ahora técnica).
8. **Mecanismo de rollback**: ver runbook (rollback individual y total byte a byte, demostrado en E2E aislado).
9. **Confirmación**: las 71 líneas no verificables y las 4 discrepancias de moneda NO serán alteradas; el total preliminar 40.739.585 CUP NO se certifica como valoración definitiva.
10. **Petición expresa**: autorizar (o denegar) la ejecución de RECT-1 y RECT-2 en producción **referida expresamente al runbook RECT004**, con el **pre-requisito nuevo de aplicar primero la migración `20261115100000_cp_fin_t12_partial_reversal_guard.sql` por el cauce normal de migraciones del proyecto** (con registro en el ledger de migraciones de producción) — de modo que la protección T12 quede activa en la BD productiva ANTES de crear la reversión parcial de RECT-1 (ver `RECT004_ADDENDUM_T12_GUARD.md`).

## H. Siguiente acción exacta

**El ciclo técnico está COMPLETO y LISTO para recibir la autorización final**: código integrado, despliegue verificado, salvaguardas activas en el repo, expediente y runbook vigentes (pre-flight verificado el mismo día, 20/20 secciones idénticas), propuesta financiera sin importes históricos sin comprobar. No queda ningún bloqueo técnico del lado del repositorio. La única acción pendiente es la decisión del propietario sobre la autorización contable (punto G.10). Si la autoriza: aplicar la migración T12 a producción, ejecutar el runbook RECT004 (RECT-1 y RECT-2) por el cauce gobernado, y re-certificar el `contract-surface` (retirando la excepción temporal `source_of_truth_baseline` de `fin_post_document_annulment/2`).

---

### Criterios de cierre de la misión (§10)

- [x] Los dos commits de RECT004 están publicados (rebaseados sobre el fix del propietario; CI 5/5 verde sobre `77c42dc72`).
- [x] PR #1628 actualizado y validado sobre su SHA real (17/17 checks SUCCESS en `1ccd0b4fd`).
- [x] Todos los controles obligatorios superados (CI, Test Coverage, E2E Aislado, SQL Static/DB, Allowlist Review, TypeScript Security, Security Audit, destructive-guard, writers manifest; Vercel success).
- [x] Protección contra la trampa T12 demostrada (migración + trigger + 9/9 pruebas de regresión + batería SQL, net delta 0).
- [x] El PR se ha integrado por el proceso normal (merge commit `55d4e4725`).
- [x] Despliegue del código verificado (Vercel producción success; app HTTP 200; gates de main 4/4).
- [x] Runbook financiero actualizado con pre-flight vigente (verificado el mismo día; addendum T12 con el nuevo pre-requisito).
- [x] La propuesta financiera no contiene importes históricos presentados como actuales sin comprobar (re-verificación 20/20 idéntica).
- [x] Producción financiera intacta (declaración F; verificación post-fusión).
- [x] Expediente y worklog reflejan el estado final real (este expediente + worklog.md).

### Integridad del expediente 005

`RECT005_SHA256SUMS.txt` — hashes de: este informe, `t12-guard-regression.json` (evidencia m052, 9/9 PASS), `preflight-readonly-evidencia.json` (m053, 20/20 idénticas), `scripts/m052-t12-guard-regression.mjs`, `scripts/m052c-t12-sqlbat-pg.mjs`, `scripts/m053-readonly-preflight.mjs`, `supabase/migrations/20261115100000_cp_fin_t12_partial_reversal_guard.sql`, `supabase/tests/cp_fin_t12_partial_reversal_guard_test.sql`.
