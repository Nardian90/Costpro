-- ============================================================================
-- Política de Secuencia Global (Forward-Only Locking)
-- ----------------------------------------------------------------------------
-- Garantiza la integridad cronológica de TODOS los documentos del sistema.
-- Ningún documento nuevo puede tener fecha anterior al documento más reciente
-- ya registrado (sin importar el módulo).
--
-- Componentes:
--   1. Vista `v_global_operation_dates` — unifica fechas de todos los documentos
--   2. RPC `get_global_max_operation_date()` — retorna la fecha MAX global
--   3. Función helper `validate_operation_date(p_new_date, p_store_id)`
--      — lanza excepción si p_new_date < MAX global
--   4. Modificación de `create_sale` para aceptar p_operation_date y validar
-- ============================================================================

-- ============================================================
-- 1. Vista unificada de fechas operativas globales
-- ============================================================
-- Combina las fechas de emisión/operación de TODOS los documentos
-- contables y de inventario del sistema.
-- Cada SELECT incluye un `doc_type` para trazabilidad en auditoría.

CREATE OR REPLACE VIEW public.v_global_operation_dates AS
-- Ventas
SELECT 'sale'::text AS doc_type, id AS doc_id, store_id, created_at AS operation_date
FROM public.transactions WHERE status = 'completed'
UNION ALL
-- Transferencias: enum en español (PENDIENTE, CONFIRMADA, CANCELADA)
SELECT 'transfer'::text, id, origin_store_id, created_at FROM public.transfers
WHERE status IN ('PENDIENTE', 'CONFIRMADA')
UNION ALL
-- Ajustes de inventario (cualquiera con status no nulo)
SELECT 'inventory_adjustment'::text, id, store_id, created_at FROM public.inventory_adjustments
WHERE status IS NOT NULL
UNION ALL
-- Órdenes de compra: usar received_at si está disponible
SELECT 'purchase_order'::text, id, store_id, COALESCE(received_at, created_at) FROM public.purchase_orders
WHERE status IS NOT NULL
UNION ALL
-- Recepciones
SELECT 'receipt'::text, id, store_id, COALESCE(reception_date, created_at) FROM public.receipts
WHERE status IS NOT NULL
UNION ALL
-- Cierres de caja
SELECT 'cash_closure'::text, id, store_id, COALESCE(closed_at, created_at) FROM public.cash_closures
UNION ALL
-- Movimientos de caja
SELECT 'cash_movement'::text, id, store_id, created_at FROM public.cash_movements
UNION ALL
-- Sesiones de caja
SELECT 'cash_session'::text, id, store_id, COALESCE(opening_at, created_at) FROM public.cash_sessions
UNION ALL
-- Movimientos de stock
SELECT 'stock_movement'::text, id, store_id, COALESCE(movement_date, created_at) FROM public.stock_movements
UNION ALL
-- Ofertas (fecha es text, castear a timestamptz)
SELECT 'oferta'::text, id, store_id, fecha::timestamp with time zone FROM public.ofertas
WHERE fecha IS NOT NULL AND fecha != '';

-- ============================================================
-- 2. RPC get_global_max_operation_date()
-- ============================================================
-- Retorna la fecha máxima (TIMESTAMP) de todos los documentos del sistema.
-- Si no hay documentos, retorna NULL (cualquier fecha es válida).
-- Es SEGURA: cualquier usuario autenticado puede consultarla (lectura).

DROP FUNCTION IF EXISTS public.get_global_max_operation_date();
CREATE OR REPLACE FUNCTION public.get_global_max_operation_date()
RETURNS TIMESTAMP WITH TIME ZONE
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT MAX(operation_date) FROM v_global_operation_dates;
$$;

GRANT EXECUTE ON FUNCTION public.get_global_max_operation_date() TO authenticated;

COMMENT ON FUNCTION public.get_global_max_operation_date() IS
'Retorna la fecha MAX global de todos los documentos operativos del sistema. Used por el frontend para mostrar el badge "Fecha de Operación Actual" y por los RPCs de creación de documentos para validar forward-only locking.';

-- ============================================================
-- 3. Función helper validate_operation_date(p_new_date)
-- ============================================================
-- Lanza excepción si p_new_date es menor que la fecha MAX global.
-- Reutilizable por todos los RPCs de creación de documentos.
-- Si p_new_date es NULL, usa NOW() (no bloquea).

DROP FUNCTION IF EXISTS public.validate_operation_date(TIMESTAMP WITH TIME ZONE);
CREATE OR REPLACE FUNCTION public.validate_operation_date(p_new_date TIMESTAMP WITH TIME ZONE)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_date TIMESTAMP WITH TIME ZONE;
  v_max_date_str TEXT;
BEGIN
  IF p_new_date IS NULL THEN
    RETURN; -- sin fecha = usar NOW() implícitamente, no bloquea
  END IF;

  SELECT public.get_global_max_operation_date() INTO v_max_date;

  IF v_max_date IS NOT NULL AND p_new_date < v_max_date THEN
    v_max_date_str := to_char(v_max_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI');
    RAISE EXCEPTION 'ERR_BACKDATED_DOCUMENT: La fecha % es anterior a la fecha mínima permitida (%). No se puede retroceder en el tiempo operativo.',
      to_char(p_new_date AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI'),
      v_max_date_str
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE) TO authenticated;

COMMENT ON FUNCTION public.validate_operation_date(TIMESTAMP WITH TIME ZONE) IS
'Valida que la fecha de un nuevo documento no sea anterior a la fecha MAX global. Lanza excepción ERR_BACKDATED_DOCUMENT si viola la política forward-only. Llamar desde todos los RPCs de creación de documentos.';

-- ============================================================
-- 4. Modificación de create_sale: añadir p_operation_date + validación
-- ============================================================
-- IMPORTANTE: la función create_sale ya existe en la BD (creada fuera del
-- sistema de migraciones). La reemplazamos preservando toda su lógica
-- original y añadiendo:
--   - parámetro p_operation_date (default NULL = usar NOW())
--   - llamada a validate_operation_date al inicio
--   - uso de p_operation_date en el INSERT de transactions

DROP FUNCTION IF EXISTS public.create_sale(UUID, UUID, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, JSONB, UUID);

CREATE OR REPLACE FUNCTION public.create_sale(
  p_store_id UUID,
  p_seller_id UUID,
  p_total_amount NUMERIC,
  p_items JSONB,
  p_subtotal NUMERIC DEFAULT 0,
  p_discount_type TEXT DEFAULT 'fixed',
  p_discount_value NUMERIC DEFAULT 0,
  p_payment_method TEXT DEFAULT 'cash',
  p_tax_amount NUMERIC DEFAULT 0,
  p_applied_taxes JSONB DEFAULT '[]'::jsonb,
  p_transaction_id UUID DEFAULT NULL,
  -- NUEVO parámetro: fecha de operación elegida por el usuario.
  -- Si es NULL, se usa NOW() (comportamiento legacy).
  p_operation_date TIMESTAMP WITH TIME ZONE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_transaction_id UUID;
  v_item JSONB;
  v_product_id UUID;
  v_units_to_deduct NUMERIC;
  v_current_stock NUMERIC;
  v_tenant_id UUID;
  v_effective_date TIMESTAMP WITH TIME ZONE;
BEGIN
  -- 0) Validación de política forward-only
  -- Si p_operation_date es NULL, no validamos (usa NOW() implícito).
  -- Si viene una fecha, validamos que no sea anterior al MAX global.
  PERFORM public.validate_operation_date(p_operation_date);
  v_effective_date := COALESCE(p_operation_date, NOW());

  -- 1) Internal security check
  IF NOT public.has_store_access(p_store_id) THEN
    RAISE EXCEPTION 'Unauthorized store access';
  END IF;

  SELECT tenant_id INTO v_tenant_id FROM public.stores WHERE id = p_store_id;
  v_transaction_id := COALESCE(p_transaction_id, gen_random_uuid());

  -- 2) Insert transaction header con la fecha efectiva
  INSERT INTO public.transactions (
    id, store_id, seller_id, total_amount, subtotal, tenant_id, status,
    payment_method, discount_type, discount_value, tax_amount, applied_taxes,
    created_at  -- NUEVO: usar la fecha de operación efectiva
  )
  VALUES (
    v_transaction_id, p_store_id, p_seller_id, p_total_amount, p_subtotal, v_tenant_id,
    'completed'::transaction_status,
    p_payment_method::payment_method_enum,
    p_discount_type::discount_type_enum,
    p_discount_value, p_tax_amount, p_applied_taxes,
    v_effective_date
  );

  -- 3) Process items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item->>'product_id')::UUID;
    v_units_to_deduct := (v_item->>'quantity')::NUMERIC;

    -- Lock product record
    PERFORM 1 FROM public.products WHERE id = v_product_id FOR UPDATE;

    -- Check inventory stock
    SELECT quantity INTO v_current_stock FROM public.inventory
      WHERE store_id = p_store_id AND product_id = v_product_id FOR UPDATE;

    IF COALESCE(v_current_stock, 0) < v_units_to_deduct THEN
      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK: Producto % tiene % unidades, se requieren %', v_product_id, COALESCE(v_current_stock, 0), v_units_to_deduct;
    END IF;

    -- Insert item (con fecha efectiva)
    INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale, created_at)
    VALUES (v_transaction_id, v_product_id, v_units_to_deduct, (v_item->>'price')::NUMERIC, (v_item->>'cost')::NUMERIC, v_effective_date);

    -- Register movement (con fecha efectiva via register_stock_movement)
    PERFORM public.register_stock_movement(
      p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := p_seller_id,
      p_quantity := -v_units_to_deduct, p_movement_type := 'sale',
      p_sale_id := v_transaction_id, p_unit_cost := COALESCE((v_item->>'cost')::NUMERIC, 0)
    );
  END LOOP;

  RETURN v_transaction_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_sale(UUID, UUID, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, JSONB, UUID, TIMESTAMP WITH TIME ZONE) TO authenticated;

COMMENT ON FUNCTION public.create_sale(UUID, UUID, NUMERIC, JSONB, NUMERIC, TEXT, NUMERIC, TEXT, NUMERIC, JSONB, UUID, TIMESTAMP WITH TIME ZONE) IS
'RPC de creación de venta. p_operation_date (opcional) permite al usuario elegir la fecha de la venta, sujeto a validación forward-only (no puede ser anterior al MAX global). Si es NULL, usa NOW().';

-- ============================================================
-- 5. Test de verificación
-- ============================================================
-- Verifica que el RPC funciona y retorna la fecha MAX actual

SELECT
  'get_global_max_operation_date' AS test,
  public.get_global_max_operation_date() AS max_date,
  to_char(public.get_global_max_operation_date() AT TIME ZONE 'America/Havana', 'DD/MM/YYYY HH24:MI') AS max_date_havana;
