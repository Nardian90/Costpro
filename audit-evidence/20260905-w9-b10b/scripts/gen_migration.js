#!/usr/bin/env node
/**
 * B-10b — Generador de migración + rollback
 * Fuente: definiciones LIVE capturadas en raw-gate1-live.json (veracidad DB, no repo).
 * - reverse_devolution: cuerpo NUEVO (pipeline canónico) con header idéntico PRE
 *   (misma firma/LANGUAGE/SECURITY DEFINER/search_path → preserva OID/owner/ACL).
 * - auto_kardex_on_stock_movement: cuerpo PRE byte-idéntico + 1 rama en el CASE.
 * - rollback: restaura ambos cuerpos PRE + documenta no-removibilidad del enum.
 */
const fs = require('fs');
const path = require('path');

const EV = '/home/z/my-project/Costpro/audit-evidence/20260905-w9-b10b';
const cap = require(path.join(EV, 'raw', 'raw-gate1-live.json'))[0].capture;

// ── 1. Nuevo cuerpo de reverse_devolution ──────────────────────────────────
const NEW_REVERSE_DEVOLUTION = `CREATE OR REPLACE FUNCTION public.reverse_devolution(p_devolution_id uuid, p_reason text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dev RECORD;
  v_item RECORD;
  v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
  v_count INTEGER := 0;
  v_uc_dev NUMERIC;
BEGIN
  SELECT * INTO v_dev FROM public.devolutions WHERE id = p_devolution_id FOR UPDATE;
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
  -- W9.5 B-10b: la autorizacion NO cambia; solo la mutacion.
  IF NOT public.can_reverse_document(v_uid, v_dev.store_id, 'devolution') THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion de devolucion requiere membresia activa en la tienda';
  END IF;

  -- ── W9.5 B-10b: mutacion EXCLUSIVAMENTE via pipeline canonico ──
  -- register_stock_movement -> stock_movements -> triggers (fn_sync_inventory_
  -- on_movement / auto_kardex / sync_product_stock) -> inventory + products.
  -- Quedan PROHIBIDOS (divergencia corregida):
  --   * UPDATE directo de products.stock_current (antes: GREATEST(0, stock-qty))
  --   * INSERT directo en kardex_entries (antes: 'out' con unit_cost=0)
  FOR v_item IN
    SELECT product_id, quantity FROM public.devolution_items WHERE devolution_id = p_devolution_id
  LOOP
    -- (a) Costo complementario del kardex: del movimiento 'return' original
    --     (promedio ponderado si hay varios). Si no existe (devoluciones
    --     pre-pipeline — 13/13 en datos reales), cadena canonica de
    --     create_devolution_v2: cost_at_sale -> cost_average -> 0.
    --     Solo atribucion contable: el WAC real NO se toca (ver (b)).
    SELECT (SUM(sm.unit_cost * sm.quantity_change) / NULLIF(SUM(sm.quantity_change), 0))
      INTO v_uc_dev
      FROM public.stock_movements sm
      WHERE sm.reference_id = p_devolution_id::text
        AND sm.product_id = v_item.product_id
        AND sm.movement_type = 'return';
    IF v_uc_dev IS NULL THEN
      IF v_dev.original_transaction_id IS NOT NULL THEN
        SELECT ti.cost_at_sale INTO v_uc_dev
          FROM public.transaction_items ti
          WHERE ti.transaction_id = v_dev.original_transaction_id
            AND ti.product_id = v_item.product_id
          LIMIT 1;
      END IF;
      IF v_uc_dev IS NULL THEN
        SELECT cost_average INTO v_uc_dev FROM public.products WHERE id = v_item.product_id;
      END IF;
      v_uc_dev := COALESCE(v_uc_dev, 0);
    END IF;

    -- (b) WAC: la devolucion original NO altera cost_average (hotfix A2 v2.22.0,
    --     "for other paths (transfers, devolutions, etc.), cost_average stays
    --     as-is"). El reverse conserva esa invariancia via la rama q=0 de
    --     fn_recalc_wac ("Salida pura / devolucion A1 / evento neutro: WAC
    --     INVARIANTE"): lock del producto + wac_change_log (before==after).
    --     Permite llevar el stock a 0 sin division por cero ni WAC corrupto.
    PERFORM public.fn_recalc_wac(
      v_dev.store_id, v_item.product_id, 'devolution_reverse',
      0, 0,
      jsonb_build_object('rpc', 'reverse_devolution', 'devolution_id', p_devolution_id,
        'qty_reversed', v_item.quantity));

    -- (c) Mutacion de stock SOLO via pipeline canonico. Signo (GATE 3): la
    --     devolucion original sumo (+q, 'return') -> el reverse resta (-q).
    --     Sin clamp: si el stock ya no alcanza, fn_sync_inventory_on_movement
    --     falla con ERR_INSUFFICIENT_STOCK (deteccion sobre silencio, W7 D-01).
    --     reference_id = devolutions.id (trazabilidad estructurada, GATE 8).
    PERFORM public.register_stock_movement(
      p_product_id := v_item.product_id,
      p_store_id := v_dev.store_id,
      p_quantity := -v_item.quantity,
      p_movement_type := 'devolution_reverse',
      p_reason := ('Reversión devolución ' || COALESCE(v_dev.devolution_number, p_devolution_id::text))::text,
      p_user_id := v_uid,
      p_variant_id := NULL,
      p_sale_id := p_devolution_id,
      p_unit_cost := v_uc_dev,
      p_notes := COALESCE(p_reason, ''),
      p_operation_date := NOW(),
      p_skip_access_check := TRUE
    );

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.devolutions
    SET status = 'reversed', reversed_at = now(), reversed_by = v_uid, reversal_reason = p_reason
    WHERE id = p_devolution_id;

  -- W9.5 B-10 (GATE J): la operacion deja audit explicito. B-10b mantiene
  -- action/operation congelados y enriquece metadata (aditivo).
  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
  VALUES ('REVERSE_DEVOLUTION', 'devolutions', p_devolution_id, v_dev.store_id, v_uid,
    jsonb_build_object('reason', p_reason, 'items_reversed', v_count,
      'old_status', v_dev.status, 'new_status', 'reversed',
      'operation', 'ADMIN_REVERSE_DEVOLUTION',
      'pipeline', 'register_stock_movement',
      'movement_type', 'devolution_reverse'));

  RETURN jsonb_build_object('status', 'success', 'items_reversed', v_count, 'devolution_id', p_devolution_id);
END;
$function$
;`;

// ── 2. auto_kardex_on_stock_movement: PRE + 1 rama ─────────────────────────
const akPre = cap.auto_kardex_on_stock_movement[0].definition; // sin ';' final
const anchor = "    WHEN NEW.movement_type = 'production_reverse' THEN 'production_reverse'";
if (!akPre.includes(anchor)) throw new Error('ANCLA production_reverse no encontrada en auto_kardex live');
// El CHECK kardex_entries_movement_type_check ya contempla 'devolution_out'
// (complemento canónico de 'devolution_in') → se usa ese tipo de kardex.
const akNew = akPre.replace(
  anchor,
  anchor + "\n    WHEN NEW.movement_type = 'devolution_reverse' THEN 'devolution_out'"
);
if (akNew === akPre) throw new Error('Parche auto_kardex no aplicado');
// garantía: 1 sola línea añadida, resto byte-idéntico
if (akPre.split('\n').length + 1 !== akNew.split('\n').length) throw new Error('auto_kardex: drift de líneas inesperado');

// ── 3. Rollback: cuerpos PRE exactos ────────────────────────────────────────
const rdPre = cap.reverse_devolution.definition; // sin ';' final
const rollback = `-- W9.5 B-10b — ROLLBACK de modernización reverse_devolution
-- Restaura los cuerpos PRE capturados en raw-gate1-live.json (hashes en
-- 02-function-pre.md). Ejecutar SOLO si se decide revertir B-10b.
--
-- NOTA ENUM: PostgreSQL no permite eliminar un valor de enum de forma segura.
-- El valor 'devolution_reverse' permanece en public.movement_type tras el
-- rollback (queda SIN USO: la función restaurada no lo referencia). No altera
-- datos ni comportamiento; su presencia es inerte y documentada.
--
-- Tras ejecutar: reverse_devolution vuelve a UPDATE directo de stock +
-- INSERT directo kardex (divergencia pre-B-10b). No ejecutar salvo rollback
-- completo de la fase.

-- 1) reverse_devolution (cuerpo PRE, OID/owner/secdef/search_path preservados)
${rdPre}
;

-- 2) auto_kardex_on_stock_movement (cuerpo PRE sin la rama devolution_reverse)
${akPre}
;
`;

// ── 4. Migración final ──────────────────────────────────────────────────────
const migration = `-- ═══════════════════════════════════════════════════════════════════════════
-- W9.5 — B-10b · Modernización de reverse_devolution al pipeline canónico
-- de inventario (register_stock_movement → stock_movements → triggers)
-- ═══════════════════════════════════════════════════════════════════════════
-- Baseline : c892b055 (B-10)
-- Alcance  : SOLO integridad de mutación. La política de autorización de
--            B-10 (can_reverse_document('devolution') = membresía activa)
--            permanece byte-idéntica.
-- Cambios  : 1) enum movement_type += 'devolution_reverse' (append, seguro)
--            2) reverse_devolution: elimina UPDATE directo de products y
--               INSERT directo de kardex; muta SOLO vía register_stock_movement.
--               Firma/owner/SECURITY DEFINER/search_path/ACL sin cambios (OID 136657).
--            3) auto_kardex_on_stock_movement: rama 'devolution_reverse'→'devolution_out'
--               en el CASE (tipo kardex ya sancionado por el CHECK de la tabla).
--              Resto del cuerpo byte-idéntico al live (hash PRE en 02-function-pre.md).
-- Reversibilidad: rollback_reverse_devolution.sql (evidence pack).
-- Prohibido: DROP ... CASCADE; no se elimina ningún objeto.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Nuevo tipo de movimiento (idempotente; el valor solo se USA en runtime,
--    nunca dentro de esta transacción)
ALTER TYPE public.movement_type ADD VALUE IF NOT EXISTS 'devolution_reverse';

-- 2) reverse_devolution — cuerpo nuevo (pipeline canónico)
${NEW_REVERSE_DEVOLUTION}

-- 3) auto_kardex_on_stock_movement — rama kardex complementaria
${akNew}
;
`;

const migPath = '/home/z/my-project/Costpro/supabase/migrations/20260905120000_w9_b10b_modernize_reverse_devolution.sql';
fs.writeFileSync(migPath, migration);
fs.writeFileSync(path.join(EV, 'rollback_reverse_devolution.sql'), rollback);
fs.writeFileSync(path.join(EV, 'raw', 'auto_kardex_post_body.sql'), akNew + '\n;\n');
fs.writeFileSync(path.join(EV, 'raw', 'reverse_devolution_post_body.sql'), NEW_REVERSE_DEVOLUTION + '\n');
console.log('OK migration:', migPath, migration.length, 'bytes');
console.log('OK rollback :', path.join(EV, 'rollback_reverse_devolution.sql'));
