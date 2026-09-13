# 06 — POST-DDL CATALOG (REM-INV-2R, fase 9)

Re-ejecución completa del auditor de catálogo (mismo script que en PRE) contra POST-DDL.

## Objetivo

| Verificación | PRE | POST |
|---|---|---|
| pg_proc public.receive_purchase | 1 fila (oid 25452) | **0 filas — NOT FOUND** |
| ACL explícita (aclexplode) | 3 grants | **0 — NONE** |
| routine_privileges (information_schema) | 3 grants | **0 — NONE** |
| Firmas totales de receive_purchase en public | 1 | **0 (sin sobrecargas huérfanas)** |
| Función receive_purchase en CUALQUIER schema (fase 14) | — | **0 filas** |
| pg_depend resolve regprocedure | resolvía | **42883 does not exist (prueba positiva)** |

## Callers / dependencias POST

| Verificación | POST |
|---|---|
| Callers internos DB | 0 |
| Triggers | 0 |
| pg_depend | 0 (objeto inexistente) |
| Vistas / rewrite | 0 / 0 |
| Policies | 0 |
| Column defaults | 0 |
| Referencias en código vivo | 0 (ver 07) |

## Funciones canónicas — continuidad funcional demostrada

Comparación de `pg_get_functiondef` PRE vs POST (sha256 sobre salida cruda):

| Función | oid | Definición PRE vs POST | ACL PRE vs POST |
|---|---|---|---|
| receive_against_po | 138544 | **IDENTICAL** (57cb0dad9085e5c4…) | UNCHANGED |
| register_reception | 138536 | **IDENTICAL** (a6ce108357ee5bb0…) | UNCHANGED |
| confirm_pending_reception | 136713 | **IDENTICAL** (d7b0610b77bab22f…) | UNCHANGED |
| void_reception_with_reversal | 136714 | **IDENTICAL** (2de37b0d819cb1e2…) | UNCHANGED |

Esperado `IDENTICAL`: **CUMPLIDO** (12/12 hashes idénticos: 4 definiciones × [pre-post]
+ 8 firmas/oid).

Raw: `assets/phase1-target-post.json`, `assets/phase2-dependency-post.json`,
`assets/phase4-canonical-post.json` (contienen hashes completos),
`assets/phase4-canonical-pre.json` (comparación).
