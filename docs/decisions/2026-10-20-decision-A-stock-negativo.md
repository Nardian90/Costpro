# DECISIÓN A — Política de stock negativo (REGISTRO)

> **Estado del registro:** `RATIFICADA` (2026-10-20). Este archivo REGISTRA una
> decisión ya tomada por el propietario; no crea ninguna decisión nueva. Preparado en
> la Misión C (2026-10-21).

| Campo | Valor |
|---|---|
| Decisión | **El sistema nunca admite stock negativo** (alternativa 1 ratificada: la política actual ES la canónica). Toda regularización pasa por `process_inventory_adjustment` con trazabilidad auditada. No se crea bandera de excepción por flujo; no se elimina ninguna restricción global. |
| Ratificada por | Propietario (prompt v2, cierre CP-SEC-027 fase 9) |
| Fuente primaria | `docs/audits/DECISION_A_STOCK_NEGATIVO_2026-10-20.md` |
| Documento base de alternativas | `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §A |
| Integración en `main` | PR **#1431** (`fix/mision-c-cierre`), fusionado por el propietario (2026-10-19T19:01:52Z; merge `cc4ce985f`) — verificado vía API GitHub en la Misión B |
| Desbloquea | **CP-INV-005** (la política de negocio que mantenía la tarea abierta) |

## Evidencia que avala la decisión (verificada viva, read-only, 2026-10-20)

- CHECK maestros VIGENTES: `products_stock_current_check (stock_current >= 0)` en
  `products` y `stock_non_negative (quantity >= 0)` en `inventory`.
- **0 productos con stock negativo** sobre 376 en 22 tiendas.
- Las 4 divergencias históricas (SKU 113, 127, 135, 141) YA NO EXISTEN:
  `docs/audits/evidence/20261018-reconciliacion-stock/` (SKU 113: 121=121; SKU 127: 0=0).

## Distinción política de negocio vs. mecanismo técnico (Misión C)

- **Política de negocio (RATIFICADA):** el stock nunca es negativo; los flujos que
  «necesiten» un negativo (p. ej. devolución sin existencia) se rediseñan como
  **ajuste gobernado + reposición**.
- **Mecanismo técnico (ya vigente, no requiere nueva decisión):** CHECKs a nivel BD +
  RPC `process_inventory_adjustment` + revalidación con lock determinista (DF-06) en
  transferencias + tests de regresión de ambos CHECK en la suite.

## Efecto pendiente (no es una nueva decisión)

La regularización de los artefactos QA restantes (~10 productos de prueba en
TIENDA CENTRAL; 41 divergencias actuales todas de pruebas/QA) queda como **tarea de
higiene separada**, cada lote con su propia autorización expresa del propietario
(`DECISION_A_STOCK_NEGATIVO_2026-10-20.md` §Efecto sobre datos). La Misión F
(ajustes CP-INV-005/006) queda desbloqueada en su parte de política; su ejecución
sigue requiriendo autorización por lote.
