# TEST-EVIDENCE.md — Evidencia de pruebas
## Misión CP-SEC-EXCHANGE-RATES-BACKUP-HARDENING-001 · FASE 5-6

## 1. Batería E2E de postura (`scripts/cpsec-fx-e2e-posture.mjs`) — **17/17 PASS**

Ejecutada contra la BD aislada CostproE2E (lguovmvrozxgssupkwpf) con guard fail-closed `assertIsolatedDb` + centinela + recarga PostgREST tras cada cambio de ACL. La batería crea una fixture que replica el estado PRE vulnerable, aplica la **migración REAL del repo** y verifica:

| # | Prueba | Resultado |
|---|---|---|
| F0 | Exposición PRE replicada: anon SELECT con grants+sin RLS | PASS — HTTP 200, **3 filas visibles** (la exposición de producción 13:27Z→17:10Z reproducida) |
| F1 | Migración real 20261128173000 aplicada sobre la fixture | PASS — sin error (guardas + verificación fail-closed interna superadas) |
| F2 | Lectura anónima POST | PASS — HTTP 401 `42501 permission denied for table` |
| F3a | INSERT anónimo POST | PASS — HTTP 401 42501 |
| F3b | UPDATE anónimo POST | PASS — HTTP 401 42501 |
| F3c | DELETE anónimo POST | PASS — HTTP 401 42501 |
| F4 | Lectura autenticada (JWT real de usuario creado por admin API) | PASS — HTTP 403 42501 |
| F5 | Escritura autenticada | PASS — HTTP 403 42501 |
| F6 | Lectura privilegiada legítima (service_role) | PASS — HTTP 200 con filas (canal de rollback/sondeo intacto) |
| F7 | Escritura privilegiada legítima (service_role) | PASS — HTTP 201 (canal operativo) |
| F8 | Postura catálogo: RLS on · 0 policies · grants públicos 0 | PASS |
| F8b | Grants anon/authenticated/PUBLIC = 0 | PASS |
| F9 | Datos conservados: 3 filas ORIGINALES intactas (total 4 = 3 + 1 insert del propio test F7) — la migración no toca datos | PASS |
| F10 | Defensa en profundidad (grants restaurados + RLS on): SELECT → 200 con **0 filas** visibles | PASS |
| F10b | … e INSERT denegado por RLS sin WITH CHECK | PASS — HTTP 401 |
| F11 | Reintentos: password grant 4 intentos/backoff (patrón run-env, flake conocido) | PASS |
| F12 | Net-zero: fixture DROP + usuario eliminado vía RPC oficial `e2e_hard_delete_user` + tabla viva intacta | PASS |

Nota de honestidad de la primera corrida (15/17): dos defectos del PROPIO test se corrigieron antes de la corrida verde — (a) cabecera `apikey` debía llevar la clave anon (no el JWT) y el bearer el token de usuario; (b) el email de prueba pasó a dominio oficial `@costpro.test` para que el RPC de limpieza oficial lo aceptara (un usuario residual de la primera corrida quedó creado con dominio no canónico y fue limpiado vía re-etiquetado + RPC). La batería final 17/17 es la evidencia válida.

## 2. Suite smoke E2E (misma filtro que el workflow `e2e-isolated.yml`)

- `health-api|isolated-db-sentinel|auth.spec.ts|data-hygiene-probe|isolation-proof|inventory.spec.ts|pos-checkout|inventory-integrity` → **57 passed + 31 passed (re-run de inventory-integrity + pos-checkout completos) = 88/88**. Los 2 fallos de la primera corrida eran **infraestructura del sandbox** (executable Chromium headless-shell ausente tras el reciclaje — mensaje `browserType.launch: Executable doesn't exist`), no del cambio; tras `bunx playwright install chromium`, ambos archivos completos en verde.
- Guardrail de la suite: **`PASS — net delta = 0`**.

## 3. Higiene de datos E2E

- `node e2e/scripts/data-hygiene-guard.cjs` → **`[AFTER] PASS — net delta = 0`** (residuos stores=0 users=0; 5 tiendas protegidas intactas).

## 4. Gates locales

| Gate | Resultado |
|---|---|
| `check-writers` | OK — 107 guardProtected · 59 isolationProtected · 164 excepciones, todas verificadas |
| Test contractual migración (`cpsec-fx-backup-private-migration.test.ts`) | **11/11** — guardas, revocaciones, cero policies, cero DML, cero refs a `exchange_rates` viva, sin FORCE, service_role intacto, fail-closed, comment, rollback coherente |
| `bunx tsc --noEmit` | EXIT 0 |
| eslint (archivos de la misión) | 0 errores |
| `security-contract-test-static.cjs` | **0 divergencias bloqueantes, 233/233 representadas** (3 warnings MEDIUM/LOW preexistentes, sin cambios vs baseline) |
| `build-migrations-replay --check` | **MATCH** (manifiesto 235 migraciones, commiteado) |
| `check-e2e-config --target project` / `verify-remote-e2e` | OK · «Base aislada PREPARADA» |

## 5. Cobertura de la matriz de FASE 6 de la misión

| Ítem exigido | Dónde quedó cubierto |
|---|---|
| Lectura anónima | F2 (denegada) + F0 (PRE expuesta) |
| Escritura anónima | F3a/b/c (denegada) |
| Lectura autenticada | F4 (denegada) |
| Escritura autenticada | F5 (denegada) |
| Lectura privilegiada legítima | F6 (operativa) |
| Escritura privilegiada legítima | F7 (operativa) |
| Rechazo de accesos no autorizados | F2-F5 y F10 (grants y/o RLS) |
| Validación del formato de tasas | La migración no toca datos ni formatos (test contractual cero DML); el formato de la serie queda bajo el contrato de `exchange_rates` viva |
| Reintentos | F11 (password grant con backoff) |
| Actualizaciones concurrentes | **N/A por diseño para un artefacto congelado** (pg_stat upd=0/del=0 desde la creación; el único escritor es one-shot). La actualización continua de tasas pertenece a `exchange_rates` viva — cubierta por pos-checkout 31/31 |
| Conservación de registros anteriores | F9 (3 originales intactas) + POST productivo (1.607 filas + hash PRE→POST idénticos) |
| Consistencia del consumidor de tasas de COSTPRO | Suite smoke 88/88 (POS usa la resolución canónica; cero cambios en la fuente de tasas) |
| No afecta: Inteligencia cambiaria / Tasa canónica / CxC / CxP / POS / Informes / actualización externa | Test contractual: la migración tiene **0 referencias** a `exchange_rates` viva; smoke 88/88; el cron de captura no toca el respaldo (código) |

## 6. Pruebas de mutación en producción

**NINGUNA** ejecutada (prohibición explícita de la misión): las mutaciones se reprodujeron íntegramente en E2E (F3/F5/F10b). En producción solo se ejecutaron **consultas read-only** (sondeo forense + SELECT anónima PRE con resultado 200/`[]` y POST con 403 — ver MIGRATION-AND-APPLICATION.md).
