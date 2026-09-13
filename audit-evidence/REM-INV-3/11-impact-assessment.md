# REM-INV-3 — FASE 17 — Impacto económico real (no valor nominal)

## 1. Separación nominal vs real

| Concepto | Valor |
|---|---|
| VALOR NOMINAL DOCUMENTAL (13 NC, TIENDA CENTRAL) | 353,850.00 CUP = 349,650.00 (NC-000008: 999×350) + 12×350.00 |
| EFECTO FINANCIERO REAL (pagos/cash/ledger creados por esas NC) | 0.00 CUP — el modelo de la era de creación (pre-W7) NO implementaba integración financiera de devoluciones (DF-03). obs1 (LIVE 2026-09-05): "payment_transactions sin refs a devoluciones; comisiones intactas". REM-INV-1 (LIVE 2026-09-12): sin pagos asociados |
| EFECTO REAL DE INVENTARIO HOY | 0 unidades netas — los efectos transitorios de la era (+999 y +1×11 en products de la época; −1 por la reversión legacy de NC-000007) fueron purgados por el reset_store_data de la tienda documentado en obs1 §16. Inventario vigente consistente (r01 PASS; obs1 A1..A8: products==inventory 141/141) |
| WAC / costos | 0 impacto vivo (obs1: cost_average invariante exacto; kardex sin refs a devoluciones) |

## 2. Lectura contable

Una NC "completada" por 349,650 CUP SIN integración financiera en su era y con
efectos de stock purgados por un reset NO constituye una pérdida de 349,650 CUP
ni un pasivo implícito: es un DOCUMENTO sin efecto económico. El riesgo del
documento es DOCUMENTAL (aparece como crédito emitido en reportes que lean
devolutions), no de caja ni de inventario. Ninguna reconstrucción de movimientos
o pagos retroactivos está justificada por el impacto real (es 0); fabricarlos
crearía el impacto que dicen corregir.

## 3. Riesgo residual vivo (quantificado)

| Riesgo | Severidad | Detalle |
|---|---|---|
| Reintroducción del patrón vía v1 bajo flag=false | P2 (deuda técnica) | fallback muerto en prod config (flag true) pero v1 conserva grant authenticated según migraciones; 1 línea de ACL lo neutraliza |
| Reportes que lean devolutions completadas como deuda/crédito | P2 (contable) | 353,850 CUP nominales visibles según el reporte; decisión documental pendiente |
| Procedencia probada de los documentos | — | audit DEVOLUTION_CREATED_V2 13/13 + razones "Hot dev *" + ventana test→fix de 4 minutos |

## 4. REENUMERAR_EN_ACCESO

El impacto HOY debe re-verificarse puntualmente contra producción cuando haya
acceso: conteo vigente de NC por tienda/estado, SUM(total_amount) del universo
vigente, presencia de payment_transactions con ref_type='devolution' para los 13
IDs, y consistencia inventory==products de la tienda. La expectativa, basada en
las dos capturas LIVE posteriores a los hechos (obs1 05-sep, REM-INV-1 12-sep),
es: 0 cambio material.
