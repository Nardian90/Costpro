# W9.4 F-06 — Evidence Manifest (espejo commitado)

| Campo | Valor |
|---|---|
| Fase | W9.4 — F-06 SECURITY DEFINER EXECUTE Hardening (subfase W9.4.1) |
| Fecha (UTC) | 2026-09-02 |
| Base | commit `2787b22c` (W9.3) |
| Migración | `supabase/migrations/20260902000002_w9_f06_secdef_execute_hardening.sql` (SHA256 en `migration_file.sha256`, c4aa5510…) |

## Contenido

- `W9.4-F06-PROPOSAL.md` — propuesta del mandato W9.4-G (11 secciones): inventario, clasificación C0–C4, top riesgo, consumidores, guards, SQL por función, grants, impacto, rollback, funciones NO tocadas, consumidores externos.
- `W9.4-F06-REPORT.md` — informe final: veredicto PASS WITH CONDITIONS / F-06 PARTIALLY CLOSED / READY FOR W9.4.2.
- `pre/` — inventario físico 481 funciones (b01–b04), ACL expandida 2.106 entradas, prosrc 481 (d01), pg_depend/triggers/policies/vistas (d02–d05), cron+extensiones (e01–e02), refs de funciones en policies (e03 + policy_fn_refs), consumidores: src estático (136 sites), dinámicos (24), scripts (29), e2e, receiver-roles por call-site, triage literal repo-wide, snapshot datos PRE (23 métricas), guard dry-run (PASS), guard_block.sql.
- `post/` — verificación W9.4-J/K (h01–h06), probes PostgREST (5 anon: 4×PGRST202 + 1×permission-denied; 1 service positivo 200 `true`; OpenAPI svc; health), data_integrity POST, tsc_noemit.log (OOM documentado ×2).
- `comparison/` — only_acl_changed.json (verdict PASS: 119/119 solo-proacl, 362/362 intactas, md5 prosrc 481/481), acl_diff_per_function.json (119 PRE→POST), privilege_matrix_119.json, data_regression.json (23/23 idénticas), structure_*_unchanged.json (triggers/policies/vistas/pg_depend), artefactos de clasificación (f06_classification.json, f06_priority_table.csv, f06_summary.md, f06_final_sets.json, f06_migration_candidates.json).
- `rollback/rollback_w9_f06.sql` — reversión exacta 1:1 (158 GRANTs inversos; NO ejecutada).
- `migration_apply_response.json` — respuesta Management API (HTTP 201, `[]`, 19:22:48Z).
- `migration_file.sha256` — SHA256 de la migración aplicada.

## Nota sobre archivos excluidos

Los `*.log` (queries.log de pre y post) se excluyen de este espejo por regla del mandato
("NO incluir logs") y por `.gitignore` (`*.log`). Los checksums completos del árbol
canónico de evidencia (incl. logs) viven en `/home/z/my-project/w9-readiness/SHA256SUMS`
(237 archivos, fuera del árbol Git) — este espejo replica su contenido menos logs.
