# PAQUETE DE EJECUCIÓN — D: LEGAL INCIDENTS (migración `20261020000005`)

**Expediente:** CP-SEC-027 v5 · Fase 3 (D) · **Fecha de preparación:** 2026-10-21
**Estado del paquete:** PREPARADO — **PENDIENTE DE AUTORIZACIÓN EXPRESA DEL PROPIETARIO. NADA EJECUTADO.**

---

## 1. Qué es y por qué

La Decisión D (ratificada 2026-10-20, Misión C) reescribió el endpoint de incidentes legales: POST `/api/legal/incidents` ya no persiste en `data/incidents.json` (FS efímero, BUG-024 de CP-SEC-012) sino en una fila de `audit_logs` con `action='legal_incident'`; GET admin-only (`withRole('admin')`) pagina ese legajo. El código **ya está fusionado en main y desplegado** (PR #1431, 19/10; verificado en el árbol el 21/10). La migración `supabase/migrations/20261020000005_legal_incidents_index.sql` añade el **índice parcial** que sostiene el rendimiento del GET:

```sql
BEGIN;
CREATE INDEX IF NOT EXISTS idx_audit_logs_legal_incident_created_at
  ON public.audit_logs (created_at DESC)
  WHERE action = 'legal_incident';
COMMIT;
```

## 2. Estado verificado en producción (21/10, read-only)

| Objeto | Estado |
|---|---|
| Índice `idx_audit_logs_legal_incident_created_at` | **NO existe** (pg_indexes: 0 filas) |
| Legajo `audit_logs WHERE action='legal_incident'` | 0 filas (índice parcial ~vacío: coste de creación ≈ 0) |
| Endpoint reescrito en main/desplegado | SÍ (route.ts con `withRole`, `audit_logs`, POST+GET) |
| Tests de regresión | 8/8 PASS (vitest, PR #1431) |

**Consecuencia de no aplicarla:** el endpoint funciona (búsqueda secuencial sobre `audit_logs`); el índice es protección de rendimiento para cuando el legajo crezca. Riesgo de aplicar: **mínimo** (índice nuevo, idempotente, sin datos propios).

## 3. Precondiciones (todas verificadas el 21/10 salvo la 5)

1. Working tree limpio en `main`; migración presente en el árbol (hash registrado abajo).
2. Índice NO presente en BD viva (verificado read-only 21/10).
3. Legajo 0 filas → creación instantánea, sin bloqueo apreciable de escrituras.
4. Código del endpoint desplegado (verificado).
5. **Autorización expresa del propietario para esta aplicación** — PENDIENTE.
6. Ventana: cualquier horario (índice parcial vacío; no requiere cuiescencia).

## 4. Comandos exactos

**4.1 Hash de trazabilidad (pre-vuelo):**
```bash
sha256sum supabase/migrations/20261020000005_legal_incidents_index.sql
```

**4.2 Dry-run atómico (BEGIN → verificar → ROLLBACK), vía Management API:**
```sql
BEGIN;
CREATE INDEX IF NOT EXISTS idx_audit_logs_legal_incident_created_at
  ON public.audit_logs (created_at DESC)
  WHERE action = 'legal_incident';
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='audit_logs'
   AND indexname='idx_audit_logs_legal_incident_created_at';
ROLLBACK;
```
Esperado: 1 fila dentro de la transacción; tras ROLLBACK, re-consulta externa → 0 filas.

**4.3 Aplicación real (BEGIN … COMMIT):** mismo SQL con `COMMIT`.

**4.4 Post-verificación (read-only, inmediata):**
```sql
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname='public' AND indexname='idx_audit_logs_legal_incident_created_at';
SELECT count(*) FROM public.audit_logs WHERE action='legal_incident';
```
Más sondas HTTP (contra el despliegue): POST/GET `/api/legal/incidents` sin sesión → 401/401; GET con sesión admin → 200.

## 5. Criterios de aborto

| Señal | Acción |
|---|---|
| Dry-run devuelve 0 filas en el SELECT interno | ABORTAR: objeto bloqueado por otra transacción → investigar `pg_stat_activity` |
| `duplicate_object` (42710) en el apply | ABORTAR como YA APLICADA (idempotencia) → re-verificar y archivar |
| Timeout > 30 s en dry-run (legajo vacío, debe ser <1 s) | ABORTAR: intervención externa |
| Post-verificación: índice ausente tras COMMIT | ABORTAR: reversión del protocolo + investigación (no debería ocurrir: COMMIT transaccional) |
| Cualquier error de sintaxis/firma distinta al hash del pre-vuelo | ABORTAR ANTES de ejecutar: deriva de archivo |

## 6. Reversión

```sql
BEGIN;
DROP INDEX IF EXISTS public.idx_audit_logs_legal_incident_created_at;
COMMIT;
```
- El índice no contiene datos propios (es una estructura secundaria) → reversión **sin pérdida alguna**.
- El endpoint queda funcional (más lento con legajos grandes), sin pérdida del legajo (vive en `audit_logs`).
- Coste total de un ciclo aplicar→revertir: ≈ 0.

## 7. Registro de la aplicación (sin ocultar la deuda R1)

- La BD viva **NO tiene** tabla `schema_migrations` (verificado 21/10: `relation "public.schema_migrations" does not exist`). El control formal de aplicadas no existe — esta es la deuda **R1** (registrada como **CP-INFRA-018** en el worklog maestro; abierta).
- Protocolo de registro para D (idéntico al patrón F7 ya usado en producción): (1) hash SHA-256 del fichero; (2) salida del dry-run; (3) salida del apply; (4) post-verificación; (5) todo archivado en `evidence/20261021-decisiones-operativas/` con fecha y autorización citada.
- **NO** se crea un registro ad-hoc parcial (sembrar una tabla nueva solo para D produciría un estado híbrito con falsa completitud: la regularización integral de R1 es la vía correcta, con backfill completo desde la evidencia histórica, como tarea separada).
- Riesgo de reaplicación accidental: **nulo** para D — `CREATE INDEX IF NOT EXISTS` es idempotente; una segunda corrida (manual o futura toolchain) reproduce el mismo estado sin error.

## 8. Qué NO hace este paquete

- No toca `unit_cost`, tablas de negocio, RLS, policies ni datos del legajo.
- No es autorización para C: **C requiere aprobación contable expresa de los 8 valores WAC y autorización de despliegue separada** (ver `PAQUETE_C_COGS_DERIVED.md`).
- No modifica `main`, workflows, ni configuración de GitHub.
