/**
 * adn009-sr-hardening-migration.test.ts — ADN-SERVICES-RECEIVED-POSTMERGE-HARDENING-009
 *
 * Contrato ESTÁTICO de la migración correctiva 20261121190000 (patrón adn008):
 *  · §3: contrato canónico CP-FIN-004 en el batch (external_transfer; zelle
 *    heredado NORMALIZADO — jamás persistido) + restricción de moneda
 *    (Transf. Exterior = riel divisa USD/EUR) en AMBOS caminos.
 *  · §4: serialización compartida — SELECT ... FOR UPDATE del documento en el
 *    motor individual y en el batch, ANTES de la lectura de saldo; estado del
 *    servicio comprobado tras el lock (solo active paga).
 *  · §5: gate de gestión DENTRO de los RPC de borradores (can_manage_store_as,
 *    espejo DB de canManageStore); batch service_role exclusivo.
 *  · §7: idempotencia de creación — advisory lock ANTES de consultar
 *    creation_key + re-consulta + índice único parcial + EXCEPTION que revierte.
 *  · §9: update_received_service_draft firma patch tri-state (firma /15
 *    retirada — sin overloads ambiguos); fecha null = día operativo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261121190000_adn009_sr_postmerge_hardening.sql'),
  'utf8',
);

const MigrationHelper = {
  functionBody(name: string): string {
    const start = MIGRATION.indexOf(`FUNCTION public.${name}(`);
    if (start === -1) throw new Error(`función ${name} no encontrada en la migración`);
    const fnStart = MIGRATION.indexOf('AS $function$', start);
    const fnEnd = MIGRATION.indexOf('$function$;', fnStart);
    if (fnStart === -1 || fnEnd === -1) throw new Error(`cuerpo de ${name} no delimitado`);
    return MIGRATION.slice(fnStart, fnEnd);
  },
};

describe('ADN-009 · migración 20261121190000 — contrato estático', () => {
  describe('§5 — gate de gestión (Alternativa B drafts / A batch)', () => {
    it('helper can_manage_store_as = espejo DB de canManageStore (admin/manager/encargado + is_admin_check)', () => {
      const body = MigrationHelper.functionBody('can_manage_store_as');
      expect(body).toContain('is_admin_check(p_user_id)');
      expect(body).toMatch(/m\.role IN \('admin', 'manager', 'encargado'\)/);
      expect(body).toMatch(/m\.status = 'active'/);
    });

    it('los RPC de borradores gatean con can_manage_store_as (no solo acceso de miembro)', () => {
      expect(MigrationHelper.functionBody('create_received_service_draft')).toContain(
        'public.can_manage_store_as(v_caller_uid, p_store_id)',
      );
      expect(MigrationHelper.functionBody('update_received_service_draft')).toContain(
        'public.can_manage_store_as(v_caller_uid, v_store_id)',
      );
    });

    it('la identidad del actor NO se toma de parámetros para sesiones autenticadas (anti-spoofing)', () => {
      const createBody = MigrationHelper.functionBody('create_received_service_draft');
      expect(createBody).toMatch(/WHEN auth\.role\(\) = 'service_role' THEN COALESCE\(p_created_by, auth\.uid\(\)\)\s+ELSE auth\.uid\(\)/);
      const updateBody = MigrationHelper.functionBody('update_received_service_draft');
      expect(updateBody).toMatch(/ELSE auth\.uid\(\)/);
    });

    it('el batch queda service_role EXCLUSIVO (REVOKE authenticated + GRANT service_role)', () => {
      expect(MIGRATION).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.register_supplier_payment_batch\(uuid, text, uuid, jsonb, uuid, timestamptz, text\) FROM PUBLIC, anon, authenticated;/,
      );
      expect(MIGRATION).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.register_supplier_payment_batch\(uuid, text, uuid, jsonb, uuid, timestamptz, text\) TO service_role;/,
      );
    });
  });

  describe('§3 — contrato canónico external_transfer', () => {
    it('el batch normaliza el heredado zelle → external_transfer y JAMÁS lo persiste como valor nuevo', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      expect(body).toContain("IF lower(v_method) = 'zelle' THEN v_method := 'external_transfer'; END IF;");
      // la lista heredada ('cash','transfer','zelle') NO vuelve a aparecer como whitelist
      expect(body).not.toMatch(/NOT IN \('cash', 'transfer', 'zelle'\)/);
      expect(body).toMatch(/v_method NOT IN \('cash', 'transfer', 'external_transfer'\)/);
    });

    it('el motor individual conserva la normalización CP-FIN-004 y su whitelist canónica', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment');
      expect(body).toContain("IF lower(btrim(COALESCE(p_payment_method, ''))) = 'zelle' THEN p_payment_method := 'external_transfer'; END IF;");
      expect(body).toMatch(/p_payment_method NOT IN \('cash', 'transfer', 'external_transfer'\)/);
    });

    it('restricción de moneda de Transf. Exterior en AMBOS caminos (riel divisa USD/EUR, pre-check temprano)', () => {
      expect(MigrationHelper.functionBody('register_supplier_payment')).toContain(
        "IF p_payment_method = 'external_transfer' AND p_currency NOT IN ('USD', 'EUR') THEN",
      );
      expect(MigrationHelper.functionBody('register_supplier_payment_batch')).toContain(
        "IF v_method = 'external_transfer' AND v_currency NOT IN ('USD', 'EUR') THEN",
      );
    });
  });

  describe('§4 — concurrencia: serialización compartida', () => {
    it('el motor individual bloquea la fila del documento (FOR UPDATE) ANTES de idempotencia y saldo', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment');
      const lockPos = body.indexOf('FOR UPDATE');
      const idemPos = body.indexOf('p_idempotency_key IS NOT NULL');
      const paidPos = body.indexOf('INTO v_paid');
      expect(lockPos).toBeGreaterThan(-1);
      expect(idemPos).toBeGreaterThan(lockPos);
      expect(paidPos).toBeGreaterThan(lockPos);
      expect(body).toMatch(/FROM public\.received_services WHERE id = p_ref_id FOR UPDATE/);
    });

    it('el batch bloquea el documento PRIMERO y lee el saldo DESPUÉS del lock', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      const lockPos = body.indexOf('FOR UPDATE');
      const paidPos = body.indexOf('INTO v_paid');
      const overpayPos = body.indexOf('ERR_BATCH_OVERPAY');
      expect(lockPos).toBeGreaterThan(-1);
      expect(paidPos).toBeGreaterThan(lockPos);
      expect(overpayPos).toBeGreaterThan(paidPos);
    });

    it('estado del servicio comprobado tras el lock: solo ACTIVO admite pagos (batch y motor)', () => {
      const engine = MigrationHelper.functionBody('register_supplier_payment');
      expect(engine).toContain("p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active'");
      expect(engine).toContain('ERR_SERVICE_NOT_ACTIVE');
      const batch = MigrationHelper.functionBody('register_supplier_payment_batch');
      expect(batch).toContain("p_ref_type = 'service' AND COALESCE(v_doc_status, 'active') <> 'active'");
      expect(batch).toContain('ERR_SERVICE_NOT_ACTIVE');
    });

    it('el replay fast-path del lote precede al overpay (reenvío idéntico NO es overpay)', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      const replayPos = body.indexOf('IF v_replay_complete THEN');
      const overpayPos = body.indexOf('ERR_BATCH_OVERPAY');
      expect(replayPos).toBeGreaterThan(-1);
      expect(overpayPos).toBeGreaterThan(replayPos);
    });
  });

  describe('§7 — idempotencia real en creación de borradores', () => {
    it('el advisory lock se adquiere ANTES de consultar la creation_key (re-consulta tras el lock)', () => {
      const body = MigrationHelper.functionBody('create_received_service_draft');
      const lockPos = body.indexOf('pg_advisory_xact_lock(hashtext(p_store_id::text))');
      const keyQueryPos = body.indexOf("al.metadata->>'creation_key' = v_key");
      expect(lockPos).toBeGreaterThan(-1);
      expect(keyQueryPos).toBeGreaterThan(lockPos);
    });

    it('índice único parcial de creation_key limitado por tienda y operación', () => {
      expect(MIGRATION).toMatch(
        /CREATE UNIQUE INDEX IF NOT EXISTS uq_audit_service_draft_creation_key\s+ON public\.audit_logs \(store_id, \(metadata->>'creation_key'\)\)\s+WHERE action = 'SERVICE_DRAFT_CREATED' AND metadata->>'creation_key' IS NOT NULL;/,
      );
    });

    it('EXCEPTION unique_violation revierte la creación completa y devuelve el borrador ganador', () => {
      const body = MigrationHelper.functionBody('create_received_service_draft');
      expect(body).toContain('EXCEPTION');
      expect(body).toContain('WHEN unique_violation THEN');
      expect(body).toContain("'duplicate', true");
      expect(body).toMatch(/RAISE;\s+-- unique_violation ajeno/);
    });
  });

  describe('§9 — update_received_service_draft: patch tri-state', () => {
    it('nueva firma /3 (service_id, actor_id, patch) y firma /15 RETIRADA (sin overloads ambiguos)', () => {
      expect(MIGRATION).toMatch(
        /DROP FUNCTION IF EXISTS public\.update_received_service_draft\(uuid, uuid, text, uuid, uuid, jsonb, uuid, text, numeric, date, text, text, text, jsonb, jsonb\);/,
      );
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain('v_patch jsonb := COALESCE(p_patch, \'{}\'::jsonb)');
    });

    it('tri-state por presencia de clave (CASE por v_patch ? clave, no COALESCE ambiguo)', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain("CASE WHEN v_patch ? 'reference_doc' THEN v_reference_doc ELSE reference_doc END");
      expect(body).toContain("CASE WHEN v_patch ? 'observations' THEN v_observations ELSE observations END");
    });

    it('service_date NULL restablece al día operativo ACTUAL (America/Havana) + revalida la política temporal', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain('jsonb_typeof(v_patch->\'service_date\') = \'null\'');
      // Día de NEGOCIO Habana (canon CP-FIN-004 / todayBusinessDay): CURRENT_DATE
      // corre en UTC y tras las 20:00 Habana fechaba mañana (documento futuro).
      expect(body).toMatch(/v_service_date := \(now\(\) AT TIME ZONE 'America\/Havana'\)::date;/);
      expect(body).toContain('validate_operation_date(v_service_date::timestamp with time zone, v_store_id)');
    });

    it('identidad atómica con snapshot desde la fuente autorizada y coherencia nombre/IDs', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain('FROM suppliers s');
      expect(body).toContain('adn008_master_party_valid_for_store(v_mid, v_store_id)');
      expect(body).toContain('ERR_SUPPLIER_IDENTITY_MISMATCH');
      // identidad limpiada → snapshot limpio (nunca nombre nuevo con ID antiguo)
      expect(body).toContain('v_supplier := NULL;');
      expect(body).toContain('v_meta := NULL;');
    });

    it('vínculos: array = reemplazo completo | null = borrar todos | ausente = conservar', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain("IF v_patch ? 'receipt_ids' THEN");
      expect(body).toContain("IF v_patch ? 'production_order_ids' THEN");
    });
  });

  describe('invariantes financieros y compatibilidad', () => {
    it('create_received_service_v2 y set_received_service_status NO se tocan en esta migración', () => {
      expect(MIGRATION).not.toContain('FUNCTION public.create_received_service_v2');
      expect(MIGRATION).not.toContain('FUNCTION public.set_received_service_status');
    });

    it('el insert del motor mantiene payment_transactions y la columna generated amount_cup (sin cambios de esquema)', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment');
      expect(body).toContain('INSERT INTO public.payment_transactions (');
      expect(body).toContain('amount_cup');
    });

    it('los draft RPC conservan EXECUTE para authenticated (el gate vive en el cuerpo — Alternativa B)', () => {
      expect(MIGRATION).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.create_received_service_draft\([^)]*\) TO authenticated, service_role;/,
      );
      expect(MIGRATION).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.update_received_service_draft\(uuid, uuid, jsonb\) TO authenticated, service_role;/,
      );
    });
  });
});
