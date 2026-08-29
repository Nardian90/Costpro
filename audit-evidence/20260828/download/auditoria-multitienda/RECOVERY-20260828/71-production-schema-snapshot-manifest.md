# 71 · PRODUCTION-SCHEMA-SNAPSHOT-RECOVERY — Manifiesto del artefacto

Fecha: 2026-08-28 · Autoridad: **GO — Opción A** del dueño (extracción READ-ONLY, exclusivamente metadatos/DDL, sin datos de negocio, sin modificaciones).
Estado: **COMPLETADO Y CONGELADO (SHA-256)** · Custodia: `download/auditoria-multitienda/RECOVERY-20260828/PRODUCTION-SCHEMA-SNAPSHOT/`

---

## 1. Naturaleza del artefacto (honestidad forense)

```text
harness original ........ LOST (conservado como historia forense)
baseline original ....... LOST (ídem)
ESTE snapshot ........... RECOVERED — nueva evidencia de recuperación, fecha y hash propios
```

Este artefacto **NO es** la «verdad histórica del harness perdido». Es un snapshot **nuevo** del esquema real de producción, etiquetado `PRODUCTION-SCHEMA-SNAPSHOT-RECOVERY`. La regla del dueño se cumplió: no se presentó como original, no se dedujo nada por inferencia, y la pérdida previa (informes 68/70) queda preservada.

## 2. Método real de extracción (desviación documentada de pg_dump)

La cadena autorizada decía `pg_dump --schema-only`. Realidad técnica verificada en runtime:

1. Host directo `db.<ref>.supabase.co:5432` es **IPv6-only** → inalcanzable desde el sandbox (`Network is unreachable`).
2. Pooler `aws-1-us-east-1.pooler.supabase.com:5432` resuelve el tenant pero la clave `sb_secret_` **no es la contraseña de BD** (`password authentication failed`). Resetear la contraseña vía Management API habría sido una **mutación de producción** (prohibida).
3. Vía ejecutada (incluida explícitamente en la Opción A aprobada: «consultas pg_catalog/information_schema + pg_dump»): **sentencias SELECT-only contra `pg_catalog` vía Management API** (`POST /v1/projects/<ref>/database/query`), con rol `postgres` sobre **PostgreSQL 17.6.1.063**.

Cada consulta emitida (una sola clase de statement: `SELECT` de catálogo) quedó registrada en `extraction-queries.log` y cada respuesta pristine en `extraction-raw/*.response.json` (121 respuestas + 1 intento fallido preservado `sequences.response.failed.json` como historia forense). **Cero conexiones mutativas, cero datos de negocio** — no se emitió ni un `SELECT *` sobre ninguna tabla del negocio.

Notas de robustez del método (todas corregidas y verificadas por huella):
- `pg_class.conowner`/`pg_trigger.tgowner` no existen en PG 17 (se añadieron en 18) → re-extraídas sin esas columnas.
- La huella de identidad (`row_number`) sustituye al `attnum` bruto (los huecos por columnas eliminadas en la historia de prod no son reconstruibles ni por pg_dump).
- Secuencias de columnas IDENTITY (deptype `i`) no se emiten: `GENERATED ... AS IDENTITY` las auto-crea con parámetros idénticos.

## 3. Alcance material extraído (esquema `public` de producción)

| Categoría | Cantidad | Fuente catálogo |
|---|---|---|
| Tablas (r/p) | 141 | pg_class/pg_attribute |
| Vistas / Matviews | 8 / 3 | pg_get_viewdef |
| Enums / Composites standalone | 13 / 2 | pg_type, pg_enum |
| Secuencias (2 identity-owned detectadas) | 6 | pg_sequence, pg_depend |
| Constraints (PK/FK/U/C/X) | 581 | pg_get_constraintdef |
| Índices no-constraint | 386 | pg_get_indexdef |
| Rutinas (todas prokind=f) | 478 | pg_get_functiondef (cuerpos = código, autorizado) |
| Triggers de tabla / Event triggers | 81 / 6 | pg_get_triggerdef / pg_event_trigger |
| Policies RLS | 390 | pg_policies |
| Grants relaciones / funciones / esquema | 4.823 / 1.841+2.107 / 7 | aclexplode (funciones re-extraídas con PUBLIC) |
| Default ACLs | 24 entradas (300 filas expandidas) | pg_default_acl |
| Publicaciones + miembros | 2 + 1 | pg_publication |

Extensiones instaladas en prod: `btree_gist@1.7, pg_stat_statements@1.11, pgcrypto@1.3, plpgsql@1.0, supabase_vault@0.3.1, uuid-ossp@1.1` (pgcrypto/uuid-ossp viven en esquema `extensions`, btree_gist en `public`).

**Exclusiones declaradas** (fuera del alcance de negocio, documentadas):
- Esquemas de plataforma: `auth, storage, supabase_*, graphql, graphql_public, realtime, extensions, pgsodium, vault, net, cron, pgbouncer, analytics` (en el lab los cubren SHIMS declarados).
- 120 default-privileges sobre esquemas de plataforma (`graphql` 48, `graphql_public` 48, `realtime` 24).
- Extensiones `pg_stat_statements` (requiere shared_preload) y `supabase_vault` (específica Supabase).
- Handlers de event triggers en esquema `extensions` (6): instalados como **stubs SHIM-PLATFORM** declarados en el lab.

## 4. Versiones del artefacto (correcciones transparentes, nada oculto)

| Versión | SHA-256 (snapshot .sql) | Corrección |
|---|---|---|
| v1 02:20Z | `9e0abd5a…14e3a` | Emisión inicial (con defectos de constructor) |
| v2 02:23Z | `b36d754b…7e9f1` | GRANT matview→ON TABLE; handlers→`extensions.<sch>`; +2 composites |
| v3 | ver `artifact-versions.log` | Secuencia identity-owned omitida (IDENTITY la auto-crea) |
| v4 | ver `artifact-versions.log` | Extensiones→SCHEMA; default-privs al final; encoding newlines F3 |
| v5 | ver `artifact-versions.log` | btree_gist sin SCHEMA; pgcrypto de shims eliminado antes del snapshot |
| **v6 (final)** | **ver SHA256SUMS** | Normalización ACL de funciones REVOKE-first + grants-func2 con PUBLIC |

El archivo `SHA256SUMS` (165 líneas) congela: snapshot SQL, `statements.json`, `roles-inventory.json`, las 122 respuestas pristine, el log de consultas, las huellas y el log de versiones.

## 5. Verificación de fidelidad S1 (snapshot → lab)

Carga en `costpro_audit_v2` (PostgreSQL 17.11 lab): **5.040 statements; 4.918 aplicados; 120 excluidos por alcance-plataforma (declarado); 3 publicaciones OK**.

Huella canónica de 15 dimensiones (mismo SQL contra prod y lab, separador US, registros de una línea): **DIFF S1 = 0 líneas — el lab ES idéntico a producción en tablas, enums, composites, columnas (orden relativo y tipos), constraints, índices, funciones (firma+kind+md5 de cuerpo), triggers, policies, grants de relación/función/esquema, secuencias, vistas/matviews, event triggers, default ACLs (alcance negocio) y publicaciones.**

Evidencia: `fingerprint/prod-fingerprint.txt`, `fingerprint/lab-v2-fingerprint-s1.txt`, `fingerprint/s1-vs-prod.diff` (vacío), congelados con SHA-256.

## 6. Desviación de entorno declarada

```text
Target histórico del dueño : PostgreSQL 17.6
Snapshot de producción    : PostgreSQL 17.6.1.063 (aarch64)  ← objetivo real alcanzado en datos
Harness reconstruido      : PostgreSQL 17.11 (x86_64, Debian trixie)
Estado                    : DEV-MINOR-VERSION-DEVIATION (declarada, no oculta)
```

La huella S1 exacta demuestra que **ninguna diferencia de renderizado catálogo 17.6↔17.11 afecta a las 15 dimensiones comparadas**. El análisis formal de release-notes 17.6→17.11 para comportamiento SQL/plpgsql queda pendiente para la fase de certificación (exigido por el dueño antes de certificar).
