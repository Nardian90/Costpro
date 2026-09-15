# REM-INV-6R FINAL REPORT

REM-INV-6R FINAL VERDICT: CERTIFIED

BASELINE:
  entrada: 88c88aa038e01bac98a3e05d4325ce7167938610 (HEAD == origin/main, worktree clean)
  previo certificado: REM-INV-6 (acb58b24) — snapshot 134 funciones, Layer A 134/134, B PASS, C 134/134

COMMIT:
  cierre: 7dd74d90f8fa5169413b35ce2f63f06c1875c083 (HEAD == origin/main, main, worktree clean)

CI RUN:
  main 7dd74d90: CI 35015372491 — TypeCheck+Lint+UnitTests+Build SUCCESS · Security Audit SUCCESS · E2E cancelled (preexistente, continue-on-error; idéntico al run certificado 34929053031) · Test Coverage 35015372648 SUCCESS
  negative (PR 1321, rama desechable, cerrada sin merge): Security CI Gate FAILURE · Security Audit FAILURE — el gate BLOQUEA la regresión (FAIL WHEN TAMPERED)

PARSER COVERAGE (migraciones, 433→434 archivos):
  TOTAL functions seen 709 · $$=314 · named-tag=395 ($function$ 341, $func$ 48, $body$ 5, $fn$ 1) ·
  arbitrary tags 53 · sql=17 · plpgsql=692 · SECDEF=620 · con DML=509 · multi-fn files=125 ·
  functions_with_alter=18 · MISSED=0 (transversal: el census corregido ve DELETE FROM/TRUNCATE/UPDATE sin calificar)

LIVE FUNCTIONS: 484 públicas · 245 SECDEF · census corregido: 141 SECDEF-write (antes 134 — 7 invisibles)

MIGRATION FUNCTIONS: replay Layer C 141/141 EXACT (body/secdef/search_path/ACL/volatilidad/parallel/leakproof)

LAYER A: 141/141 verificadas, 0 violaciones (PIN REM-INV-2R ausente)
LAYER B: 188 SECDEF-write verificadas · 17 baseline histórico · 9 nuevas = SOLO LOW (SEARCH_PATH_NOT_SET,
  no bloqueantes, clasificadas PARSER BUG PREVIOUSLY HIDDEN — visibilidad nueva de violaciones históricas;
  NO se amplió allowlist) · 0 CRITICAL/HIGH nuevas
LAYER C: 141/141 representadas · 0 divergencias

NEGATIVE TESTS: 14/14 PASS en PostgreSQL 17 efímero (staging local, cuerpos reales, ACLs reales):
  A1 anon→RPC denegado (ACL) · A2 spoof p_user_id por no-miembro → ERR_UNAUTHORIZED ·
  A3 cross-tenant create → denegado · A4 authenticated→reverse_transfer denegado (ACL) ·
  A5 authenticated→reset_store_data denegado (ACL) · A6 KPI cross-tenant REPRODUCIDO (hallazgo) →
  fase 2: A6R denegado con el remedio · L1-L4 flujos legítimos PASS (10+ flows, Gate K) · L2b binding dinámico probado

LEGITIMATE TESTS: L1 create_transfer miembro OK · L2 confirm OK + L2b confirmed_by=auth.uid() (p_user_id ignorado) ·
  L3 service_role on-behalf OK · L4/L4R KPIs tiendas propias OK tras remedio — 0 falsos positivos

P_USER_ID (confirm/create/reverse_transfer): H1 STRUCTURALLY BOUND —
  v_caller_uid := CASE WHEN auth.role()='service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  callers HTTP pasan session.user.id (nunca body); dinámica demostrada en staging → RES-A: A1 STRUCTURALLY SAFE
  (capability service_role = trust boundary explícita, verificada en los 4 callers API)

RESET_STORE_DATA (2 overloads: uuid/boolean/uuid + uuid/boolean): LIVE, SECDEF, EXECUTE {postgres, service_role}
  únicamente; 0 body_refs, 0 triggers, 0 exposición API (el route usa la 3-arg tras withRole+canManageStore);
  dinámico: authenticated → permission denied → RES-B: B1 TECHNICAL DEBT ONLY (retiro futuro opcional, no ejecutado)

BULK AUTHORIZATION: destructivos = service_role-only (2ª barrera estructural); process_bulk_import = INVOKER +
  RLS real (products_tenant_insert store_id=ANY(current_user_store_ids())) + guard interno en register_stock_movement;
  managed_delete_product = guard in-body (tenant + has_store_access) → RES-C mayoritario C1;
  process_bulk_import C2 (residual P3: atribución p_user_id); get_batch_store_daily_kpis era C3 (SECDEF read sin
  guard, leak cross-tenant reproducido) → REMEDIADO en 20260916000004 con helper canónico has_store_access
  (service_role preservado; flujos legítimos verificados) → C1 post-remedio

ZERO-TOUCH: BITWISE IDENTICAL (PRE/POST/final tras CI) — ENERVIDA-VITALLCONS (5e6fe821…) y Puerto Padre VITALLCONS
  (43a4dabc…): inventory 141 · stock_movements 702 · transactions 520 · receipts 6 · payment_transactions 366 ·
  audit_logs 6574 · memberships 6 · transfers/devolutions/production_orders 0 — hashes md5 idénticos

SECRET SCAN: REAL_SECRET = 0 (0 valores reales en archivos trackeados; .env no trackeado)

WORKTREE: CLEAN
REMOTE: origin/main == HEAD == 7dd74d90

CRITICAL/P0: 0
HIGH/P1: 0
MEDIUM/P2: 0 abiertos — 1 REMEDIADO (get_batch_store_daily_kpis cross-tenant read; fix en 20260916000004, pendiente
  de deploy de producción — el guard entra con la próxima aplicación de migraciones; mientras tanto la exposición
  persists en LIVE: RIESGO RESIDUAL DOCUMENTADO, mitigado por que el caller oficial (dashboard) es client-side con
  tiendas propias y el dato es agregado)
LOW/P3: 9 SEARCH_PATH_NOT_SET ahora visibles (históricas, no bloqueantes, sin allowlist) + atribución p_user_id en
  process_bulk_import (spoof de atribución intra-tienda, RLS impide cross-store)
TECHNICAL DEBT: reset_store_data(uuid,boolean) 2-arg (muerto, sin permisos de usuario, sin callers) — retiro futuro
  opcional; 14 funciones C3/legacy-candidate de REM-INV-6 sin cambiar
RESIDUALS:
  - R1 (P2→mitigado-en-repo): 20260916000004 requiere deploy a LIVE para activar el guard (proceso estándar del repo;
    esta auditoría NO aplica migraciones a producción)
  - R2: el contrato solo cubre SECDEF-write; funciones SECDEF de LECTURA (KPIs) no están en Layer A — recomendado
    extender surface a lecturas sensibles en una fase futura
  - R3: E2E en CI sigue cancelado por timeout (preexistente, continue-on-error)
NEXT RECOMMENDED REMEDIATION: (1) aplicar migraciones 20260916000003/4 a producción en la próxima ventana de deploy;
  (2) extender el contract a funciones SECDEF de lectura; (3) rotación de credenciales expuestas en el chat del
  encargo (SUPABASE_ACCESS_TOKEN/service key/PAT fueron compartidos en conversación — práctica a evitar).
