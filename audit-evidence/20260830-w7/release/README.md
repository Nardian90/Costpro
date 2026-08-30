# W7-RELEASE — Release Candidate W6.2+W7-D1 (estado: CANDIDATO — pendiente de aprobación explícita del dueño)

Fecha: 2026-08-30 · Orden: GO W7 FINAL CLOSURE + OWNER DECISION GATE (FASE 8).
**Producción NO autorizada** — este paquete solo puede aplicarse tras `GO PRODUCCIÓN` explícito del dueño.

## 1. Composición y provenance

| Directorio | Contenido | Provenance |
|---|---|---|
| `sql/` | Paquetes 01..09 en orden canónico de aplicación (W7-05 §14.1) | `w62-remediation/sql/` (originales históricos, SIN modificar) + enmienda W7-D1 anexada a 01 |
| `rollback/` | `w7-rollback.sql` (rollback real generado desde snapshot v6) + `w7d1-rollback-complement.sql` (DROP del huérfano `w62_guard_wac_writer()`) | `w7-readiness/` |
| `patch/` | `w7d1-acl-patch.sql` (los mismos 3 REVOKE, como artefacto autónomo de referencia) | `w7-readiness/` |

Los originales de `w62-remediation/sql/` **se conservan intactos** con sus hashes registrados en
`W7-RELEASE-MANIFEST.sha256` (sección ORIGINALS). El candidato parcheado vive solo aquí con hashes separados.

**Única diferencia entre 01 original y 01 release**: bloque `S5. ENMIENDA W7-D1` (3 REVOKE EXECUTE
a PUBLIC/anon/authenticated sobre `fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)`).
Verificable: `diff w62-remediation/sql/01-df01-wac-singleton.sql W7-RELEASE/sql/01-df01-wac-singleton.sql` → solo `840a841,856`.

## 2. Matriz de paquetes (FASE 8 de la orden)

| Paquete | Estado | Cambio requerido | Evidencia | Listo para producción |
|---|---|---|---|---|
| 01 | READY (release candidate con enmienda W7-D1) | Enmienda ACL incorporada en `sql/01` (bloque S5) — original intacto en `w62-remediation/` | Exploit PRE 6/6 → DENIED POST 12/12 (re-verificado 2026-08-30, clon fresco); 182 asserts | **SÍ** (tras aprobación del dueño) |
| 02 | READY | ninguno | DF-02 13/13 + veneno 7777 sin efecto (re-run hoy) | **SÍ** |
| 03 | READY | ninguno | DF-05 13/13; PT=87.5=insumos server (re-run hoy) | **SÍ** |
| 04 | READY | ninguno | DF-09 12/12; INV-14; NOTIFY pgrst en runbook | **SÍ** |
| 05 | READY | ninguno | DF-06 16/16; blend destino 77.142857 exacto (re-run hoy) | **SÍ** |
| 06 | READY | ninguno | DF-07 8/8 + race 3/3 + INV-09 4≤5 (re-run hoy) | **SÍ** |
| 07 | READY | ninguno | DF-08 10/12→10/10 en re-run (replay/param_hash) | **SÍ** |
| 08 | READY con PRECHECK P2 obligatorio | ninguno al SQL; **P2 vivo**: medir volumen `payment_transactions` (ref_type_check full-scan, ACCESS EXCLUSIVE, lock_timeout 5s) | DF-03 16/16; INV-11 0 huérfanos; W7-05 §14.2 H2 | **SÍ** (condicionado a P2) |
| 09 | READY design-only | ninguno (sin backfill, cero mutación de datos de negocio) | W62-14 8/8; clasificador determinista | **SÍ** (despliegue separable/opcional) |

## 3. Runbook (resumen normativo — fuente completa: W7-05, W7-06)

1. **PRECHECK P1**: S1 fingerprint DIFF=0 vs baseline `9e7cea9a…edc2` — abortar si DIFF≠0.
2. **PRECHECK P2**: volumen/duración de `payment_transactions` (ventana de mantenimiento si el scan es largo).
3. Aplicar en orden `01 → 09`, **una transacción única por paquete**, `ON_ERROR_STOP=1`, asserts embebidos; fallo ⇒ abortar y ejecutar `rollback/w7-rollback.sql` **+ `rollback/w7d1-rollback-complement.sql`** (sin el complemento queda 1 huérfano inerte `w62_guard_wac_writer()`).
4. `SET lock_timeout='5s'` para pkg 08; tras pkg 04: `NOTIFY pgrst, 'reload schema'` (P6).
5. **ASSERT-FINAL**: INV-01..15 + huella post-migración esperada; ventana coordinada DB↔frontend (W7-04 §13.3: withdraw/devolutions/reset rotas hasta W8 — errores limpios, sin corrupción).
6. Post-migración: NO ejecutar `09` backfill (no existe); revisar `wac_change_log` (INV-15) y `w62_zero_cost_flags`.

## 4. Condiciones del CONDITIONAL GO pendientes del dueño (W7-20 §3)

1. ✅ **Enmienda formal pkg 01** → incorporada en este release candidate (esta orden).
2. ✅ **Complemento de rollback** → incorporado en `rollback/` (esta orden).
3. ⏳ Ventana coordinada DB↔frontend (W8).
4. ⏳ PRECHECK P2 vivo (solo ejecutable en producción, en ventana).
5. ⏳ Ratificación formal de P-1 (W7-19: clasificación RERUN-REPLACEMENT, decisión del dueño).
6. ⏳ Hallazgos W8 registrados (42703 reset_store_data fail-closed; REVOKE defensivo recomendado a wrappers v2; sync_product_stock tie MEDIUM).
7. ✅ Sin migración sin GO explícito (mantenido).

## 5. Integridad

Todos los hashes (originales + release candidate + rollback + patch) están registrados en
`W7-RELEASE-MANIFEST.sha256`. Verificación: `cd W7-RELEASE && sha256sum -c W7-RELEASE-MANIFEST.sha256`.
