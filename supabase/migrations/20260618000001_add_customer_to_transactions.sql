-- POS-3b audit P0.1: Persistir cliente en transactions
-- Ejecutar en Supabase Dashboard → SQL Editor
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
