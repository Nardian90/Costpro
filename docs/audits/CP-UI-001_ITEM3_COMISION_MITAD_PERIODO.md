# CP-UI-001 — Ítem 3: Comisión a mitad de período (pro-rateo) — Documentación técnica

**Misión:** COSTPRO-FINAL-CYCLE-CLOSE-001 · T5 ítem 3 · Fecha: 2026-11-08
**Alcance:** documentar el comportamiento efectivo. NO se cambia `pay_commission` ni lógica monetaria alguna.

## 1. Archivos y líneas (estado real en main c589e81e3)

| Rol | Archivo | Líneas |
|---|---|---|
| Selección de regla vigente | `src/lib/commission-engine.ts` | `selectApplicableRule` :140-166 |
| Cálculo base por sub-período | `src/lib/commission-engine.ts` | `calculateCommission` :168+ |
| Construcción de sub-períodos | `src/app/api/commissions/calculate/route.ts` | ~:395-411 (cut points = `valid_from` de reglas aplicables dentro del período) |
| Ventana de ventas por sub-período | `src/app/api/commissions/calculate/route.ts` | :421-436 (incluye fallback POS AUDIT-2026-10-15) |
| Regla reportada (`rule_applied`) | `src/app/api/commissions/calculate/route.ts` | :465-466 (regla vigente al FINAL del período) |
| Presentación en UI | `src/components/views/terminal/views/workers/WorkersView.tsx` | bloque FIX-A5 (2026-07-15) :1502+ |

## 2. Fórmula efectiva

Cuando dentro del período `[date_from, date_to]` hay cortes de regla (los `valid_from` de reglas aplicables al trabajador), el cálculo se divide en sub-períodos y se SUMA:

```
comisión_total = Σ_sub  comisión(regla_vigente_al_final_del_sub, ventas_del_sub)

donde para cada sub-período:
  ventas_del_sub = Σ sales (payment_cash/payment_transfer/amount_total de
                    ventas con sale_date dentro del sub)
                  + Σ pos_tx (cash_amount/transfer_amount/total_amount de
                    transactions POS por created_at — fallback 4a)
  regla_vigente_al_final_del_sub = selectApplicableRule(rules, worker, sub.end)
```

Selección de regla (`selectApplicableRule`): filtra por `worker_id` (regla específica del trabajador gana), ventana `valid_from ≤ fecha ≤ valid_to`, y desempata por `priority` DESC y luego `valid_from` DESC (la más reciente con mayor prioridad).

Tipos de regla y su fórmula (`calculateCommission`):
- `percentage_sales`: `base × value_percent / 100`, donde `base` = `base_calculation` ∈ {total, cash, transfer, net (total − descuentos)}.
- `fixed_amount`: `fixed_value` (una vez por período; no por sub-período — ver pregunta contable §5.2).
- `salary_based`: `salary_amount` (idem).
- `hybrid`: `salary_amount + value_percent% × base`.
- `product_specific` / `scale_percentage`: motor avanzado v2 (`calculateCommissionWithProducts` :372+, configs por producto con modo `per_sale`/`per_unit` y escalas).

## 3. Redondeo

- **No hay redondeo intermedio**: `totalCommission` acumula floats de `calculateCommission` por sub-período. El único redondeo visible es de PRESENTACIÓN (`toFixed(2)` en `calculation_explanation` :491 y en la UI). El pago final usa `final_amount` del flujo de aprobación (4 pasos de WorkersView), que es editable por el operador; `pay_commission` registra lo aprobado.
- Consecuencia práctica: la suma de sub-períodos puede producir centavos flotantes (p. ej. 3×0.1 = 0.30000000000000004); no afecta CUP/USD con 2 decimales en montos reales, pero es un punto a conocer.

## 4. Ejemplos sintéticos (máximo 3)

**Ejemplo 1 — cambio de porcentaje a mitad de período:**
Regla A: 5% total, vigente desde 2026-10-01. Regla B: 7% total, vigente desde 2026-10-16.
Período consultado: 2026-10-01 → 2026-10-31. Ventas sub-1 (1→15): 10 000; sub-2 (16→31): 10 000.
`comisión = 10 000×5% + 10 000×7% = 500 + 700 = 1 200`. (Sin pro-rateo, con solo la última regla sería 1 400 — el pro-rateo ES efectivo.)

**Ejemplo 2 — regla específica del trabajador que desplaza la general:**
Regla general: 5%; regla del trabajador X: 10% desde 2026-10-10.
Sub-período 1-9 oct: aplica general (5%) sobre 8 000 = 400.
Sub-período 10-31 oct: aplica la del trabajador (10%) sobre 20 000 = 2 000.
Total 2 400. `rule_applied` reportada: la del trabajador (vigente al final).

**Ejemplo 3 — hueco sin regla:**
Regla A vigencia 10-01→10-15; regla B desde 10-20. El sub-período 10-16→10-19 queda SIN regla aplicable → comisión 0 para esas ventas (no retrocede a A; no se promedia). Las ventas de ese tramo no generan comisión sugerida.

## 5. Preguntas contables pendientes (decisión del propietario — no resueltas aquí)

1. **`fixed_amount` y `salary_based` en sub-períodos**: `calculateCommission` suma el monto fijo POR CADA sub-período. Un salario de 5 000 con un corte de regla a mitad de mes sugiere 10 000. ¿Es la semántica deseada, o el fijo/salario debe prorratearse por días o cobrarse una sola vez?
2. **Redondeo**: ¿debe fijarse un redondeo explícito (2 decimales, half-up) por sub-período antes de sumar, para que la suma del desglose coincida exactamente con el total?
3. **Ventana del sub-período POS vs sales**: las ventas históricas usan `sale_date` (fecha local en texto) y las POS usan `created_at` UTC — en fronteras de día pueden caer en sub-períodos distintos. ¿Se acepta como está (convención existente del fallback 4a)?
4. **Huecos sin regla**: ¿0 comisión (actual) o debe exigirse cobertura completa del período antes de aprobar un pago?

Cambiar cualquiera de estos puntos requiere una misión sobre `calculateCommission`/`calculate` (lógica monetaria — fuera del alcance documental de este ítem).

## 6. Estado de los ítems 4 y 5 (misma misión)

- **Ítem 4 (HistoryTab)**: implementado — detalle legible en español por versión (número, fecha, autor, motivo, valor nuevo y anterior) + «Ver datos técnicos» colapsado SOLO para admin/superadmin; maneja estructuras antiguas (sin `changed_at`/`previous_snapshot` → textos controlados); aislamiento multiempresa intacto (mismas queries por tienda de la API existente).
- **Ítem 5 (tabla 9 columnas)**: implementado — en móvil (<640 px) la tabla se sustituye por tarjetas expandibles con TODA la información (CI, cash, transfer, regla activa, último pago, estado y acciones); escritorio conserva la tabla; estados de carga/vacío unificados; touch targets ≥44 px; sin pérdida de datos.

## 7. Limpieza de la restricción duplicada de comisiones (T5) — RESULTADO

La misión pedía eliminar `commission_payments_no_overlap` conservando `no_overlapping_periods` **solo si ambas existen y son equivalentes**. Verificación por catálogo en producción (2026-11-08, [MEDIDO]):

- `commission_payments` tiene UNA sola restricción EXCLUDE: `commission_payments_no_overlap` (la de 20261022000002, con guard, `WHERE status <> 'cancelled'`).
- `no_overlapping_periods` (20260714000001) **ya NO existe en producción** — fue retirada en algún momento posterior al expediente del 2026-11-04 (que la documentaba como duplicada vigente).

**Decisión técnica:** la condición «ambas existen» NO se cumple → no se crea migración de limpieza (no hay nada que eliminar; crear una migración `DROP CONSTRAINT IF EXISTS` sobre una constraint que se desea CONSERVAR sería introducir un borrado condicional peligroso). No se altera la lógica monetaria. La discrepancia con el expediente queda documentada aquí; la entrada del libro (20261022000002) ya nota la duplicidad histórica — el estado real actual es una única restricción activa que se conserva intacta.
