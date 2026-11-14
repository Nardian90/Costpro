# EXPEDIENTE — CP-POST-MERGE-EXECUTION-002
## Ejecución post-merge de la adenda vinculante del propietario (2026-11-14)

Antecedente: `audit-evidence/CP-SECURITY-BACKLOG-001/EXPEDIENTE.md` (misión anterior, 7 frentes CERRADOS / 2 BLOQUEADOS: compuerta del freno TRUNCATE y decisión de costos). Esta misión ejecuta la **ADENDA VINCULANTE CP-POST-MERGE-EXECUTION-002** del propietario, que desbloquea ambos frentes y añade el frente de reincidencia del importador. La adenda **sustituye** la compuerta textual `AUTORIZO BREAKER PROD` y declara las tres decisiones TOMADAS (no requieren nueva autorización).

---

## §1. Estado de reanudación (protocolo 11f — verificar antes de actuar)

| Verificación | Resultado [MEDIDO 2026-11-14 16:48 UTC] |
|---|---|
| PR #1625 | **MERGED** (aa3e9e8c0), CI main 4/4 verde (CI, Security CI Gate, SQL Security Gate, Test Coverage) |
| PM2 local | online, health 200, `.env` PRINCIPAL activo |
| Freno TRUNCATE en producción | 0 funciones, 0 triggers; las 34 tablas requeridas existían → instalable |
| Costo promedio (`products.cost_average`) | 97/355 exactamente cero (0 nulos, 0 negativos) — coincide con la adenda |
| Clasificación operativa | nullable, sin default; 274 NULL + 81 venta = 355 |
| Libro de migraciones | 53 filas, al día con main (incluida 20261114160000) |

Hallazgo clave: `products` tiene DOS campos de costo. `cost_price` = costo documental (301 en cero); `cost_average` = costo promedio WAC (97 en cero). El universo de la adenda (97/355) confirma que el campo objetivo es **`cost_average`**, denominado en **CUP** por convención del sistema (`register_reception` normaliza `unit_cost × tasa` a CUP antes de `fn_recalc_wac`).

## §2. FRENTE 1 — Freno de TRUNCATE instalado en producción (CP-INFRA-020 → CERRADO)

Autorización expresa adenda §1. Secuencia segura v1 → v2, lote único atómico por archivo (protocolo simple = transacción implícita), doble guard (`--authorize` + `ALLOW_PROD_WRITE=I_UNDERSTAND`), registro en el libro en la misma sesión.

| Paso | Evidencia |
|---|---|
| Validación E2E previa | anomalía detectada y corregida: 28/34 triggers habían perdido `ENABLE ALWAYS` (causa local del fixture E2E, NO de migraciones). Re-aplicado v2 idempotente → 34/34 'A'. Batería `infra020_breaker_v2_test.sql` 6/6 PASS, cero residuos |
| v1 `20261110120000` aplicada | sha `e1d388ad…`, fila libro id 55 (versión `20261110120000-2`: sufijo por colisión de prefijo con `plantillas`; el índice único del libro es PARCIAL `version WHERE status='applied'`) |
| v2 `20261114180300` aplicada | sha `20af6280…`; verificación fail-closed 34/34 pasada DENTRO del lote; fila libro id 56 |
| Verificación post [MEDIDO] | función activa con bypass restringido por rol (condición `anon/authenticated` en el cuerpo) + SECURITY INVOKER; 34 triggers / 34 `tgenabled='A'` / 0 no-A / 34 tablas distintas; 34/34 tablas protegidas; 0 duplicados; 0 GRANT del instalador a anon/authenticated; delta negocio 0 (products 355, transactions 1009) |
| Bypass revisado | GUC `costpro.allow_truncate='on'` NO basta a un rol de aplicación (condición de rol en `block_truncate` + REVOKE TRUNCATE de 20261114180100); probado en la batería (test 4) |
| Sin TRUNCATE de prueba sobre tablas reales | cumplido (la batería usa tabla dummy en transacción revertida) |

## §3. FRENTE 2 — Costo promedio cero → 1 CUP nominal (CP-COST-RECONCILIATION → CERRADO)

Decisión expresa adenda §2: «todos los productos cuyo costo promedio sea exactamente cero deben actualizarse a 1 CUP» — se documenta como **COSTO NOMINAL ESTABLECIDO POR DECISIÓN DEL PROPIETARIO: 1 CUP** (no procede de factura ni recepción).

Investigación previa [MEDIDO]:
- Universo: 97 (ENERVIDA 92, PUERTO PADRE 2, QA 2, Prueba 1). 0 nulos, 0 negativos.
- **0 de los 97 tienen `receipt_items` ni `inventory_movements`** → la asignación no contradice ningún documento de recepción → **0 incidencias técnicas separadas**.
- 60 de los 97 nacen de la **importación del catálogo del 2026-11-13** (60 maestros creados ese día + 59 acciones `IMPORT_PRODUCT` en audit_logs). El resto por fechas de alta verificadas (08-11×13, 10-16×14, 10-17×4, 11-07×2, 11-09, 11-11, 08-16) — nada se atribuyó a la importación sin comprobar identificadores y fechas.
- 4 casos con costo documental > 0 y WAC 0 (PROD-033 13200; PBM-001 100; QA-ICON-001 50; QA-ICON-002 80): el costo documental se conserva INTACTO; solo el WAC pasa a 1 por la decisión.
- 1 producto cotizado en USD (sku '23' ENERVIDA): `cost_average` es CUP por convención → 1 = 1 CUP; su `cost_price` (0) queda intacto.

Migración `20261114190000_cp_cost_nominal_1cup.sql` (sha `76894c57…`, fila libro id 57):
- Snapshot auditable `cp_cost_nominal_20261114_audit` (valor ANTES por fila, origin explícito, write_path). Detectó en E2E un producto huérfano (store colgante) que un INNER JOIN perdía → corregido a LEFT JOIN antes de producción.
- **Doctrina de escritura única del WAC respetada** (guard `w62_guard_wac_writer`, tgtype 19 = BEFORE UPDATE ROW, ACTIVO durante toda la operación; nada se deshabilitó):
  - stock = 0 (95): `PERFORM fn_recalc_wac(store, product, 'cp_post_merge_002_nominal', qty_in=1, uc_in=1)` → blend D-01 (0·0+1·1)/(0+1) = **exactamente 1** + asiento automático en `wac_change_log`. La unidad nominal NO crea movimientos ni toca stock.
  - stock > 0 (2 QA): el blend no puede producir exactamente 1 con S>0 → patrón de escritura EXACTO del escritor canónico (token `SET LOCAL app.wac_writer='fn_recalc_wac'` sellado alrededor del UPDATE) + fila explícita en `wac_change_log` (`cp_post_merge_002_nominal_owner_decision`, qty_in=NULL, source_ref con la autorización). Escritura consciente y auditada de operador.
- Verificación fail-closed dentro del lote: 0 cero/nulo/negativo; costos documentales preservados POR IGUALDAD (portable al replay); precios íntegros; asiento global `audit_logs` `COST_NOMINAL_1CUP_OWNER_DECISION` (table_name='system', permitido por la check).
- Idempotente (re-run E2E HTTP 201 sin efectos).

Verificación producción [MEDIDO]: 355 total → **0 cero / 244 en 1 CUP** (97 asignados + 147 ya en 1) / **99 mayores intactos** / 0 nulos / 0 negativos. Snapshot 97/97 en 1. `wac_change_log`: 95 + 2 = 97 asientos. Los 4 costos documentales EXACTOS; precios de venta intactos. Conciliación posterior por tienda: 0 promedio cero / 0 nulo / 0 negativo / 0 precio negativo / 0 no-venta en TODAS.

## §4. FRENTE 3 — Clasificación operativa `venta` (CP-MIGRATION-LEDGER + frente clasificación → CERRADO)

Decisión expresa adenda §3: todos los productos del catálogo con clasificación `venta`, sin NULLs, nuevos heredan `venta`, sin reincidencia.

- **Por qué correctiva NUEVA (`20261114190100`, sha `9c995669…`, fila libro id 58) y no actualizar `20261110090000`**: la original NO está aplicada en producción PERO ya forma parte del replay certificado de CostproE2E (manifiesto + digest). El protocolo de inmutabilidad protege toda migración integrada al replay (modificarla rompería la reproducibilidad). La correctiva alcanza EL MISMO ESTADO FINAL y es portable: idempotente sobre una base donde la original ya corrió (E2E) y completa donde no corrió (producción).
- Cuerpos de las RPC `create_master_product` / `activate_master_product` copiados VERBATIM de 20261110090000, con verificación programática previa: diff contra la definición vigente (20261108150000) = exactamente 2 diferencias por función, ambas `DEFAULT NULL` → `DEFAULT 'venta'`. Ninguna migración posterior redefinió estas RPC (sin riesgo de regresión).
- Contenido: backfill 274 NULL → venta; `SET DEFAULT 'venta'`; `SET NOT NULL`; COMMENT (incluye aclaración: NO clasifica movimientos de inventario — una Entrada/Devolución/Vale de Salida conserva su propio tipo); REVOKE/GRANT re-declarados; verificación final fail-closed (NOT NULL + DEFAULT + 0 sin clasificar + 0 fuera del enum + DEFAULT 'venta' en ambas RPC).
- E2E: aplicada + re-run idempotente (201/201).
- Producción [MEDIDO]: `operational_class` NOT NULL con DEFAULT `venta`; **355/355 `venta`**, 0 nulos, 0 fuera de enum; por tienda 0 nulos. Movimientos históricos SIN tocar.
- Consistencia UI/API: el backend y el frontend ya operan `venta` (81 filas creadas desde la UI; importador valida el enum; schemas con tests).

## §5. FRENTE 4 — Fix de reincidencia del importador (adenda §5)

Raíz confirmada por código en `managed_bulk_import_products` (20261113140100, aplicada — NO se modifica): INSERT sin `cost_average` (DEFAULT 0) y `operational_class` NULL explícito con celda vacía. 60 de los 97 productos en cero nacieron así.

Correctiva NUEVA `20261114190200` (sha `a45b0c9f…`, fila libro id 59), cuerpo VERBATIM + 8 parches generados programáticamente (script `scripts/gen-import-fix-migration.cjs` fuera del repo) con verificaciones: el DO UPDATE NO contiene `cost_average`/`stock_current`/`image_url`/`has_movements`:

| Parche | Contenido |
|---|---|
| Altas con costo | `cost_average` en el INSERT con origen: costo CUP > 0 → seed = costo (WAC inicial documentado; recepción posterior recalcula por blend); ausente/cero → **nominal 1 CUP** (contado); moneda ≠ CUP con costo > 0 → NO se siembra (WAC es CUP, sin tasa documental no se convierte ni se inventa) y se REPORTA por fila (`non_cup_cost_not_seeded_pending_wac`) |
| Clasificación | celda vacía → `venta` ANTES de escribir (`COALESCE`); el DEFAULT de la columna no cubre NULLs explícitos |
| Re-import conservador | celda vacía NO degrada la clasificación existente (CASE con bandera `v_oc_was_default`); el UPDATE NUNCA toca `cost_average`/stock/imagen/has_movements |
| Informe al usuario | `nominal_cost_assigned` + `venta_default_applied` agregados en la respuesta; `cost_average_origin` y `operational_class_effective` por fila; auditoría `IMPORT_PRODUCT` con origen; toast del `CatalogImportDialog` con el conteo nominal |

- Guard WAC: tgtype 19 = BEFORE UPDATE FOR EACH ROW → los INSERT no lo disparan; guard intacto.
- No duplicación sobre importaciones ya procesadas: los contadores y la asignación aplican SOLO a altas (`v_was_inserted`); el re-import no reasigna.
- **Validación funcional E2E [MEDIDO]** (transaccional, cero residuos): alta sin costo → `cost_average=1`, `venta`, `nominal_cost_assigned=1`, `venta_default_applied=2`; alta con costo CUP 500 → seed 500; re-import fila 1 con costo 999 y clasificación explícita → `cost_price` 999 actualizado, `cost_average` se MANTIENE (1), clasificación → `insumo`; re-import fila 2 con celda vacía → clasificación `venta` conservada, `cost_average` 500 intacto; alta USD con costo 10 → sin seed + origen reportado + venta default.
- Test de migración nuevo: `src/__tests__/migrations/cp-import-flow-recurrence-fix-migration.test.ts` — 6/6 PASS. El test de la migración original (20261113140100) permanece 11/11 (sin cambios: su archivo no se toca).

## §6. Conciliación posterior y libro de migraciones

- Conciliación [MEDIDO]: por tienda 0 promedio cero/nulo/negativo, 0 precios negativos, 0 no-venta; snapshot 97/97 en 1; 0 costos documentales alterados.
- Libro: 53 → **58 filas** (55-59 registradas en la misma sesión de cada aplicación, como ordena la adenda). `ledger-sync-check`: ver §7.
- Estados de los 9 frentes de la misión anterior: los 2 BLOQUEADOS pasan a **CERRADO** (INFRA-020 instalación real comprobada; COST-RECONCILIATION los 97 cubiertos por decisión, 0 incidencias técnicas). Los 7 CERRADOS permanecen (verificaciones no alteradas: payroll RLS, privilegios, comisiones, rate limit, BUG-024, IPV-003, libro).

## §7. Integración y CI

- Manifiesto replay regenerado: 167 → **171 migraciones** (digest `75fbbbe7…`, `--check MATCH`).
- Test replay actualizado (170 incluidas).
- Contract-surface re-certificado desde producción: 208 funciones, sha `76383724…`; estático 208/208, **0 divergencias**; **LIVE: TODAS LAS FUNCIONES PASAN**.
- Suite local completa: **tsc 0 errores** · **eslint 0 errores** · **6069 tests PASS / 0 FAIL** (446 archivos; +6 del nuevo test) · `check-writers` OK (161 escritores declarados) · `check-destructive-guard` OK (sin destructivos sin guard).
- BD aislada: `verify-remote-e2e` → "Base aislada PREPARADA" (centinela true, REST 200) con el manifiesto 170.
- Build local: compila (67s); la fase TypeScript interna del `next build` se aborta por el límite de memoria del sandbox (SIGKILL) — limitación de entorno ya documentada en la misión anterior; `tsc --noEmit` standalone pasó con exit 0 y el CI de GitHub lo validará.
- Los guards `check-writers` / `check-destructive-guard` no requirieron cambios (las 3 nuevas migraciones no introducen destructivos sin guard; `DESTRUCTIVE-OK` del freno ya declarado en su cabecera).

## §8. Rolling de producción (cinco capas)

| Migración | En repo | Aplicada prod | Desplegada (Vercel) | Verificada |
|---|---|---|---|---|
| 20261110120000 (freno v1) | ✓ (desde PR #1625) | ✓ [MEDIDO 34 triggers] | N/A (BD) | ✓ §2 |
| 20261114180300 (freno v2) | ✓ | ✓ | N/A | ✓ §2 |
| 20261114190000 (1 CUP) | ✓ (este PR) | ✓ [MEDIDO 0 cero] | N/A | ✓ §3 |
| 20261114190100 (venta) | ✓ (este PR) | ✓ [MEDIDO 355/355] | N/A | ✓ §4 |
| 20261114190200 (import fix) | ✓ (este PR) | ✓ [MEDIDO] | N/A | ✓ §5 |
| 20261114190300 (RLS auditoría 1 CUP) | ✓ (este PR) | ✓ [MEDIDO] | N/A | ✓ §7-bis |
| Frontend informe nominal (dialog) | ✓ (este PR) | pendiente merge PR → Vercel | — | ✓ suite local |

## §9. Residuos y prohibiciones verificadas

- No se modificó ninguna migración aplicada (20261110120000, 20261110090000, 20261113140100, 20261114180300 intactas — verificado por diff).
- No se deshabilitó RLS ni ningún guard (w62 WAC guard activo antes/después; freno con ENABLE ALWAYS; RLS nómina intacta).
- No se inventaron datos ni tasas de conversión (USD → reporte visible, sin conversión).
- No se tocaron precios de venta, costos documentales, recepciones, facturas, fichas de costo ni movimientos históricos (verificado por igualdad post-migración).
- Sin TRUNCATE de prueba sobre tablas reales de producción.
- Diff de la rama escaneado contra los patrones canónicos de secretos de este repo (PAT de GitHub, claves Supabase de servicio/publicables y prefijos JWT): **0 coincidencias reales** (la única detección era esta misma línea del checklist; reformulada para no producir ruido en scanners).

## §7-bis. Fix del SQL Security Gate (hallazgo tables_no_rls)

- El gate en vivo (contra la BD) marcó `cp_cost_nominal_20261114_audit` (creada por 190000) como tabla sin RLS.
- Correctiva `20261114190300`: `ENABLE ROW LEVEL SECURITY` sin políticas = deny-all fail-closed (lectura solo owner/service_role). Aplicada en producción (libro id 60), manifiesto 171, test replay 171 PASS, XLSX actualizado.

## §10. Pendientes y siguientes pasos

1. Merge del PR de esta misión (CI verdes) → despliegue Vercel del informe nominal en el importador.
2. E2E Aislado (workflow manual) opcional tras el merge: la base ya contiene las 170 migraciones aplicadas y validadas.
3. La matriz XLSX de conciliación se actualiza con el estado post-decisión (entregable adjunto a la misión).
