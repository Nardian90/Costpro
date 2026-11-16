# RECT004_FINAL_READINESS.md — CP-FIN-ULTIMATE-CLOSE-008

Fecha: 2026-11-16 · Estado: **runbook preparado y vigente · ejecución pendiente de AUTORIZACIÓN FINANCIERA INDEPENDIENTE del propietario**

## 1. Estado de preparación

| Elemento | Estado |
|---|---|
| Runbook RECT004 (expediente 004) | PREPARADO — pre-flight 20/20 secciones hash-idénticas (m053, 2026-11-16) |
| Valores de la propuesta | **Sin recálculo necesario** — los saldos congelados siguen idénticos a producción |
| Protección T12 que gobierna la regularización | Aplicada, viva y certificada (motor + trigger, sin escape hatch) |
| Plataforma técnica | LISTA (integración completa: PRs #1628→#1633 fusionados; migraciones del ciclo 4/4 aplicadas) |
| Evidencia de no ejecución | Asiento único + 0 reversiones + `fin_posting_errors=0` (m057 E4/E5/E11) |

## 2. Valores de referencia vigentes (sin cambios)

- **RECT-1 — 151.299.851 CUP**: Débito `PAS_CXP_PROV` / Crédito `ACT_INVENTARIO`; corrección gobernada de los costos de adquisición de SKU111/SKU112 a 1 CUP/u (cabecera, capas de compra, WAC); referencia al asiento original `93bb5da9-0afd-4325-baad-a275710062c5` y a FAC-VITALLCONS-001 (`fd9d6c88-5db8-49ea-b185-8bc96cc93e63`).
- **RECT-2 — 24 CUP**: Débito `GAS_VALES` 6 / Débito `GAS_PERDIDA_INV` 18 / Crédito `ACT_INVENTARIO` 24.
- Contexto inalterado: 18 líneas legítimas de precio de venta; **71 líneas no verificables** (≈24,5 M CUP contingentes, no error probado); **4 discrepancias de moneda**; COGS existente 7 CUP; vales contabilizados; reingreso VS-000223; kardex 111=10 / 112=20; WAC 1 CUP.

## 3. Límite expreso heredado

Las misiones 006, 007 y 008 —y este documento— **NO autorizan ni ejecutan RECT-1 ni RECT-2** ni ninguna modificación de registros de la recepción, capas de compra, WAC o kardex. T12 y el hardening son **esquema**; RECT-1/RECT-2 son **contabilidad real**. La distinción se mantiene.

## 4. Qué queda pendiente (única acción del ciclo)

**Decisión financiera del propietario**: autorizar (o no) la ejecución de RECT-1/RECT-2 conforme al runbook RECT004, cuyo pre-flight sigue vigente sin recálculo. Mientras no exista esa autorización explícita, la contabilidad permanece intacta y cualquier intento de anulación de FAC-VITALLCONS-001 seguirá siendo bloqueado por T12 con `ERR_PARTIAL_REVERSAL_PENDING` y el aviso de regularización.

No se requiere al propietario información adicional: todos los valores, saldos y controles están confirmados en los expedientes 004/006/007/008.
