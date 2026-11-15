# CP-VALUATION-NOMINAL-ACTIVATION-004 — Normalización de costos nominales y prevención de nuevas altas con WAC cero

**Fecha:** 2026-11-15 · **Mecanismo:** Management API (lote único atómico por migración) · **Autorización:** adenda vinculante del propietario (2026-11-15): decisión ya otorgada, sin nueva compuerta.

## 1. Alcance

| Ítem | Resultado |
| --- | --- |
| 64 productos PUERTO PADRE con `cost_average = 0` | **NORMALIZADOS a 1 CUP nominal** [MEDIDO] |
| Vía de escritura | **64/64 vía `fn_recalc_wac`** (blend D-01: (0·0+1·1)/(0+1) = exactamente 1), asiento 0→1 en `wac_change_log` por producto |
| Vía de activación futura (`activate_master_product`) | **CORREGIDA**: el INSERT de altas nace con `cost_average = 1` (patrón del importador 20261114190200); la reactivación NUNCA degrada el WAC |
| Universo global | 419 productos: **0 ceros, 0 nulos, 0 negativos**; 308 @1 CUP; 99 >1 |

## 2. Verificación inicial (F0) [MEDIDO — f0-estado-inicial.json]

- PR #1628 y #1629 MERGED; main = origin/main = 011e9a23f al abrir la misión.
- Los 64: todos PUERTO PADRE, activos, con maestro ACTIVO (64/64), stock=0, cost_price=0, price=0, CUP, alta 19:56:34–19:58:37 UTC del 2026-11-14; **0 receipt_items y 0 stock_movements** (sin respaldo documental que contradiga el nominal).
- Guard WAC activo (trg_guard_wac_writer, tgtype 19, 'O'); `fn_recalc_wac` ACL postgres+service_role.
- RPC en producción sin deriva vs 20261114190100 (cuerpo normalizado idéntico).
- Nota de coordinación: sesión hermana activa aplicó la migración T12 (20261115100000, dominio FIN) hoy 12:26 UTC — sin solapamiento con esta misión; re-verificación pre-aplicación integrada en el lote con ABORT si el universo difiere de 64.

## 3. Diagnóstico WAC (F1) — por qué el nominal no contamina

- Guard: `BEFORE UPDATE OF cost_average` exige token `app.wac_writer='fn_recalc_wac'`; los INSERT no están vigilados por diseño → asignar el nominal en el estado inicial (INSERT) es legítimo y coincide con el patrón del importador.
- `register_reception` normaliza a CUP (unit_cost × tasa) y llama a `fn_recalc_wac('reception_in', …)` ANTES del movimiento: con S=0 el blend produce el costo real EXACTO; las siguientes entradas ponderan (S·ca_prev + q·uc)/(S+q).
- Los ajustes de stock también recalculan WAC ('adjustment_plus') → todo incremento de existencia pasa por el escritor canónico.

## 4. Migraciones (paso 1 del protocolo — archivos versionados)

| Migración | Contenido |
| --- | --- |
| `20261115120000_cp_valuation_nominal_pp64.sql` | Tabla de auditoría `cp_cost_nominal_pp64_20261115_audit` (identificadores exactos + situación completa; **RLS deny-all desde la creación**); snapshot ANTES; asignación 3 vías (fn_recalc_wac / token sellado / huérfanos) con filtro `p.cost_average = 0` en los 3 bucles (**idempotencia estricta: la reejecución no reprocesa el snapshot histórico ni genera asientos redundantes**); verificación fail-closed (cero universal, costos documentales, integridad stock/precio/sku/nombre/maestro, cero documentos ficticios, asientos wac_change_log, precios íntegros); asiento global `COST_NOMINAL_PP64_OWNER_DECISION`. |
| `20261115120100_cp_valuation_activation_nominal.sql` | `CREATE OR REPLACE activate_master_product` (firma/validaciones/ACL VERBATIM de 20261114190100): INSERT con `cost_average = 1` + `nominal_cost_assigned` + `cost_average_origin='nominal_1cup_owner_policy'` en respuesta y auditoría; reactivación sin tocar cost_average (`preexistente_intacto`); verificación fail-closed del cuerpo. |

## 5. Aplicación en producción (pasos 2-4 del protocolo)

- Lote único atómico por migración: pre-verificación (64 exactos + guard + fn_wac) → migración con verificaciones internas → fila del libro en el MISMO ciclo. Doble guard: doble flag del operador + `assertNotProduction` CP-INFRA-019.
- Libro: filas para `20261115120000` y `20261115120100` (mechanism=management_api, sha256 del contenido aplicado, applied_by=etiqueta de rol). `ledger-sync-check`: **OK, libro sincronizado**.
- Drift: `drift-baseline-20261115.md` (antes) y `drift-post-20261115.md` (después).
- Contract-surface re-certificado desde producción tras la aplicación: 208 funciones, sha256 3dddf3ee…; `security-contract-test-static` → exit 0 (capa C sin drift).

## 6. Verificación post [MEDIDO — produccion-verificacion-post.log + conciliacion-final.json]

11/11 controles OK:
- universo en cero = 0 · nulos = 0 · negativos = 0
- los 64 PP en 1 CUP (pp_64_en_1 = 64; PUERTO PADRE total 122/122 en 1 CUP)
- snapshot auditable = 64 · asientos wac_change_log = 64 (todos 0→1, qty_in=1/uc_in=1, write_path=fn_recalc_wac)
- asiento global presente · guard WAC activo ('O') · RPC con política nominal (marcadores en pg_get_functiondef)
- libro 2/2 · precios íntegros (0 negativos/nulos)
- Documentos: 0 receipts/receipt_items/stock_movements creados por la misión (movimientos del día: 0)
- Integridad individual de los 64 [MEDIDO]: cost_price, price, stock_current, sku, name y master_product_id intactos 64/64

## 7. E2E aislado (CostproE2E, lguovmvrozxgssupkwpf) — 9 escenarios PASS

Prototipo re-ejecutable `scripts/val004-e2e-prototype.mjs` (sentinelas REST+SQL + guard canónico; cleanup net delta 0):

1. **Alta nominal**: activación nueva → `cost_average=1`, price/cost_price=0, stock=0, venta, respuesta con origen.
2. **Reactivación**: `already_active`, WAC sin degradación.
3. **Primera recepción real** (10u @ 500 CUP): WAC = **500 EXACTO** (nominal reemplazado; asiento `reception_in`).
4. **Segunda recepción** (5u @ 700): WAC = **566.666…** = (10·500+5·700)/15 (ponderación correcta).
5. **Dos tiendas**: maestro compartido (M1), tienda B nominal 1, tienda A conserva WAC real — costos independientes.
6. **Reactivación tras WAC real**: WAC intacto (566.67).
7. **Corrección PP64 + idempotencia**: fixture legado (INSERT con cost_average=0) → re-ejecución de la migración real → 1 CUP vía fn_recalc_wac (asiento 0→1); 2ª re-ejecución → 0 filas nuevas en snapshot, 0 asientos wac_change_log, asiento de auditoría con `updated=0`.
8. **Costo documental y precio**: cost_price=0 y price=0 en todo el flujo.
9. **Guard WAC**: `UPDATE` directo sin token → `ERR_WAC_SINGLE_WRITER_VIOLATION`; trigger activo.

Suite local: tsc 0 errores · eslint 0 errores · vitest **6081/6081** (447 archivos, +12 tests de migración) · check-writers OK · destructive-guard OK · manifiesto replay 174 `--check` MATCH.

## 8. Criterio de cierre — CUMPLIDO

- ✅ Los 64 normalizados (cost_average = 1 CUP), por vía canónica, con auditabilidad completa.
- ✅ Las futuras activaciones cumplen la política (RPC corregido en producción + E2E S1/S5).
- ✅ La primera recepción real reemplaza el nominal sin alterar costos documentales, precios, existencias, identidad ni catálogo maestro (E2E S3/S4/S8 + integridad 64/64 en producción).
- ✅ Integridad contable, multitienda y protección del escritor WAC intactas.

## 9. Entregables

- Repo: 2 migraciones + prototipo E2E + aplicador E2E/prod + test de migración (12) + manifiesto replay 174 + contract-surface re-certificado + este expediente + drift baseline/post + evidencia JSON/logs.
- PR: fix/valuation-nominal-activation-20261115.
