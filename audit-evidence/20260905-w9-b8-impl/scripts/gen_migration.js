#!/usr/bin/env node
/**
 * W9.5-B8 MODELO C — Generador de la migración de autorización.
 *
 * Estrategia anti-error: parte de las definiciones LIVE (pg_get_functiondef)
 * de void_transaction y reverse_transaction_v2 y aplica inserciones/sustitu-
 * ciones quirúrgicas con ANCLAS EXACTAS. Si un ancla no se encuentra, FALLA
 * sin escribir el archivo (nunca improvisa).
 *
 * Salida: supabase/migrations/20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql
 */
const fs = require('fs');
const path = require('path');

const live = JSON.parse(fs.readFileSync('/home/z/my-project/scripts/b8c/out_c01.json', 'utf8'));
const defs = Object.fromEntries(live.map(r => [r.fn, r.def]));

function mustReplace(src, anchor, replacement, label) {
  if (!src.includes(anchor)) {
    console.error(`FALLO: ancla no encontrada para ${label}:\n---\n${anchor}\n---`);
    process.exit(1);
  }
  return src.replace(anchor, replacement);
}

// ─────────────────────────────────────────────────────────────────────
// 1) void_transaction — MODELO C Nivel 1 (POS Undo)
// ─────────────────────────────────────────────────────────────────────
let voidFn = defs['void_transaction'];

const VOID_AUTH_ANCHOR = `  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
`;
const VOID_AUTH_NEW = `  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): guard de estado explicito
  -- (endurecimiento B-9a: rechaza estados distintos de completed/voided
  -- ANTES de tocar datos; el trigger trg_validate_tx_transition sigue
  -- siendo la segunda barrera).
  IF v_tx.status = 'voided' THEN RAISE EXCEPTION 'ERR_ALREADY_VOIDED'; END IF;
  IF v_tx.status <> 'completed' THEN
    RAISE EXCEPTION 'ERR_INVALID_TRANSITION: void_transaction (POS undo) solo permite completed (status=%)', v_tx.status;
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 1 POS Undo): politica normativa UNICA
  -- can_pos_undo_transaction: venta propia + ventana server-side 30s
  -- + estado completed + rol operativo POS (membership por tienda o
  -- admin global). Identidad SIEMPRE auth.uid() para no-service_role;
  -- p_user_id del cliente no puede convertirse en actor.
  IF NOT public.can_pos_undo_transaction(p_transaction_id, v_caller_uid) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: POS undo requiere venta propia, dentro de la ventana de 30s y rol operativo POS en la tienda';
  END IF;
`;
voidFn = mustReplace(voidFn, VOID_AUTH_ANCHOR, VOID_AUTH_NEW, 'void:authorization+status');

const VOID_AUDIT_ANCHOR = `    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status));`;
const VOID_AUDIT_NEW = `    jsonb_build_object('reason', p_reason, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'POS_UNDO'));`;
voidFn = mustReplace(voidFn, VOID_AUDIT_ANCHOR, VOID_AUDIT_NEW, 'void:audit-metadata');

// ─────────────────────────────────────────────────────────────────────
// 2) reverse_transaction_v2 — MODELO C Nivel 2 (Reversión administrativa)
// ─────────────────────────────────────────────────────────────────────
let v2Fn = defs['reverse_transaction_v2'];

const V2_AUTH_ANCHOR = `  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;
`;
const V2_AUTH_NEW = `  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
  END IF;

  -- W9.5 B-8 (MODELO C, Nivel 2 Reversion administrativa): politica
  -- normativa UNICA can_admin_reverse_transaction: admin global
  -- (alcance transversal *) o membership activa con rol
  -- admin/manager/encargado en LA TIENDA de la transaccion.
  -- La membresia responde "puede operar en la tienda"; el ROL responde
  -- "puede realizar esta operacion administrativa". Ownership NO se
  -- exige (venta ajena permitida dentro del alcance); sin ventana
  -- temporal (doc vigente; la ventana 24h de la doc previa esta
  -- superseda). Todo lo demas de V2 se conserva intacto (GATE 14).
  IF NOT public.can_admin_reverse_transaction(v_caller_uid, v_tx.store_id) THEN
    RAISE EXCEPTION 'ERR_UNAUTHORIZED: reversion administrativa requiere rol admin/manager/encargado en la tienda de la venta';
  END IF;
`;
v2Fn = mustReplace(v2Fn, V2_AUTH_ANCHOR, V2_AUTH_NEW, 'v2:role-authorization');

const V2_AUDIT_ANCHOR = `    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored));`;
const V2_AUDIT_NEW = `    jsonb_build_object('reason', p_reason, 'units_restored', v_total_restored, 'old_status', v_tx.status, 'new_status', 'voided', 'operation', 'ADMIN_REVERSE'));`;
v2Fn = mustReplace(v2Fn, V2_AUDIT_ANCHOR, V2_AUDIT_NEW, 'v2:audit-metadata');

// ─────────────────────────────────────────────────────────────────────
// 3) Helpers normativos (fuente única de la política)
// ─────────────────────────────────────────────────────────────────────
const HELPERS = `-- ═══════════════════════════════════════════════════════════════════
-- 1. HELPERS NORMATIVOS (fuente unica de la politica MODELO C)
--    Espejo DB de la doctrina de src/lib/roles.ts:
--      - ROL GLOBAL admin (profiles.role)  -> alcance transversal (*)
--      - ROLES DE MEMBERSHIP (por tienda)  -> definen lo operable EN ESA TIENDA
--    STORE ACCESS (has_store_access_as)  ≠  OPERATION AUTHORIZATION (estos helpers)
-- ═══════════════════════════════════════════════════════════════════

-- Nivel 2: reversion administrativa de ventas.
-- admin global -> true (cualquier tienda, alcance transversal confirmado
-- por has_store_access_as + canManageStore + B-2 P5). Resto: SOLO con
-- membership ACTIVA en la tienda con rol admin/manager/encargado
-- (patron canManageStore). clerk/warehouse/usuario/costo -> false.
CREATE OR REPLACE FUNCTION public.can_admin_reverse_transaction(p_actor uuid, p_store_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_actor IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = p_store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado'), false);
END;
$function$;

-- Nivel 1: POS Undo (deshacer la venta que el actor acaba de realizar).
-- Requisitos TODOS obligatorios:
--   a) estado 'completed' (create_sale_v2 solo produce completed);
--   b) ownership estricto (tx.seller_id = actor — venta PROPIA);
--   c) ventana server-side de 30 segundos desde created_at (MM-9,
--      "ventana POS"; antes solo client-side);
--   d) rol operativo POS: admin global transversal o membership activa
--      en la tienda con rol admin/manager/encargado/clerk.
CREATE OR REPLACE FUNCTION public.can_pos_undo_transaction(p_transaction_id uuid, p_actor uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_tx RECORD;
  v_profile_role TEXT;
  v_membership_role TEXT;
BEGIN
  IF p_transaction_id IS NULL OR p_actor IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = p_transaction_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_tx.status <> 'completed' THEN RETURN false; END IF;

  IF v_tx.seller_id IS NULL OR v_tx.seller_id <> p_actor THEN RETURN false; END IF;

  IF v_tx.created_at IS NULL OR v_tx.created_at < now() - INTERVAL '30 seconds' THEN RETURN false; END IF;

  SELECT role::text INTO v_profile_role FROM public.profiles WHERE id = p_actor;
  IF v_profile_role = 'admin' THEN RETURN true; END IF;

  SELECT m.role::text INTO v_membership_role
    FROM public.user_store_memberships m
   WHERE m.user_id = p_actor AND m.store_id = v_tx.store_id AND m.status = 'active'
   LIMIT 1;

  RETURN COALESCE(v_membership_role IN ('admin','manager','encargado','clerk'), false);
END;
$function$;
`;

const ACL = `-- ═══════════════════════════════════════════════════════════════════
-- 4. ACL de los helpers (patron de endurecimiento F06 del repo).
--    Los helpers se ejecutan DENTRO de las funciones DEFINER (owner
--    postgres) y por service_role desde /api/reverse (boundary API).
--    Ningun cliente necesita ni debe invocarlos directamente.
-- ═══════════════════════════════════════════════════════════════════
REVOKE ALL ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_pos_undo_transaction(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin_reverse_transaction(uuid, uuid) TO service_role;
`;

const HEADER = `-- ============================================================================
-- W9.5 — B-8 · MODELO C: autorización diferenciada POS Undo vs Reversión admin
-- Migración: 20260905000001 (versionada, idempotente, SIN DROP CASCADE)
--
-- Política congelada: audit-evidence/20260905-w9-b8-impl/01-policy-matrix.md
--
--   NIVEL 1 (POS Undo, void_transaction): venta propia + ventana 30s
--           server-side + estado completed + rol operativo POS por
--           membership (admin/manager/encargado/clerk) o admin global.
--   NIVEL 2 (Reversión administrativa, reverse_transaction_v2): rol
--           admin/manager/encargado en la tienda (o admin global
--           transversal); venta ajena permitida; sin ventana.
--
-- INVARIANTES PRESERVADOS (GATE 14):
--   - firmas, SECURITY DEFINER, owner, search_path endurecidos;
--   - FOR UPDATE como primera lectura relevante en ambos RPC;
--   - has_store_access_as como capa STORE ACCESS (sin cambios);
--   - máquina de estados + triggers (segunda barrera, sin cambios);
--   - mecánica de stock/WAC/pagos/kardex/idempotencia intacta;
--   - ACLs preexistentes de ambos RPC intactas (solo se fija ACL de los
--     helpers NUEVOS).
--   Audit: acciones históricas se conservan; metadata gana operation /
--   old_status / new_status (aditivo).
--
-- ROLLBACK: ver audit-evidence/20260905-w9-b8-impl/ (cuerpos previos
-- capturados byte a byte de live antes de aplicar).
-- ============================================================================

`;

const OUT = path.join('/home/z/my-project/Costpro/supabase/migrations/20260905000001_w9_b8_modelo_c_undo_reverse_authorization.sql');
const content = HEADER
  + HELPERS + '\n'
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + `-- 2. void_transaction — Nivel 1 (POS Undo). Cuerpo live c57e8de1 +\n`
  + `--    guards de política. FOR UPDATE sigue siendo la 1ª lectura.\n`
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + voidFn + ';\n\n'
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + `-- 3. reverse_transaction_v2 — Nivel 2 (Reversión administrativa).\n`
  + `--    Cuerpo live c57e8de1 + capa de rol. FOR UPDATE 1ª lectura intacta.\n`
  + `-- ═══════════════════════════════════════════════════════════════════\n`
  + v2Fn + ';\n\n'
  + ACL;

fs.writeFileSync(OUT, content);
console.log(`OK → ${OUT} (${content.length} bytes)`);
