/**
 * CP-AP-ACCOUNTING-INTEGRITY-AND-SUPPLIER-RECONCILIATION-001 — FASE 8.
 *
 * Test de contrato de las migraciones del ciclo de vida de pagos y del
 * saneamiento TiendaPueblo (patrón cp-fin110-enervida-migration.test.ts:
 * asserts estáticos sobre el SQL, sin BD). Valida lo no negociable de la
 * regla empresarial (misión §2): un documento con pagos confirmados o
 * liquidados NO se anula/revierte ignorando sus pagos — primero se resuelve
 * cada pago con el procedimiento oficial de reversión.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const GUARDS = resolve(process.cwd(), 'supabase/migrations/20261126120000_cp_apai_payment_lifecycle_guards.sql');
const TIENDA = resolve(process.cwd(), 'supabase/migrations/20261126120100_cp_apai_tiendapueblo_supplier_link.sql');
const sql = readFileSync(GUARDS, 'utf8');
const sqlTienda = readFileSync(TIENDA, 'utf8');

const LIVE_PAYMENT_PREDICATE = `
    FROM public.payment_transactions t
   WHERE t.ref_type = 'receipt' AND t.ref_id = p_receipt_id
     AND COALESCE(t.direction, 'in') = 'in'
     AND NOT EXISTS (SELECT 1 FROM public.payment_transactions c
                      WHERE c.reverses_payment_id = t.id)`;

describe('migración 20261126120000 — guards del ciclo de vida de pagos', () => {
  it('existe, transaccional y reemite las 4 vías de anulación', () => {
    expect(sql).toContain('20261126120000');
    expect(sql).toMatch(/^BEGIN;/m);
    expect(sql).toMatch(/COMMIT;/m);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.reverse_receipt_v2');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.void_pending_reception');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.void_received_service_with_reversal');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.set_received_service_status');
  });

  it('§FASE2: las 4 vías tienen el GUARD de pagos vivos (in sin contra-fila)', () => {
    // Recepciones: código de error propio en ambas vías (pending + active)
    expect(sql).toContain("ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS: pagos_vivos=% importe_vivo=% total_documento=% saldo_actual=%");
    expect((sql.match(/RAISE EXCEPTION 'ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS/g) || []).length).toBe(2);
    // Servicios: código propio en las dos vías (void RPC + status RPC)
    expect((sql.match(/RAISE EXCEPTION 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS/g) || []).length).toBe(2);
  });

  it('la definición de pago vivo replica exactamente la del mecanismo oficial', () => {
    // direction='in' (o NULL legado) SIN contra-fila reversal apuntándole —
    // misma semántica que reverse_supplier_payment / update_payment_status.
    const receiptGuards = (sql.match(
      /COALESCE\(t\.direction, 'in'\) = 'in'\s+AND NOT EXISTS \(SELECT 1 FROM public\.payment_transactions c\s+WHERE c\.reverses_payment_id = t\.id\)/g,
    ) || []).length;
    expect(receiptGuards).toBe(2); // reverse_receipt_v2 + void_pending_reception
    const serviceGuards = (sql.match(
      /COALESCE\(t\.direction, 'in'\) = 'in'\s+AND NOT EXISTS \(SELECT 1 FROM payment_transactions c\s+WHERE c\.reverses_payment_id = t\.id\)/g,
    ) || []).length;
    expect(serviceGuards).toBe(2); // void_received_service_with_reversal + set_received_service_status
  });

  it('los guards van DESPUÉS de la autorización y ANTES de cualquier efecto', () => {
    // reverse_receipt_v2: guard tras can_reverse_document (W9-B10) y antes del bucle de stock.
    const authIdx = sql.indexOf("IF NOT public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt') THEN");
    const guardIdx = sql.indexOf("RAISE EXCEPTION 'ERR_RECEIPT_HAS_UNRESOLVED_PAYMENTS");
    const stockLoopIdx = sql.indexOf('FOR v_item IN SELECT * FROM public.receipt_items');
    expect(authIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeGreaterThan(authIdx);
    expect(stockLoopIdx).toBeGreaterThan(guardIdx);
    // void de servicios: guard antes de los DELETE de links/distribuciones.
    const svcGuardIdx = sql.indexOf("RAISE EXCEPTION 'ERR_SERVICE_HAS_UNRESOLVED_PAYMENTS");
    const linksDeleteIdx = sql.indexOf('DELETE FROM service_reception_links');
    expect(linksDeleteIdx).toBeGreaterThan(svcGuardIdx);
  });

  it('no debilita seguridad: sin cambios de ACL, triggers intactos, bodies completos', () => {
    // CREATE OR REPLACE preserva ACL — la migración NO contiene GRANT/REVOKE.
    expect(sql).not.toMatch(/^(GRANT|REVOKE)/m);
    // Conserva las capas de autorización originales reemitidas.
    expect(sql).toContain('public.has_store_access_as(v_caller_uid, v_receipt.store_id)');
    expect(sql).toContain("public.can_reverse_document(v_caller_uid, v_receipt.store_id, 'receipt')");
    expect(sql).toContain('PERFORM public.validate_operation_date(p_operation_date, v_store_id)');
    // Conserva la reversión de stock exacta (WAC) y los asientos compensatorios.
    expect(sql).toContain("public.fn_recalc_wac(");
    expect(sql).toContain("'purchase_reverse'::movement_type");
    expect(sql).toContain('fin_post_payment_annulment');
    // Conserva trazabilidad de auditoría.
    expect(sql).toContain("'REVERSE_RECEIPT_V2', 'receipts'");
    expect(sql).toContain("'SERVICE_VOIDED', 'received_services'");
  });

  it('bucles de auto-reversión conservados como defensa en profundidad (no mecanismo paralelo)', () => {
    // Misión §4.1: no crear un segundo mecanismo. Los bucles existentes de
    // contra-filas siguen presentes; con el guard activo son inalcanzables
    // para pagos vivos (verificable por la condición NOT EXISTS interna).
    const counterRowInserts = (sql.match(/'reversal',\s+v_pay\.id/g) || []).length;
    expect(counterRowInserts).toBe(2);
    expect(sql).toContain("'reversal:' || v_pay.id::text");
  });
});

describe('migración 20261126120100 — saneamiento Tienda Pueblo / TiendaPueblo', () => {
  it('existe, transaccional, con guards de identificación del documento', () => {
    expect(sqlTienda).toContain('20261126120100');
    expect(sqlTienda).toMatch(/^BEGIN;/m);
    expect(sqlTienda).toMatch(/COMMIT;/m);
    expect(sqlTienda).toContain("service_number = 'SRV-20261026-00087'");
    expect(sqlTienda).toContain("reference_doc = 'C26102026'");
    expect(sqlTienda).toContain("supplier = 'TiendaPueblo'");
    expect(sqlTienda).toContain('supplier_id IS NULL');
  });

  it('idempotente y fail-closed: no-op si no existe o si hay ambigüedad', () => {
    expect(sqlTienda).toMatch(/IF NOT FOUND THEN\s+RAISE NOTICE[^;]*no-op/);
    expect(sqlTienda).toMatch(/sin proveedor canónico/); // no inventa identidad
    expect(sqlTienda).toMatch(/ambigüedad de proveedores canónicos/); // >1 canónico → detener
  });

  it('modifica SOLO la relación con el proveedor — nunca importes/pagos/estados', () => {
    const updateBlock = sqlTienda.slice(
      sqlTienda.indexOf('UPDATE public.received_services'),
      sqlTienda.indexOf('WHERE id = v_service.id;', sqlTienda.indexOf('UPDATE public.received_services')) + 1,
    );
    expect(updateBlock).toContain('SET supplier = v_canonical_name');
    expect(updateBlock).toContain('supplier_id = v_canonical_id');
    expect(updateBlock).toContain('updated_at = now()');
    expect(updateBlock).not.toMatch(/total_amount|paid_amount|payment_status|status\s*=/);
    // La migración entera tampoco toca pagos ni asientos.
    expect(sqlTienda).not.toMatch(/payment_transactions|fin_entries|fin_movements/);
  });

  it('trazabilidad: audit SR_SUPPLIER_NORMALIZED con antes/después y reversibilidad', () => {
    expect(sqlTienda).toContain("'SR_SUPPLIER_NORMALIZED'");
    expect(sqlTienda).toContain("'supplier_before', v_service.supplier");
    expect(sqlTienda).toContain("'supplier_after', v_canonical_name");
    expect(sqlTienda).toContain("'reversible', true");
    expect(sqlTienda).toContain('rollback_hint');
  });
});

describe('migración 20261126120200 — fix del trigger de inmutabilidad (motor de pagos sobre voided)', () => {
  const sqlFix = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261126120200_cp_apai_void_service_payment_engine_fix.sql'), 'utf8');

  it('existe, transaccional y reemite prevent_received_service_edit', () => {
    expect(sqlFix).toContain('20261126120200');
    expect(sqlFix).toMatch(/^BEGIN;/m);
    expect(sqlFix).toMatch(/COMMIT;/m);
    expect(sqlFix).toContain('CREATE OR REPLACE FUNCTION public.prevent_received_service_edit');
  });

  it('habilita la reversión oficial sobre servicios voided (bug latente F-23112026)', () => {
    // La cadena del fallo: reverse_supplier_payment → contra-fila →
    // update_payment_status → UPDATE del voided → ERR_SERVICE_VOIDED.
    // El fix permite el neteo SOLO de campos de pago con estado intacto.
    expect(sqlFix).toContain('solo el motor de pagos netea sus campos de pago');
    expect(sqlFix).toContain('NEW.status IS DISTINCT FROM OLD.status');
    expect(sqlFix).toContain('NEW.total_amount IS DISTINCT FROM OLD.total_amount');
    expect(sqlFix).toContain('NEW.supplier IS DISTINCT FROM OLD.supplier');
    expect(sqlFix).toContain('NEW.service_number IS DISTINCT FROM OLD.service_number');
  });

  it('conserva el resto del contrato del trigger (inmutabilidad estructural)', () => {
    expect(sqlFix).toContain('ERR_SERVICE_NUMBER_IMMUTABLE');
    expect(sqlFix).toContain('ERR_STORE_ID_IMMUTABLE');
    expect(sqlFix).toContain('ERR_TOTAL_BELOW_PAID');
    expect(sqlFix).toContain('ERR_TOTAL_BELOW_DISTRIBUTIONS');
    expect(sqlFix).toContain('PERFORM public.validate_operation_date(NEW.service_date::timestamp with time zone, NEW.store_id)');
    // Las configs de escape de los RPCs se conservan.
    expect(sqlFix).toContain("current_setting('app.is_void_rpc', true)");
    expect(sqlFix).toContain("current_setting('app.is_status_change_rpc', true)");
  });
});
