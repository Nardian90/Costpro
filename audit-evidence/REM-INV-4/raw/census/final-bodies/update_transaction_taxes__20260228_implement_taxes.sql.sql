-- DECLARED FINAL STATE (Git) de update_transaction_taxes
-- fuente: 20260228_implement_taxes.sql stmt#6

CREATE OR REPLACE FUNCTION public.update_transaction_taxes(
    p_transaction_id uuid,
    p_applied_taxes jsonb,
    p_tax_amount numeric,
    p_total_amount numeric
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_tax_amount numeric;
    v_store_id uuid;
BEGIN
    -- Check permissions (only manager or admin)
    IF NOT (public.is_admin() OR public.has_role('manager') OR public.has_role('encargado')) THEN
        RAISE EXCEPTION 'Unauthorized: Only managers can update taxes of confirmed sales';
    END IF;

    SELECT tax_amount, store_id INTO v_old_tax_amount, v_store_id
    FROM public.transactions
    WHERE id = p_transaction_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transaction not found';
    END IF;

    -- Update transaction
    UPDATE public.transactions
    SET
        applied_taxes = p_applied_taxes,
        tax_amount = p_tax_amount,
        total_amount = p_total_amount,
        updated_at = now()
    WHERE id = p_transaction_id;

    -- Audit Log
    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
    VALUES (
        auth.uid(),
        'UPDATE_TRANSACTION_TAXES',
        'transactions',
        p_transaction_id,
        jsonb_build_object('tax_amount', v_old_tax_amount),
        jsonb_build_object('tax_amount', p_tax_amount, 'total_amount', p_total_amount, 'applied_taxes', p_applied_taxes),
        v_store_id
    );

    RETURN true;
END;
$$
