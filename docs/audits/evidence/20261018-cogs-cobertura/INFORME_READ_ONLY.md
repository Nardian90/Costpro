# EVIDENCIA — Cobertura de re-costeo COGS READ-ONLY (2026-10-18)

**Método:** SELECT puro sobre `kardex_entries` (unit_cost = 0) cruzado con `wac_change_log` (evidencia de WAC > 0 anterior a cada entrada). Cero escrituras.
**Pregunta que responde:** de las 632 entradas de Kardex con costo 0, ¿cuántas son re-costeables con evidencia interna del sistema?

## Resultado

| Tienda | Entradas costo 0 | Derivables con WAC interno | Período |
|---|---|---|---|
| ENERVIDA-VITALLCONS | 420 | 8 | 2026-08-11 → 2026-10-14 |
| Puerto Padre VITALLCONS | 212 | 0 | 2026-08-16 (un solo día) |
| **Total** | **632** | **8 (1,3%)** | |

## Lectura para la Decisión C

1. **Solo 8 de 632 (1,3%) son derivables con evidencia interna** (`wac_change_log` con WAC > 0 previo a la entrada). El backfill «basado en evidencia» alternativo 2 tendría alcance real de 8 entradas.
2. **624 (98,7%) no son determinables internamente**: requieren facturas externas (decisión contable, alternativa 3) o quedan «costo indeterminable» (alternativa 1).
3. **Patrón de datos:**
   - Puerto Padre: las 212 entradas ocurren TODAS el 2026-08-16 → consistente con una carga/inicialización masiva con costo 0 (no con operaciones dispersas).
   - ENERVIDA: 420 entradas dispersas en 2 meses → coincide con el hallazgo de auditoría «procedencia de costos ENERVIDA 0% con evidencia documental» (CP-IPV-004).
4. **`sales_transactions` tiene 0 filas** — no hay ventas históricas que re-costear; el objeto del re-costeo son exclusivamente estas 632 entradas y los 39 productos con WAC = 0.

## Implicación práctica sobre la propuesta original

La recomendación de la Decisión C se matiza con datos: **alternativa 2 (derivar con evidencia) aplica solo a 8 entradas**; para las 624 restantes la elección real de negocio es entre alternativa 1 (congelar y anotar «costo indeterminado») y alternativa 3 (re-costeo contable con facturas externas, que exige su política contable). El dataset de evidencia queda construido; su decisión puede ser por partes (p. ej. 1 para Puerto Padre 2026-08-16, 3 para ENERVIDA si consigue facturas).

**Trazabilidad:** Management API `POST /v1/projects/wthkddeleylijmonclxg/database/query`, 2026-10-18; consultas CTE `zero_cost`/`coverage` documentadas en el historial de sesión; mismos números reproducibles con el SELECT de este informe.
