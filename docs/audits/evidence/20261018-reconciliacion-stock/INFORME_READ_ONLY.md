# EVIDENCIA — Conciliación stock ↔ Kardex READ-ONLY (2026-10-18)

**Método:** réplica exacta de la lógica de inspección de `reconcile_stock` (`SELECT` puro: `products.stock_current` vs `SUM(stock_movements.quantity_change)` por producto/tienda, umbral 0.001, solo productos activos). No se invocó el RPC (su guard exige admin autenticado, correcto); no se ejecutó modo fix; cero escrituras de datos.
**Datos crudos:** `divergencias_raw.json` (41 filas, mismas columnas que el RPC).

## Resultado principal

1. **Las 4 divergencias históricas de la auditoría (CP-INV-005) YA NO EXISTEN.** Verificación puntual de los SKU nombrados por el informe original:
   - SKU 113 «Goma Termo Retráctil» (ENERVIDA-VITALLCONS): stock 121 = esperado 121 → **reconciliado**.
   - SKU 127 «Transfer 220» (ENERVIDA-VITALLCONS): stock 0 = esperado 0 → **reconciliado** (la «decisión de registro bloqueada» del informe quedó sin objeto).
2. **Divergencias actuales: 41, TODAS en contexto de pruebas/QA** — clasificación programática (patrones de nombre de producto + tiendas de prueba): **0 divergencias en datos de negocio real** (ENERVIDA, VITALLCONS y tienda central operativa).
   - Tiendas afectadas: QA-H1-A/B, E2E PILOT A/B, Tienda Auditor, Sucursal Vedado/Playa/Habana (tenant de pruebas), Store Tenant 2, E2E Multi.
   - **Hallazgo adicional relevante:** ~10 productos de PRUEBA con divergencia viven dentro de la tienda real «TIENDA CENTRAL COSTPRO» (nombres: «WAC Test Product», «Concurrent Recv Test», «Tasa Extrema Test», «Void WAC Test», «PROD WAC Verify», etc., stock 10–15, kardex esperado 0). Es contaminación de pruebas en tienda de producción, no un defecto de negocio.
   - Patrón de las divergencias: productos creados con stock directo sin movimiento inicial de kardex (p. ej. stock 972 vs esperado −87) — consistente con datos de pruebas generados fuera de banda.

## Consecuencias para el programa

- **CP-INV-005 (evidencia):** el bloqueo original («4 divergencias sin clasificar + política sin decidir») quedó reducido a la decisión de política (Decisión A del documento de Misión C). Las divergencias de negocio ya no existen como problema abierto.
- **Nueva tarea propuesta (registro como defecto vinculado):** higiene de datos de pruebas en tienda de producción (los «WAC Test» en TIENDA CENTRAL) + estrategia de aislamiento de datos de pruebas. No es urgente (no afecta negocio: los SKUs reales están reconciliados) pero debe registrarse para no inflar futuras conciliaciones.
- **La recomendación de la Decisión A (ratificar «nunca negativo») se refuerza:** el sistema opera limpio en producción de hecho; el CHECK convive sin conflicto con los datos.

**Trazabilidad de la consulta (para reproducir):** Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query` con el SELECT de comparación del RPC (documentado arriba), 2026-10-18, 41 filas devueltas, guardadas sin modificación en `divergencias_raw.json`.
