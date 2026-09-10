# 04_OF3_FORENSICS — close_fiscal_period escribe en tabla inexistente (§6)

## Qué intenta escribir (def PRE completa en out_q01_forensics.txt s03)
1. `IF EXISTS (SELECT 1 FROM public.fiscal_period_closures WHERE store_id=… AND year=… AND month=…)` → ERR_PERIOD_ALREADY_CLOSED
2. `SELECT COUNT(*), SUM(total_amount) … FROM public.transactions` (revenue del periodo)
3. `INSERT INTO public.fiscal_period_closures (store_id, year, month, period_start, period_end, transaction_count, total_revenue, closed_by, closed_at) … RETURNING id`
4. `INSERT INTO public.audit_logs (… 'CLOSE_FISCAL_PERIOD', 'fiscal_period_closures', v_closed_id …)` (auditoría manual de la tabla fantasma)

## Existencia de fiscal_period_closures — censo EXHAUSTIVO de relkinds (raw s05)
Consultado pg_class (r=table, v=view, m=matview, S=sequence, f=foreign, p=partition) + pg_proc:
- RESULTADO: **NO existe como NADA**. Único objeto fiscal en pg_class: fiscal_closings (relkind r)
  + sus 3 índices (pkey, uq_fiscal_closings_store_period, idx_fiscal_closings_store_period).
- Tampoco existe como función (pg_proc: 0 filas).
→ inequívoco: la referencia es a una estructura INEXISTENTE (42P01 en runtime, reproducido 03).

## Consecuencia estructural adicional (demostrada)
- lock_fiscal_period exige fiscal_closings.status='closed'.
- Con close_fiscal_period roto, NINGÚN camino de negocio lleva la fila a 'closed'
  (el trigger prevent_fiscal_closing_edit no crea estados; ensure crea 'open').
- → flujo OPEN→LOCK→CLOSE completo inoperante, no solo "close lanza 500".

## Arqueología de la regresión (resumen; detalle en 05_FISCAL_MODEL_MAP)
- 20260726000002_v1_2: close_fiscal_period ESCRIBÍA fiscal_closings (UPDATE status='closed'
  / INSERT con totales) — líneas 411-489 de la migración.
- 20260727000006_v2_12_9: reescritura anti-spoofing — SIGUIÓ escribiendo fiscal_closings.
- 20260727000012_v2_12_18: REEMPLAZÓ el cuerpo hacia fiscal_period_closures (tabla que no
  tiene CREATE TABLE en TODA la cadena de migraciones — único archivo que la menciona es el
  cuerpo de la propia función). REGRESIÓN introducida por v2_12_18.
