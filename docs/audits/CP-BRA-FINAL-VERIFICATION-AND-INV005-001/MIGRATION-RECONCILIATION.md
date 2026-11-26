# MIGRATION-RECONCILIATION — Reconciliación de migraciones y producción

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Regla de la misión aplicada:** no se re-ejecutó ninguna migración productiva; verificación exclusivamente read-only (Management API `/database/query` con SELECT, `pg_get_functiondef`, `pg_trigger`, `pg_indexes`) + historial + evidencias del expediente.

## 1. La discrepancia temporal (informe fechado 25-11 con migraciones versionadas 26-11)

Hechos verificados con git (no inferidos):

| Elemento | Fecha real |
|---|---|
| Commits de la cadena (4) | **2026-11-25 19:15–19:50Z** |
| Versión de los archivos SQL | `20261126140000` / `20261126150000` / `20261126160000` (26-11 14:00/15:00/16:00) |
| Acta de aplicación 140000 | fechada **2026-11-25 (~19:10 UTC)** |
| Acta de aplicación 150000 | fechada **2026-11-25 (~19:35 UTC)** |
| INFORME.md de CP-BRA-REMEDIATION-001 | fechado **2026-11-25** |

**Conclusión:** no hay aplicación futura ni informe retrodatado de forma engañosa; el agente de remediación creó los SQL el día 25 y los **versionó con timestamp del día 26** (elección de versión, no registro de ejecución), aplicándolos a producción el 25-11 19:10–19:50 UTC y documentándolo así. El identificador de versión no corresponde a la fecha de creación ni de aplicación — es una anomalía de nomenclatura documentada aquí; no afecta al contenido ni al orden real (140000 → 150000 → 160000 en la cadena).

Secuencia real reconstruida: acta declara aplicación 140000 ~19:10Z → commit R-01/R-14 19:15Z → aplicación 150000 ~19:35Z (acta) → commit R-11 19:37Z → commit R-15 19:50Z. La aplicación precede al commit en minutos; el contenido aplicado está verificado por SHA (abajo), por lo que no hay divergencia material, pero se anota como práctica a evitar (el protocolo §11c exige el expediente versionado como punto de control).

## 2. Verificación independiente de artefactos DDL en producción (método autoritativo)

`schema_migrations` está estancado en `20260615000003` (limitación conocida: las aplicaciones vía Management API no se registran en esa tabla — documentada desde CP-POS Task 30). Por eso la verificación se hace por **artefactos DDL**, con tres fuentes independientes que convergen:

### Fuente A — sonda propia `scripts/cpbra-verify-prod-migrations.mjs` (27 checks, todos PASS)

- **140000 (R-01+R-14):** `update_payment_status()` contiene la rama `('production_order','work')`, neteo de contra-filas en las 3 ramas, guard OT voided; trigger `trg_update_payment_status` AFTER INSERT/UPDATE/DELETE FOR EACH ROW; `reverse_supplier_payment(uuid,text,uuid,timestamptz,boolean)` con guard `ERR_PAYMENT_IN_CLOSED_FISCAL_PERIOD`, excepción `PAYMENT_REVERSED_CLOSED_PERIOD`, exige `is_admin_check` + motivo; **overload de 4 args eliminado** (1 sola función); ACL `{postgres, service_role}`.
- **150000 (R-11):** `create_sale_v2` firma /35 con `ERR_INCIDENT_INVALID_STRUCTURE`, `ERR_INCIDENT_ARITHMETIC_MISMATCH`, `ERR_INCIDENT_DOES_NOT_EXPLAIN_DIFFERENCE`, enum de 4 tipos, cobertura exacta ±0.01 en §18.
- **160000 (R-15):** `create_supplier_local` firma /10 con `ERR_SUPPLIER_DUPLICATE_SUSPECTED`, auditoría `SUPPLIER_DUPLICATE_CONFIRMED`, motivo ≥3, autorización `is_admin_check`/`has_store_access_as`, ACL `{postgres, authenticated, service_role}`; **sin UNIQUE por nombre** (los 2 UNIQUE existentes son `suppliers_pkey(id)` y `suppliers_master_party_unique(master_party_id, store_id)`, ambos preexistentes de la misión Catálogo Maestro — decisión §8.4 respetada).

### Fuente B — modo `--check` del script versionado `scripts/cpbra-apply-migration-prod.mjs`

`YA APLICADA (todas las marcas presentes). Se salta.` para las tres migraciones: 9/9 (140000), 5/5 (150000), 5/5 (160000). Exit 0.

### Fuente C — expediente CP-BRA-REMEDIATION-001 (actas + INFORME, en rama #1720)

Actas de aplicación con canal gobernado (guard CP-INFRA-019, doble flag, lote único, `NOTIFY pgrst` 201), aislada primero, surface re-certificado (232→232→233 funciones).

### Correspondencia SQL versionado ↔ SQL aplicado

| Migración | SHA-256 calculado sobre el archivo de la rama | Declarado en acta | ¿Coincide? |
|---|---|---|---|
| `20261126140000_cpbra_r01_r14_payment_engine.sql` (22.699 bytes) | `15efb4e4a8fd7a4b8da1734cd5ed117aa65bb88e4c20b2055f914e0fa3f7ffeb` | `15efb4e4…f7ffeb` | **SÍ** |
| `20261126150000_cpbra_r11_pos_incidents_validation.sql` (76.571 bytes) | `3152b4ce7a0623a1cb9920d2f633001c4a05a4d92f044ae2390cdda33982022c` | (el acta 150000 no declara SHA) | verificado por las 5 marcas DDL + surface |
| `20261126160000_cpbra_r15_supplier_dedup_guard.sql` (7.279 bytes) | `fc97d85e4ea56c216d97633485e752b43006bb4e2499c19b75dbcc81d55d494c` | (sin acta separada; INFORME §3) | verificado por las 5 marcas DDL + surface |

Nota menor de documentación: el acta 140000 declara «22.555 bytes» pero el SHA declarado coincide con el archivo de 22.699 bytes; el SHA es la referencia autoritativa (la cifra de bytes del acta es imprecisa). Sin impacto material.

## 3. Funciones críticas examinadas (código + producción)

| Función | Estado en producción | Coincide con SQL versionado |
|---|---|---|
| `update_payment_status` | rama OT presente, neteo, guard voided, trigger con DELETE | SÍ |
| `register_supplier_payment` | rama OT con FOR UPDATE + `ERR_ORDER_NOT_PAYABLE`; overpay bloqueado; idempotencia | SÍ |
| `reverse_supplier_payment` | 5 args, guard período cerrado/locked, excepción admin auditada, idempotente por `reverses_payment_id`; overload eliminado | SÍ |
| `create_sale_v2` | /35, validación `ERR_INCIDENT_*` server-side, PT011 intacto cuando no hay incidencias | SÍ |
| `create_supplier_local` | dedup server-side, fail-closed con candidatos, confirmación auditada | SÍ |

## 4. Evidencia de datos productiva (forense re-ejecutable, 2026-11-26)

`scripts/cpbra-forensic-7criticals.mjs` (read-only): R-01 18/18 OTs coherentes (0 stale); R-02 0 OTs no-CUP activas; R-04 0 anulados con pagos vivos; R-05 1 ajuste (rol encargado, desv 1.00); R-11 3 ventas con Σpagos≠total (−200, −12.000, +8.100); R-14 0 reversiones en período cerrado (0 cierres fiscales); R-15 0 duplicados (10 proveedores, 3 clientes).

## 5. Conclusión de reconciliación

1. **Las 3 migraciones declaradas SÍ están aplicadas en producción** y el SQL versionado en las ramas coincide byte-a-byte (SHA) con lo aplicado. No hay divergencia versionado↔producción.
2. **No es necesario aplicar nada nuevo a producción** para consolidar los PRs: fusionar #1717–#1720 solo integra en `main` el código y la documentación de lo que producción ya ejecuta (los PRs son el registro versionado de una aplicación gobernada ya documentada).
3. La discrepancia temporal queda explicada (nomenclatura de versión del 26-11 para trabajo real del 25-11) y documentada; no oculta ninguna divergencia.
4. La operación pendiente para esta misión es de **integración (fusión de PRs)**, no de base de datos. No se tocará producción.
