# DECISIÓN A — Política de stock negativo (RATIFICADA)

**Fecha de ratificación:** 2026-10-20 · **Ratificada por:** propietario (prompt v2, cierre CP-SEC-027 fase 9)
**Desbloquea:** CP-INV-005 · **Documento base:** `docs/audits/DECISIONES_PENDIENTES_MISION_C_2026-10-18.md` §A

---

## Decisión ratificada — Alternativa 1: la política actual ES la canónica

**El sistema nunca admite stock negativo.** Toda regularización pasa por el camino gobernado
`process_inventory_adjustment` con trazabilidad auditada. No se crea ninguna bandera de
excepción por flujo y no se elimina ninguna restricción global.

### Estado de la BD que avala la decisión (verificado vivo, read-only, 2026-10-20)

- Los dos CHECK maestros permanecen VIGENTES en producción:
  `products_stock_current_check (stock_current >= 0)` en `products` y
  `stock_non_negative (quantity >= 0)` en `inventory`.
- **0 productos con stock negativo** sobre el catálogo activo; no existe deuda
  estructural de negativos.
- Las 4 divergencias históricas documentadas (SKU 113, 127 y 2 más del informe
  multi-tienda) YA NO EXISTEN: reconciliadas con evidencia en
  `evidence/20261018-reconciliacion-stock/` (SKU 113: 121=121; SKU 127: 0=0). Las
  divergencias restantes registradas son TODAS artefactos de pruebas/QA
  (registradas como tarea de higiene, no como bloqueo de negocio).

### Compromisos operativos derivados

1. Cualquier flujo que hoy "necesite" un negativo (p. ej. devolución sin
   existencia) se rediseña como **ajuste gobernado + reposición**, nunca como
   excepción del CHECK.
2. La regularización de divergencias se hace **una a una** con `process_inventory_adjustment`,
   auditada y autorizada por el propietario (por ajuste o por lote aprobado).
3. Tests de regresión de ambos CHECK forman parte de la suite (no se relajan).

## Por qué se ratifica

La capa de BD es la única defensa contra llamadas RPC directas y operaciones
concurrentes (transacciones simultáneas de venta/ajuste). Retirar o suavizar el
CHECK trasladaría la integridad contable a la capa de aplicación, que no puede
garantizar serialización bajo concurrencia. La política además ya convive sin
fricción con los datos históricos reales: formalizarla no requiere migración,
backfill ni cambio de esquema — riesgo cero y elimina la ambigüedad que mantenía
abierta CP-INV-005.

## Efecto sobre datos

Ninguno en esta decisión. Las regularizaciones pendientes de artefactos QA se
ejecutan como tarea de higiene separada, cada una con su propia autorización.
