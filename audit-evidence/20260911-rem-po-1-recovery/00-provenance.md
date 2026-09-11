# RECOVERY-PO-1 — Pack de evidencia de recuperación de REM-PO-1

Fecha: 2026-09-11 · Alcance: recuperación y publicación del trabajo REM-PO-1
Baseline: `f59b8883a671299220d87b9fb1e42c9039ed1719` (== origin/main al inicio de este gate)

## 1. Qué ocurrió

REM-PO-1 (mismo día, ~01:00–04:48 UTC) completó su remediación y produjo 3 commits
locales (`82e0f953` fix+evidencia, `e2d8cc95` sync, `3d5ed7b9` push-status) con push
PENDIENTE por ausencia de credenciales (§32 de ese gate). Entre esa sesión y la
actual, el workspace fue recreado: el repositorio de trabajo
(`/home/z/my-project/Costpro`) fue eliminado junto con sus commits y su evidence
pack `audit-evidence/20260911-rem-po-1/` (62 archivos, SHA256SUMS 62/62).

## 2. Búsqueda forense (no destructiva) — resultado

| Fuente | Resultado |
|---|---|
| `/home/z/my-project` (scaffold nuevo) | reflog solo scaffold 2026-08-29/30; sin remote; SHA ausentes (`raws/02-sha-probe-home.txt`) |
| fsck --unreachable del scaffold | solo objetos del scaffold; nada de REM-PO-1 |
| `/tmp/my-project` (mirror de gates previos) | snapshot de la era W9/REM-SEC-1; sin artifacts 20260911 salvo `worklog.md` (Task 6) |
| `.initial_snapshot.json` | registra entrada `Costpro` (mtime 02:47 UTC) que ya no existe: el repo fue borrado, no respaldado |
| 2354 refs de GitHub (`raws/03-remote-refs.txt`) | NINGÚN ref contiene `82e0f953`/`e2d8cc95`/`3d5ed7b9`; origin/main = baseline |
| FS completo (bundles/patches/trash) | sin restos recuperables |

CONCLUSIÓN: los 3 commits son IRRECUPERABLES como objetos Git.

## 3. Reconstrucción basada en evidencia (no de memoria)

La remediación REM-PO-1 fue APLICADA a la base de datos Supabase en vivo y la DB
no fue afectada por el reset del workspace: el catálogo PostgreSQL ES el estado
POST-remediación auditado. Fuentes verificables:

- Worklog superviviente (`/tmp/my-project/worklog.md`, Task ID 6): alcance del fix
  (guard V2.12.9 en 7 funciones incl. `create_production_order_v2` con variante
  `p_created_by`; REVOKE PUBLIC/anon en 3; sub-fix API `receive_output` p_user_id 1 línea).
- Catálogo live (extractos read-only en `db-extract/`): definiciones completas,
  proacl, grants expandidos, matriz anon/authenticated.
- Diffs baseline-vs-live (`delta/`): el delta semántico de cada función es
  exactamente el guard V2.12.9 (+ normalización pg_get_functiondef).
- `supabase_migrations.schema_migrations`: sin registros >= 20260910 (las
  migraciones REM-SEC-1/REM-PO-1 se aplicaron vía Management API /query).

## 4. Validación de los 5 CRITICAL + MEDIUM (mapa §7 de REM-PO-1)

| Hallazgo | Función | Evidencia live |
|---|---|---|
| CRITICAL 1 | `close_production_order_v2` | guard V2.12.9 presente (`delta/close_production_order_v2.diff.txt`: `COALESCE(p_user_id, auth.uid())` → `CASE WHEN auth.role()='service_role' ...`); ACL: PUBLIC revocado, EXECUTE a authenticated/service_role |
| CRITICAL 2 | `receive_production_output` | guard V2.12.9 + `p_user_id uuid DEFAULT NULL` + `p_idempotency_key` en firma; ACL restrictiva |
| CRITICAL 3 | `void_closed_production_order` | guard V2.12.9; anon EXECUTE = False (antes CRIT-3b anon 200) |
| CRITICAL 4 | `reverse_production_order` | guard V2.12.9; EXECUTE solo postgres/service_role (latente, inaccesible a app) |
| CRITICAL 5 | `withdraw_production_item_deprecated_6arg` | guard V2.12.9; EXECUTE solo postgres (inaccesible a roles de app — contrato real) |
| SUB-FIX §33 | `create_production_order_v2` | guard variante `COALESCE(p_created_by, auth.uid())` |
| MEDIUM | `receive_against_po`, `set_purchase_order_status`, `void_closed_production_order` | anon=False; PUBLIC revocado (`db-extract/q05_grants_expanded.json`, matriz has_function_privilege en `00-provenance.md` §5) |
| SUB-FIX API | `src/app/api/production-orders/[id]/route.ts` | `p_user_id: session_user.id` (identidad server-side) en llamada `receive_production_output` |

Nota `void_transaction`: conserva EXECUTE por PUBLIC (preexistente, NO formó parte
de la lista de remediation de REM-PO-1); su cuerpo incluye guard V2.12.9 → para
anon `auth.uid()` = NULL → fail-closed DENY sin mutación. Clasificado
PREEXISTING/OBS, sin fix (disciplina de alcance).

## 5. Matriz de privilegios live (has_function_privilege, read-only)

```
close_production_order_v2                  anon=False  auth=True
create_production_order_v2                 anon=False  auth=False (postgres/service_role)
receive_against_po                         anon=False  auth=True
receive_production_output                  anon=False  auth=True
receive_production_output_deprecated_4arg  anon=False  auth=False
reverse_production_order                   anon=False  auth=False
set_purchase_order_status                  anon=False  auth=True
void_closed_production_order               anon=False  auth=True
void_transaction                           anon=True   auth=True  (PUBLIC preexistente + guard fail-closed)
withdraw_production_item_deprecated_6arg   anon=False  auth=False
withdraw_production_item_deprecated_9arg   anon=False  auth=False
withdraw_production_item_v3                anon=False  auth=True
```

## 6. Revalidación ejecutada (§10 de RECOVERY-PO-1)

| Prueba | Resultado | Esperado (REM-PO-1) | Clasificación |
|---|---|---|---|
| `test:security` (contrato, catálogo) | 134 verificadas, 0 violaciones, exit 0 | 134/134, exit 0 | IDENTICO |
| `tsc --noEmit` | 0 errores, exit 0 | 0 | IDENTICO |
| `npm run lint` | 0 errors / 1291 warnings, exit 0 | 0 errors / 1291 warnings | IDENTICO |
| `vitest run` | 2058 passed / 0 failed / 24 skipped | 2075/0 | DELTA −17 tests: los tests añadidos por el commit perdido no son recuperables; suite baseline completa al 100% (0 fallos). Clasificado RECOVERY-INDUCED (ausencia), no regresión |
| Build | NO ejecutado en este gate | exit 137 OOM documentado | Límite de infraestructura ya documentado (global_oom 2.3GB RSS / host 4GB) |

## 7. Contenido reconstruido (commits de este gate)

1. `supabase/migrations/20260911000100_rem_po1_production_orders_boundaries.sql` —
   7 CREATE OR REPLACE FUNCTION verbatim del catálogo live + 8 REVOKE ALL FROM PUBLIC
   + 8 GRANT EXECUTE (7 funciones con guard + `receive_against_po` solo-ACL).
2. `src/app/api/production-orders/[id]/route.ts` — sub-fix de 1 línea (`p_user_id: session_user.id`).
3. Este evidence pack (`audit-evidence/20260911-rem-po-1-recovery/`).

## 8. Pérdidas materiales documentadas (no falsificadas)

- Evidence pack original `20260911-rem-po-1/` (62 archivos + SHA256SUMS): PERDIDO.
  Este pack es una reconstrucción de procedencia, NO un facsímil del original.
- Tests adicionales del commit `82e0f953` (~17): PERDIDOS.
- Los SHAs `82e0f953`, `e2d8cc95`, `3d5ed7b9` no vuelven a existir; la cadena
  publicada es nueva y se documenta aquí.
