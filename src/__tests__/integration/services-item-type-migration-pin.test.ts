/**
 * services-item-type-migration-pin.test.ts — MISIÓN TIPO-DE-ARTÍCULO (2026-10-19).
 *
 * Pin de doctrina sobre la migración 20261020000001 (replay estático, sin BD):
 *   1. get_products_for_pos y get_paginated_products_v2 retornan is_service
 *      (la capa de lectura que antes ocultaba el campo al frontend).
 *   2. create_sale_v2 NO se redefinió (ya respetaba is_service desde
 *      20261017000000 — líneas 321-326 y 736-743): la misión NO toca la
 *      función de venta vigente.
 *   3. Los 4 RPC post-venta tienen el guard is_service (no crean stock
 *      fantasma para servicios): create_devolution_v2, void_transaction,
 *      reverse_transaction_v2, reverse_devolution.
 *   4. create_transfer rechaza servicios explícitamente y su producto
 *      espejo copia is_service.
 *   5. void_transaction además filtra product_id IS NOT NULL (bug latente
 *      de items de close_service_order_as_sale).
 *   6. Ninguna de las funciones redefinidas cambia firma/SECURITY DEFINER
 *      (grep negativo de DROP CASCADE y de cambios de grants en la migración).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase/migrations/20261020000001_services_item_type_model.sql'),
  'utf-8',
);

describe('MISIÓN TIPO-DE-ARTÍCULO — pin de doctrina SQL (20261020000001)', () => {

  it('1 · RPCs de lectura exponen is_service', () => {
    // get_products_for_pos: columna en RETURNS TABLE + COALESCE(p.is_service, false)
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.get_products_for_pos\(/);
    expect(MIGRATION).toMatch(/on_promotion boolean,\s+is_service boolean\s+\)/);
    expect((MIGRATION.match(/COALESCE\(p\.is_service, false\)/g) || []).length).toBeGreaterThanOrEqual(3);
    // get_paginated_products_v2: columna junto a is_complete
    expect(MIGRATION).toMatch(/is_complete boolean,\s+is_service boolean,\s+total_count bigint/);
    expect(MIGRATION).toMatch(/COALESCE\(p\.is_service, false\) AS is_service/);
  });

  it('2 · create_sale_v2 NO se redefinió (la función vigente ya respeta is_service)', () => {
    expect(MIGRATION).not.toMatch(/CREATE OR REPLACE FUNCTION public\.create_sale_v2\b/);
    // La doctrina de venta ya vive en 20261017000000 — verificación cruzada:
    const saleMig = readFileSync(
      join(process.cwd(), 'supabase/migrations/20261017000000_pos_payment_incidents_negative_guard.sql'),
      'utf-8',
    );
    expect(saleMig).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.products WHERE id = v_pid AND is_service = true\) THEN/);
  });

  it('3 · guards is_service en los 4 RPC post-venta (sin stock fantasma)', () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.create_devolution_v2\(/);
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.void_transaction\(/);
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_transaction_v2\(/);
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.reverse_devolution\(/);
    // El guard existe en el cuerpo de devolución (return no restaura stock)
    const devolutionBody = MIGRATION.split('CREATE OR REPLACE FUNCTION public.create_devolution_v2')[1]?.split('$function$;')[0] || '';
    expect(devolutionBody).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.products WHERE id = v_pid AND is_service = true\) THEN\s+PERFORM public\.register_stock_movement/);
    // void + reverse_transaction_v2: el WHERE del loop excluye servicios
    expect(MIGRATION).toMatch(/AND NOT EXISTS \(SELECT 1 FROM public\.products pr WHERE pr\.id = ti\.product_id AND pr\.is_service = true\)/);
    // reverse_devolution: guard envuelve fn_recalc_wac + register_stock_movement
    const reverseDevBody = MIGRATION.split('CREATE OR REPLACE FUNCTION public.reverse_devolution')[1]?.split('$function$;')[0] || '';
    expect(reverseDevBody).toMatch(/IF NOT EXISTS \(SELECT 1 FROM public\.products pr WHERE pr\.id = v_item\.product_id AND pr\.is_service = true\) THEN/);
  });

  it('4 · create_transfer: rechazo explícito de servicios + espejo copia is_service', () => {
    expect(MIGRATION).toMatch(/CREATE OR REPLACE FUNCTION public\.create_transfer\(/);
    expect(MIGRATION).toMatch(/ERR_SERVICE_NOT_TRANSFERABLE/);
    expect(MIGRATION).toMatch(/COALESCE\(p\.is_service, false\) AS is_service,/);
    // El INSERT espejo incluye la columna
    expect(MIGRATION).toMatch(/is_active, category, is_service\s+\) VALUES \(/);
    expect(MIGRATION).toMatch(/COALESCE\(v_origin_product\.category, 'General'\),\s+-- H-049: categoría del origen\s+v_origin_product\.is_service/);
  });

  it('5 · void_transaction filtra product_id IS NOT NULL (bug latente de items sin producto)', () => {
    const voidBody = MIGRATION.split('CREATE OR REPLACE FUNCTION public.void_transaction')[1]?.split('$function$;')[0] || '';
    expect(voidBody).toMatch(/WHERE ti\.transaction_id = p_transaction_id\s+AND ti\.product_id IS NOT NULL/);
  });

  it('6 · sin DROP CASCADE ni cambios de grants en la migración (invariantes de contrato)', () => {
    expect(MIGRATION).not.toMatch(/DROP\s+(TABLE|FUNCTION|TRIGGER|VIEW|TYPE)[^;]*CASCADE/i);
    expect(MIGRATION).not.toMatch(/\bREVOKE\b/);
    expect(MIGRATION).not.toMatch(/\bGRANT\s+EXECUTE\b/);
    // SEARCH_PATH / SECURITY DEFINER de cada función redefinida se conservan
    expect(MIGRATION).toMatch(/SET search_path TO 'public', 'pg_temp'\s+AS \$function\$/);
    expect(MIGRATION).toMatch(/SET search_path TO 'pg_catalog', 'public'\s+AS \$function\$/);
    expect(MIGRATION).toMatch(/SET search_path TO 'public'\s+AS \$function\$/);
  });
});
