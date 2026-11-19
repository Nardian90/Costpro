# MATRIZ DE REGLAS CONTABLES — CP-FIN-003

**Misión:** CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
**Fecha:** 2026-11-20 · **Motor:** partida doble CP-FIN (fin_rule_versions + fin_apply_templates)
**Fuente:** catálogos LIVE (`fin_rule_versions` activas tras la migración 20261120120000) + `fin_account_mapping`.

## 1. Mapeo canónico de cuentas financieras (fin_account_mapping)

El **medio de pago determina la cuenta financiera; la moneda determina la
denominación**. Única fuente de verdad para el motor (origen `cuenta_financiera`),
la UI de configuración y los escritores. La moneda NUNCA sustituye al medio.

| Medio del carrito | Valor canónico | Moneda | Cuenta financiera | Nota |
|---|---|---|---|---|
| Efectivo | `cash` | CUP | `ACT_EFECTIVO_CUP` | Billetes CUP en caja |
| Efectivo | `cash` | USD | `ACT_EFECTIVO_USD` | Billetes USD en caja |
| Efectivo | `cash` | EUR | `ACT_EFECTIVO_EUR` | Nueva (matriz completa del carrito) |
| Efectivo | `cash` | MLC | `ACT_EFECTIVO_MLC` | Nueva (matriz completa del carrito) |
| Transf. | `transfer` | CUP | `ACT_BANCOS` | Transferencia nacional |
| Transf. | `transfer` | USD | `ACT_BANCOS` | Transferencia nacional en USD |
| Transf. | `transfer` | EUR | `ACT_BANCOS` | Transferencia nacional en EUR |
| Transf. | `transfer` | MLC | `ACT_BANCOS` | Transferencia nacional en MLC |
| Transf. Exterior | `zelle` | USD | `ACT_TRANSF_EXTERIOR` | **Nueva cuenta propia** (antes ACT_BANCOS) |
| Transf. Exterior | `zelle` | EUR | `ACT_TRANSF_EXTERIOR` | **Nueva cuenta propia** (antes ACT_BANCOS) |

Combinación sin mapeo activo → `ERR_COMBINACION_NO_SOPORTADA` (fail-closed,
`fin_resolve_financial_account`). **Nunca** USD = Zelle por defecto ni moneda
extranjera = transferencia.

## 2. Reglas activas (vigentes desde CURRENT_DATE de la migración)

### 2.1 VENTA (v3 — sustituye a v2 de M-015)

| # | Evento | Métrica | Condición | Débito | Crédito |
|---|---|---|---|---|---|
| 1 | reconocimiento | `cob_cash_cup` | > 0 | `ACT_EFECTIVO_CUP` | |
| 2 | reconocimiento | `cob_cash_usd_cup` | > 0 | `ACT_EFECTIVO_USD` | |
| 3 | reconocimiento | `cob_cash_eur_cup` | > 0 | `ACT_EFECTIVO_EUR` | |
| 4 | reconocimiento | `cob_cash_mlc_cup` | > 0 | `ACT_EFECTIVO_MLC` | |
| 5 | reconocimiento | `cob_transfer_cup` | > 0 | `ACT_BANCOS` | |
| 6 | reconocimiento | `cob_transfer_usd_cup` | > 0 | `ACT_BANCOS` | |
| 7 | reconocimiento | `cob_transfer_eur_cup` | > 0 | `ACT_BANCOS` | |
| 8 | reconocimiento | `cob_transfer_mlc_cup` | > 0 | `ACT_BANCOS` | |
| 9 | reconocimiento | `cob_zelle_usd_cup` | > 0 | `ACT_TRANSF_EXTERIOR` | |
| 10 | reconocimiento | `cob_zelle_eur_cup` | > 0 | `ACT_TRANSF_EXTERIOR` | |
| 11 | reconocimiento | `total_cup` | — | | `ING_VENTAS` |
| 12 | reconocimiento | `costo_productos_cup` | > 0 | `GAS_COSTO_VENTAS` | |
| 13 | reconocimiento | `costo_productos_cup` | > 0 | | `ACT_INVENTARIO` |
| 14 | reconocimiento | `diferencia_cobro_debe_cup` | > 0 | `ING_DESCUENTOS` | |
| 15 | reconocimiento | `diferencia_cobro_haber_cup` | > 0 | | `ING_DESCUENTOS` |

Cambio vs v2: **zelle → ACT_TRANSF_EXTERIOR** (cuenta propia, mandato §4) y
efectivo EUR/MLC con su propia caja. Diferencias de cobro M-015 conservadas.

### 2.2 SERVICIO_RECIBIDO (v2 — sustituye a v1)

| # | Evento | Métrica | Condición | Débito | Crédito |
|---|---|---|---|---|---|
| 1 | reconocimiento | `total_cup` | > 0 | `GAS_SERVICIOS` | |
| 2 | reconocimiento | `total_cup` | > 0 | | `PAS_SERV_PEND` |
| 3 | pago | `importe_pago_cup` (origen `cuenta_financiera`) | — | | **cuenta canónica (medio × moneda del pago)** |
| 4 | pago | `importe_pago_cup` | — | `PAS_SERV_PEND` | |

Semántica (anexo §3.2/§6): confirmar el servicio reconoce el gasto y la
obligación **sin mover efectivo**; cada pago cancela la obligación por su
importe y sale por la cuenta canónica del **(medio × moneda) REAL** del
desembolso; el movimiento conserva `amount_origin`/`currency_origin` del pago.

### 2.3 RECEPCION (v2 — sustituye a v1)

| # | Evento | Métrica | Condición | Débito | Crédito |
|---|---|---|---|---|---|
| 1 | reconocimiento | `total_cup` | > 0 | `ACT_INVENTARIO` | |
| 2 | reconocimiento | `total_cup` | > 0 | | `PAS_CXP_PROV` |
| 3 | pago | `importe_pago_cup` (origen `cuenta_financiera`) | — | | **cuenta canónica (medio × moneda del pago)** |
| 4 | pago | `importe_pago_cup` | — | `PAS_CXP_PROV` | |

Semántica (anexo §4): **recibir mercancía ≠ pagar al proveedor**. La deuda nace
al activar la recepción; cada liquidación registra el (medio × moneda) real.

### 2.4 DEVOLUCION_VENTA (v2 — sustituye a v1)

Reembolsos por método con el mapeo canónico: cash CUP/USD/EUR/MLC → su caja;
transfer (CUP/USD) → `ACT_BANCOS`; **zelle → `ACT_TRANSF_EXTERIOR`**;
`store_credit_cup` → `PAS_ANTICIPOS_CLI`; contra-ingreso `ING_DEVOLUCIONES`;
costo devuelto: crédito `GAS_COSTO_VENTAS` + débito `ACT_INVENTARIO`.

### 2.5 Reglas inalteradas (vigentes)

`VALE_SALIDA` v1 (GAS_VALES + ACT_INVENTARIO), `AJUSTE_INVENTARIO` v1
(faltante → GAS_PERDIDA_INV; sobrante → ING_OTROS_OPER), `COMISION` v1 (gasto y
pago por método/moneda), `NOMINA` v1 (devengo + pago neto), `FLUJO_CAJA` v2
(M-015, egreso/ingreso manual por moneda), `TRANSFERENCIA` v1 (explícitamente
vacía — traslado interno sin efecto económico).

## 3. Separación universal de eventos (anexo §6)

Todo escritor respeta la separación: **(1) reconocimiento de la obligación →
(2) liquidación → (3) movimiento de efectivo/banco**. Un servicio de 5,000 CUP
pendiente: débito GAS_SERVICIOS + crédito PAS_SERV_PEND (sin tocar efectivo).
Al pagar en efectivo: débito PAS_SERV_PEND + crédito ACT_EFECTIVO_CUP con medio
`cash` y moneda `CUP`. Por transferencia: crédito `ACT_BANCOS`. El gasto jamás
se reconoce dos veces por registrar después su pago (un único evento
`reconocimiento` por documento — índice único por generación).

## 4. Configuración y seguridad

- Acceso: Inicio → OPERACIÓN → Estados Financieros → «Configuración de
  Documentos» (existente CP-FIN-015) + acción contextual «Config. contable»
  por movimiento del drilldown (nuevo, §6.2) + matriz de cuentas financieras
  (nuevo panel, §6.4/§10).
- Cambios de reglas: versionados (`fin_rule_versions`), una sola activa por
  tipo+ámbito, con `effective_from`, `created_by/activated_by`, notas y
  auditoría. Los asientos históricos conservan su `rule_version_id` — cambiar
  una regla NO reescribe períodos contabilizados (verificado en E2E C2).
- Escritores del ciclo de vida de generaciones: canal canónico `service_role`
  (patrón rectificador T12), sin EXECUTE para clientes.
