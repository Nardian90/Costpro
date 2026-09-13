-- DECLARED FINAL STATE (Git) de log_audit_event
-- fuente: 20260324_total_remediation.sql stmt#19

CREATE OR REPLACE FUNCTION public.log_audit_event(
    p_action TEXT,
    p_payload JSONB,
    p_store_id UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_prev_hash TEXT;
    v_payload_hash TEXT;
    v_event_hash TEXT;
    v_event_id UUID;
    v_tenant_id UUID;
    v_role TEXT;
BEGIN
    SELECT tenant_id, role::text INTO v_tenant_id, v_role FROM public.profiles WHERE id = auth.uid();
    SELECT event_hash INTO v_prev_hash FROM public.audit_events ORDER BY utc_timestamp DESC LIMIT 1;

    v_payload_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
    v_event_hash := encode(extensions.digest(v_payload_hash || COALESCE(v_prev_hash, '') || now()::text, 'sha256'), 'hex');

    INSERT INTO public.audit_events (
        actor_id, role, tenant_id, store_id, action, payload_hash, previous_event_hash, event_hash
    ) VALUES (
        auth.uid(), v_role, v_tenant_id, p_store_id, p_action, v_payload_hash, v_prev_hash, v_event_hash
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
