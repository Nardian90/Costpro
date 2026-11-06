# PLAN T2.6 — MIGRACIONES ATRASADAS EN PRODUCCIÓN (COSTPRO) — PENDIENTE DE COMPUERTA

**Fecha:** 2026-11-06 · **Base de evidencia:** `docs/audits/DERIVA_PRODUCCION_VS_REPO_2026-11-06.md` (T0, [MEDIDO])
**Compuerta:** NO se aplica NADA sin la frase literal del propietario:
`AUTORIZO MIGRACIONES ATRASADAS PROD: <lista de versiones>` — y únicamente las versiones de esa lista,
**en orden**, verificando tras cada una; si una falla, DETENER.

## Qué está demostrado pendiente [MEDIDO por catálogo, 2026-11-06]

| Orden | Versión | Archivo | Efecto pendiente en prod | Dependencias | Riesgo | Guard de la migración | Verificación posterior por catálogo | Rollback |
|---|---|---|---|---|---|---|---|---|
| 1 | `20260811000010` | `pr4_4g_fix_usd_visualization.sql` (parcial) | cuerpo nuevo de `get_transactions` | ninguna | **Medio** — lectura de transacciones; NO cambia escritura de dinero | la migración es CREATE OR REPLACE idempotente | huella md5 = repo | recrear cuerpo anterior desde el catálogo (pg_get_functiondef previo) |
| 2 | `20261020000004` | `cogs_derived.sql` | columna `stock_movements.unit_cost_derived` | ninguna | Bajo — columna derivada | IF NOT EXISTS | `information_schema.columns` | `ALTER TABLE … DROP COLUMN` |
| 3 | `20261020000005` | `legal_incidents_index.sql` | índice `idx_audit_logs_legal_incident_created_at` | ninguna | Bajo — índice | IF NOT EXISTS | `pg_indexes` | `DROP INDEX` |
| 4 | `20261028112100` | `cp_catalogo_rpcs_ciclo_vida.sql` (parcial) | cuerpo nuevo de `create_master_product` | tablas/objetos del lote catálogo maestro ya presentes en prod [MEDIDO] | **Medio** — catálogo maestro, NO función de dinero | CREATE OR REPLACE idempotente; guards del propio archivo | huella md5 = repo | recrear cuerpo anterior |
| 5 | `20261105130000` | `cp_clasificador_maestro_base.sql` (parcial) | cuerpo nuevo de `is_party_store_connected` | las tablas/índices del lote ya están en prod [MEDIDO] | Bajo-Medio | CREATE OR REPLACE idempotente | huella md5 = repo | recrear cuerpo anterior |

## Qué NO va en la lista (y por qué)

- `20261103120000` (managed_hard_delete): **ya aplicada en producción** [MEDIDO — funciones presentes].
- `20261105130100`, `20261105140000`, `20261106100000`: efectivamente aplicadas en producción (todos sus
  objetos presentes, cuerpos iguales salvo el de `is_party_store_connected` que sube con la 5).
- `pay_commission`: **excluida** (regla 8 — refactor en curso de otro actor). Cualquier migración que la
  toque queda fuera de este plan hasta orden expresa del propietario.
- `20260911000000` (crea `close_cash_shift/5`) y `20261004120001` (crea `create_devolution_v2/11`): NO
  pendientes — sus efectos sobran en producción (CP-SEC-005 T1 D1.1 los retira del replay con migración
  nueva); aplicarlos REINTRODUCIRÍA las sobrecargas muertas en prod.
- Cuerpo de `get_transactions`: es función de LECTURA; aun así, por prudencia se lista como riesgo Medio
  y solo se aplica con verificación funcional posterior del panel de transacciones.

## Procedimiento por migración (cuando haya compuerta)

1. Verificar identidad del proyecto (nombre + ref) inmediatamente antes de escribir.
2. Informe de deriva ANTES (`scripts/ops/drift-report.cjs`, guardar salida en la evidencia).
3. Aplicar UNA migración (Management API, transaccional si el archivo no exige lo contrario).
4. Verificación posterior por catálogo (tabla del plan) + fila en `production_migration_ledger`
   (requiere `AUTORIZO LEDGER PROD` previo para que exista la tabla; si no, documentarlo y sembrar después).
5. Informe de deriva DESPUÉS + evidencia en `audit-evidence/T2.6-<versión>/`.
6. Si un paso falla: DETENER, reportar, sin aplicar las siguientes.

## Estado

**PENDIENTE DE COMPUERTA DEL PROPIETARIO.** Nada de esta lista se ha aplicado en producción.
CostproE2E ya tiene el tramo completo (127/127 al cierre de T1) y sirve de campo de pruebas.
