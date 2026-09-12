# REM-INV-2 — 02: DEFINICIÓN V1 `receive_purchase` (verbatim de producción)

Fuente: `pg_get_functiondef(p.oid)` sobre producción vía Management API (solo SELECT), PHASE 1 del gate.
Captura íntegra, sin truncamientos. Análisis línea a línea debajo.

## Definición exacta (1264 chars)

```sql
CREATE OR REPLACE FUNCTION public.receive_purchase(p_purchase_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  r record;
  v_store_id uuid;
BEGIN
  SELECT store_id INTO v_store_id FROM public.purchase_orders WHERE id = p_purchase_id;

  FOR r IN
    SELECT * FROM public.purchase_items WHERE purchase_order_id = p_purchase_id
  LOOP
    -- Actualizar inventario
    INSERT INTO public.inventory (store_id, product_id, quantity, updated_at)
    VALUES (v_store_id, r.product_id, r.quantity, timezone('utc', now()))
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET quantity = public.inventory.quantity + r.quantity,
                  updated_at = timezone('utc', now());

    -- Movimiento de stock con costo
    INSERT INTO public.stock_movements (
      store_id,
      product_id,
      quantity_change,
      movement_type,
      reference_id,
      created_at
    ) VALUES (
      v_store_id,
      r.product_id,
      r.quantity,
      'purchase',
      p_purchase_id::text,
      timezone('utc', now())
    );
  END LOOP;

  -- Cambiar estado de orden
  UPDATE public.purchase_orders
  SET status = 'received', received_at = timezone('utc', now())
  WHERE id = p_purchase_id;
END;
$function$

```

## Análisis forense

| Línea/región | Hallazgo | Implicación F-01 |
|---|---|---|
| `RETURNS void ... LANGUAGE plpgsql` + **sin** `SECURITY DEFINER` | `SECURITY INVOKER` — RLS del caller aplica a las 4 tablas que toca | Único freno parcial; no hay guard propio |
| `SELECT store_id INTO v_store_id FROM purchase_orders WHERE id = p_purchase_id` | Sin verificación de existencia: si la OC no existe, `v_store_id` queda NULL y el loop itera sobre 0 items | comportamiento silencioso (no falla) |
| `FOR r IN SELECT * FROM purchase_items WHERE purchase_order_id = ...` | Consume la tabla LEGACY `purchase_items` (0 filas en prod) | El modelo V1 de items está vacío y huérfano |
| `INSERT INTO inventory ... ON CONFLICT ... DO UPDATE SET quantity = inventory.quantity + r.quantity` | **Acumulación ciega de stock** | ← SEMILLA DEL DOBLE CÓMPUTO: cada re-ejecución vuelve a sumar |
| `INSERT INTO stock_movements ... ('purchase', p_purchase_id::text, ...)` | Movimiento sin `unit_cost`, sin `created_by`, sin `movement_date` | Sin costo ni atribución de identidad en kardex |
| `UPDATE purchase_orders SET status='received', received_at=now() WHERE id=...` | **Sin WHERE de estado previo** — sobrescribe cualquier estado, incluso `cancelled`/`received` | ← SEGUNDA SEMILLA: nada impide re-recepción ni recepción de OC anuladas |

### Controles AUSENTES (verificación negativa sobre el texto exacto)

| Control | Presente en la definición |
|---|---|
| `auth.uid()` | NO (0 ocurrencias) |
| `p_user_id` / identidad | NO (firma de 1 parámetro) |
| Guard de store / membresía | NO (0 ocurrencias de `has_store_access`, `membership`) |
| Guard de estado (`status <> 'received'` / `cancelled`) | NO |
| `FOR UPDATE` / locking | NO |
| WAC (`cost_average`, `fn_recalc_wac`, PMP) | NO — `unit_cost` de purchase_items jamás se lee |
| `audit_logs` | NO |
| Idempotency key / unique / guard | NO |
| Manejo de errores codificado (`ERR_*`) | NO |

**Veredicto de la definición**: la función es estructuralmente incapaz de bloquear una doble recepción; el defecto F-01 no es una regresión puntual sino ausencia total de guardas en el diseño V1. Reproducción empírica: 06-f01-double-reception.md.
