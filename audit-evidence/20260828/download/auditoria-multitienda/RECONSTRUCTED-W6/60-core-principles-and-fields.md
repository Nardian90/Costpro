> **[ RECONSTRUCTED-FROM-TRANSCRIPT — NO ES EVIDENCIA ORIGINAL ]**
> Reconstruido: 2026-08-28 · Original perdido en reinicio de sandbox (ver `../RECOVERY-20260828/68-recovery-state-report.md`)
> Original: `download/auditoria-multitienda/WAC-DATAFLOW/W6-CANONICAL-DESIGN/60-core-principles-and-fields.md`
> Método: verbatim desde transcripción (lectura íntegra previa a la pérdida); único añadido = este banner. SHA-256: ver `00-RECONSTRUCTION-MANIFEST.md`.

# W6 · 60 — Principios rectores y semántica de campos (COSTING CANONICAL DESIGN)

Estado: ESPECIFICACIÓN DE DISEÑO — **sin modificación de código ni de datos**. Base forense: commit `e9f466b1` + hallazgos W0–W5 (`../W0..W5`, defectos WAC-DF-01…07). Todo lo aquí definido entra en vigor SOLO tras la ratificación del dueño (registro 62) y su demostración íntegra en el Audit Harness (W7–W8) antes de cualquier despliegue.

## 1. Principios rectores (P-*, verificables)

| # | Principio | Consecuencia operativa |
|---|---|---|
| PR-1 | **Un solo escritor por estado derivado** | `products.cost_average` tiene UNA única rutina de recálculo (`fn_recalc_wac`) invocada por eventos autorizados; el trigger heterodoxo `trg_update_product_wac` se elimina o se convierte en guard pasivo. Cierra DF-01. |
| PR-2 | **El servidor determina todo costo** | Ningún evento económico acepta costos del cliente como autoridad (`cost_at_sale`, `unit_cost` de vale/producción ya server-side). Cierra DF-02 y reabre WF06-corrección. |
| PR-3 | **El ledger no se muta; se compensa** | Toda corrección es un movimiento inverso apendizado que referencia al original; historia intacta y auditable. |
| PR-4 | **Todo evento económico tiene contra-asiento financiero cuando toca dinero o su reversión lo toca** | Venta↔pagos (existe), devolución↔reembolsos (por construir, DF-03), resto según matriz §3. |
| PR-5 | **Valoración única**: Valor(t)=Σ(stock×WAC) | Solo una semántica WAC declarada lo sostiene; reportes usan esa, nunca mezclas. |
| PR-6 | **Idempotencia universal en RPCs económicas** | clave + hash de parámetros + retorno almacenado (infra `idempotency_keys`/`idempotency_registry` ya existente; hecho 59). |
| PR-7 | **Matemática en unidades base** | Variantes expandidas al entrar al cálculo; unidades de presentación preservadas para trazabilidad. |
| PR-8 | **Historia no se corrige en silencio** | Capa WAC reparable de forma determinista SOLO con job aprobado (doc 62); capa COGS pre-canon irrecuperable ⇒ etiquetada, no fingida. |

## 2. La decisión raíz D-01 — ¿Qué es contablemente `cost_average`?

**RESERVADA AL DUEÑO** (el agente solo recomienda técnicamente).

### Opción A — WAC operativo actual (promedio móvil ponderado del inventario)

```
WAC_nuevo = (Stock_prev × WAC_prev + ΔQty_in × Costo_in) / (Stock_prev + ΔQty_in)
Salidas (venta/consumo/ajuste−): WAC constante ; retiros valorizan a WAC_prev
```

- Representa «cuánto vale en promedio la unidad que hay AHÍ» — la única semántica que satisface PR-5 exactamente.
- Coherente con COGS server-side (PR-2) y con kardex `balance_total_value`.
- Requiere reconstrucción inicial para los SKU históricos (doc 62 — demostrablemente feasible: el PMP se reconstruye con la serie cronológica de entradas y stocks SIN necesitar los costos de venta venenados).

### Opción B — Promedio histórico de adquisiciones (Σadquisiciones/Σcantidades)

```
WAC_B = Σ(costo_recepciones_activas + servicios) / Σ(qty_recibida)      [vive hoy en el trigger]
```

- Representa «precio medio de compra histórico»: útil como ANALÍTICA de reposición, pero rompe PR-5 en cuanto existen salidas (Σ(stock×WAC_B) deja de reflejar el valor retenido: fue la fórmula que el caso D venció).
- Coherente con lo que el trigger instaló y con Puerto Padre (36/36 MATCH); incompatible como base de COGS confiable (venta consigue unidades compradas ayer o hace un año indistinguibles).

### Recomendación técnica

**D-01 = A**, y el concepto B se conserva como **métrica derivada analítica** `avg_acquisition_price` (calculable al vuelo desde `receipt_items`; NUNCA columna autoritativa ni participante en cálculos financieros). Si el dueño ratifica B, el modelo de eventos sigue siendo válido pero PR-5 debe reformularse y el COGS pasaría a requerir lotes/costeo específico — opción marcadamente mayor y no recomendada. Efectos por consumidor: matriz en `63-consumer-remediation-map.md`.

## 3. Declaración oficial de campos (supuesto D-01=A; validar tras ratificación)

| Campo | Declaración canónica | Únicos escritores legítimos | Lectores financieros permitidos |
|---|---|---|---|
| `products.cost_average` | **WAC operativo vigente por tienda** (valoración corriente; moneda CUP) | solo `fn_recalc_wac` vía eventos autorizados (E-R/E-T-in/E-A+/E-PT/reversas que alteran valor) | todos los financieros |
| `products.cost_price` | **Dato paramétrico de catálogo**: costo de referencia de reposición (`catalog_cost_reference` conceptual) | catálogo manual/bulk/import masivo/fichas FC | avisos de margen paramétrico, completitud de ficha, guard variación de costo (semántica «desviación vs referencia»); PROHIBIDO en COGS/WAC/reportes |
| `receipt_items.unit_cost (+tasa)` | costo de adquisición ORIGINAL del evento (moneda original + tasa congelada) | RPCs de recepción confirmadas | motor WAC, estructura de costo |
| `stock_movements.unit_cost` | costo unitario DEL EVENTO según su tipo (tabla §catálogo) | RPCs del evento correspondiente | kardex/reconciliaciones |
| `transaction_items.cost_at_sale` | **COGS server-side congelado** = units×WAC_prev (mismo snapshot que el movimiento) | solo `create_sale_v2` (cliente ignorado/deprecated) | utilidad, kardex out |
| `kardex_entries.total_value / balance_*` | valor del evento a costo-evento / valorización corriente a WAC del momento | trigger kardex único | reportes |
| [SCHEMA-CANDIDATE] `wac_before/wac_after` en `stock_movements` (o snapshot JSON) | trazabilidad exacta del motor WAC y material para INV-04/05 | RPCs | tests harness |

### Reglas transversales R-*

- **R-1 Sin fallbacks cruzados**: se eliminan `ca || cp` y `cp || ca` (mapa deremediación doc 63). Un consumo lee EXACTAMENTE el campo declarado.
- **R-2 Moneda**: WAC y COGS SIEMPRE en CUP normalizados con la tasa congelada del evento origen.
- **R-3 Stock no negativo**: ningún evento clampa a silencio; coincide con `prevent_negative_inventory` existente (hecho 59) y elimina el piso GREATEST(0…) divergente (DF-11 nota W2).
- **R-4 Snapshot de costo dentro de la transacción**: cada evento captura `(stock, WAC)` con FOR UPDATE antes de calcular; nada depende de lecturas fuera de la TX.
- **R-5 Servicios puros** quedan fuera de WAC/kardex físico (is_service), ya observado correcto.
