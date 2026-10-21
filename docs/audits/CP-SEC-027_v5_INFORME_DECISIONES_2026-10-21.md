# CP-SEC-027 v5 — INFORME OPERATIVO: DECISIONES PENDIENTES (2026-10-21)

**Expediente:** CP-SEC-027 v5 — Ejecución controlada de decisiones pendientes
**Modo:** verificación + preparación. **CERO escrituras a producción, CERO migraciones aplicadas, CERO cambios de configuración de GitHub, CERO fusions.**
**Convención de estados:** **VERIFICADO** (comprobado hoy, evidencia archivada) · **PREPARADO** (artefacto listo, sin ejecutar) · **PENDIENTE DE AUTORIZACIÓN** (requiere orden expresa del propietario) · **EJECUTADO** (ya realizado, con evidencia).
**Evidencia de la misión:** `docs/audits/evidence/20261021-decisiones-operativas/` (fichas de fase + evidencia cruda del 21/10).

---

## 1. Dictamen PR #1433 — FASE 1

**Estado REAL (VERIFICADO):** el PR **ya está fusionado** por el propietario (Nardian90, 2026-10-19T20:49:57Z; merge `8b9a162e7`). El expediente lo daba por abierto — hecho consumado por el dueño antes de la revisión.

- Diff real verificado: **+32/−0 en 2 workflows**, alcance exacto (trigger `push` con filtros de rutas idénticos a `pull_request` en `security-gate.yml` y `sql-security-gate.yml`); **sin duplicación ni omisión de controles**; `pull_request` intacto en ambos. Checks al merge: CI verde; en `main` hoy: 7 success + 2 E2E skipped.
- **Verificación forense de los filtros `push`:** `branches: [main]` CORRECTO en ambos (YAML parseado + bytes del patch de la API + hash de cadena de evidencia idéntico). Una lectura inicial sugirió un defecto tipográfico (`ain]`): fue un **falso positivo del canal de visualización**, no del código — descartado por verificación byte a byte y documentado como precedente del expediente (ningún hallazgo se declara sin bytes crudos).
- **Canal `push` verificado operando:** ambos workflows corrieron en `push|main` el 20/10 sobre `c08a4038cc` con success — el objetivo del PR (cerrar el hueco de fusión directa) funciona con corrida real.

**DICTAMEN: APTO PARA FUSIÓN — sin defectos** (la fusión realizada por el propietario se confirma correcta a posteriori). No se requiere PR de corrección alguno por esta revisión. Detalle completo: `FASE1_DICTAMEN_PR1433.md`.

## 2. Protección de `main` — FASE 2

**VERIFICADO:** `main` SIN protección (404) ni rulesets (`[]`).

**Recomendación inequívoca: OPCIÓN B** — checks y reglas obligatorios, con el matiz estructural corregido: en un repositorio personal los `bypass_actors` NO existen (feature org-level); el bypass del propietario se materializa como control administrativo auditable (editar/desactivar el ruleset, con registro en el audit log de GitHub), nunca como bypass silencioso. La Opción A (aprobación independiente obligatoria) es inviable: no existe un segundo revisor.

- **PREPARADO:** `RULESET_PROPUESTA_MAIN_v2.json` — ruleset reconstruido con los **7 checks EXACTOS** verificados hoy vía API (Security Audit; Unit & Integration Tests; TypeCheck + Lint + Unit Tests + Build; TypeScript Security Checks; Allowlist Review; SQL Static Checks; SQL DB Security Checks) + `deletion` + `non_fast_forward`; E2E excluido (corre skipped). Plan: crear en modo **`evaluate`** (no bloquea) → 14 días de observación → `active` con autorización aparte. El archivo v1 citado por el expediente no existe en el repo (se perdió con el sandbox) — la v2 lo sustituye corregido.
- **PENDIENTE DE AUTORIZACIÓN:** crear el ruleset (incluso en modo evaluate, que no bloquea nada).
- Detalle: `FASE2_PROTECCION_MAIN.md`.

## 3. Paquetes de ejecución D y C (separados) — FASE 3

**VERIFICADO (21/10, read-only):** ninguna de las dos migraciones está aplicada (columnas de C ausentes; índice de D ausente; legajo `legal_incident` = 0 filas).

- **Paquete D — PREPARADO** (`PAQUETE_D_LEGAL_INCIDENTS.md`): migración `20261020000005` (índice parcial que sostiene el GET admin ya desplegado). Idempotente, aditivo, ~0 filas hoy, coste ≈ 0, reversión sin pérdida (DROP INDEX). Incluye precondiciones, dry-run atómico, apply, post-verificación, criterios de aborto y reversión. **PENDIENTE DE AUTORIZACIÓN.**
- **Paquete C — PREPARADO, CON DOBLE AUTORIZACIÓN EXIGIDA** (`PAQUETE_C_COGS_DERIVED.md`): migración `20261020000004` (5 columnas nuevas; **8 derivables con evidencia `wac_change_log`** — tabla individualizada en el paquete con los 8 valores WAC y sus fuentes documentales — más **624 `not_derivable`**; CERO UPDATE destructivo; idempotente y auto-verificante). **Requiere (1) aprobación contable EXPRESA de los 8 valores y (2) autorización de despliegue separada de D. Una autorización para D NO autoriza C.**
- **Registro sin reaplicación ni ocultar R1 (resolución documental):** la BD viva **NO tiene tabla `schema_migrations`** (verificado hoy: la relación no existe — esa es exactamente la deuda R1, registrada como **CP-INFRA-018** en el worklog maestro). Protocolo para ambas: hash SHA-256 del fichero + dry-run atómico + apply transaccional + post-verificación, todo archivado como evidencia datada — idéntico al patrón F7 ya usado en producción. NO se crea un registro ad-hoc parcial (sembrar una tabla solo para C/D produciría un estado híbrito con falsa completitud). El riesgo de reaplicación accidental es **nulo por diseño**: ambas migraciones son idempotentes (`IF NOT EXISTS`; derivación determinista con DO block de cierre que ABORTA si queda algo sin marcar). La regularización integral de R1 (backfill del registro desde la evidencia histórica) queda como tarea abierta y visible, no oculta.

## 4. Backfill `david9999` — FASE 4

**Estado de la OPERACIÓN — EJECUTADA y VERIFICADA VIVA (21/10):** `tenant_id = 5364ccf8-…` (Default Tenant), fila `dt03_backfill_tenant` en `audit_logs` con la MISMA marca temporal exacta (transacción atómica), NULLs 11→10, alcance de exactamente 1 fila respetado.

**Estado de la AUTORIZACIÓN — PENDIENTE DE DECISIÓN:** la cadena de autorización (ratificación D-3) fue conversacional; conforme a la regla del expediente, ni el audit_log ni los commits del agente cuentan como sustitutos de la autorización formal.

**FICHA DE DECISIÓN PREPARADA** (`FICHA_DECISION_BACKFILL_DAVID9999.md`) con las dos opciones del expediente: **(1) ratificación expresa a posteriori** del propietario tras revisar la evidencia (RECOMENDADA — la operación es correcta, respaldada por pertenencia demostrable, reversible, sin efecto sobre accesos en modo latente) o **(2) remediación conforme al dossier §6** (reversión transaccional exacta que restaura `tenant_id = NULL` + `updated_at` previo). **Ninguna de las dos se ejecuta** sin orden expresa. Sin decisión, el estado documental persiste: operación correcta + autorización formal pendiente.

## 5. Allowlist: las 6 entradas con vencimiento 2026-12-31 — FASE 5

**VERIFICADO (21/10):** allowlist v2 con 97 entradas (91 → 2027-06-30; **6 → 2026-12-31**). Lectura del código del job `Allowlist Review` (evidencia reutilizada, sin repetir pruebas): al vencer una entrada, `expires < now` → `exit 1` → **el check falla (fail-closed) y bloquea todo PR/push** que toque `supabase/migrations/**`, `src/app/api/**`, la allowlist o los scripts del gate.

Fichas individuales en `ALLOWLIST_6_ENTRADAS_2026-12-31.md`. Resumen de las decisiones PROPUESTAS (ninguna ejecutada):

| Entrada | Permiso vivo (documental) | Decisión propuesta |
|---|---|---|
| `check_bulk_ops_hourly_limit` | service_role-only | RENOVAR a 2027-06-30 |
| `get_table_writable_columns` | service_role-only | RENOVAR a 2027-06-30 |
| `validate_backup_registry_drift` | service_role-only | RENOVAR a 2027-06-30 |
| `validate_post_restore` | service_role-only | RENOVAR a 2027-06-30 |
| `validate_pre_restore_fk_integrity` | service_role-only | RENOVAR a 2027-06-30 |
| `validate_store_can_be_modified` | **authenticated CONSERVADO** + service_role | **REVOKE `authenticated` primero** (único caller documentado usa service-role: `stores/bulk/preview/route.ts:115` vía `getSupabaseAdminSafe`) → RENOVAR a 2027-06-30 |

Fundamento común: las 6 son `STABLE` read-only del dominio backup/restore y validación, con REVOKE anon/PUBLIC aplicado; retirarlas de la allowlist produciría falsos positivos permanentes del check 1 (exigir marcadores `auth.uid()` semánticamente inapropiados para helpers internos). La renovación unifica las 97 entradas en una sola fecha de revisión (2027-06-30) — la bomba se agrupa y difiere; la solución definitiva sigue siendo el saneamiento planificado (CP-SEC-005/CP-INFRA-004).

## 6. TABLA FINAL DE AUTORIZACIONES QUE REQUIERO DEL PROPIETARIO

| # | Decisión solicitada | Artefacto listo | Efecto si autoriza | Riesgo |
|---|---|---|---|---|
| A1 | **Fusionar el PR de respaldo de esta misión** (solo documentación: worklog maestro + 24 certificaciones + expediente v5 + evidencia read-only del 21/10; sin cambios de código — el PR #1433 resultó correcto tras verificación forense) | PR en rama `agent/worklog-certificaciones-v5-20261021` | Documenta el programa de resolución y respalda el trabajo del agente en el repo | Nulo (solo `.md` + evidencia) |
| A2 | **Crear el ruleset `protect-main-v2` en modo `evaluate`** | `RULESET_PROPUESTA_MAIN_v2.json` | NADA se bloquea (solo reporta); primer paso real de protección de `main` | Nulo en evaluate |
| A3 | (tras ~14 días de observación) **Pasar el ruleset a `active`** | Ídem (comando PATCH en el JSON) | Bloquea push directo y merges sin checks verdes; el propietario conserva control administrativo auditable | Cambio de flujo de fusión — por eso va en decisión separada |
| A4 | **Aplicar paquete D** (migración `20261020000005` — índice legal incidents) | `PAQUETE_D_LEGAL_INCIDENTS.md` | Completa la Decisión D en producción (índice del GET admin ya desplegado) | Mínimo (índice parcial vacío, reversible sin pérdida) |
| A5 | **Aprobar contablemente los 8 valores WAC** de la tabla §2 del paquete C (individualmente o por lote) | `PAQUETE_C_COGS_DERIVED.md` §2 | Habilita la aplicación de C | Contable: valida el re-costeo de 8 devoluciones del 14/10 con evidencia `wac_change_log` |
| A6 | **Autorizar el despliegue del paquete C** (tras A5) | `PAQUETE_C_COGS_DERIVED.md` | Aplica la migración derivativa (aditiva, idempotente, reversible) | Bajo (sin UPDATE destructivo; ventana fuera de operación) |
| A7 | **Decidir el backfill `david9999`**: ratificar (Opción 1, recomendada) o revertir (Opción 2) | `FICHA_DECISION_BACKFILL_DAVID9999.md` | Ratificar cierra el expediente DT-03; revertir restaura el estado previo exacto | Ratificación: nulo. Reversión: retroceso documental |
| A8 | **Decidir las 6 entradas allowlist** (por lote o individual): 5 renovaciones + 1 REVOKE-antes-de-renovar para `validate_store_can_be_modified` | `ALLOWLIST_6_ENTRADAS_2026-12-31.md` | Evita que el 31-12-2026 el gate `Allowlist Review` se rompa en rojo | Renovar: nulo. No decidir: gate bloqueado en diciembre |

**Restricciones respetadas en esta misión:** no se fusionó PR, no se modificó `main` ni reglas/protección/configuración de GitHub, no se ejecutó DDL/DML/migración/backfill/sync en producción, no se revirtió ni repitió el backfill, no se renovó ni retiró ninguna entrada de la allowlist, no se imprimió/copió/incluyó credencial alguna en los informes, no se crearon auditorías generales redundantes, y ninguna acción preparada se declaró como ejecutada.

**Elaborado y DETENIDO aquí.** Ninguna acción adicional se tomará sin autorización explícita del propietario.
