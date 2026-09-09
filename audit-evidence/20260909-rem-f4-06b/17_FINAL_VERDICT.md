# REM-F4-06b — FINAL VERDICT

## Baseline
HEAD: 35f326caa701414d6ecb8bbdb439004adfcd6fc5 (fix(audit): remediate F4-03 production withdrawal)
origin/main: 35f326caa701414d6ecb8bbdb439004adfcd6fc5 (idéntico al HEAD al inicio del gate)
worktree: LIMPIO (solo entradas no rastreadas de este gate: migración + evidence pack)

## Finding
`audit_fiscal_closings_changes()` (trigger AFTER INSERT OR UPDATE de
`fiscal_closings`) abortaba TODA escritura de la tabla. Defecto COMPUESTO en
el mismo objeto: (D2) asignaba `NEW.id::text` a `audit_logs.record_id`
(uuid) → SQLSTATE 42804 «column "record_id" is of type uuid but expression
is of type text»; (D1) la metadata del MISMO INSERT referenciaba
`NEW.year`/`NEW.month`, columnas que nunca existieron (reales:
`period_year`/`period_month`) → SQLSTATE 42703, que enmascaraba al 42804.
Resultado: 0 filas en fiscal_closings desde 20260809, 0 auditoría fiscal,
HTTP 500 en caminos de aplicación. Reproducido en vivo PRE-fix (DB: 02;
HTTP: 03) y mecanismo 42804 demostrado aislado (02, PRE-A3).

## Root Cause
La migración 20260809000004_v2_18_4_audit_triggers.sql escribió el trigger
con nombres de columna conceptuales (year/month) inexistentes desde la
creación de la tabla (20260726000002 usa period_year/period_month) y con un
cast `::text` contrario al contrato canónico uuid→uuid
(`audit_cash_closures_changes`: `v_record_id := NEW.id`). El trigger jamás
funcionó; quedó inadvertido porque ningún flujo HTTP escribía
fiscal_closings de extremo a extremo (close escribe fiscal_period_closures;
el lock HTTP está roto independientemente — OF-1).

## Remediation
Migración nueva `supabase/migrations/20260909000003_rem_f4_06b_audit_fiscal_closing_record_id_uuid.sql`
(CREATE OR REPLACE FUNCTION; migraciones históricas intactas) con guards
PRE (tipos uuid, objetos, trigger habilitado, estado defectuoso esperado o
ya-remediado) y POST (sin ::text, referencias correctas, SECDEF/search_path/
owner/firma/trigger preservados; fallo ⇒ rollback transaccional total).
Aplicada vía Management API en una sola transacción (HTTP 201, log raw).
Cambio exacto (3 líneas): `CASE ... NEW.id::text ELSE NEW.id::text END` →
`NEW.id`; `NEW.year` → `NEW.period_year`; `NEW.month` → `NEW.period_month`
(claves JSON 'year'/'month' conservadas). Nota de alcance: D1 es intra-objeto
y NECESARIO para que D2 sea operativo (condicional §5 falsa; criterios §24
INSERT/UPDATE PASS lo exigen) — documentado en 04/06.

## Scope Integrity
Objetos modificados: UNO — public.audit_fiscal_closings_changes() (cuerpo).
Objetos deliberadamente no modificados: audit_logs (record_id sigue uuid),
fiscal_closings (esquema/RLS/ACL), prevent_fiscal_closing_edit() y su
trigger, trg_audit_fiscal_closings (definición/eventos), resto de audit_*
(censo 05), close/lock/ensure/reset RPCs, src/, grants, RLS, producción
(ENERVIDA/PUERTO PADRE intocadas), migraciones históricas.

## Functional
INSERT: PASS — BD, ctx authenticated, trigger activo → audit row
FISCAL_CLOSING_CREATED; record_id = fiscal_closings.id; pg_typeof=uuid;
store_id/user_id/metadata correctos (09 P1; PRE era 42703/42804).
UPDATE: PASS — open→closed (09 P2) y closed→locked — operación EXACTA de
lock_fiscal_period — (09 P3): audit row FISCAL_CLOSING_UPDATED con
OLD/NEW representados vía metadata (tg_op/status), record_id uuid.
DELETE: NO APLICA (diferencia de contrato documentada) — el trigger NO
cubre DELETE (AFTER INSERT OR UPDATE) y RLS no define DELETE; probado que
DELETE no genera auditoría (02 PRE-D) — no defecto.
Atomicity: PASS — fallo forzado DESPUÉS de la auditoría revirtió negocio +
auditoría + DDL transitorio (0 persistencia, 0 residuo); caso de éxito con
ambas persistidas; operación de negocio fallida → 0 auditoría (10).

## UUID Integrity
commission/fiscal source id: fiscal_closings.id = uuid (y
commission_payments.id = uuid verificado intacto en §2).
audit_logs.record_id: uuid (tipo canónico sin cambio).
Result: uuid = uuid — sweep total: 3/3 filas con record_id = id del negocio,
pg_typeof(record_id)=uuid, metadata consistente con el cierre unido
(0 mezclas), 0 huérfanos (09 P4). No se aceptó texto, cast implícito,
cast dinámico ni cambio de esquema.

## Idempotency
Result: PASS — ensure_fiscal_period ×2 → mismo id, 1 fila, 1 audit CREATED
(sin duplicados); retry de lock → 0 filas, 0 auditoría adicional (contrato
ERR_NOT_CLOSED del RPC documentado); INSERT duplicado (unique
store+periodo) → 23505 sin auditoría. No se inventó idempotencia nueva.

## Concurrency
Result: PASS — C-A: dos lock-UPDATE concurrentes al MISMO cierre → 1 sesión
aplica, 1 audit row, estado consistente; C-B: cierres distintos → ambos
exitosos, cada audit row con SU uuid (sin mezcla); C-C: ensure concurrente
en periodo nuevo bajo carrera → 1 fila, 1 audit CREATED, sin corrupción.

## Security
Anon: DENY — POST y GET /api/fiscal-close sin sesión → HTTP 401.
Non-member: DENY — RLS: SELECT 0 filas, UPDATE 0 filas (ctx authenticated
sin membresía).
Cross-store: DENY — has_store_access_as(non-member, STORE_B)=false; EXECUTE
de close/lock_fiscal_period denegado a authenticated (42501; ACL solo
postgres/service_role).
Authorized: PASS — ctx authenticated del usuario fixture ejecuta INSERT/
UPDATE con auditoría correcta (09).
RLS/ACL/SECURITY DEFINER/ownership/search_path: re-verificados POST —
intactos (13 S4; 08).

## Regression
Vitest: 2058 PASS / 0 FAIL / 24 SKIP (idéntico al baseline)
TSC: 0 errores (exit 0)
Lint: 0 errores / 1291 warnings (idéntico al baseline)
Build: INFRASTRUCTURE OOM clasificado — compiló (Turbopack Next 16.3.0),
exit 137 Killed, dmesg: «Out of memory: Killed process 7788 (next-build
(v16))» global_oom, anon-rss ≈2.4GB; TSC independiente 0; log sin errores
de código; config sin alterar — las 5 condiciones §18 demostradas
(antecedente idéntico F4-03/04/06).
PM2: 3/3 online, 0 restarts (uptime >72m durante todo el gate)
Health: /api/health HTTP 200, / HTTP 200

## Production Zero-Touch
ENERVIDA: PRE == POST — 13/13 métricas idénticas (conteos, sumas monetarias,
hashes md5 de contenido de products/stock_movements/transactions/
commission_payments/audit_logs). md5 canónico 427e64eb0806e812a207e3e554945ba8.
PUERTO PADRE: PRE == POST — idéntico, mismo md5 canónico.
(14_ZERO_TOUCH; raws ztx_PRE/ztx_POST; determinismo PRE verificado con doble
captura idéntica.)

## Sibling Census
Hallazgos adicionales: OF-1 (ALTA): POST /api/fiscal-close action='lock'
SIEMPRE 500 por desajuste ruta→RPC — la ruta pasa `p_user_id` y
`lock_fiscal_period(uuid,integer,integer)` no lo acepta → PostgREST no
resuelve la función. Defecto en src/ INDEPENDIENTE del trigger; NO corregido
(fuera del alcance quirúrgico; directiva §0). Reproducido en vivo (03).
Recomendación: gate de seguimiento REM-F4-06c + E2E HTTP del lock.
OF-2 (MEDIA, administrativa): el commit de REM-F4-06 (87cd4a49) no llegó a
origin/main; su EFECTO en BD sí está vivo y verificado intacto
(audit_commission_payments_changes sin ::text, §2). Reconstruir artefacto
administrativo en gate dedicado. OF-3 (ALTA): close_fiscal_period
referencia la tabla `fiscal_period_closures` que NO existe en ningún
relkind → la acción 'close' es 500 estructural; NO corregido (fuera de
alcance); descubierto durante zero-touch (tabla ausente, determinista).
Ningún otro patrón NEW/OLD.id::text en audit_* (censo 05: único defecto
era el objeto objetivo).

## Evidence
Documents: audit-evidence/20260909-rem-f4-06b/00…17 (17 documentos + SHA256SUMS)
Raw: raw/ (queries SQL, runners, salidas vivas PRE/POST, snapshots
zero-touch PRE/POST, logs de build/oom, definición PRE de la función)
SHA256: SHA256SUMS verificado con `sha256sum -c SHA256SUMS` → ALL OK
(hashes NO auto-referenciales, §20).

## Git
Local: commit `fix(db): remediate fiscal closing audit uuid integrity` sobre
base 35f326caa701414d6ecb8bbdb439004adfcd6fc5 — hash exacto vía
`git rev-parse HEAD` (no incrustado aquí por §20).
Remote: verificado tras `git push origin main` — resultado en reporte final
del gate y worklog.md.
Push: ejecutado con credenciales seguras preexistentes; sin PAT en chat,
archivos ni logs; sin force push.
LOCAL == REMOTE: verificado en vivo post-push (reporte final / worklog).

## Open Findings

- OF-1: wiring ruta→RPC del lock fiscal (src/app/api/fiscal-close/route.ts
  pasa p_user_id; lock_fiscal_period no lo acepta) — severidad ALTA —
  impacto: lock HTTP siempre 500 — evidencia: raw/pre_http_out.txt —
  recomendación: REM-F4-06c (alinear firma/llamada + E2E HTTP).
- OF-2: trazabilidad REM-F4-06 (commit no pusheado; efecto BD vivo y
  verificado) — severidad MEDIA — recomendación: gate administrativo de
  reconstrucción de artefacto.
- OF-3: fiscal_period_closures inexistente (close_fiscal_period roto
  estructuralmente) — severidad ALTA — evidencia: raw/out_q01.txt
  (censo de relkinds), q13 — recomendación: incluir en REM-F4-06c o gate de
  flujos fiscales; NO corregido aquí.

## VERDICT
TECHNICAL: PASS — todos los criterios §24 de la remediación cumplidos con
evidencia reproducible (reproducción PRE, causa raíz, migración con guards,
alcance quirúrgico, integridad uuid, funcional, atomicidad, idempotencia,
concurrencia, seguridad, RLS/ACL/SECDEF intactos, zero-touch producción,
regresión en baseline, PM2/health, secret scan limpio, SHA256SUMS OK).
ADMINISTRATIVE: PUSH RESULT DOCUMENTED IN FINAL GATE REPORT — cierre
administrativo condicionado a LOCAL == origin/main verificado post-push
(§23/§24); si el push hubiese fallado por credenciales, queda
TECHNICAL PASS / ADMINISTRATIVE PENDING sin pedir credenciales por chat.

## NEXT GATE
STOP ejecutado (§27): NO se ejecuta E2E-2, ni FASE 7/9, ni otras
correcciones. El único siguiente paso autorizado es decidir formalmente si
E2E-2 queda autorizado (recomendación previa: resolver OF-1/OF-3 vía
REM-F4-06c para que los flujos fiscales HTTP estén operativos antes del
E2E-2).
