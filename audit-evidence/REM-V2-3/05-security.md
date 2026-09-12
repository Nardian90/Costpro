# 05 — SECURITY CONTRACT (PHASE 9)

Método: censo de ACL/GRANT en PRODUCCIÓN vía catálogo (solo SELECT; **NO se modificó ningún ACL**)
+ herencia de security tests efímeros (REM-V2-2/2.1: clerk→403, cross-store→ERR_STORE_MISMATCH,
spoofed p_user_id rechazado, anon→401; árbol idéntico verificado).

## ACL reales en producción (pg_proc.proacl, 2026-09-12)

| Función | EXECUTE | search_path | Implicación |
|---|---|---|---|
| `reverse_receipt` (V1) | postgres, service_role — **sin authenticated** | public | Ningún usuario JWT puede llamarla vía PostgREST; única vía era el admin client del API (flag=false) |
| `reverse_adjustment` (V1) | postgres, service_role — **sin authenticated** | public | ídem |
| `reverse_receipt_v2` | postgres, authenticated, service_role | public, pg_temp | llamable por usuarios autenticados — con validación interna |
| `reverse_inventory_adjustment_v2` | postgres, service_role — sin authenticated | public, pg_temp | solo admin client (ruta) |
| `void_transaction` | postgres, authenticated, service_role | pg_catalog, public | undo POS via JWT — REQUERIDO |
| `create_sale` | postgres, authenticated, service_role | public, pg_temp | fallback fail-closed (allow-list) |

## Verificación de que el retiro no genera fallback inseguro

1. PRE-retiro, el único camino dinámico a V1 era: `USE_V2_REVERSE=false` → admin client (service_role)
   ejecuta `reverse_receipt`/`reverse_adjustment`. La autenticación/autorización la ponía el API
   (`withAuth` + `can_reverse_document` B-10) — la V1 no tenía rol-check interno (R-04 heredado,
   OBSERVATION P2-candidato sin cambio).
2. POST-retiro, ese MISMO camino resuelve a las V2 con **igual o mayor** hardening (audit_logs,
   FOR UPDATE, fail-closed de estado). La autorización del API es idéntica (B-10 boundary intacta).
3. anonymous: sin sesión → 401 en la ruta (probe vivo heredado REM-V2-2.1 E3); ACL anon = NONE
   en todas las funciones del censo. Spoofed user_id: mitigación p_user_id (20260727000006)
   intacta en ambas generaciones; caller_uid de sesión manda.
4. `SECURITY DEFINER` + `search_path` fijado en todas (sin SEARCH_PATH mutable) — sin regresión.
5. GRANT/REVOKE: **0 cambios** en este gate (zero-touch verificado — catálogo pre/post idéntico).

**Veredicto PHASE 9: SECURITY PASS** — el retiro no abre ningún camino inseguro; reduce superficie
(el fallback ya no puede resolver a funciones sin auditoría).
