# Migration: Agregar customer_id y customer_name a transactions

**Fecha:** 2026-06-18
**Propósito:** Persistir el cliente seleccionado en el POS dentro de la venta.
**Riesgo:** Bajo — solo agrega columnas, no modifica funciones existentes.

## ⚠️ Importante

El cliente admin de Supabase **no permite ejecutar DDL** (CREATE/ALTER) vía PostgREST por seguridad. Por eso este SQL debe ejecutarse **manualmente** en el Supabase Dashboard.

## Pasos

1. Abrir https://supabase.com/dashboard
2. Seleccionar el proyecto: `wthkddeleylijmonclxg` (CostPro)
3. En el menú izquierdo, ir a **SQL Editor**
4. Abrir el archivo `supabase/migrations/20260618000001_add_customer_to_transactions.sql`
5. Copiar todo el contenido
6. Pegar en SQL Editor
7. Click **RUN**
8. Verificar que el output muestre 2 filas:
   ```
   column_name    | data_type | is_nullable
   ---------------+-----------+-------------
   customer_id    | uuid      | YES
   customer_name  | text      | YES
   ```

## Después de ejecutar

El frontend ya está preparado (desde el commit POS-AUDIT-FINAL). Hace:

```ts
// usePOSCheckout.ts — después de createSale()
if (safeCustomerId || customerName) {
  await supabase
    .from("transactions")
    .update({
      customer_id: safeCustomerId,
      customer_name: customerName || null,
    })
    .eq("id", saleId);
}
```

Si las columnas **no existen** (SQL aún no ejecutado), el UPDATE falla silenciosamente con un `console.warn` — la venta se registra igual, solo que el cliente no se persiste. No rompe el flujo.

## SQL a ejecutar

```sql
-- POS-3b audit P0.1: Persistir cliente en transactions
-- Idempotente: IF NOT EXISTS evita errores si se ejecuta múltiples veces.

-- 1. Agregar columnas a transactions (sin FK porque no existe tabla customers en Supabase)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS customer_id UUID,
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- 2. Comentar las columnas para documentación
COMMENT ON COLUMN transactions.customer_id IS 'UUID del cliente (referencia futura a tabla customers). NULL = walk-in';
COMMENT ON COLUMN transactions.customer_name IS 'Nombre del cliente al momento de la venta. NULL = walk-in';

-- 3. Índice opcional para queries futuras por cliente
CREATE INDEX IF NOT EXISTS idx_transactions_customer_id ON transactions(customer_id) WHERE customer_id IS NOT NULL;

-- 4. Verificación
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'transactions'
  AND column_name IN ('customer_id', 'customer_name')
ORDER BY column_name;
```

## Por qué NO se modifica la RPC `create_sale`

La función `create_sale` ya existe en la BD con esta firma:
```
create_sale(p_applied_taxes, p_discount_type, p_discount_value, p_items,
            p_payment_method, p_seller_id, p_store_id, p_subtotal,
            p_tax_amount, p_total_amount, p_transaction_id)
```

NO acepta `p_customer_id` ni `p_customer_name`. Para añadirlos, habría que hacer `DROP FUNCTION` + `CREATE FUNCTION` con la nueva firma — pero **no conocemos el cuerpo de la función** (no está en las migrations del repo, fue creada fuera de ese sistema).

Recrearla desde cero rompería todas las ventas. Por eso, el frontend hace un `UPDATE` posterior a la inserción en lugar de pasar los parámetros a la RPC.

## Futuro: si quieres integrarlo en la RPC

Cuando tengas tiempo de extraer la definición actual (`SELECT pg_get_functiondef('public.create_sale(bigint)'::regprocedure);` en SQL Editor) y puedas recrearla con seguridad, los cambios al frontend ya están listos — solo necesitarás quitar el bloque `UPDATE` y pasar `p_customer_id`/`p_customer_name` a `createSale()`.
