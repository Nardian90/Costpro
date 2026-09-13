# 02 — DEPENDENCY ANALYSIS (REM-INV-2R, fase 2)

## PostgreSQL — todas las clases de dependencia consultadas (SELECT-only)

| Superficie | Query | Resultado PRE | Resultado POST |
|---|---|---|---|
| Callers internos DB (prosrc de otras funciones) | regex word-boundary sobre pg_get_functiondef de TODA función public | 0 filas | 0 filas |
| Triggers cuya función es/referencia receive_purchase | pg_trigger × pg_proc | 0 filas | 0 filas |
| pg_depend con refobjid = receive_purchase(uuid) | pg_depend | 0 filas | (42883: objeto no existe — prueba positiva de ausencia) |
| Vistas que la referencian | pg_views | 0 filas | 0 filas |
| Rewrite rules que la referencian | pg_rewrite × pg_get_viewdef | 0 filas | 0 filas |
| Policies (qual / with_check) | pg_policies | 0 filas | 0 filas |
| Column defaults / generated expressions | information_schema.columns | 0 filas | 0 filas |
| Event triggers | pg_event_trigger | 6 (infraestructura Supabase estándar: pgrst_ddl_watch, pgrst_drop_watch, graphql/pg_cron/pg_net access — ninguno depende de receive_purchase) | 6 (sin cambios) |
| Sobrecargas / otras firmas | pg_proc por proname | 1 (solo public.receive_purchase(uuid), oid 25452) | 0 |

Raw: `assets/phase2-dependency-pre.json`, `assets/phase2-dependency-post.json`.

## Repositorio — búsqueda completa de `receive_purchase`

Método: `git grep` sobre árbol trackeado (excluye node_modules/.git/.next por naturaleza)
+ rg dirigido en directorios vivos (src/ supabase/ scripts/ e2e/).

Resultado PRE-DDL (repetido fresco inmediatamente antes de ejecutar el DDL):

- Código vivo (src, supabase, scripts, e2e): **0 callers**.
- Apariciones totales fuera de audit-evidence: 1 archivo —
  `src/__tests__/integration/rem-inv-2-dynamic-reachability.test.ts` (test pin permanente
  de REM-INV-2: comentario + assertion GATE de no invocación). PERMITIDO por el mandato.
- Resto de apariciones: `audit-evidence/**` (evidencia histórica de REM-V2-1, REM-INV-1,
  REM-INV-2 y snapshots de recuperación 20260828/20260830). PERMITIDO por el mandato.

Clasificación de callers: ACTIVE=0 · DEAD=0 · LEGACY=0 · TEST ONLY=1 (pin) ·
ADMIN ONLY=0 · SERVICE ROLE ONLY=0 · UNKNOWN=0.

## Conclusión

La eliminación de `receive_purchase(uuid)` no rompe ninguna dependencia en DB ni en código.
**DROP directo justificado sin CASCADE** (y CASCADE prohibido por mandato).
