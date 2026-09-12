# REM-INV-1 — 15 RISK MATRIX (TOP riesgos y exposición)

| ID | Severidad | Riesgo | Exposición | Detección | Recuperable |
|----|-----------|--------|-----------|-----------|-------------|
| F-01 | P1 | Doble recepción vía receive_purchase (authenticated, sin guardas) | Latente (purchase_items vacía hoy; camino vivo) | Cualquier empleado autenticado | Sí (recomputando desde POs) |
| F-02 | P1 | 13 notas de crédito fantasma 353,850 CUP en producción | Activa (datos residuales era HOT) | Reportes de devoluciones/NC inflados | Sí (anulación documental) |
| F-03 | P1 | COGS=0 heredado (66-81% de ventas sin costo) | Activa en reportes de margen | Rentabilidad/kardex inválidos para stock legacy | Parcial (política de costo base) |
| F-06 | P2 | EXECUTE PUBLIC en 4 RPCs mutativos | Mitigada (guards fail-closed internos) | Violación de doctrina; superficie futura | — |
| F-05 | P2 | Kardex pre-image (balance sistemáticamente anterior) | Activa en reportes kardex | Balance_quantity engañoso | Sí (recalcular) |
| F-04 | P2 | Trazabilidad doc↔ledger rota (reference_id NULL) | Activa | Auditoría manual costosa | Sí (heurística hoy) |
| F-08 | P2 | Sin idempotencia DB en transfers/ajustes | Latente (retry de red duplica docs) | Duplicados de documentos | Sí (por diseño lock+status) |
| F-07 | P2 | Fallback SKU cross-store en fn_process_receipt[1] | Mitigada (service_role only) | Doc en tienda B, stock en tienda A | Sí |
| F-09/F-10 | P3 | Observabilidad/código muerto | Menor | — | — |

**Lectura ejecutiva**: la columna vertebral de CANTIDAD (movements→inventory→stock_current→kardex 1:1) está matemáticamente íntegra en el 100% del dataset live, protegida por 4 guards de integridad. El riesgo concentrado está en la dimensión VALOR (costos heredados sin base, NC fantasma) y en caminos v1 residuales con grants amplios (receive_purchase). No hay evidencia de corrupción activa de saldos ni de contaminación económica entre tiendas en el estado actual.
