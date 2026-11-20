/**
 * adn008-services-drafts-migration.test.ts — ADN-SERVICES-RECEIVED-CREATION-WORKFLOW-008
 *
 * Contrato ESTÁTICO de la migración 20261121120000 (patrón cp-fin-partida-doble):
 *  · Borradores: RPC draft con proveedor OPCIONAL, status SIEMPRE 'draft',
 *    idempotencia por creation_key, vínculos validados; gate de confirmación
 *    en set_received_service_status (proveedor + importe).
 *  · Identidad de proveedor: columnas NULL-ables + ownership fail-closed.
 *  · Multipago atómico: batch 1..20 componentes, pre-check del saldo en la
 *    moneda del documento, idempotencia de bloque, reuso del motor.
 *  · create_received_service_v2 y el trigger CP-FIN NO se tocan (cero riesgo).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261121120000_adn008_sr_drafts_supplier_multipago.sql'),
  'utf8',
);

describe('ADN-008 · migración 20261121120000 — contrato estático', () => {
  describe('§4 identidad de proveedor (aditivo, sin tocar históricos)', () => {
    it('añade las 6 columnas de identidad con IF NOT EXISTS (idempotente, NULL-ables)', () => {
      expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS supplier_id uuid');
      expect(MIGRATION).toContain('ADD COLUMN IF NOT EXISTS supplier_master_party_id uuid');
      expect(MigrationHelper.columnNames().length).toBe(6);
    });

    it('valida ownership fail-closed del proveedor local y del tercero maestro', () => {
      expect(MIGRATION).toContain('ERR_SUPPLIER_INVALID');
      expect(MIGRATION).toContain('ERR_SUPPLIER_MASTER_INVALID');
      expect(MIGRATION).toContain('adn008_supplier_belongs_to_store');
      expect(MIGRATION).toContain('adn008_master_party_valid_for_store');
      // El maestro se valida por TENANT de la tienda + status active
      expect(MIGRATION).toMatch(/master_parties mp\s+JOIN public\.stores st ON st\.tenant_id = mp\.tenant_id/);
      expect(MIGRATION).toMatch(/mp\.status = 'active'/);
    });
  });

  describe('§3 borradores — create_received_service_draft', () => {
    it('SECURITY DEFINER, actor-explícito y advisory lock (doctrina del repo)', () => {
      expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.create_received_service_draft\(/);
      expect(MIGRATION).toContain('pg_advisory_xact_lock(hashtext(p_store_id::text))');
      expect(MIGRATION).toContain('auth.role()');
      expect(MIGRATION).toContain('has_store_access_as(v_caller_uid, p_store_id)');
    });

    it('el proveedor es OPCIONAL en el borrador y NUNCA se inventa un dato', () => {
      // El bloque del draft NO puede exigir proveedor de forma incondicional:
      // entre su inicio y el primer INSERT no existe un ERR_SUPPLIER_REQUIRED.
      const draftBody = MigrationHelper.functionBody('create_received_service_draft');
      expect(draftBody).not.toContain('ERR_SUPPLIER_REQUIRED');
      expect(draftBody).toContain("v_supplier text := NULLIF(btrim(COALESCE(p_supplier, '')), '')");
    });

    it('inserta SIEMPRE status=draft (cero efectos financieros de un borrador)', () => {
      const draftBody = MigrationHelper.functionBody('create_received_service_draft');
      expect(draftBody).toContain("'draft'");
      // El RPC de borrador NUNCA activa ni cambia el estado a active
      // (la activación pertenece a set_received_service_status).
      expect(draftBody).not.toMatch(/UPDATE received_services SET/);
      expect(draftBody).not.toContain('set_received_service_status');
    });

    it('idempotencia de creación por creation_key (anti doble-clic / reintento)', () => {
      const draftBody = MigrationHelper.functionBody('create_received_service_draft');
      expect(draftBody).toContain("al.action = 'SERVICE_DRAFT_CREATED'");
      expect(draftBody).toContain("al.metadata->>'creation_key'");
      expect(draftBody).toContain("'duplicate', true");
    });

    it('valida el gate temporal (validate_operation_date) y los vínculos documentales', () => {
      const draftBody = MigrationHelper.functionBody('create_received_service_draft');
      expect(draftBody).toContain('validate_operation_date');
      expect(draftBody).toContain('ERR_RECEIPT_INVALID');
      expect(draftBody).toContain('ERR_PRODUCTION_ORDER_INVALID');
    });

    it('ACL al patrón del repo (REVOKE PUBLIC/anon; GRANT authenticated+service_role)', () => {
      expect(MIGRATION).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.create_received_service_draft\([^)]*\) FROM PUBLIC, anon;[\s\S]*?GRANT EXECUTE ON FUNCTION public\.create_received_service_draft\([^)]*\) TO authenticated, service_role;/,
      );
    });
  });

  describe('§3.3 edición de borradores — update_received_service_draft', () => {
    it('solo status=draft; fail-closed con pagos o distribuciones existentes', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain("v_status <> 'draft'");
      expect(body).toContain('ERR_NOT_DRAFT');
      expect(body).toContain('ERR_HAS_PAYMENTS');
      expect(body).toContain('ERR_HAS_DISTRIBUTIONS');
    });

    it('audita en service_audit_log y valida la fecha operativa', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toContain("INSERT INTO service_audit_log");
      expect(body).toContain("'draft_updated'");
      expect(body).toContain('validate_operation_date');
    });

    it('los vínculos son reemplazo completo con las mismas validaciones', () => {
      const body = MigrationHelper.functionBody('update_received_service_draft');
      expect(body).toMatch(/DELETE FROM service_reception_links WHERE service_id = p_service_id/);
      expect(body).toMatch(/DELETE FROM service_production_order_links WHERE service_id = p_service_id/);
    });
  });

  describe('§7 confirmación — gate en set_received_service_status', () => {
    it('draft→active exige proveedor no vacío e importe > 0', () => {
      const body = MigrationHelper.functionBody('set_received_service_status');
      expect(body).toContain("v_current = 'draft' AND p_new_status = 'active'");
      expect(body).toContain('ERR_SUPPLIER_REQUIRED');
      expect(body).toContain('ERR_INVALID_AMOUNT');
    });

    it('mantiene la MISMA firma y el contexto de estado (sin tocar el trigger de edición)', () => {
      expect(MIGRATION).toMatch(
        /set_received_service_status\(p_service_id uuid, p_new_status text, p_user_id uuid DEFAULT NULL::uuid, p_reason text DEFAULT NULL::text\)/,
      );
      expect(MIGRATION).toContain("set_config('app.is_status_change_rpc', 'true', true)");
    });
  });

  describe('§5 liquidación multipago — register_supplier_payment_batch', () => {
    it('lote de 1..20 componentes con catálogo canónico (medio × moneda)', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      expect(body).toMatch(/v_comp_count < 1 OR v_comp_count > 20/);
      expect(body).toContain('ERR_BATCH_SIZE');
      expect(body).toMatch(/v_method NOT IN \('cash', 'transfer', 'zelle'\)/);
      expect(body).toMatch(/v_currency NOT IN \('CUP', 'USD', 'EUR', 'MLC'\)/);
      expect(body).toContain('ERR_COMPONENT_INVALID');
    });

    it('pre-check de la suma contra el saldo pendiente EN LA MONEDA DEL DOCUMENTO', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      expect(body).toContain('ERR_BATCH_OVERPAY');
      // misma aritmética que el motor (amount_cup → /doc_rate)
      expect(body).toMatch(/pt\.amount_cup \/ v_doc_rate/);
      expect(body).toMatch(/v_sum_in_doc > v_balance/);
    });

    it('reusa register_supplier_payment por componente (mismo motor: tasas fail-closed + asientos)', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      expect(body).toContain('public.register_supplier_payment(');
      expect(body).toContain("v_block_key || ':' || v_idx");
      expect(body).toContain('ERR_TASA_NO_DISPONIBLE');
      expect(body).toContain('store_exchange_rates');
    });

    it('replay idempotente: lote completo ya existente → devuelve ids sin escribir', () => {
      const body = MigrationHelper.functionBody('register_supplier_payment_batch');
      expect(body).toContain('v_replay_complete');
      expect(body).toContain("'replayed', true");
    });

    it('ACL al patrón del repo', () => {
      expect(MIGRATION).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.register_supplier_payment_batch\([^)]*\) FROM PUBLIC, anon;[\s\S]*?GRANT EXECUTE ON FUNCTION public\.register_supplier_payment_batch\([^)]*\) TO authenticated, service_role;/,
      );
    });
  });

  describe('§10 cero regresión — superficies NO tocadas', () => {
    it('create_received_service_v2 NO se modifica (sin riesgo de overloads PGRST203)', () => {
      expect(MIGRATION).not.toContain('CREATE OR REPLACE FUNCTION public.create_received_service_v2');
      expect(MIGRATION).not.toContain('DROP FUNCTION public.create_received_service_v2');
    });

    it('el motor CP-FIN (fin_trg_received_services) NO se modifica: un borrador no contabiliza', () => {
      expect(MIGRATION).not.toMatch(/CREATE OR REPLACE FUNCTION public\.fin_trg_received_services/);
      expect(MIGRATION).not.toMatch(/DROP TRIGGER[\s\S]*fin_trg_received_services/);
      expect(MIGRATION).not.toMatch(/\bfin_post_document_safe\(/);
    });

    it('payment_transactions y PT007 no se relajan (DELETE sigue prohibido)', () => {
      expect(MIGRATION).not.toMatch(/DROP TRIGGER.*validate_payment_transactions_invariants/i);
      expect(MIGRATION).not.toMatch(/ALTER TABLE public\.payment_transactions\b/i);
    });
  });
});

/** Utilidad: extraer el cuerpo AS $function$…$function$ de un RPC de la migración. */
const MigrationHelper = {
  columnNames(): string[] {
    const block = MIGRATION.slice(
      MIGRATION.indexOf('ADD COLUMN IF NOT EXISTS supplier_id'),
      MIGRATION.indexOf('COMMENT ON COLUMN public.received_services.supplier_id'),
    );
    const names = [...block.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
    return [...new Set(names)];
  },
  functionBody(name: string): string {
    const start = MIGRATION.indexOf(`FUNCTION public.${name}(`);
    if (start === -1) throw new Error(`función ${name} no encontrada en la migración`);
    const fnStart = MIGRATION.indexOf('AS $function$', start);
    const fnEnd = MIGRATION.indexOf('$function$;', fnStart);
    if (fnStart === -1 || fnEnd === -1) throw new Error(`cuerpo de ${name} no delimitado`);
    return MIGRATION.slice(fnStart, fnEnd);
  },
};
