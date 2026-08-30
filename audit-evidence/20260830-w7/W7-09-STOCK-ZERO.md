# W7-09 — STOCK=0 DECISION (FASE 18)

Pregunta del gate: cuando el stock llega a 0, ¿el WAC se RETIENE o se REINICIA? La decisión debe ser matemática y explícita — prohibido dejarla al «comportamiento incidental» del código.

## 18.1 Evidencia (clon post-migración, `tmp/W7-f4-f18.out`)

Ciclo: `10@100 → venta total (stock=0) → recepción 5@200`.

| Assert | Verificación | Esperado | Observado | |
|---|---|---|---|---|
| F18-1 | stock tras venta total | 0 | 0.0000 | PASS |
| F18-2 | **WAC RETAINED** (100; no reset, no NULL) | 100 | 100 | PASS |
| F18-3 | COGS de la venta total = 10×WAC_prev | 1000 | 1000.0000 | PASS |
| F18-4 | venta con stock=0 → rechazada | ERR_INSUFFICIENT_STOCK | ERR_INSUFFICIENT_STOCK | PASS |
| F18-5 | **recepción sobre stock=0: WAC=200 EXACTO** | 200 | 200.000000 | PASS |
| F18-6 | stock tras recepción | 5 | 5.0000 | PASS |
| F18-7 | **conservación en la frontera**: valor post = uc×q | 1000 | 1000.000000 | PASS |

## 18.2 Prueba matemática — RETENER es el único comportamiento correcto

Con la fórmula de blend `ca_new = (S·ca_prev + q·uc)/(S+q)`:

```text
S = 0  ⇒  ca_new = (0·ca_prev + q·uc)/(0+q) = uc   (peso del WAC viejo = 0)
```

- **Retener** WAC=100 con stock=0 es **irrelevante para la valoración**: el valor del inventario es `0 × 100 = 0`, idéntico al de cualquier WAC retenido. No existe posibilidad de doble conteo porque el término `S·ca_prev` se anula.
- La siguiente entrada se valora **exactamente a su costo real** (F18-5: 200), sin contaminación del histórico — el blend con S=0 es matemáticamente un re-seed limpio por sí solo.
- **Reiniciar a NULL/0** (la alternativa) introduciría los defectos ya documentados: ventas durante WAC NULL → `ERR_PRODUCT_COST_UNAVAILABLE` (interrumpe operación) o COGS=0 silencioso (destruye conservación, DF-02/CR-W6-2), y exige manejo especial del denominador en cada ruta.

**Conclusión**: RETENER el WAC en stock=0. La fórmula ya implementa la decisión correcta; cualquier reset explícito sería un cambio SIN beneficio matemático y CON riesgo de conservación. La conducta post-fix es determinista en todas las fronteras (F18-1..7), sin «accidentes».

## 18.3 Escritores WAC post-migración (censo F4 del mismo run)

```text
1. fn_recalc_wac(uuid,uuid,text,numeric,numeric,jsonb)   ← ÚNICO escritor legítimo
2. reset_store_data(uuid,boolean)                         ← admin, fail-closed por guard (F-C)
3. reset_store_data(uuid,boolean,uuid)                    ← ídem
motor B update_product_wac: 0 | trigger motor B: 0 | guard trg_guard_wac_writer: 1
token app.wac_writer: NINGUNA función externa puede forjarlo
UPDATE directo sin token → ERR_WAC_SINGLE_WRITER_VIOLATION (bloqueado)
```

## 18.4 Veredicto FASE 18

```text
STOCK-ZERO GATE = PASS — decisión: WAC RETAINED (demostrada matemáticamente y en laboratorio; sin comportamiento incidental)
```
