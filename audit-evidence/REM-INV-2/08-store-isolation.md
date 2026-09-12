# REM-INV-2 — 08: STORE ISOLATION (staging aislado)

Protocolo: intentar `purchase_store != caller_store`, `item_store != purchase_store` y combinaciones equivalentes; esperado DENIED.

## 1. Diseño de la función (verificación negativa sobre la definición verbatim)

- La firma es `receive_purchase(p_purchase_id uuid)` — **no existe parámetro de store del caller**, por lo que la comparación `caller_store == purchase_store` es **estructuralmente imposible** dentro de la función.
- No hay ninguna llamada a `has_store_access` / `has_store_access_as` / verificación de membresía / `auth.uid()` en el cuerpo.
- El store de destino se toma de la propia fila (`SELECT store_id FROM purchase_orders`): la función nunca puede "recibir en otro store" que el de la OC (aísla el destino), pero **jamás valida quién llama**.

## 2. Prueba conductual: forastero recibe la OC de una tienda ajena

Se creó el rol `stg_unprivileged` (sin membresías, sin relación con STORE_B, solo GRANT de tablas — simulando un authenticated sin pertenencia) y se invocó:

```text
SET ROLE stg_unprivileged;
SELECT public.receive_purchase('PO_B');   -- PO_B pertenece a STORE_B
→ commit OK
SELECT * FROM inventory WHERE store_id = STORE_B;
→ [('STORE_B', 10)]   ← inventario creado en tienda ajena por rol sin pertenencia
```

**Resultado: FAIL (accepted)** — la recepción cross-store por rol ajeno se ejecutó sin ninguna denegación a nivel función.

## 3. Alcance del mitigador externo (RLS de prod)

En producción la función es `SECURITY INVOKER`: el SELECT sobre `purchase_orders` del caller atraviesa RLS (`po_sel`/`po_select_authenticated`/`purchase_orders_select_rls` — membresía activa) y el `UPDATE` atraviesa `po_upd`/`po_update_authenticated`. El aislamiento de tienda queda entonces **totalmente delegado en las políticas RLS** de cada tabla, no en la función: cualquier usuario con membresía en la tienda de la OC puede ejecutarla, y las políticas DENY permissivas de `inventory`/`stock_movements` se analizan en 16-production-zero-touch §RLS. No existe defensa en profundidad propia: un solo cambio/omisión de política RLS convertiría el aislamiento en violable sin que la función se opusiera.

## 4. Consecuencia

`receive_purchase` **carece de store guard propio** (FAIL estructural del control). El modelo canónico lo contrasta: `register_reception` valida `has_store_access_as(auth.uid(), p_store_id)` + producto-en-store (B5); `receive_against_po` valida `has_store_access(v_store_id)`.
