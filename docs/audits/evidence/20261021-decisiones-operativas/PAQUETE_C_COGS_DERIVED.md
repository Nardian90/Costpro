# PAQUETE DE EJECUCIÓN — C: COGS DERIVED (migración `20261020000004`)

**Expediente:** CP-SEC-027 v5 · Fase 3 (C) · **Fecha de preparación:** 2026-10-21
**Estado del paquete:** PREPARADO — **PENDIENTE DE: (1) aprobación contable expresa de los 8 valores WAC individualizados (§2) y (2) autorización de despliegue del propietario. NADA EJECUTADO.**

> ⚠️ Regla del expediente v5: **una autorización para D NO es autorización para C.** Este paquete requiere su propia aprobación con los 8 valores sobre la mesa.

---

## 1. Qué es y por qué

La Decisión C (ratificada 2026-10-20, Misión C) resuelve el re-costeo de COGS (CP-IPV-002 / TAREA 3) **basado en evidencia, sin mutar el Kardex**. La migración añade 5 columnas NUEVAS a `stock_movements` (`unit_cost_derived`, `unit_cost_derived_source`, `unit_cost_derived_evidence_id`, `unit_cost_derived_at`, `cogs_derivation_status`), deriva el costo SOLO donde existe respaldo documental (`wac_change_log.wac_after > 0` más reciente con fecha ≤ movimiento) y marca `not_derivable` el resto. **CERO UPDATE destructivo: `unit_cost` original queda intacto.**

Estado verificado en producción (21/10, read-only): **NO aplicada** — ninguna de las 5 columnas existe (`information_schema.columns`: 0 filas). Baseline documental (20/10): 1676 movimientos, 632 con `unit_cost = 0` → **8 derivables** + **624 not_derivable**.

## 2. Los 8 valores WAC individualizados (aprobación contable requerida)

Todos son movimientos `sale_reverse` del **2026-10-14** (devoluciones del incidente ENERVIDA de octubre, con evidencia de WAC de octubre — fiable para re-costeo) en la tienda `5e6fe821-5465-48b1-b3f1-3aa3182edc38` (ENERVIDA-VITALLCONS). Fuente documental de cada valor: fila de `wac_change_log` citada (id completo en `cogs_8_derivables_preview.json`).

| # | Movimiento (stock_movements.id) | Producto (products.id) | WAC derivado (CUP) | Evidencia `wac_change_log` | Fecha evidencia | Fecha movimiento |
|---|---|---|---|---|---|---|
| 1 | `08ab9975-e60d-4631-ad34-22a4a3075b3b` | `0012bb78-b717-4c09-bb67-47fe780319e4` | 0.300751879699248120301 | `793c9aa1-a930-475b-84c6-f7122e147230` | 2026-10-04 04:53:55 | 2026-10-14 08:48:24 |
| 2 | `205c33bd-3b71-40bf-b103-a666778b20ee` | `e46b0164-5f65-40b9-8c48-a8154138e2be` | 1 | `bdfaa62e-e501-467f-9040-0f719cd31dcd` | 2026-10-07 11:39:34 | 2026-10-14 08:47:02 |
| 3 | `3e904931-bf9b-441c-8f73-db1475a0af31` | `3c072e9a-1c0d-4adf-add5-b337485bc3e4` | 0.8960997442455242966761636777 | `115c7cd8-f6ea-44db-8602-79204228dbf4` | 2026-10-04 04:53:53 | 2026-10-14 08:48:50 |
| 4 | `5b24113f-3d3e-4cb2-bd20-d905634c55bd` | `30124691-337c-422f-9955-23eeaae3e140` | 1.0 | `f3c2d4d1-41a3-4af7-ace3-006338cfdd4f` | 2026-10-06 11:20:58 | 2026-10-14 08:50:07 |
| 5 | `927bca92-8f61-414f-a784-3c679bbbe01d` | `1b0d19fd-e0fe-4ac1-972c-3a1361d61263` | 0.751879699248120300752 | `76aff4b2-3e31-4d20-bbc7-6a9315fd8c3a` | 2026-10-04 04:53:42 | 2026-10-14 08:49:41 |
| 6 | `d2612105-d618-4140-9242-663ea3ee01a5` | `a38829be-3866-4860-b125-ced53287cee6` | 0.944444444444444444446667 | `4ac1b0ea-65f2-4f33-a089-957b93eb8af5` | 2026-10-04 04:53:45 | 2026-10-14 08:47:30 |
| 7 | `d92f0153-8d4e-4df8-bfe7-302b29ba85d8` | `909e914d-0672-4952-9f7a-57bf60ab07d5` | 0.869565217391304347826 | `c829c936-ac16-4bb6-b864-55f5d4104e34` | 2026-10-04 04:53:42 | 2026-10-14 08:49:16 |
| 8 | `dc3abfd7-3427-4c57-97c9-b09c3da767e1` | `f2757338-f26f-4538-945e-5da97ec10a8f` | 0.79152308752584424534898351136802 | `a66b189a-…` (completo en preview JSON) | 2026-10-04 04:53:56 | 2026-10-14 08:47:58 |

**Los 624 restantes** (`unit_cost = 0` sin respaldo documental) quedan marcados `not_derivable` — el sistema NO inventa costos. La corrección contable de esos 624 es decisión de negocio separada (fuera de este paquete).

**Aprobación contable requerida:** el propietario (o contabilidad) debe ratificar EXPRESAMENTE los 8 valores de la tabla como costo derivado aceptable para esos movimientos, o rechazarlos individualmente (la migración es todo-o-nada; un rechazo parcial requiere editar la regla SQL antes de aplicar).

## 3. Precondiciones

1. **Paquete D aplicado antes** (recomendado, no requisito técnico — cero interacción entre ambos).
2. Migración presente en el árbol; hash SHA-256 registrado en el pre-vuelo.
3. Columnas derivadas ausentes (verificado read-only 21/10).
4. Baseline congelado: 632 filas `unit_cost = 0`; `wac_change_log` con 616 entradas (captura 20/10).
5. **Aprobación contable de los 8 valores (§2)** — PENDIENTE.
6. **Autorización de despliegue del propietario** — PENDIENTE.
7. Ventana: fuera de operación de tienda activa (la migración bloquea `stock_movements` por el UPDATE; con 1676 filas el impacto es de segundos, pero se exige ventana por disciplina).

## 4. Comandos exactos

**4.1 Pre-vuelo:**
```bash
sha256sum supabase/migrations/20261020000004_cogs_derived.sql
```
```sql
SELECT count(*) FROM public.stock_movements WHERE unit_cost = 0;           -- esperado: 632
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='stock_movements'
   AND column_name IN ('unit_cost_derived','unit_cost_derived_source',
      'unit_cost_derived_evidence_id','unit_cost_derived_at','cogs_derivation_status');  -- esperado: 0
```

**4.2 Dry-run atómico (BEGIN … ROLLBACK, vía Management API):** ejecutar la migración íntegra (§1+§2+§3 y el DO block de verificación §4 del fichero) dentro de una transacción con `ROLLBACK` final. El DO block emite `NOTICE: COGS derivado: derived=8, not_derivable=624, sin_marca=0` **dentro** de la transacción → es la prueba exacta del resultado sin persistir nada. Tras ROLLBACK: re-consulta externa → 0 columnas.

**4.3 Aplicación real:** mismo SQL con `COMMIT` (el fichero ya trae `BEGIN/COMMIT`).

**4.4 Post-verificación (read-only):**
```sql
SELECT cogs_derivation_status, count(*) FROM public.stock_movements
 WHERE unit_cost = 0 GROUP BY cogs_derivation_status;      -- derived=8, not_derivable=624
SELECT count(*) FROM public.stock_movements
 WHERE unit_cost = 0 AND cogs_derivation_status IS NULL;    -- 0
SELECT count(*) FROM public.stock_movements
 WHERE unit_cost_derived IS NOT NULL AND unit_cost <> 0;    -- 0 (columna original intacta)
```

## 5. Criterios de aborto

| Señal | Acción |
|---|---|
| Dry-run: `derived ≠ 8` o `not_derivable ≠ 624` | ABORTAR: el baseline derivó (nuevas ventas/recepciones con costo 0 desde el 20/10) → re-auditar el delta antes de aplicar |
| Dry-run: `sin_marca ≠ 0` (RAISE EXCEPTION del DO block) | ABORTAR: inconsistencia estructural — investigar |
| `duplicate_column` (42701) | ABORTAR como YA APLICADA → re-verificar estado y archivar |
| Pre-vuelo: columnas ya presentes con datos | ABORTAR: estado desconocido — no aplicar encima |
| Timeout > 120 s en dry-run | ABORTAR: bloqueo concurrente (ver `pg_stat_activity`) |
| Hash del fichero ≠ registrado | ABORTAR: deriva de archivo |
| Aprobación contable de los 8 valores ausente o parcial | **NO INICIAR** (requisito de entrada, no de ejecución) |

## 6. Reversión

La migración es **aditiva** (solo columnas nuevas; el Kardex original jamás se toca). Reversión exacta:

```sql
BEGIN;
ALTER TABLE public.stock_movements
  DROP COLUMN IF EXISTS unit_cost_derived,
  DROP COLUMN IF EXISTS unit_cost_derived_source,
  DROP COLUMN IF EXISTS unit_cost_derived_evidence_id,
  DROP COLUMN IF EXISTS unit_cost_derived_at,
  DROP COLUMN IF EXISTS cogs_derivation_status;
COMMIT;
```

- Pérdida de la reversión: el trabajo de derivación (recalculable: la migración es idempotente, re-ejecutar reproduce el mismo estado).
- Datos de negocio afectados por la reversión: **NINGUNO** (columnas nuevas desechables).
- Reversión documentada como evento propio en la carpeta de evidencia, igual que el apply.

## 7. Registro de la aplicación (deuda R1 explícita)

- `schema_migrations` **no existe** en BD viva (verificado 21/10) → misma técnica de registro del paquete D: hash + dry-run + apply + post-verificación archivados en `evidence/20261021-decisiones-operativas/` con autorización citada. Deuda R1 (CP-INFRA-018) queda ABIERTA y visible — no se crea registro ad-hoc parcial.
- Riesgo de reaplicación accidental: **nulo estructural** — segunda corrida: §1 `IF NOT EXISTS` no-op, §2 re-deriva los mismos 8 (mismos valores, idempotente por diseño LATERAL determinista), §3 afecta 0 filas (todo marcado), §4 verifica. El DO block lo convierte en auto-verificante.
- La reaplicación futura por toolchain (cuando R1 se regularice) no corrompe: la migración fue diseñada idempotente por esta razón.

## 8. Qué NO hace este paquete

- No recostea los 624 `not_derivable` (decisión de negocio separada).
- No corrige los 4 WAC inflados 680× (CP-IPV-003 — otra misión, protocolo gobernado distinto).
- No toca `unit_cost`, `wac_change_log`, ventas, ni el Kardex existente.
- No es autorización implícita de nada posterior: la confirmación viva del Reporte Entrega y el backfill de ledger IPV (CP-IPV-001) siguen siendo expedientes aparte.
