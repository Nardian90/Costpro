/**
 * CP-PROD-DEL-001 (2026-11-13) — migración 20261113140000: el borrado y la
 * activación/desactivación de productos fallaban con 23514
 * (audit_logs_store_id_check) porque insertaban la auditoría SIN la columna
 * store_id (la tienda iba embebida dentro de old_data/new_data) → el DELETE
 * completo se revertía y la interfaz mostraba el error crudo de SQL.
 *
 * Contrato estático verificado:
 *  · managed_delete_product / managed_toggle_product_active: auditoría con
 *    store_id EXPLÍCITO (columna) + cuerpo vivo certificado preservado
 *    (autorización has_store_access, chequeo de movimientos con su mensaje
 *    histórico, DELETEs por tienda, SECURITY DEFINER + search_path).
 *  · Pre-chequeos con mensajes comprensibles para las FK RESTRICT / NO ACTION
 *    hacia products (ventas legacy, movimientos de inventario, compras,
 *    devoluciones, solicitudes de material, transferencias, vales de salida,
 *    conteos físicos, producción) — sin 23503 crudo.
 *  · Semántica multitienda intacta: eliminar el local de una tienda NO toca
 *    master_products (el maestro se conserva; su ciclo de vida es gobernado).
 *  · Idempotente (CREATE OR REPLACE) y sin cambios de firma ni de ACL.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261113140000_cp_products_audit_store_id.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

function fnBody(sql: string, fnName: string): string {
  const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fnName}`);
  const end = sql.indexOf('$function$;', start);
  return sql.slice(start, end);
}

describe('20261113140000 — fix 23514 en auditoría de borrado/desactivación de productos', () => {
  const s = read(MIGRATION);
  const del = fnBody(s, 'managed_delete_product');
  const tog = fnBody(s, 'managed_toggle_product_active');

  it('ambas RPCs insertan la auditoría con store_id EXPLÍCITO en la columna', () => {
    expect(del).toMatch(/INSERT INTO public\.audit_logs \(user_id, action, table_name, record_id, old_data, store_id\)/);
    expect(del).toMatch(/jsonb_build_object\('name', v_product_name, 'store_id', v_store_id\),\s*v_store_id/);
    expect(tog).toMatch(/INSERT INTO public\.audit_logs \(user_id, action, table_name, record_id, old_data, new_data, store_id\)/);
    expect(tog).toMatch(/jsonb_build_object\('is_active', p_is_active, 'store_id', v_store_id\),\s*v_store_id/);
  });

  it('cuerpo vivo preservado: autorización y chequeo de movimientos sin cambios', () => {
    for (const body of [del, tog]) {
      expect(body).toMatch(/SECURITY DEFINER/);
      expect(body).toMatch(/SET search_path TO 'public', 'pg_temp'/);
      expect(body).toMatch(/IF NOT public\.has_store_access\(v_store_id\) THEN/);
      expect(body).toMatch(/RAISE EXCEPTION 'Product tenant mismatch' USING ERRCODE = '42501'/);
    }
    expect(del).toMatch(/SELECT 1 FROM public\.transaction_items ti WHERE ti\.product_id = p_product_id/);
    expect(del).toMatch(/RAISE EXCEPTION 'No se puede eliminar un producto con movimientos\. Desactivelo en su lugar\.'/);
    // Borrado por tienda (no global)
    expect(del).toMatch(/DELETE FROM public\.products\s+WHERE id = p_product_id\s+AND store_id = v_store_id/);
    // Semántica maestro: NO toca master_products (el maestro se conserva)
    expect(del).not.toMatch(/master_products/);
  });

  it('pre-chequeos con mensajes comprensibles para las FK RESTRICT / NO ACTION (sin 23503 crudo)', () => {
    expect(del).toMatch(/public\.sale_items si WHERE si\.product_id = p_product_id[\s\S]*?ventas registradas/);
    expect(del).toMatch(/public\.inventory_movements im WHERE im\.product_id = p_product_id[\s\S]*?movimientos de inventario registrados/);
    expect(del).toMatch(/public\.inventory_adjustment_items ia WHERE ia\.product_id = p_product_id/);
    expect(del).toMatch(/public\.inventory_batches ib WHERE ib\.product_id = p_product_id/);
    expect(del).toMatch(/public\.purchase_items pi WHERE pi\.product_id = p_product_id[\s\S]*?compras registradas/);
    expect(del).toMatch(/public\.devolution_items dv WHERE dv\.product_id = p_product_id[\s\S]*?devoluciones registradas/);
    expect(del).toMatch(/public\.material_request_items mr WHERE mr\.product_id = p_product_id[\s\S]*?solicitudes de material/);
    expect(del).toMatch(/public\.transfer_items tr WHERE tr\.product_id = p_product_id[\s\S]*?transferencias entre tiendas/);
    expect(del).toMatch(/public\.issue_slip_items isv WHERE isv\.product_id = p_product_id[\s\S]*?vales de salida/);
    expect(del).toMatch(/public\.physical_inventory_items phi WHERE phi\.product_id = p_product_id[\s\S]*?conteos físicos/);
    expect(del).toMatch(/public\.production_order_items poi WHERE poi\.product_id = p_product_id[\s\S]*?órdenes de producción/);
    expect(del).toMatch(/public\.production_orders po WHERE po\.output_product_id = p_product_id/);
    // Los pre-chequeos corren ANTES de los DELETE (fail-fast sin efectos)
    expect(del.indexOf('sale_items')).toBeLessThan(del.indexOf('DELETE FROM public.inventory'));
  });

  it('idempotente (CREATE OR REPLACE) y sin GRANT/REVOKE nuevos (ACL certificada intacta)', () => {
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.managed_delete_product\(p_product_id uuid\)/);
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.managed_toggle_product_active\(p_product_id uuid, p_is_active boolean\)/);
    expect(s).not.toMatch(/^\s*(GRANT|REVOKE) EXECUTE/m);
  });
});
