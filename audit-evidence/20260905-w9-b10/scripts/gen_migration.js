#!/usr/bin/env node
/**
 * W9.5-B10 — Generador de la migración de autorización para los 5 tipos
 * restantes de /api/reverse. Cirugía de anclas sobre definiciones LIVE
 * (out_q01/out_q02/out_q03). FALLA si un ancla no se encuentra.
 */
const fs = require('fs');
const defs = {};
for (const f of ['out_q02.json','out_q03.json']) {
  const rows = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/b10/' + f, 'utf8'));
  rows.forEach(r => defs[r.fn] = r.def);
}
function mustReplace(src, anchor, replacement, label) {
  if (!src.includes(anchor)) { console.error(`FALLO ancla ${label}:\n${anchor}`); process.exit(1); }
  return src.replace(anchor, replacement);
}

// ── 1. reverse_receipt_v2 ──
let receipt = defs['reverse_receipt_v2'];
receipt = mustReplace(receipt,
`  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
`,
`  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_receipt.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa de rol (fuente unica can_reverse_document).
  -- Politica congelada: operadores de recepciones (membership admin/manager/
  -- encargado/warehouse en la tienda del receipt) o admin global transversal.
  IF NOT public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de recepcion requiere rol admin/manager/encargado/warehouse en la tienda';
  END IF;
`, 'receipt:role');

// metadata.operation aditivo en audit
receipt = mustReplace(receipt,
`     jsonb_build_object('reason', p_reason,
                        'items_processed', v_items_processed,
                        'payments_reversed', v_reversed_payments,
                        'v2_reverse', true));`,
`     jsonb_build_object('reason', p_reason,
                        'items_processed', v_items_processed,
                        'payments_reversed', v_reversed_payments,
                        'old_status', v_receipt.status, 'new_status', 'reversed',
                        'operation', 'ADMIN_REVERSE_RECEIPT',
                        'v2_reverse', true));`, 'receipt:audit');

// ── 2. reverse_transfer ──
let transfer = defs['reverse_transfer'];
transfer = mustReplace(transfer,
`  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;
`,
`  IF NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED_DESTINATION';
  END IF;

  -- W9.5 B-10: capa normativa de rol resuelta en la tienda ORIGEN (duena del
  -- documento y del audit). El acceso al DESTINO sigue siendo requisito
  -- adicional (naturaleza bidireccional de la transferencia).
  IF NOT public.can_reverse_document(v_caller_uid, v_transfer.origin_store_id, 'transfer') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de transferencia requiere rol admin/manager/encargado/warehouse en la tienda de origen';
  END IF;
`, 'transfer:role');

transfer = mustReplace(transfer,
`    jsonb_build_object('reason', p_reason, 'items_reversed', v_count, 'reference_doc', v_ref_doc,
      'dest_reverse_blend_df06', true));`,
`    jsonb_build_object('reason', p_reason, 'items_reversed', v_count, 'reference_doc', v_ref_doc,
      'old_status', v_transfer.status, 'new_status', 'REVERSADA',
      'operation', 'ADMIN_REVERSE_TRANSFER',
      'dest_reverse_blend_df06', true));`, 'transfer:audit');

// ── 3. reverse_devolution ──
let devolution = defs['reverse_devolution'];
devolution = mustReplace(devolution,
`  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
`,
`  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
  IF v_dev IS NULL THEN RAISE EXCEPTION 'ERR_DEVOLUTION_NOT_FOUND'; END IF;
  IF v_dev.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;

  -- W9.5 B-10: guard de estado explicito (GATE G) — solo completed reversible.
  IF v_dev.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_STATUS: reverse_devolution solo permite completed (status=%)', v_dev.status;
  END IF;

  IF v_uid IS NULL OR NOT public.has_store_access_as(v_uid, v_dev.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa (fuente unica). Politica congelada (C conservar):
  -- cualquier membresia ACTIVA en la tienda, simetrica a la creacion de
  -- devoluciones (modulo dormant, sin puerta de navegacion).
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;
`, 'devolution:guards');

devolution = mustReplace(devolution,
`  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);`,
`  -- W9.5 B-10 (GATE J): la operacion deja audit explicito (antes: cero rastro
  -- en audit_logs; solo reversed_by/reversal_reason en la fila).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);`, 'devolution:audit');

// ── 4. reverse_production_order ──
let production = defs['reverse_production_order'];
production = mustReplace(production,
`  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
`,
`  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_order.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-10: capa normativa de rol. Politica congelada: puerta UI real del
  -- modulo (Costo: membership admin/manager/costo en la tienda de la orden) o
  -- admin global transversal. Observacion de producto registrada (02-policy).
  IF NOT public.can_reverse_document(v_caller_uid, v_order.store_id, 'production_order') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de orden de produccion requiere rol admin/manager/costo en la tienda';
  END IF;
`, 'production:role');

production = mustReplace(production,
`    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac));`,
`    jsonb_build_object('reason', p_reason, 'wac_before', v_output_wac, 'wac_after', v_new_wac,
      'old_status', v_order.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_PRODUCTION_ORDER'));`, 'production:audit');

// ── 5. Helper normativo + nueva función de inversión de ajustes ──
const HELPER = `-- ═══════════════════════════════════════════════════════════════════
-- 1. HELPER NORMATIVO ÚNICO (fuente de la política B-10 para los 5 tipos)
--    Espejo DB de la doctrina de src/lib/roles.ts; espejo UI:
--    canReverseDocumentInStore. STORE ACCESS ≠ OPERATION AUTHORIZATION.
--    Politica congelada: audit-evidence/20260905-w9-b10/02-policy-matrix.md
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.can_reverse_document(p_actor uuid, p_store_id uuid, p_operation text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL OR p_operation IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;
  IF v_membership_role IS NULL THEN RETURN false; END IF;
  IF v_membership_role = 'admin' THEN RETURN true; END IF;

  CASE p_operation
    WHEN 'receipt' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'transfer' THEN
      RETURN v_membership_role IN ('manager','encargado','warehouse');
    WHEN 'adjustment' THEN
      RETURN v_membership_role IN ('manager','encargado');
    WHEN 'devolution' THEN
      RETURN true; -- cualquier membresía activa (simétrica a la creación; módulo dormant)
    WHEN 'production_order' THEN
      RETURN v_membership_role IN ('manager','costo');
    ELSE
      RETURN false;
  END CASE;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════
-- 2. reverse_inventory_adjustment_v2 (B-10-ADJ-1) — INVERSIÓN verdadera.
--    El path activo de /api/reverse para 'adjustment' era
--    duplicate_inventory_adjustment_v2 (re-aplica el MISMO delta). El
--    contrato del producto (tooltip del botón, comentario del hook, V1) es
--    INVERTIR. Esta función crea un CONTRA-DOCUMENTO con items esperado<->​
--    contado intercambiados y aplica -diff vía register_stock_movement.
--    El botón "Duplicar" conserva duplicate_inventory_adjustment_v2 intacto.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reverse_inventory_adjustment_v2(p_adjustment_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_original RECORD;
  v_item RECORD;
  v_counter_id uuid := gen_random_uuid();
  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_diff numeric;
  v_count integer := 0;
BEGIN
  SELECT * INTO v_original FROM public.inventory_adjustments WHERE id = p_adjustment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ADJUSTMENT_NOT_FOUND'; END IF;
  IF v_original.status = 'reversed' THEN RAISE EXCEPTION 'ERR_ALREADY_REVERSED'; END IF;
  IF v_original.status <> 'confirmed' THEN
    RAISE EXCEPTION 'ERR_NOT_CONFIRMED: solo ajustes confirmed pueden revertirse (status=%)', v_original.status;
  END IF;

  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_original.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
  IF NOT public.can_reverse_document(v_caller_uid, v_original.store_id, 'adjustment') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de ajuste requiere rol admin/manager/encargado en la tienda';
  END IF;

  INSERT INTO public.inventory_adjustments (
    id, store_id, status, reason, created_by, created_at, confirmed_at, confirmed_by
  ) VALUES (
    v_counter_id, v_original.store_id, 'confirmed',
    v_original.reason, v_caller_uid, NOW(), NOW(), v_caller_uid
  );

  FOR v_item IN
    SELECT * FROM public.inventory_adjustment_items WHERE adjustment_id = p_adjustment_id
  LOOP
    v_diff := COALESCE(v_item.counted_quantity, 0) - COALESCE(v_item.expected_quantity, 0);
    IF v_diff = 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory_adjustment_items (
      adjustment_id, product_id, expected_quantity, counted_quantity
    ) VALUES (
      v_counter_id, v_item.product_id, v_item.counted_quantity, v_item.expected_quantity
    );

    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_original.store_id,
      p_user_id := v_caller_uid,
      p_quantity := -v_diff,
      p_movement_type := 'adjustment'::text,
      p_sale_id := v_counter_id,
      p_unit_cost := 0,
      p_reason := 'Reversión de ajuste: ' || COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );
    v_count := v_count + 1;
  END LOOP;

  UPDATE public.inventory_adjustments
    SET status = 'reversed', reversed_at = NOW(), reversed_by = v_caller_uid, reversal_reason = p_reason
    WHERE id = p_adjustment_id;

  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_ADJUSTMENT_V2', 'inventory_adjustments', p_adjustment_id, v_original.store_id, v_caller_uid,
    jsonb_build_object('reason', p_reason, 'counter_adjustment_id', v_counter_id,
      'items_reversed', v_count, 'old_status', v_original.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_ADJUSTMENT'));

  RETURN jsonb_build_object('status', 'success', 'adjustment_id', p_adjustment_id,
    'counter_adjustment_id', v_counter_id, 'items_reversed', v_count);
END;
$function$;
`;

const ACL = `-- ═══════════════════════════════════════════════════════════════════
-- 5. ACL (patrón F06 / B-8)
-- ═══════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.can_reverse_document(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_reverse_document(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.can_reverse_document(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_reverse_document(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_inventory_adjustment_v2(uuid, text, uuid) TO service_role;
`;

const HEADER = `-- ============================================================================
-- W9.5 — B-10 · Autorización diferenciada para los 5 tipos restantes de
-- /api/reverse (receipt, transfer, adjustment, devolution, production_order)
-- Migración: 20260905000002 (versionada, idempotente, SIN DROP CASCADE)
--
-- Política congelada: audit-evidence/20260905-w9-b10/02-policy-matrix.md
--   - receipt:         membership admin/manager/encargado/warehouse (+*)
--   - transfer:        membership admin/manager/encargado/warehouse en ORIGEN
--                      (+ acceso DESTINO preexistente) (+*)
--   - adjustment:      membership admin/manager/encargado (+*) + FIX B-10-ADJ-1
--                      (inversión verdadera vía contra-documento)
--   - devolution:      membresía activa (C conservar, como su creación) (+*)
--                      + hardening: FOR UPDATE + estado 'completed' + audit
--   - production_order:membership admin/manager/costo (+*)
--
-- INVARIANTES: firmas/owner/SECURITY DEFINER/search_path/ACL de los RPC
-- existentes intactas; FOR UPDATE conservado/añadido; mecánica financiera
-- intacta (solo guards + audit aditivo). has_store_access_as sin cambios.
-- ROLLBACK: audit-evidence/20260905-w9-b10/rollback_b10.sql (cuerpos PRE).
-- ============================================================================

`;

const OUT = '/home/z/my-project/Costpro/supabase/migrations/20260905000002_w9_b10_reverse_document_authorization.sql';
const content = HEADER + HELPER + '\n'
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + `-- 3. reverse_receipt_v2 (cuerpo live dd3f3276 + capa de rol + audit aditivo)\n`
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + receipt + ';\n\n'
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + `-- 4. reverse_transfer (cuerpo live + capa de rol en ORIGEN + audit aditivo)\n`
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + transfer + ';\n\n'
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + `-- 5. reverse_devolution (cuerpo live + FOR UPDATE + estado + rol + audit)\n`
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + devolution + ';\n\n'
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + `-- 6. reverse_production_order (cuerpo live + capa de rol + audit aditivo)\n`
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + production + ';\n\n'
  + ACL;
fs.writeFileSync(OUT, content);
console.log(`OK → ${OUT} (${content.length} bytes)`);
