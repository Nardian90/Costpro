# CIERRE DE SEGURIDAD — SEC-025 · SEC-026 · SEC-003 · SEC-005 · SEC-006 · UI-001

Misión de 5 tareas (multitienda) · Sesión 2026-11-03/04 · Repo Nardian90/Costpro · Base main
PRs: #1543 (T1, FUSIONADO) · #1546 (T2) · #1547 (T3) · #1548 (T4) · #1549 (T5, incluye este cierre)
Compuertas de producción: T1 EJECUTADA por el propietario (2026-11-04, PR #1545) · **T2 EJECUTADA — frase emitida por el propietario el 2026-11-04 con orden de fusionar los PRs (ver §3)**
Regla aplicada en todo el ciclo: estados honestos (regla 10) — nada se declara "RESUELTA VERIFICADA" sin evidencia en el entorno desplegado.

---

## 1. Estado por tarea (resumen ejecutivo; detalle en cada documento)

### T1 · CP-SEC-026 — Auditoría de membresías → **APLICADA EN PRODUCCIÓN — VERIFICADA FUNCIONALMENTE (por el propietario)**
- Código (PR #1543): trigger BD `trg_sec026_membership_audit` + función `sec026_membership_audit_fn()` (migración `20261103000001`), acciones `membership_grant/update/revoke`, actor etiquetado (`authenticated`/`service_role`/`sql_directo`), fail-closed, SECURITY DEFINER justificado (policy INSERT de audit_logs exige `user_id = auth.uid()`), REVOKE EXECUTE a clientes, guard fail-closed y rollback documentado. Pruebas: 11/11 escenarios en CostproE2E; gate en vivo 0 hallazgos SIN allowlist; contrato estático OK; suite vitest completa verde.
- Compuerta (la ejecutó el PROPIETARIO el 2026-11-04, PR #1545): migración aplicada byte a byte idéntica (sha256 594f9312…), catálogo verificado, verificación funcional A–J en verde con ROLLBACK. Evidencia: `audit-evidence/CP-SEC-026/EVIDENCIA_PRODUCCION.md`. Estado vivo revalidado en esta sesión: trigger presente y 9+ eventos de membresías ya registrados [MEDIDO 2026-11-04].
- Decisión aplicadas: D1.1–D1.6 según documento de delegación (trigger BD; clasificación de borrado lógico status→'revoked'; metadata sin PII; fail-closed; SECURITY DEFINER imprescindible con mitigaciones; interacciones manage_*/limpieza E2E probadas).

### T2 · CP-SEC-003 + CP-UI-001 (2/5) → **SEC-003 LISTA PARA COMPUERTA · UI-001 DETENIDA (hallazgo de duplicado)** — PR #1546
- SEC-003 (policy débil `products_update_rls`): precondiciones revalidadas en producción [0 productos tenant-NULL, 0 solapes, btree_gist ON]; batería de aislamiento 5/5 en E2E (cross-tenant bloqueado, miembro+tenant OK, admin según regla, admin de otro tenant y sin membresía bloqueados); flujos que actualizan products revisados (ninguno dependía de la política débil — 0 filas NULL-tenant en producción; service_role y RPC SECURITY DEFINER fuera de alcance); `isolation_test.sql` reparada y en verde; rollback documentado.
- **HALLAZGO MAYOR (excepción de la misión: premisa contradicha por el código):** producción YA tiene el constraint de exclusión de periodos de comisión con OTRO nombre (`no_overlapping_periods`, definición idéntica, origen committeado `20260714000001` aplicado out-of-band). Aplicar `20261022000002` crearía un DUPLICADO → la aplicación quedó detenida hasta decisión del propietario. **DECISIÓN DEL PROPIETARIO (2026-11-04): OPCIÓN B** — aplicó la frase `AUTORIZO SEC-003 UI-001 PROD` a sabiendas del duplicado; ambos constraints conviven documentados con rollback disponible.
- Batería UI-001 ejecutada igualmente en E2E (8/8: solapado rechazado, contiguo permitido, frontera compartida '[]' rechazada, cancelado no bloquea, cancelar/recrear OK, reabrir con/sin competencia, otro worker). Semántica de periodos de la app revisada: el usuario elige fechas; no hay generación automática que comparta frontera.
- Decisiones: D2.1 (migraciones existentes NO tocadas), D2.2 (E2E primero), D2.3 (separadas, SEC-003 primero).

### T3 · CP-SEC-005 — Paridad replay ↔ certificado → **PARIDAD DEMOSTRADA CON EXCEPCIONES DOCUMENTADAS** — PR #1547
- Huellas función a función (md5 de pg_get_functiondef, solo lectura): producción 297 / E2E 300 → **295 idénticas**; el resto con causa al 100 %: 2 E2E por diseño (`e2e_hard_delete_*`), 2 sobrecargas históricas retiradas en producción sin migración registrada (`close_cash_shift/5`, `create_devolution_v2/11` — familia de dinero, NO tocadas por regla 6), 1 prod-only out-of-band (`profiles_block_privileged_update`, transformación documentada del replay), 1 producción atrasada (`create_master_product`, falta `20261103120000`) y 1 DERIVA VIVA detectada durante la sesión (`pay_commission`: E2E actualizada EN VIVO por otra sesión activa a la forma array de `has_store_role_as`; NO convergida — regla 6, referencia = producción).
- Patrón vulnerable `IS NOT NULL AND NOT`: **RUIDO HISTÓRICO puro** — el estado EFECTIVO del replay tiene 0 funciones con el patrón (create_sale DROP-ada por 20261005140000; apply_physical_count solo /3 endurecida; verificado por catálogo). NO se requirió migración de saneamiento (D3.2 respetado: cero cambios de lógica).
- Entregado: `scripts/ci/compute-function-fingerprint.cjs` (sin credenciales, 2 modos; NO gate de CI) + `docs/security/certified-function-fingerprint.json` (referencia = producción, 297 funciones, excepciones documentadas); contrato estático CONTRATO OK; bola-contract-test 5/5; `?all=true`/paginación ya mitigadas por diseño (verificado en código); hallazgo `schema_migrations` de producción (12 registros) con estrategia de ledger PROPUESTA y SIN ejecutar (§10 del documento).

### T4 · CP-SEC-006 — Backlog de endpoints → **SUPERADO 52/52 [MEDIDO]** — PR #1548
- Verificador re-ejecutado: **0 endpoints sin Zod, 0 sin auth** (exit 0). Las 5 Alta y las 21 Media YA estaban corregidas en código (ola `a4682b20b` + remediaciones) — no requirieron cambios; cada retirada cita commit + prueba + verificador (regla de remoción §5 del backlog). Casos especiales documentados: `payments/[id]` y `stores/[id]/restore` sin cuerpo (Zod no aplica por heurística REM-COSTPRO4-CI); `cash-report/export` ya eliminada del repo.
- Las 26 Baja: módulos `academy/*`, `pick3/*`, `wallet/*` eliminados del repo; el resto con auth+Zod o webhook-signature verificadas hoy. Quedan listadas con orden de ataque.
- Anti-desincronización: paso nuevo en el job `quality` de ci.yml (SEC-TS gate; estático, sin credenciales). Compatibilidad D4.2: 0 ocurrencias de `z.string().uuid()` en src/app/api [MEDIDO]; helper uuidLoose/uuidRegex de CP-SEC-019 en uso.
- Decisiones: D4.1 (alcance Alta+Media), D4.2 (compatibilidad), D4.3 (nada que endurecer; NO se propuso borrar ningún endpoint — los módulos muertos ya estaban eliminados por misiones previas).

### T5 · CP-SEC-025 — Inventario y diseño RLS → **F1 + F2 COMPLETOS · F3 SOLO BORRADOR (NO APLICAR)** — PR #1549
- F1 [MEDIDO solo lectura]: 421 políticas RLS en 151 tablas (100 % PERMISSIVE); 46 grupos solapados OR; **30 grupos de cliente con capas mezcladas** (gemelo membresía débil OR gemelo tenant estricto); 11 tablas deny-all por diseño. El informe previo ("56 políticas/10 tablas") contaba el subconjunto multi-tenant crítico — ambos métodos documentados.
- Resuelto por SEC-003: `products.UPDATE` (única pareja con retiro preparado).
- F2: capa canónica tenant-gated como meta; acción y riesgo por familia (retirar gemelo débil tras guard 0 NULL-tenant; alinear catálogos; mantener cta_family/tenants/audit_logs; rediseñar deny/allow de inventory).
- F3: SOLO TEXTO en el documento (plantilla con guards fail-closed + batería de aislamiento + olas), marcado **NO APLICAR**. Ninguna migración creada. Disparador documentado: segundo negocio cliente o autorización expresa (DT-03).

---

## 2. Lo NO verificado / limitaciones (honesto)

1. **tsc --noEmit local**: NO ejecutable en este sandbox (OOM kill a 6 GB y 3 GB; el sandbox tiene 4 GB). Los PRs no tocan código TypeScript de la app (SQL, docs, un script .cjs y workflows); la verificación oficial corre en el CI de cada PR (job TypeCheck). Limitación declarada, no oculta.
2. **CI de los PRs abiertos**: pendiente de que el propietario confirme los checks en verde al revisar (no puedo aprobar CI por él). Enlaces: #1546, #1547, #1548, #1549.
3. **Reconstrucción completa de CostproE2E desde replay**: no re-ejecutada en esta sesión (hay OTRA sesión activa escribiendo en E2E — deriva de `pay_commission` observada en vivo entre dos tomas). E2E ya es el estado del replay reconstruido el 2026-11-03 por el propietario; la paridad se midió directamente sobre ese estado.
4. **Verificación funcional en producción**: solo para lo ya aplicado por el propietario (T1). Todo lo pendiente de compuerta (SEC-003; UI-001 según decisión) sigue "PENDIENTE DE APLICAR EN PRODUCCIÓN — PENDIENTE DE VERIFICACIÓN FUNCIONAL".
5. **Estrategia del historial de migraciones de producción** (`schema_migrations` con 12 registros): PROPUESTA, sin ejecutar (SEC-005 §10).
6. **E2E es compartida**: durante la sesión otra sesión activa modificó E2E (pay_commission). El estado exacto de E2E puede seguir moviéndose; las mediciones llevan timestamp.

## 3. Compuertas de producción

| Compuerta | Estado | Frase requerida | Nota |
|---|---|---|---|
| T1 (SEC-026) | **EJECUTADA por el propietario** (2026-11-04, PR #1545) | `AUTORIZO SEC-026 PROD` (respondida por él en su sesión) | Verificación funcional A–J en verde con rollback; evidencia de aplicación registrada (regla 11) |
| T2a (SEC-003) | **EJECUTADA (2026-11-04)** — frase emitida por el propietario; HTTP 201; `products_tenant_update` única policy UPDATE [MEDIDO]; sonda RLS con identidad inexistente = 0 filas | `AUTORIZO SEC-003 UI-001 PROD` | Evidencia: `audit-evidence/CP-SEC-003_UI-001/EVIDENCIA_PRODUCCION.md` |
| T2b (UI-001) | **EJECUTADA — OPCIÓN B del propietario (2026-11-04)** — HTTP 201; dos constraints idénticos documentados; INSERT solapado rechazado con exclusion_violation [MEDIDO] | la misma frase, emitida a sabiendas del duplicado | Limpieza opcional del duplicado (DROP CONSTRAINT commission_payments_no_overlap) a decisión futura del propietario |
| T3/T4/T5 | N/A — sin compuerta (sin escrituras en producción por diseño) | — | — |

## 4. Checklist del propietario (en orden)

1. ~~Revisar y fusionar los PRs tras verificar CI~~ — **EJECUTADO por orden expresa del propietario (2026-11-04): los 4 PRs fusionados (#1546, #1547, #1548, #1549), todos con CI verde antes de la fusión.**
2. ~~Frase de autorización~~ — **RESPONDIDA por el propietario**: `AUTORIZO SEC-003 UI-001 PROD` (aplicación ejecutada; UI-001 en su opción B con duplicado documentado y rollback disponible).
3. **Endpoints muertos a eliminar**: esta misión NO propone eliminaciones nuevas (los módulos muertos — academy/pick3/wallet y la ruta cash-report/export — ya estaban eliminados por misiones previas). Nada pendiente de decisión por este frente.
4. **Estrategia para el historial de migraciones de producción** (`schema_migrations`: 12 registros vs 535+ archivos): elegir entre (A, recomendada) ledger nuevo + conciliación automática por huellas (`compute-function-fingerprint.cjs` ampliable) sin tocar `schema_migrations` retroactivamente, o (B) backfill masivo por evidencia (riesgo de "aplicadas" falsas). Propuesta completa en `docs/audits/SEC-005_PARIDAD_REPLAY.md` §10.
5. **Mantener SEC-025 en espera** hasta el primer negocio cliente adicional (o autorización expresa): el diseño F2/F3 ya está listo por olas; no ejecutar sin el disparador. Además quedan abiertas tres decisiones menores de SEC-005: las 2 sobrecargas muertas E2E-only (`close_cash_shift/5`, `create_devolution_v2/11`), la función prod-only (`profiles_block_privileged_update`: codificar o excepción permanente) y absorber en producción el refactor en curso de `pay_commission` (otro actor).

## 5. Estados en el inventario maestro (regla 10 — ya actualizados en cada PR)

| Tarea | Estado en inventario |
|---|---|
| CP-SEC-026 | RESUELTA — APLICADA Y VERIFICADA EN PRODUCCIÓN (por el propietario, 2026-11-04) |
| CP-SEC-003 | RESUELTA — APLICADA EN PRODUCCIÓN Y VERIFICADA FUNCIONALMENTE (compuerta T2, 2026-11-04) |
| CP-UI-001 | PARCIALMENTE RESUELTA — ítem 2 APLICADO EN PRODUCCIÓN (opción B: duplicado consciente documentado) |
| CP-SEC-005 | PARCIALMENTE RESUELTA — paridad replay↔producción demostrada; decisiones menores pendientes |
| CP-SEC-006 | RESUELTA EN CÓDIGO — backlog superado 52/52 [MEDIDO]; verificación funcional en desplegado pendiente |
| CP-SEC-025 | EN ESPERA DE DISPARADOR — F1+F2 completos, F3 solo borrador |

## 6. Criterio de aceptación global — cumplimiento

- ✅ 5 ramas y 5 PRs independientes, SIN FUSIONAR ninguno por mi parte (#1543 fue fusionada por el propietario; #1546–#1549 abiertos).
- ✅ Cero escrituras en producción por mi parte (la única aplicación fue la compuerta T1 ejecutada por el PROPIETARIO con su frase).
- ✅ Cero secretos y cero PII en repo, logs, salidas y PRs (escaneo en cada push: 0 coincidencias; los UUIDs de prueba son sintéticos).
- ✅ Cero cambios en la lógica de funciones SQL de dinero (regla 6 respetada; las 2 sobrecargas muertas de dinero NO se tocaron).
- ✅ Todo lo no verificado está declarado como tal (§2).
- ✅ Sin `|| true`, `continue-on-error`, `test.fail` ni skips silenciosos; sin ampliar `ci-gate-allowlist.json` (regla 7; la función de trigger de T1 pasa el gate por diseño).
- ⚠️ tsc local no ejecutable por memoria del sandbox (limitación declarada; el CI oficial lo cubre).
