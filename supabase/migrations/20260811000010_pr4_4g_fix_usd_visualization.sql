-- PR-4.4G — Fix USD visualization: get_transactions RPC + payment method labels
--
-- CAUSA RAÍZ:
-- 1. get_transactions RPC no devolvía cash_amount, transfer_amount, zelle_amount
--    → el frontend no podía mostrar información de USD/Zelle
-- 2. SalesHistoryView no tenía case para payment_method='zelle'
--    → las ventas 100% USD aparecían como "Sin especificar"
-- 3. /api/sales/summary no sumaba zelle_amount al USD del resumen
--    → el resumen consolidado mostraba USD=0
--
-- FIX:
-- 1. get_transactions ahora devuelve cash_amount, transfer_amount, zelle_amount,
--    sale_currency, sale_exchange_rate, completed_at, customer_name, invoice_number
-- 2. Frontend: añadido case 'zelle' → 'USD/Zelle' en SalesHistoryView, useSalesHistoryView, TransactionDetailsModal
-- 3. /api/sales/summary: zelle_amount se suma a day.usd (USD equivalente en CUP)

DROP FUNCTION IF EXISTS public.get_transactions(uuid, text, timestamp without time zone, timestamp without time zone, integer);

CREATE OR REPLACE FUNCTION public.get_transactions(
  p_store_id uuid DEFAULT NULL::uuid,
  p_search_term text DEFAULT NULL::text,
  p_date_from timestamp without time zone DEFAULT NULL::timestamp without time zone,
  p_date_to timestamp without time zone DEFAULT NULL::timestamp without time zone,
  p_limit integer DEFAULT 1000
)
RETURNS TABLE(
  id uuid,
  created_at timestamp with time zone,
  total_amount numeric,
  status text,
  payment_method text,
  subtotal numeric,
  discount_value numeric,
  store_id uuid,
  seller_id uuid,
  seller_name text,
  cash_amount numeric,
  transfer_amount numeric,
  zelle_amount numeric,
  sale_currency text,
  sale_exchange_rate numeric,
  completed_at timestamp with time zone,
  customer_name text,
  invoice_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id uuid;
    v_is_admin boolean;
BEGIN
    v_user_id := auth.uid();
    v_is_admin := public.is_admin();

    IF p_limit IS NULL THEN
        p_limit := 1000;
    END IF;

    RETURN QUERY
    SELECT
        t.id,
        t.created_at,
        t.total_amount,
        t.status::text,
        t.payment_method::text,
        t.subtotal,
        t.discount_value,
        t.store_id,
        t.seller_id,
        p.full_name as seller_name,
        t.cash_amount,
        t.transfer_amount,
        t.zelle_amount,
        t.sale_currency,
        t.sale_exchange_rate,
        t.completed_at,
        t.customer_name,
        t.invoice_number
    FROM public.transactions t
    LEFT JOIN public.profiles p ON t.seller_id = p.id
    WHERE
        (v_is_admin OR public.has_store_access(t.store_id))
        AND (p_store_id IS NULL OR t.store_id = p_store_id)
        AND (p_date_from IS NULL OR t.created_at >= p_date_from)
        AND (p_date_to IS NULL OR t.created_at <= p_date_to)
        AND (
            p_search_term IS NULL OR p_search_term = ''
            OR p.full_name ILIKE ('%' || p_search_term || '%')
            OR t.id::text ILIKE ('%' || p_search_term || '%')
        )
    ORDER BY t.created_at DESC
    LIMIT p_limit;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_transactions TO authenticated;
