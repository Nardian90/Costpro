# CP-FIN-NEGATIVE-WAC-REMEDIATION-013
## PRODUCTION_READONLY_EVIDENCE — Extracción 100 % read-only de producción

| Campo | Valor |
|---|---|
| Misión | CP-FIN-NEGATIVE-WAC-REMEDIATION-013 |
| Ejecución | 2026-11-17 (extracción m090 · análisis m091 · XLSX m093) |
| Proyecto | `wthkddeleylijmonclxg` (producción) |
| **Escrituras en producción** | **CERO** |
| Canal | Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query` — exclusivamente sentencias `SELECT`/`WITH` |
| Guards | ① CP-INFRA-019: `assert-not-production` en modo *read* (`ALLOW_PROD=read-only`) · ② guard de referencia (proyecto = producción, hardcodeado) · ③ CP-INFRA-020: guard anti-escritura por consulta (solo SELECT/WITH, fail-closed) |
| Writers manifest | `m090-negwac-extract.mjs` (READ-ONLY) · `m091-negwac-analysis.py` (cálculo local, sin BD) · `m092-negwac-e2e.mjs` (aislación: solo CostproE2E `lguovmvrozxgssupkwpf`) · `m093-negwac-xlsx.py` (cálculo local) |
| Extracto | `scripts/out/m013/extract.json` — 16 secciones, 12 consultas read-only |

## 1. Consultas ejecutadas (todas SELECT/WITH)

| # | Sección | Objeto | Filas |
|---|---|---|---|
| 1 | `productos_todas_tiendas` | products de SKU117/83/90/40/37/31 en TODAS las tiendas (alcance por tienda) | 8 |
| 2 | `wac_log_historico` | wac_change_log completo de los 6 productos | 16 |
| 3 | `kardex_actual` | stock_movements de los 6 SKU (todas las tiendas) | 57 |
| 4 | `capas_compra` | capas purchase de los 6 SKU | 11 |
| 5 | `recepciones_6skus` | recepciones que crearon esas capas | 6 |
| 6 | `receipt_items_6skus` | receipt_items de los 6 SKU (11 líneas; FVC a 1 CUP/CUP/1) | 11 |
| 7 | `fin_entries_fvc` | los 4 asientos del documento FVC (ORIG, RECT-1, RECT-2, RECT-011) | 4 |
| 8 | `fin_movements_fvc` | los 12 movimientos contables de esos asientos | 12 |
| 9 | `saldos_cuentas` | libro mayor de las 5 cuentas clave por tienda | 9 |
| 10 | `cadena_corte` | saldos ENERVIDA: antes de RECT-2, ventana, actual | 5 |
| 11 | `audit_loteC` | auditoría SYSTEM_RECT011_WAC de los 6 productos | 6 |
| 12 | `audit_ventana_completa` | auditoría 19:55–20:04Z del 2026-11-16 | 5 |
| 13 | `salidas_costo_historico` | costos registrados por canal de salida y SKU | 14 |
| 14 | `wac_negativos_hoy` | repro F-012-1 (cost_average<0, no-servicio, ENERVIDA) | 5 |
| 15 | `valoracion_tienda` | valoración de campo vs kardex de la tienda | 1 |

## 2. Resultados clave verificados directamente en producción

- **Repro F-012-1**: exactamente **5 productos** con `cost_average < 0` (no-servicio) en ENERVIDA — SKU117 −2.175.998,00 · SKU83 −122.398,00 · SKU90 −78.176,248120300752 · SKU40 −665,857142857143 · SKU37 −1,00. Ningún otro producto negativo.
- **Instante**: los 6 registros SYSTEM_RECT011_WAC (trace `RECT011-PROD`) muestran `created_at = 2026-11-16 19:59:14.38156+00` con `old_data.wac` POSITIVO para los 5 SKU (1 · 1 · 0,7519 · 0,1429 · 0,96) → la negatividad fue producida por el lote C de RECT-011.
- **Alcance por tienda**: SKU117 y SKU90 existen también en PUERTO PADRE (stock 1 y 100 · WAC 1,00 · `updated_at` 2026-10-10, ANTERIOR a la misión) → intactos. Todas las anomalías son de ENERVIDA.
- **Ventana de auditoría 19:55–20:04Z**: 78 SYSTEM_RECT011_VALUATION (19:59:09) · 1 SYSTEM_RECT011_TOTAL · 78 SYSTEM_RECT011_MOV_UC (19:59:12) · 25 SYSTEM_RECT011_WAC (19:59:14) · 1 SYSTEM_RECT011_ENTRY (20:03:05) — sin actividad ajena.
- **Libro mayor ENERVIDA hoy**: ACT_INVENTARIO 34.435.061,24 (deudor) · PAS_CXP_PROV −2.961.795,90 (acreedor) · **GAS_COSTO_VENTAS −16.677.175,95** · **GAS_VALES −5.105.078,39** · **GAS_PERDIDA_INV −9.691.011,00** (saldos acreedores en cuentas de gasto: los créditos de RECT-011 sin débitos que los sustenten).
- **Cadena de corte** (delta ventana 16:07:49→20:03:06): INV −3.686.327,10 · CXP +40.733.723,50 · COGS −21.442.418,90 · VALES −5.913.947,50 · PÉRDIDA −9.691.030,00 — coincide movimiento a movimiento con RECT-011 y las ventas orgánicas documentadas por la 012.
- **Recepción FVC**: 101 líneas a 1,00 CUP (los 5 SKU incluidos); CXP neta del documento 5.861,50; 4 asientos posted intactos en orden ORIG → RECT-1 → RECT-2 → RECT-011.
- **Drift de la tienda**: `drift_campo_vs_kardex = 0` sobre 256 productos no-servicio (coherente con la 012).
- **Hashes MD5 del kardex actual de los 6 SKU** (`id|qty|uc`, para comparaciones futuras): SKU117 `a5041c32026d74993d44617c8023c065` · SKU83 `27ed313ebead9f73e79cab1436bf65da` · SKU90 `a41dab689db3d8b94145306b81abba23` · SKU40 `4522ea018147587698db4a202d406de1` · SKU37 `b3e82aa128956f68cb7af09b0654140b` · SKU31 `b911e413ed694c6070a1ee3f802b1190`.

## 3. Ausencia de escrituras

- Ninguna consulta del script es no-SELECT (guard por consulta); el canal Management API solo admite la consulta enviada y todas fueron SELECT/WITH.
- El script E2E (m092) apunta al proyecto aislado `lguovmvrozxgssupkwpf` (referencia hardcodeada distinta de producción; `assert-not-production` verifica el destino por su identificador real de proyecto).
- El kardex es append-only y los 57 movimientos de los 6 SKU coinciden con el estado post-RECT-011 (misma cadena verificada por la 012: solo las 78 capas FVC cambiaron de unit_cost en la misión 011).

## 4. Re-ejecutabilidad

`ALLOW_PROD=read-only node scripts/m090-negwac-extract.mjs` → re-extracción determinista. `python3 scripts/m091-negwac-analysis.py` → re-análisis Decimal exacto. Sin secretos impresos (el token va solo en el header efímero de la llamada; no se registra ni commitea).
