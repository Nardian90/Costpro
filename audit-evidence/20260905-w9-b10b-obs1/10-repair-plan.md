# W9.5 — B-10b-OBS-1 · 10-repair-plan.md
# GATE DE DECISIÓN — Plan de reparación basado en evidencia

## RECOMMENDED REPAIR MODEL

**MODELO: NO_DATA_REPAIR (documentación + verificación atómica read-only).**

Ninguna fila será modificada. La decisión no es por conveniencia sino pordemostración
matemática y forense:

1. El drift creado por el `reverse_devolution` histórico para la devolución 0b7213e9
   fue `inventory = products + 1` (Caso A, +1 unidad, ver 02-historical-function.md §3).
2. Esa fila de inventory fue **eliminada por un reset de tienda posterior** (mecanismo
   `reset_store_data`/`STORE_BACKUP_RESTORE`, evento separado y documentado) junto con
   todo el ledger de la tienda d1c4ba0e (0 movements, 0 kardex, 0 transactions hoy).
3. **El drift ya no existe en el estado actual.** No hay desigualdad reparable:
   - inventory para (da1c4090, d1c4ba0e): NO EXISTE → nada que reconciliar.
   - products.stock_current=966: el atribuible al par es 0 (+1−1); el resto es el
     acumulado de todo el historial de pruebas de la tienda, indescomponible
     (0 filas de ledger supervivientes para el producto).
4. Los 141 productos que SÍ tienen fila de inventory están perfectamente consistentes
   (0 mismatches products==inventory en toda la base).

### Las 11 secciones exigidas

1. **Filas a modificar**: NINGUNA (0 UPDATE, 0 INSERT, 0 DELETE).
2. **Columnas**: N/A.
3. **Valor PRE**: products.stock_current(da1c4090)=966; inventory=ROW ABSENT;
   WAC=11.919422583856775; payments sin refs a devoluciones; hash reverse_devolution=
   bb8f3c09… (B-10b). Snapshot íntegro en `12-pre-repair-snapshot/`.
4. **Valor POST**: IDÉNTICO a PRE (no hay mutación). Demostrado con sentinels PRE==POST
   (21/21) y hashes de funciones PRE==POST.
5. **Fórmula**: par sobre products = +1 (pipeline) − 1 (legacy, aplicado completo) = 0;
   par sobre inventory = +1 (pipeline) − 0 (legacy no tocaba inventory) = +1 histórico,
   eliminado por purge externa. Estado correcto HOY = estado actual.
6. **Evidencia del valor POST**: raw-g1..g5, sentinels PRE/POST idénticos,
   0 mismatches Caso A globales, 0 kardex/movements refiriendo devoluciones.
7. **Por qué no duplica movimientos**: NO se crean movimientos. Crear un movimiento
   compensatorio (Modelo A) hoy: (a) fabricaría historial — el +1 'return' y su reversión
   YA EXISTIERON y fueron purgados; (b) vía register_stock_movement el upsert del
   trigger CREARÍA una fila de inventory nueva para un producto cuya fila fue
   deliberadamente eliminada por el reset; (c) movería products desde 966 sin base
   demostrable. Modelo B (reconciliación directa de inventory/products): no aplicable —
   no hay desigualdad viva ni valor objetivo demostrable desde el ledger. Ambos modelos
   fabricarían estado sin base demostrable, violando el principio final del mandato.
8. **Impacto sobre kardex**: cero (no se toca ninguna fila).
9. **Impacto sobre WAC**: cero. El reverse histórico nunca escribió cost_average
   (único escritor fn_recalc_wac; guard trg_guard_wac_writer). El par es WAC-invariante
   por diseño (hotfix A2: 'return' sin recálculo).
10. **Impacto financiero**: cero. payment_transactions solo porta ref_type='sale';
    0 refs a devoluciones; la transacción original edb274bd fue purgada; comisiones
    period-based sin vínculo a devoluciones.
11. **Estrategia de rollback**: N/A (no hay mutación que revertir). Aun así, el pack
    incluye snapshot PRE completo que permitiría reconstruir el estado exacto.

## Clasificación por fila (GATE 11)

| fila / entidad | clasificación |
|---|---|
| devolution 0b7213e9 (reverted, item q=1, product da1c4090) | **NO_REPAIR_REQUIRED** — drift histórico real (+1 inventory), demostrado y explicado; eliminado por purge externa; par neto 0 sobre products |
| devoluciones 379122c3, 74cfd314, 2a7934b7, 8bb4cfe5, 0778b5d5, a11e7aa5, 6c051892, 42f89372, def14222, fb98424e, 903269d5, c249cdcc (12 completed, nunca revertidas) | **NO_REPAIR_REQUIRED** — no pasaron por reverse_devolution; su creación fue pipeline-canónica |
| products.stock_current de la tienda d1c4ba0e (108 productos con stock≠0, Σ6553 u, sin inventory ni ledger) | **SEPARATE_FINDING → BACKLOG** — artefacto store-wide del reset de tienda; NO atribuible a reverse_devolution |
| kardex 'out' cost0 y movement 'return' del par (purgados) | **SEPARATE_FINDING** — reconstruirlos falsificaría el historial; prohibido por el mandato |
| audit de la reversión (inexistente, era pre-B-10) | **NO_REPAIR_REQUIRED** — el actor queda registrado en devolutions.reversed_by; fabricar audit sería inventar identidad/fecha |
| 24 audit CREATE_DEVOLUTION huérfanos (tienda 43a4dabc) | **SEPARATE_FINDING → BACKLOG** (devoluciones borradas, otra tienda, fuera del alcance) |

## §17 — Verificación de ambigüedad

El mandato exige STOP si hay ambigüedad sobre cantidad/stock inicial/movimiento/WAC/
kardex/impacto financiero ANTES de ejecutar una reparación. Aquí la ambigüedad existe
solo sobre el 966 (indescomponible) — y precisamente por eso NO se ejecuta reparación
alguna: la conclusión es que no hay nada demostrable que reparar en el alcance
OBS-1. La ambigüedad se registra como SEPARATE_FINDING (BACKLOG), no bloquea el
cierre de OBS-1 porque ninguna mutación depende de resolverla.

## Verificación atómica sustitutiva (GATE 13)

Se ejecuta un bloque DO read-only con assertions `expected == actual` (fallo →
EXCEPTION): ver 13-repair-execution.md y raw-assertions.json.
