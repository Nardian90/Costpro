# 05 — DDL EXECUTION (REM-INV-2R, fases 6-8)

## Artefacto diferido heredado y su fortalecimiento

Artefacto original: `audit-evidence/REM-INV-2/assets/deferred-db-remediation.sql` (fase 6).
Contenía: guards STEP 0 (3 queries), REVOKE authenticated+anon (STEP 1), verificación por
invocación con SET ROLE (STEP 2), `DROP FUNCTION IF EXISTS` (STEP 3).

Fortalecimientos aplicados (runner `scripts/rem-inv-2r/ddl-finalize.mjs` — fuera del repo):

| # | Debilidad del artefacto | Fortalecimiento |
|---|---|---|
| 1 | No pineaba identidad del objeto | Pin de oid=25452 + firma `p_purchase_id uuid` + sha256 de definición `3c471307…` — anti-confusión absoluta |
| 2 | Guard de dependencias incompleto | 7 guards DB: callers internos, triggers, pg_depend, vistas, policies, column defaults, sobrecargas — todos expect 0 filas |
| 3 | Guard canónicas ausente | Pin de oid de receive_against_po/register_reception/confirm_pending_reception (+presencia de void_reception_with_reversal) |
| 4 | STEP 2 verificaba EXECUTE INVOCANDO la RPC (riesgo de RPC mutativa en producción si el REVOKE hubiera fallado) | Sustituido por `has_function_privilege()` — SELECT-only, jamás invoca |
| 5 | `DROP FUNCTION IF EXISTS` | `DROP FUNCTION public.receive_purchase(uuid)` estricto (sin IF EXISTS, SIN CASCADE); un estado inesperado produce error visible, no silencio |
| 6 | Sin re-verificación post-DROP | P1 (ausencia) + P2 (canónicas 4/4 presentes) post-DROP |
| 7 | Ejecución monolítica | Modo rehearsal `--check` (17 guards, 0 mutación) + modo `--execute` con abort si cualquier guard falla |

## Guards en modo execute — TODOS PASS (17/17)

```text
G1.1 exactly one receive_purchase in public :: rows=1          PASS
G1.2 identity args == p_purchase_id uuid                       PASS
G1.3 oid matches PRE snapshot (25452)                          PASS
G1.4 definition sha256 matches PRE (3c471307…)                 PASS
G1.5 SECURITY INVOKER                                          PASS
G1.6 ACL PRE as reported                                       PASS
G2.1 internal DB callers            :: rows=0                  PASS
G2.2 triggers on/refs target        :: rows=0                  PASS
G2.3 pg_depend refs target          :: rows=0                  PASS
G2.4 views referencing target       :: rows=0                  PASS
G2.5 policies referencing target    :: rows=0                  PASS
G2.6 column defaults                :: rows=0                  PASS
G2.7 single signature (no overloads):: rows=1                  PASS
G3   canonical receive_against_po (oid 138544)                 PASS
G3   canonical register_reception (oid 138536)                 PASS
G3   canonical confirm_pending_reception (oid 136713)          PASS
G3   canonical void_reception_with_reversal (oid 136714)       PASS
```

App-side caller count re-verificado fresco inmediatamente antes del DDL: **0** (solo el
test pin permanente permitido).

## DDL ejecutado (fases 7-8, con canal Management API autorizado por este gate)

```sql
-- PHASE 7 — REVOKE (exactamente lo necesario)
REVOKE EXECUTE ON FUNCTION public.receive_purchase(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.receive_purchase(uuid) FROM anon;  -- no-op defensivo
-- (REVOKE FROM public: NO CORRESPONDE según ACL PRE — ver 04-pre-ddl-acl.md)

-- PHASE 8 — DROP (estricto, SIN CASCADE)
DROP FUNCTION public.receive_purchase(uuid);
```

## Resultado

```text
REVOKE authenticated :: OK
REVOKE anon :: OK (no-op)
POST-REVOKE privileges :: authenticated=false anon=false service_role=true postgres=true
V1 authenticated EXECUTE revoked :: PASS
V1 anon EXECUTE revoked          :: PASS
DROP FUNCTION public.receive_purchase(uuid) :: OK (no CASCADE used, no dependency error)
P1 receive_purchase absent after DROP       :: PASS (rows=0)
P2 canonical functions still present (4/4)  :: PASS
```

Raw: `assets/ddl-runner-check.json` (rehearsal), `assets/ddl-runner-execute.json` (ejecución).

## Datos de negocio

Cero INSERT/UPDATE/DELETE/UPSERT sobre datos productivos. Cero RPC de negocio mutativa
invocada sobre producción. Las únicas sentencias no-SELECT ejecutadas fueron las tres
anteriores, todas sobre la definición del objeto objetivo.
