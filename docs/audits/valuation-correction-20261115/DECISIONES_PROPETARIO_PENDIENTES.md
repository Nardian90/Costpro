# DECISIONES ADICIONALES DEL PROPIETARIO — PENDIENTES
## CP-FIN-VALUATION-CORRECTION-002 (tras el análisis y el prototipo E2E)
**Fecha:** 2026-11-15 · Las decisiones 1-3 ya fueron emitidas por el propietario y quedan asentadas.

---

## Decisiones YA emitidas por el propietario (no reabrir)

| # | Decisión | Estado |
|---|---|---|
| D1 | La tasa 680 queda APROBADA definitivamente para las líneas USD auténticas de FAC-VITALLCONS-001 (20 líneas). | Asentada (mantiene vigencia) |
| D2 | 2.500 y 1.000 eran PRECIOS DE VENTA en CUP (SKU 111 y 112); costo real de adquisición: 1 CUP/unidad; no multiplicar por 680. La diferencia de 151.299.851 CUP es clasificación errónea, no pérdida confirmada. | Asentada (esta misión) |
| D3 | Costos bajos 1 CUP/1 USD auténticos se conservan; no generalizar el costo 1 CUP sin respaldo. | Asentada (mantiene vigencia) |

---

## Decisiones PENDIENTES (requeridas para cerrar la rectificación)

### DP-1 · Aprobación de los importes finales de la rectificación
- Total corregido de la recepción: **40.739.585,00 CUP** (recomputado por dos vías independientes).
- Exceso a revertir: **151.299.851,00 CUP** (D PAS_CXP_PROV / C ACT_INVENTARIO).
- Revalorización de salidas subvaluadas: **26,00 CUP** (D GAS_COSTO_VENTAS 2 + D GAS_VALES 24 / C ACT_INVENTARIO 26).
- **Opción:** aprobar / ajustar / rechazar cada importe.

### DP-2 · Aprobación del procedimiento completo (7 pasos)
- Procedimiento canónico de PROPUESTA_RECTIFICACION_CP_FIN_WAC.md: respaldo lógico + corrección de
  líneas con escape hatch M021 + recálculo de cabecera + revalorización de capas + revalorización
  de salidas + 2 asientos compensatorios enlazados + auditoría por fila; transacción atómica;
  idempotente; reversible (demostrado en E2E con TODAS las pruebas PASS).
- **Opción:** aprobar el procedimiento para su aplicación en producción / solicitar cambios.

### DP-3 · Las 71 líneas «costo no verificable» (exposición 24.510.805 CUP)
`unit_cost == products.price` exacto en 71 líneas (74 contando 111/112/90/999). El propietario
debe decidir línea a línea (la matriz MATRIZ_PRODUCTOS_FAC-VITALLCONS-001.xlsx entrega la evidencia
por línea):
- (a) Declarar más líneas como «precio de venta importado como costo» (indicar cuáles) → nueva
  rectificación con el mismo procedimiento;
- (b) Aceptarlas como costos reales (costo = precio en el momento de la importación) → se
  documentan como aceptadas y se cierra el alcance;
- (c) Requerir profundización de evidencia para líneas específicas.
**Nota:** 16 de las 71 son USD (≈ 21,0M CUP a tasa 680 del total corregido); 55 son CUP (≈ 3,5M CUP).

### DP-4 · Las 4 líneas con «moneda asignada incorrectamente» (SKU 90, 92, 999, 120)
- SKU 90 (Cable Solar Rojo 6mm): línea 5 USD vs precio 5 CUP — mismo patrón que SKU 111
  (magnitud idéntica a un precio CUP). Valor en juego: 588.200 CUP.
- SKU 92, 999, 120: costos 1 CUP con producto maestro en USD — valores triviales (12 · 4 · 1 CUP).
- **Opción:** rectificar moneda de las que se declaren / dejar documentadas.

### DP-5 · SKU 86 (Panel + 600W) — observación de margen
Costo 370 USD > precio 330 USD (margen negativo; 14.a mayor línea de la recepción: 14.592.800 CUP
a 680). No hay señal del defecto precio→costo (costo ≠ precio), pero se somete a consideración
por su magnitud.

### DP-6 · Ejecución en producción
- La aplicación real (etapa posterior) requiere: ventana acordada, ejecución UNA sola vez con el
  procedimiento aprobado, verificación post-aplicación (SQL de la misión) y registro en el
  expediente docs/audits/valuation-correction-20261115/.
- **Opción:** autorizar la ejecución / aplazar.

### DP-7 (recomendación de backlog, no bloqueante) · Defecto latente de `sync_product_stock()`
El trigger resuelve el «último movimiento» con `ORDER BY movement_date DESC, created_at DESC
LIMIT 1`: con marcas de tiempo empatadas (importaciones legacy) el `stock_current` materializado
es no determinista (reproducido en el prototipo E2E: 24 en lugar de 20). Recomendado: clave de
ordenación estable o columna de secuencia.

---

**Mientras estas decisiones no se emitan, producción permanece intacta y la rectificación queda
documentada y demostrada únicamente en la BD E2E aislada.**
