# REM-INV-4 — 11-git-reconstruction.md

## Reconstrucción del estado declarado (Git) y del proceso histórico

### 1. Universo censado
- 427 archivos de migración versionados (`^[0-9].*\.sql` en `supabase/migrations/`), 4.698 statements; 5 archivos SQL auxiliares NO versionados mezclados en el mismo directorio (F-13).
- Operaciones censadas (dollar-quote aware; comentarios excluidos): 653 CREATE [OR REPLACE] FUNCTION (+3 dentro de DO blocks) · 154 DROP FUNCTION · 79 CREATE TRIGGER · 79 DROP TRIGGER · 454 keys de policies (483 CREATE, 358 DROP) · 122 tablas con evolución (98 CREATE, 4 DROP) · 349 grupos GRANT/REVOKE · 10 CREATE VIEW · 3 CREATE TYPE · 6 sequences.
- Hash de integridad del censo: raw/census/migration-ops.json (sha256 en MANIFEST).

### 2. Orden de aplicación declarado
El nombre de archivo determina el orden (convención timestamp). Verificado que el sort alfabético es cronológicamente consistente en todo el rango (2024-01 → 2026-09). Ambigüedad residual documentada: archivos con prefijo de 8 dígitos (día, sin hora) del mismo día — 1 caso sin efecto en funciones.

### 3. Estado final declarado por objeto
- **Funciones:** 251 nombres con evolución; 246 con estado final DECLARED_PRESENT (cuerpo volcado en raw/census/final-bodies/, fuente y statement citados); 5 en DECLARED_ABSENT (DROP final: p.ej. receive_purchase retirado en 29f9ef2e-era, funciones deprecadas v2). 3 adicionales definidos SOLO en SQL auxiliar no versionado.
- **Triggers:** 72 claves (tabla, nombre) → 63 PRESENT finales, 9 con DROP final.
- **Policies:** 454 claves → 356 PRESENT, 98 ABSENT.
- **Tablas:** 97 nombres → 94 PRESENT, 3 ABSENT.

### 4. Ledger de producción (evidencia de proceso)
`SELECT version, name FROM supabase_migrations.schema_migrations` (READ-ONLY) → **12 entradas**: 202401230001, 20260612000000…20260615000003. Las 12 tienen archivo Git 1:1 (0 migraciones aplicadas y borradas del repo; 0 entradas de ledger sin archivo). **415 archivos versionados (97.2%) NO constan en el ledger de producción.**
- Conclusión de proceso: entre 2024-01 y 2026-06-15 hubo un pipeline parcialmente registrado; a partir de 2026-06-15 (post `add_unique_index_product_cost_sheets`) NO se registró NINGUNA migración más, mientras Git acumula ~9 meses de releases (era V2 completa, PR-4.x, w9, hotfixes 3R-B/3C).
- El caso REM-INV-3C (swap de fn_validate_document_transition sin traza Git) ocurrió en esa ventana. Su remediación sí quedó versionada (20260913000001).

### 5. Clasificación de reconstruibilidad (§23/§34)
| Superficie | Veredicto | Fundamento |
|---|---|---|
| Funciones (cuerpos, 309 de app) | **PARTIALLY REPRODUCIBLE** | 154 byte-iguales al final declarado; 64 con cuerpo nunca declarado; 3 stale; 13 declaradas y ausentes |
| Atributos de función (secdef/search_path) | **PARTIALLY REPRODUCIBLE** | 23 divergencias sobre cuerpos reproducibles |
| Triggers | **PARTIALLY REPRODUCIBLE** | 63 match / 24 orphan / 8 missing |
| Policies | **PARTIALLY REPRODUCIBLE** | 320 match / 71 orphan / 42 missing |
| Tablas (estructura) | **NON-REPRODUCIBLE** | bootstrap de 53 tablas core nunca versionado (F-01); replay R2 → 17/146 |
| Grants | **NON-RECONSTRUCTABLE (práctico)** | mezcla de default privileges Supabase + GRANT/REVOKE históricos out-of-band; se clasifica por comportamiento (06/13) en lugar de reconstrucción textual |

### 6. Extrações y validación
- La extracción de cuerpos Git fue validada contra PostgreSQL 17.6 efímero (Fase R1, ver 12-migration-replay.md): 205/205 cuerpos aplicables produjeron md5(prosrc) byte-idéntico al censado (0 artefactos). Los 43 restantes no aplicaron por dependencias de bootstrap (tipos/tablas ausentes), no por errores de extracción.
- Conclusión: las 154 coincidencias y las 64 divergencias de cuerpo son **reales**, no ruido de parseo.
