# W9.5 — B-10b-OBS-1 · 11-risk-assessment.md

## Riesgos evaluados de la decisión NO_DATA_REPAIR

| # | Riesgo | Probabilidad | Impacto | Mitigación / estado |
|---|---|---|---|---|
| 1 | Que exista drift vivo no detectado del reverse histórico | Muy baja | Alto | El reverse histórico solo alcanzó a devoluciones revertidas: exactamente 1 (demostrado por status + reversed_at + 0 audit REVERSE_* + 0 kardex reversal). Su drift fue eliminado por la purga. Además, 0 mismatches products==inventory en los 141 productos con inventory. |
| 2 | Que el clamp GREATEST(0,…) hubiera destruido información | Descartada | Medio | Demostración temporal: reversión 1.455 s tras la creación; stock en el momento = X+1 ≥ 1 → descuento aplicado íntegro. |
| 3 | Que la purga de tienda ocultara otro caso de drift | Baja | Medio | La purga afectó a TODA la tienda (124 productos). Cualquier drift del par habría vivido en inventory/kardex/movements — todos borrados por el mismo evento. Es imposible que un drift del par sobreviva a la purga de su propio contenedor. |
| 4 | Presión para «maquillar» el 966 del producto de pruebas | — | Alto (si se hiciera) | RECHAZADO explícitamente: indescomponible sin ledger; repararlo fabricaría estado. Registrado como SEPARATE_FINDING/BACKLOG (producto fuera del pipeline en tienda reseteada). |
| 5 | Regressiones por la fase | Nula | — | No hay mutación de datos, ni cambios de código SQL, ni toques a B-1..B-10b. El único artefacto nuevo es el test permanente (read-only) y documentación. |
| 6 | Que el veredicto CLOSED sin reparación sea prematuro | Baja | Medio | El mandato §28 exige «0 drift histórico no explicado» — el drift está explicado y demostrado con la cadena completa función→timing→purge. «POST == EXPECTED» se cumple trivialmente (POST=PRE=estado correcto). |

## Riesgos operacionales residuales (fuera de alcance, para backlog)

1. **Tienda d1c4ba0e huérfana**: 108 productos con stock_current≠0 (Σ6553) sin fila de
   inventory ni ledger. Si la tienda volviera a usarse, el pipeline re-crearía inventory
   desde 0 y sync_product_stock reescribiría products con el primer movimiento —
   comportamiento a decidir por negocio (reconciliación o descarte formal).
2. **reset_store_data no deja audit con metadata** (eventos con metadata=null) —
   mejoraría la trazabilidad registrar quién/cuándo ejecuta resets (BACKLOG).
3. **Devoluciones borradas con audit huérfano** (24 en tienda 43a4dabc) —
   consistencia referencial de audit_logs (BACKLOG).

## Conclusión

La opción de NO mutar es la de MENOR riesgo total: cualquier escritura alternativa
(movimiento compensatorio o reconciliación directa) fabricaría historia o estado sin
base demostrable, violando el principio final del mandato.
