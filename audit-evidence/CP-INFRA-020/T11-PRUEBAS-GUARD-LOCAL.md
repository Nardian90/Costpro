# CP-INFRA-020 T1.1 — Evidencia: guard destructivo en Postgres 17 local desechable

- **Fecha**: 2026-11-10 · **Host**: sandbox local (Debian 13) · **Motor**: PostgreSQL 17.11 (Debian), clúster efímero arrancado por la prueba en `localhost:/tmp/pgsock:5433`, sin acceso a red.
- **BD de pruebas**: `cpinfra020_t11` (y `cpinfra020_t11b` para escenarios 4-5), creada y **destruida** por el propio banco de pruebas. Datos 100% sintéticos (tiendas/productos/usuarios/eventos ficticios). Nunca se tocó producción (CostproBD `wthkddeleylijmonclxg`) ni CostproE2E.
- **Script bajo prueba**: `supabase/scripts/reset_demo_data_pro.sql` (v5.7.13-guard.1). Banco: `scripts/` del sandbox (no versionado; los pasos son reproducibles con `psql`).
- **Salidas crudas**: `t11-esc{1..5}-output.txt` y `t11-resumen.txt` en este directorio.

## Resultados [MEDIDO]

| # | Escenario | Resultado | Evidencia |
| --- | --- | --- | --- |
| 1 | BD **sin** centinela (simula producción o BD cualquiera) | ✅ ABORTA (`exit 3`, `GUARD_DESTRUCTIVO`) y las tablas quedan **idénticas** (conteos antes/después iguales: stores=1 products=25 transactions=10 profiles=1 users=1 business_events=30 audit_logs=40) | `t11-esc1-output.txt` |
| 2 | BD **con** centinela `e2e_is_isolated_db()→true` y **sin** ledger | ✅ El guard pasa y el script corre **completo** (exit 0): re-siembra 2 tiendas demo, 4 usuarios, 10 productos, 2 transacciones | `t11-esc2-output.txt` |
| 3 | BD **con** centinela **y con** `production_migration_ledger` (simula CostproE2E) | ✅ ABORTA (exit 3) **sin cambios** (conteos idénticos antes/después) | `t11-esc3-output.txt` |
| 4 | psql **SIN** `ON_ERROR_STOP` (cliente sigue enviando comandos tras el fallo) | ✅ Datos intactos: tras el ROLLBACK del guard, el servidor responde `current transaction is aborted, commands ignored` a cada sentencia posterior; **0** TRUNCATE/INSERT/DELETE ejecutados después del guard | `t11-esc4-output.txt` (5 ERROR, 0 escrituras) |
| 5 | Script entero pegado como **una sola consulta** (`psql -c "$(cat …)"`) | ✅ ABORTA (exit 1) y los datos quedan intactos | `t11-esc5-output.txt` |

## Hallazgo y corrección durante la prueba (escenario 2)

El script original ejecutaba `ALTER TYPE user_role ADD VALUE …` y **usaba el valor nuevo en la misma transacción** (`'encargado'::user_role` en un INSERT posterior). Antes de CP-INFRA-020 eso "funcionaba" solo porque cada bloque `DO` era una transacción separada. Al envolver TODO en una transacción (requisito D1.1), Postgres lo rechaza: `unsafe use of new value "encargado" of enum type user_role`.

Corrección aplicada al script mantenido (commit aparte): el tipo se crea **completo** si no existe; si ya existe y faltan valores, se añaden con `ADD VALUE IF NOT EXISTS` y el fallo del INSERT posterior hace ROLLBACK fail-closed (una segunda ejecución lo completa, documentado en el propio script).

## Interpretación de las dos cerraduras (D1.2) [INFERIDO del estado medido]

- **Producción (CostproBD)**: sin centinela [MEDIDO el 2026-11-10: `to_regprocedure('public.e2e_is_isolated_db()')` → NULL] y **con** ledger → bloqueada por la cerradura (a) **y** la (c).
- **CostproE2E**: con centinela y **con** ledger (la migración `20261106130000_production_migration_ledger.sql` está INCLUIDA en el replay del manifiesto INFRA-011, posición 128) → bloqueada por la cerradura (c). E2E no es BD de demos; el guard la bloquea por diseño, tal como exige D1.2.
- **BD desechable de demos**: debe tener la centinela y NO el ledger → pasa las dos cerraduras.
