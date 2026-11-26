# PRODUCTION-VERIFICATION — Verificaciones de solo lectura sobre producción

**Misión:** CP-BRA-FINAL-VERIFICATION-AND-INV005-001 · **Fecha:** 2026-11-26
**Producción:** CostproBD — `wthkddeleylijmonclxg` · **Canal:** Management API `/database/query` exclusivamente con SELECT (guard CP-INFRA-019, `ALLOW_PROD=read-only`). **Ninguna operación de escritura sobre producción en toda la misión.**

## 1. Scripts re-ejecutables de evidencia (persistidos en el repo)

| Script | Qué verifica | Resultado |
|---|---|---|
| `scripts/cpbra-verify-prod-migrations.mjs` (nuevo, esta misión) | 27 artefactos DDL de las 3 migraciones (firmas, guards, ACLs, triggers, índices) | **27/27 PASS** |
| `scripts/cpbra-forensic-7criticals.mjs` (de la remediación, ahora en main) | estado de datos de los 7 críticos | sin regresiones (§3) |
| `scripts/cpbra-r11-historical-sales.mjs` (nuevo, esta misión) | las 3 ventas con incidencias | explicables/trazables/compatibles |
| `scripts/cpbra-apply-migration-prod.mjs --check` | marcas versionadas de las 3 migraciones | 9/9 + 5/5 + 5/5 OK, «YA APLICADA» |

## 2. Artefactos DDL (FASE 3) — coincidencia versionado↔producción

Ver detalle completo en `MIGRATION-RECONCILIATION.md`. Resumen:

- `update_payment_status`: rama OT + neteo ×3 + guard voided + trigger con DELETE ✓
- `reverse_supplier_payment`: 5 args, guard período cerrado, excepción admin auditada, overload eliminado (1 función) ✓
- `register_supplier_payment`: FOR UPDATE en OT + `ERR_ORDER_NOT_PAYABLE` ✓ (sonda de firma/ACL)
- `create_sale_v2`: /35 + `ERR_INCIDENT_*` ×3 + enum 4 tipos + cobertura ±0.01 ✓
- `create_supplier_local`: /10 + fail-closed + confirmación auditada + ACL correcta + sin UNIQUE por nombre ✓
- SHA-256 del SQL 140000 aplicado = SQL versionado en main (`15efb4e4…`) ✓

## 3. Estado de datos (forense 7 críticos) — 2026-11-26

| R | Evidencia productiva | Lectura |
|---|---|---|
| R-01 | 18/18 OTs con pagos coherentes (paid_amount = suma neta real, diff 0.00); 34 pagos históricos sobre OT draft | El motor mantiene saldos; los pagos en draft son la realidad operativa documentada (decisión separada del propietario) |
| R-02 | 0 OTs no-CUP activas con saldo; 0 pagos sobre OT no-CUP | Riesgo latente resuelto en código; hoy sin exposición |
| R-04 | 0 recepciones/servicios anulados con pagos vivos | Cerrado por #1716, se mantiene limpio |
| R-05 | 1 ajuste confirmado (rol encargado, desviación absoluta 1.00) | Análisis y recomendación en `DECISION-R05.md` — SIN cambios |
| R-11 | 3 ventas `completed` con Σpagos≠total (−200 / −12.000 / +8.100) — todas con incidencias válidas que explican la diferencia real | Compatibles con las reglas nuevas; excepciones de negocio en `HISTORICAL-EXCEPTIONS.md` |
| R-14 | 0 reversiones en período fiscal cerrado; 1 contra-fila total (Pixelarte, ya documentada); 0 cierres fiscales | Guard operativo; sin cierres aún |
| R-15 | 0 grupos de duplicados (10 proveedores, 3 clientes; 7 sin NIT) | RPC activo; sin duplicados actuales |

## 4. Historial de migraciones

`supabase_migrations.schema_migrations` está estancado en `20260615000003` (limitación conocida: las aplicaciones vía Management API no se registran ahí). La verificación autoritativa es por artefactos DDL + SHA + actas — ver `MIGRATION-RECONCILIATION.md`.

## 5. Reglas de la misión cumplidas

- No se re-ejecutó ninguna migración productiva.
- No se ejecutó ningún E2E contra producción (el E2E corre en CI sobre la aislada; evidencia en los checks).
- No se modificó ninguna venta, pago, ajuste o proveedor histórico.
- Producción permanece idéntica antes y después de las fusiones (forense re-ejecutado: mismos conteos).

## 6. PM2 y health (entorno principal)

- PM2 `costpro` online tras la restauración (FASE 0) y al cierre de la misión; `GET /api/health` → 200 `{"status":"ok"}`.
- `.env` principal activo (replica `costpro-env.txt`), `.env*` gitignored, sin credenciales en el repo.
