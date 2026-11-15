# RECTIFICATION_READINESS.md — CP-FIN-T12-PRODUCTION-MIGRATION-006

Fecha: 2026-11-15 · Estado de la rectificación financiera tras la instalación de la protección T12

## 1. Estado

> **T12 instalada y verificada en producción. Rectificación financiera todavía NO ejecutada.**

- Prerrequisito del runbook RECT004 (addendum T12, punto 1): «antes de ejecutar RECT-1, la migración `20261115100000_cp_fin_t12_partial_reversal_guard.sql` debe estar APLICADA en producción con registro en el ledger» → **CUMPLIDO** (fila `20261115100000 · management_api · applied · sha256 aprobado`).
- La protección está activa **ANTES** de crear la reversión parcial de RECT-1, tal como exige el addendum.

## 2. Propuesta vigente (sin cambios de importes)

| Operación | Importe | Contenido |
|---|---|---|
| **RECT-1** | **151.299.851 CUP** | Débito `PAS_CXP_PROV` / Crédito `ACT_INVENTARIO`; referencia al asiento original `93bb5da9-0afd-4325-baad-a275710062c5` y a FAC-VITALLCONS-001 (`fd9d6c88-5db8-49ea-b185-8bc96cc93e63`); corrección gobernada de costos de adquisición a 1 CUP/u (cabecera, capas de compra, WAC) |
| **RECT-2** | **24 CUP** | Débito `GAS_VALES` 6 (VS-000037/138/139) + Débito `GAS_PERDIDA_INV` 18 (cuadre Δ−1/−17) / Crédito `ACT_INVENTARIO` 24; sin duplicar el COGS de 7 CUP ya registrado |

- Re-verificación previa a la aplicación (mismo día): pre-flight del runbook **VIGENTE** (m050b fresco + m053 → 20/20 secciones idénticas) **y** captura propia m054 con las mismas referencias (FVC activa 192.039.436 · 101 líneas · 1 asiento posted · 0 reversiones · CXP pendiente · stock 10/20 · WAC 1 · COGS 7 · 0 post-corte). **La propuesta NO requiere recálculo.**
- El total corregido **40.739.585 CUP sigue siendo PRELIMINAR** y NO se certifica como valoración definitiva de las 101 líneas.

## 3. Protección T12 activa — implicaciones operativas para RECT004

- **Anulación automática con reversión parcial pendiente**: bloqueada con `ERR_PARTIAL_REVERSAL_PENDING` (canal `_safe` lo registra en `fin_posting_errors`). Durante la ejecución del runbook esto es el comportamiento **esperado y deseado**: obliga a regularizar el residual antes de cualquier anulación automática.
- **Regularización explícita** (única salida): asiento manual documentado (`document_id NULL`) enlazado por `reversal_of` — hallazgo m052/P7 (restricción `uq_fin_entries_doc_event`). Tras cobertura total, el cauce ordinario se rehabilita.
- **Anulación ordinaria de recepciones sin reversión parcial**: intacta (cobertura total → idempotencia conservada; demostrado E2E 9/9 P0/P4/P5 y por código desplegado).
- **Auditoría de intentos**: cada bloqueo queda en `fin_posting_errors` (motor) + `RAISE WARNING` en el log del servidor (negocio). Ni uno ni otro alteran saldos.

## 4. Intocable (re-confirmado tras T12)

Precios de venta · 18 líneas legítimas · **71 líneas no verificables** (≈24,5 M CUP contingentes, no error probado) · **4 discrepancias de moneda** · asientos COGS existentes (7 CUP) · vales ya contabilizados · reingreso VS-000223 · movimientos ajenos a SKU 111/112. Verificación: 11 secciones hash-idénticas pre→post (BEFORE_AFTER_SCHEMA_DIFF.md) + 20/20 secciones del pre-flight del runbook.

## 5. Riesgos y rollback

Ver `docs/audits/valuation-rectification-release-gate-004/RECT004_PRODUCTION_RUNBOOK.md` (valores antes/después exactos, 7 verificaciones post-aplicación, rollback individual y total) + `RECT004_ADDENDUM_T12_GUARD.md`. La aplicación de T12 no altera el mecanismo de rollback del runbook (los snapshots pre/post de esta misión añaden una línea base adicional).

## 6. Lo que falta para ejecutar RECT-1/RECT-2

**Únicamente la autorización contable expresa, inequívoca e independiente del propietario, referida expresamente al runbook** `RECT004_PRODUCTION_RUNBOOK.md` y su addendum `RECT004_ADDENDUM_T12_GUARD.md`. La autorización de esta misión (migración T12) **NO** cubre la rectificación y no debe interpretarse como tal.
