# FINANCIAL_INTEGRITY_POSTCHECK.md — CP-FIN-ULTIMATE-CLOSE-008

Fecha: 2026-11-16 · Modo: **100 % solo lectura** · Scripts oficiales: m057 (re-check postmerge), m050b (snapshot fresco fase DP), m053 (pre-flight contra snapshot congelado)

## Veredicto

**Contabilidad de producción intacta tras la integración completa del ciclo. Pre-flight del runbook RECT004 VIGENTE (20/20 secciones hash-idénticas).**

## 1. Invariantes del expediente (m057 re-check, `m057-postmerge-recheck.json` — 26/26 PASS)

| Invariante | Valor actual | PASS |
|---|---|---|
| FAC-VITALLCONS-001 `status` | `active` | ✅ |
| Total de cabecera | 192.039.436.000000000 | ✅ |
| Líneas de la recepción | 101 (suma recomputada 192.039.436.00) | ✅ |
| Asiento original único (reconocimiento/pago) | `93bb5da9-0afd-4325-baad-a275710062c5`, n=1 | ✅ |
| Reversiones vinculadas | **0** | ✅ |
| CXP (`payment_status`) | `unpaid` — sin liquidación inesperada | ✅ |
| Stock SKU111 / SKU112 | 10 / 20 | ✅ |
| WAC SKU111 / SKU112 | 1 CUP / 1 CUP | ✅ |
| COGS reconocido (GAS_COSTO_VENTAS débito) | 7 CUP (5 movimientos) | ✅ |
| `fin_posting_errors` | 0 filas (sin errores ni intentos bloqueados) | ✅ |

## 2. Pre-flight del runbook (m053, `m053-preflight-evidencia.json`)

Comparación del snapshot congelado de RECT004 (expediente 004) contra **extracción fresca de producción** (m050b, 2026-11-16):

> **«PRE-FLIGHT VIGENTE — todas las secciones congeladas idénticas; la propuesta RECT-1 (151.299.851 CUP) y RECT-2 (24 CUP) NO requiere recálculo»**

Las secciones congeladas incluyen la recepción FVC, sus 101 líneas, productos/costos 111-112, asientos y la **protección de 75 líneas: 71 líneas no verificables + 4 discrepancias de moneda — ambas sin modificaciones**.

## 3. Actividad legítima post-corte (documentada, sin relación con el alcance)

m050b §11 detecta actividad comercial posterior al corte **fuera de las secciones congeladas**: 8 asientos, 3 transacciones y 5 pagos nuevos. Ninguna toca FAC-VITALLCONS-001, los SKU 111/112 ni los saldos protegidos (los kardex siguen balanceados: 111 → entradas 49, salidas 39, balance/stock 10; 112 → entradas 101, salidas 81, balance/stock 20).

## 4. Recepciones y asientos fuera del alcance

Sin cambios atribuibles al ciclo: el único efecto de esquema del ciclo (T12 + hardening) no toca datos; los contadores de `fin_entries`/`stock_movements` solo reflejan actividad comercial ordinaria documentada en §3.

## 5. Reproducibilidad

```bash
node scripts/m057-pr1630-close-verify.mjs postmerge <out.json>
node scripts/m050b-rect004-faseDP-snapshot.mjs
node scripts/m053-readonly-preflight.mjs docs/audits/valuation-rectification-release-gate-004/rect004-faseDP-snapshot.json <snapshot_fresco> <out.json>
```
