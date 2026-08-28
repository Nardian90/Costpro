> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/62-historics-policy.md`
> Método: verbatim desde transcripción (lectura íntegra previa a la pérdida); único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 62 — Política para históricos corruptos (capa WAC vs capa COGS) — PROPUESTA PARA RATIFICACIÓN

Base empírica: W4 (43-summary.md) — identidad de stock íntegra; veneno COGS 83–100% en ventas históricas; ENERVIDA 79 SKU con `cost_average=0` exacto con recepciones reconstruibles [1..2.176.000 CUP]; Puerto Padre íntegro.

## Insight técnico habilitante

El PMP canónico (D-01=A) **sí es reconstruible sin los costos de venta**: basta la serie cronológica de eventos que ALTERAN valor (entradas con costo, ajustes+, transferencias-in) y las cantidades (stock corrido) — las salidas no tocan numerador ni denominador. Por eso:

- La capa WAC tiene reparación determinista verificable.
- La capa COGS (utilidad/margen histórico) NO: el dato fue cero client-side; ninguna fórmula lo inventa honestamente.

## Opciones evaluadas

| Opción | Contenido | Veredicto |
|---|---|---|
| H-OPT1 Cuarentena + forward | Corte temporal T_canon: adelante modelo canónico; atrás se etiqueta LEGACY-ERA | Base recomendada |
| H-OPT2 Rebuild total retroactivo | Reintentar COGS retroactivos con supuestos | RECHAZADA (matemáticamente indefendible: inventaría supuestos, no costos) |
| H-OPT3 Cosmética única (recalcular columna hoy) | "caja única" masiva sin flujo | PROHIBIDA por el dueño (PR-8); recidivaría |

## Propuesta híbrida H-FINAL (para ratificación)

1. **T_canon** = fecha de despliegue W8 aprobado. Todo evento post-T exige invariantes INV-*; eventos pre-T quedan congelados y etiquetados.
2. **Job único `BACKFILL-WAC-CANON`** (solo tras ratificación D-01): replay cronológico por tienda/producto del motor estándar sobre `receipt_items` activas+movimientos; produce diff-report completo old→new; ejecución solo tras aprobación del dueño del reporte; snapshots inmutables pre/post (regla permanente de evidencia), tabla de reversión old-values, id `batch_id` auditable.
   - Alcanza a los 79 SKU cero y a toda tienda; si algún producto no tiene entradas reconstruibles queda 0-documentado (no fingido).
3. **Capa COGS histórica**: KPIs de utilidad pre-T_canon se publican como `LEGACY_UNVERIFIABLE_MARGIN` (no certificados, visibles con marca de agua analítica); el margen certificado existe SOLO post-T.
4. Los `unit_cost=0` históricos permanecen intactos (PR-3): son evidencia del defecto, no basura.
5. Remanente de riesgo señalado, no ocultado: `reversal_basis` flags para devoluciones que referencien ventas pre-canon.

Criterios de aceptación del job (para W8): reproducible byte-a-byte en el harness antes que en prod; censal e identidades INV-01/02/08 estables fuera de la capa objetivo; diff esperado == diff real al 100% por SKU.
