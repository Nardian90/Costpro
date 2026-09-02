# W9.3 F-01 — Evidence Manifest (espejo commitado)

| Campo | Valor |
|---|---|
| Fase | W9.3 — F-01 RLS Hardening |
| Fecha (UTC) | 2026-09-02 |
| Base | commit `70f978b6` (W9.2) |
| Migración | `supabase/migrations/20260902000001_w9_f01_rls_hardening.sql` (SHA256 en `migration_file.sha256`) |

## Contenido

- `W9.3-F01-PROPOSAL.md` — gate humano (W9.3-E): tablas, ACL/RLS/policies PRE, consumidores, SQL propuesto, rollback, tests, impacto.
- `W9.3-F01-REPORT.md` — informe final (14 secciones): veredicto PASS / F-01 CLOSED / READY FOR W9.4.
- `pre/` — inventario físico W9.3-B/C (b01…b18), matriz de roles, grants, policies, FKs, triggers, funciones, secuencias, probes PostgREST PRE, data_integrity (23 métricas).
- `post/` — verificación W9.3-H (h1…h6), probes POST, data_integrity POST.
- `comparison/comparison_report.md` — diffs PRE→POST (RLS, privilegios, policies, probes, datos, estructura, no-regresión W9.2).
- `rollback/rollback_w9_f01.sql` — reversión exacta 1:1 (NO ejecutada).
- `migration_apply_response.json` — respuesta Management API (HTTP 201, `[]`, 18:22:53Z).
- `migration_file.sha256` — SHA256 de la migración aplicada.
- `W93-EVIDENCE-SHA256SUMS` — checksums de este directorio (85 archivos).

## Nota sobre logs (exclusión deliberada)

Los archivos `queries.log` y `postgrest_probes_*.log` de `pre/` y `post/` (4 archivos) quedan **fuera del commit** por dos razones: (1) el mandato W9.3-L prohíbe incluir logs; (2) `.gitignore` L46 (`*.log`) del repo los excluye. Las copias canónicas permanecen en el workspace de auditoría (`w9-readiness/evidence/f01/`), cuyos `W93-EVIDENCE-SHA256SUMS` sí los cubren. Este espejo regenera sus checksums sobre los 85 archivos efectivamente commitados.

## Decisión clave documentada

`FORCE ROW LEVEL SECURITY` NO fue activado (owner=postgres con BYPASSRLS ⇒ no-op). `TRUNCATE`/`MAINTAIN` revocados junto al resto (RLS no gobierna TRUNCATE ⇒ el revoke es la única protección efectiva).
