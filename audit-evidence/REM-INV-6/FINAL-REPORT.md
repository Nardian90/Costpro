# REM-INV-6 FINAL REPORT

BASELINE
HEAD: acb58b24d1a28384370f44d17aefe291a86c5ce7 (al cierre; baseline de entrada = 5ded948e)
ORIGIN: origin/main == acb58b24d1a28384370f44d17aefe291a86c5ce7
WORKTREE: CLEAN

SCOPE
62 LIVE functions: hallazgo REM-INV-5 (RES-5-1) CORREGIDO — el detector de REM-INV-5
  tenía 3 bugs estructurales (lastIndex-skip en archivos multi-función, offset de 2
  chars del keyword AS, auto-match del tag `$$`) que inflaban el número. Censo
  corregido: 97 EXACT + 23 DRIFTED + 14 ABSENT (=134). 62/62+ clasificadas: la tabla
  03-62-function-classification.csv cubre las 134 (superconjunto del hallazgo), C1..C7.
4C DCL: brecha confirmada — current_user_tenant_id() y has_store_role 2-arg sin DCL
  en migraciones (el replay dejaba PUBLIC EXECUTE); has_store_role 3-arg y
  has_store_role_as tenían DCL histórico equivalente. LIVE conservaba intacta la
  política certificada (verificado read-only). Materializada en 20260916000002.

CLASSIFICATION
C1: 97 (representadas; el detector antiguo no las veía)
C2: 23 (migración histórica presente, LIVE reescrito out-of-band)
C3: 14 (creación out-of-band genuina — solo existen en el snapshot LIVE)
C4: 0 (ninguna función del surface es de sistema/tercero)
C5: 0 (ninguna generada/automática)
C6: 0 como categoría final; 9 funciones ABSENT sin callers marcadas con nota
    legacy-candidate dentro de C7 (materializadas; retiro = decisión futura,
    NO ejecutada — Gate D prohíbe DROP sin causa)
C7: 14 (requerían migration canónica → las 14 materializadas en 20260916000001)

SOURCE-OF-TRUTH
Before: replay de migraciones NO reproducía el surface certificado
  (match=32, diff=102: 18 MISSING, 49 ACL-only —incl. PUBLIC EXECUTE residual—,
  35 con drift de cuerpo/props); el snapshot REM-INV-5 estaba obsoleto en 1 función
  (create_store_with_membership, generado antes del apply REM-INV-5).
After: replay ejecutado (PostgreSQL 17.6 real) → 134/134 EXACT (0 DRIFTED/ABSENT);
  Layer C estática 134/134 representadas, 0 divergencias; snapshot regenerado
  134/134 idénticos a LIVE.

MIGRATIONS
Created: 20260916000001_rem_inv_6_materialize_certified_function_surface.sql
  (53 bodies verbatim LIVE + 3 DROP guardados por return type histórico)
  20260916000002_rem_inv_6_reconcile_function_acl.sql (134 DO blocks
  privilegio-guardados; incluye DCL canónico REM-INV-4C)
Modified: ninguno (ninguna migración histórica fue editada)
Retired: 0 funciones (0 DROPs de superficie; los 3 DROP guardados solo afectan a
  firmas históricas incompatibles en replay y son no-op en producción)

ACL
Before: replay dejaba PUBLIC EXECUTE en ~49 funciones SECDEF-write; DCL 4C sin
  materializar (2 funciones); 5 funciones con PUBLIC EXECUTE explícito (estado
  certificado pre-existente, se reproduce fielmente).
After: 134/134 con grants idénticos al estado certificado (semántica de conjunto,
  owner excluido); guards → producción sin cambio (delta 0).

CI
Layer A: 134/134 (snapshot regenerado, formato v2 con owner+proacl verbatim)
Layer B: 174 funciones SECDEF-write verificadas, 17 baseline (9 REM-INV-5 + 13
  nuevas REM-INV-6 con reason/added_by/expires=2026-12-31), 0 nuevas
Layer C: NUEVA — 134/134 representadas, 0 divergencias (bloquea PR ante función
  LIVE sin migración, ACL no representado, cambio de SECDEF/search_path, o
  eliminación sin migración)
Negative tests: 4/4 PASS (exit 1/1/1/0) + caso extra (exit 0) sobre copia aislada

REGRESSION
Vitest: exit 0 — 2070 passed | 24 skipped (== baseline)
TSC: exit 0 (0 errores) (== baseline)
Lint: exit 0 — 0 errores / 1291 warnings (== baseline)
Build: local no ejecutado (OOM host conocido exit 137, documentado, no ocultado);
  GitHub Actions Build SUCCESS (run 34927106899)

PRODUCTION
DDL applied: 20260916000001 + 20260916000002 (HTTP 201 ×2, 1 transacción cada una)
Objects changed: changed=0 added=0 removed=0 sobre fingerprint completo de 484
  funciones (def_md5/proacl/prosecdef/proconfig/owner campo a campo)
Unexpected changes: 0 — EXPECTED DELTA (ZERO) == ACTUAL DELTA

ZERO-TOUCH
ENERVIDA: IDENTICAL (stores, products, inventory, stock_movements, transactions,
  payment_transactions, receipts, devolutions, production_orders, audit_logs...)
Puerto Padre: IDENTICAL — 15/15 tablas business rows+max(created_at) PRE==POST

SECURITY
Contract: LIVE PRE=134/134, POST=134/134 · estático 3 capas exit 0 PRE y POST
Unexpected violations: 0
REAL_SECRET: 0 (scan final 4780 archivos; 15 hits = fragmentos documentales
  truncados `sbp_...` en evidence packs históricos + placeholder RES-5-3 conocido)

EVIDENCE
Files: audit-evidence/REM-INV-6/ 01-baseline … 18-git-closure (18 artefactos)
SHA256: MANIFEST.sha256 (18/18 OK)
Manifest: verificado con sha256sum -c

GIT
Commit: acb58b24 "REM-INV-6: reconcile live security surface with migrations"
Remote: origin/main == acb58b24 (push verificado; HEAD == origin/main; CLEAN)
Closure: gate-closure-check.sh → CLOSURE OK

CI (real, GitHub Actions run 34927106899 sobre acb58b24)
Security Audit: SUCCESS (paso "Security contract (static, CI-safe)" = 3 capas) ✓
TypeCheck+Lint+Tests+Build: SUCCESS ✓
E2E Playwright: independiente del veredicto de seguridad; en curso al cierre de la
  evidencia (la ejecución de security/quality ya es SUCCESS y vinculante).

FINAL VERDICT
CERTIFIED — SOURCE OF TRUTH RECONCILED

Criterios (§30): 134/134 clasificadas ✓ · 0 C7 sin representar ✓ · DCL 4C
representado ✓ · migration replay reproducible (ejecutado, 134/134 EXACT) ✓ ·
Layer A PASS ✓ · Layer B PASS ✓ · Layer C PASS ✓ · CI negative tests PASS ✓ ·
production delta exact (0/0/0) ✓ · ENERVIDA zero-touch ✓ · Puerto Padre
zero-touch ✓ · security regression PASS ✓ · TSC PASS ✓ · lint PASS ✓ ·
secret scan REAL_SECRET=0 ✓ · Git sincronizado ✓ · WORKTREE CLEAN ✓

La pregunta final ("si mañana reconstruimos PostgreSQL desde Git/migrations en una
base limpia, ¿obtenemos la misma superficie de seguridad certificada?") ahora tiene
respuesta demostrada para la SUPERFICIE DE SEGURIDAD: sí — replay ejecutado real
(134/134 EXACT en cuerpo/SECDEF/search_path/ACL) + CI permanente (Layer C bloquea
cualquier divergencia futura). Limitación honesta: el esquema BASE de negocio
(tablas/enums pre-disciplina) sigue sin migración de creación — el replay
full-table completo requiere un baseline-migration de esquema, fuera del alcance
quirúrgico de este gate (ver RESIDUAL RISKS).

RESIDUAL RISKS
- RES-6-1 (estructural, documentado, no bloqueante para la superficie de seguridad):
  el stream NO incluye la migración del esquema base de negocio (tablas/enums
  creados out-of-band pre-disciplina). Un replay FULL-TABLE desde cero sigue
  siendo imposible (153/435 OK — diagnóstico 08). Recomendación: baseline-migration
  de esquema en un gate futuro (no es deuda de seguridad).
- RES-6-2 (cosmético, documentado): 2 funciones del replay (create_sale_v2,
  withdraw_production_item_v3) quedan con proacl set-equal pero orden de entradas
  distinto al LIVE (PG materializa owner primero). Privilegios idénticos; no se
  tocó producción para evitar churn cosmético.
- RES-6-3 (pre-existente, heredado): 5 funciones con PUBLIC EXECUTE explícito
  (create_sale_v2, register_reception, reverse_receipt_v2, void_pending_reception,
  void_transaction) — estado certificado pre-existente reproducido fielmente;
  su endurecimiento sería un cambio de contrato (fuera de alcance).
- RES-6-4 (pre-existente): build local OOM host (exit 137) — limitación de
  infraestructura conocida; CI lo ejecuta con SUCCESS.
- RES-6-5 (pre-existente, informativo): scripts/apply-sql-migration.js:10 contiene
  ilustración de formato `SUPABASE_ACCESS_TOKEN=sbp_...` (falso positivo seguro).
- RES-6-6 (informativo): 9 funciones del surface sin callers detectados
  (legacy candidates) fueron MATERIALIZADAS (no retiradas) — su retiro exige
  decisión de producto y estrategia segura (Gate D/K), fuera de este gate.
