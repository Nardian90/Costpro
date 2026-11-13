# EVIDENCIA — Matriz consolidada de costos de ENERVIDA (90 productos con cost_average = 1,00)

**Fecha (UTC):** 2026-11-13 · **Modo:** extracción read-only de producción. **Sin actualización de costos ni WAC.** Entregable de decisión: `Matriz-Costos-ENERVIDA-90-Productos-2026-11-13.xlsx` (90 filas + grupo secundario). JSON completo: `scripts/out/m4-matriz-enervida.json`.

## Resumen

| Concepto | Valor |
|---|---|
| Productos de ENERVIDA con `cost_average = 1,00` | **90** (de 199; coincide con la auditoría previa) |
| Con respaldo documental (recepciones activas con costo>0) | **78** — recepciones reales de la carga inicial (2026-07-01, tasa 680; p.ej. Panel +600W 370 USD×680=251.600 CUP) |
| Sin respaldo documental | **12** — el 1,00 es VALOR PREDETERMINADO (cost_price=0; p.ej. Cable 6, Tornillo M10, Linterna solar) |
| Líneas de venta con costo efectivo 1,00 (ventas completed, productos de los 90) | **172 líneas · 607,80 unidades · COGS registrado 607,80 CUP** |
| Criterio extendido de la auditoría previa (≈192 líneas/642,50 CUP) | **193 líneas · 643,80 unidades** — incluye 21 líneas con `cost_at_sale=1` explícito en productos con `cost_average≠1` (grupo secundario en la hoja 2 del xlsx) |
| COGS infravalorado CUANTIFICABLE (78 productos con recepción real) | **23.760.476,00 CUP** — plantea al propietario la plausibilidad de los costos documentales de la carga inicial (ver abajo) |
| Productos de los 90 que aparecen en los 34 vales sin costo | **11 productos · 219 unidades** |

## Determinación de infravaloración (sin aplicar nada)

Para cada producto con recepción real: `(costo documental unitario − 1,00) × unidades vendidas con costo 1,00`. Top: Panel +600W (42 unid. → 10.567.158 CUP), Grapas plásticas (4 → 6.799.996), Inversor (1 → 2.175.999), Grapas metálicas (3 → 2.039.997), Panel 585 (5 → 1.291.995).

**Advertencia de plausibilidad (decisión del propietario):** los costos documentales provienen de las recepciones de la carga inicial del 2026-07-01 (p.ej. «Grapas plásticas con clavo de acero», 49 unid. a 2.500×680 = 1.700.000 CUP/unidad). El sistema registra lo que el documento dice; si el `unit_cost` de la carga se introdujo por caja/lote y no por unidad, el importe documental por unidad y la infravaloración derivada deben revisarse documentalmente antes de cualquier decisión. Esto es parte de la «decisión pendiente» de la matriz.

## Relación con los 34 vales sin costo

Los 34 vales (total_cost=0 en el documento; ítems con `unit_cost=0`) usan 11 productos del grupo de los 90 (219 unidades). Mientras estos productos carezcan de valoración fiable, los vales quedan **excluidos de toda contabilización automática** (clasificación: VALORACIÓN_INCOMPLETA, no «cero legítimo»).

## Restricciones

No se actualizó `cost_average`, `cost_price` ni WAC. El costo 1,00 NO se usa como sustituto de costo real. La matriz es insumo de decisión del propietario (fuente documental por producto incluida).
