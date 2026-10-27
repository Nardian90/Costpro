/**
 * MISIÓN RECEPCIONES (2026-10-27) — Verificación estática de la migración
 * 20261027180000_recepciones_borradores_transaccional.sql.
 *
 * Contrato crítico (las restricciones viven en el SERVIDOR, no en la UI):
 *
 *   1. register_reception (misma firma de 7 params — sin overloads):
 *      1a. ERR_INVOICE_DUPLICATE: chequeo explícito de reference_doc
 *          duplicado ANTES del INSERT (defecto D-B: el 23505 crudo se
 *          reportaba como "SKU ya existe").
 *      1b. Alta TRANSACCIONAL de productos nuevos: item con product_id NULL
 *          + objeto new_product → validación (sku/name obligatorios,
 *          unicidad contra catálogo y dentro del payload, ERR_SKU_EXISTS
 *          con mensaje que guía a seleccionar el existente) + INSERT dentro
 *          de la misma transacción (defecto D-A + huérfanos).
 *      1c. Ambigüedad product_id + new_product → ERR_AMBIGUOUS_ITEM.
 *      1d. Tenant fail-closed (paridad products_tenant_insert).
 *      1e. Guard anti-spoofing v2.12.9 preservado (auth.role/service_role).
 *   2. delete_pending_reception (NUEVA):
 *      2a. FOR UPDATE (concurrencia confirmar/anular/eliminar → 1 gana).
 *      2b. Guard de estado: SOLO pending (active/voided/reversed rechazados).
 *      2c. Autorización multitienda has_store_access_as + anti-spoofing.
 *      2d. Defense-in-depth: rechaza con movimientos o pagos ligados.
 *      2e. Elimina receipt_items + receipt + evento de auditoría.
 *      2f. GRANT EXECUTE a authenticated/service_role.
 *   3. RLS receipts_delete_rls: DELETE directo SOLO status='pending'
 *      (defecto D-D: antes permitía borrar receipts de CUALQUIER estado).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261027180000_recepciones_borradores_transaccional.sql';

function sql(): string {
  return readFileSync(resolve(process.cwd(), MIGRATION), 'utf8');
}

/** Cuerpo de una función CREATE OR REPLACE por nombre (hasta $function$;). */
function fnBody(name: string): string {
  const s = sql();
  const re = new RegExp(
    `CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$function\\$\\n([\\s\\S]*?)\\n\\$function\\$;`
  );
  const m = s.match(re);
  if (!m) throw new Error(`función ${name} no encontrada en la migración`);
  return m[1];
}

describe('migración 20261027180000 — recepciones: borradores + alta transaccional', () => {
  it('existe el archivo de migración', () => {
    expect(sql().length).toBeGreaterThan(5000);
  });

  describe('1. register_reception — firma y validaciones', () => {
    it('conserva la firma de 7 parámetros (sin overloads: new_product viaja en p_items)', () => {
      expect(sql()).toMatch(
        /CREATE OR REPLACE FUNCTION public\.register_reception\(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone DEFAULT now\(\), p_invoice_number text DEFAULT ''::text, p_items jsonb DEFAULT '\[\]'::jsonb, p_user_id uuid DEFAULT NULL::uuid, p_po_id uuid DEFAULT NULL::uuid\)/
      );
    });

    it('1a. ERR_INVOICE_DUPLICATE: chequeo explícito de reference_doc duplicado ANTES del INSERT', () => {
      const body = fnBody('register_reception');
      const checkIdx = body.indexOf('ERR_INVOICE_DUPLICATE');
      const insertIdx = body.indexOf('INSERT INTO public.receipts');
      expect(checkIdx).toBeGreaterThan(-1);
      expect(insertIdx).toBeGreaterThan(-1);
      // El chequeo precede al INSERT: la validación falla sin tocar datos.
      expect(checkIdx).toBeLessThan(insertIdx);
      expect(body).toMatch(/reference_doc = btrim\(p_invoice_number\)/);
    });

    it('1b. alta transaccional: new_product embebido en el item, dentro del bucle', () => {
      const body = fnBody('register_reception');
      expect(body).toContain(`v_item ? 'new_product'`);
      expect(body).toMatch(/INSERT INTO public\.products \(\s*store_id, tenant_id, sku, name, cost_price, price,/);
      // El producto se crea ANTES del chequeo B5 (product must exist) del
      // mismo bucle → el ítem nuevo pasa la validación con el id recién creado.
      const newProductIdx = body.indexOf(`v_item ? 'new_product'`);
      const b5Idx = body.indexOf('ERR_PRODUCT_NOT_IN_STORE');
      expect(newProductIdx).toBeGreaterThan(-1);
      expect(b5Idx).toBeGreaterThan(newProductIdx);
    });

    it('1b. unicidad REAL contra el catálogo con error accionable (defecto D-A)', () => {
      const body = fnBody('register_reception');
      expect(body).toMatch(
        /ERR_SKU_EXISTS: el SKU "%" ya existe en el catálogo de esta tienda\. Selecciona el producto existente en lugar de crearlo de nuevo\./
      );
      expect(body).toMatch(/WHERE store_id = p_store_id AND sku = v_new_sku/);
    });

    it('1b. unicidad dentro del payload (dos items nuevos con el mismo SKU)', () => {
      expect(fnBody('register_reception')).toMatch(
        /ERR_SKU_DUPLICATE_PAYLOAD: el SKU "%" aparece más de una vez entre los productos nuevos de la recepción/
      );
    });

    it('1b. validación de datos del producto nuevo (sku y name obligatorios)', () => {
      const body = fnBody('register_reception');
      expect(body).toMatch(/ERR_NEW_PRODUCT_INVALID: el producto nuevo requiere sku/);
      expect(body).toMatch(/ERR_NEW_PRODUCT_INVALID: el producto nuevo % requiere nombre/);
    });

    it('1c. ambigüedad product_id + new_product rechazada', () => {
      expect(fnBody('register_reception')).toMatch(
        /ERR_AMBIGUOUS_ITEM: el item trae product_id y new_product a la vez/
      );
    });

    it('1d. tenant fail-closed (ERR_STORE_NOT_FOUND si la tienda no resuelve tenant)', () => {
      const body = fnBody('register_reception');
      expect(body).toMatch(/SELECT tenant_id INTO v_new_tenant_id FROM public\.stores WHERE id = p_store_id/);
      expect(body).toMatch(/ERR_STORE_NOT_FOUND: no se pudo resolver el tenant de la tienda %/);
    });

    it('1e. guard anti-spoofing v2.12.9 preservado', () => {
      const body = fnBody('register_reception');
      expect(body).toMatch(
        /v_caller_uid UUID := CASE\s+WHEN auth\.role\(\) = 'service_role' THEN COALESCE\(p_user_id, auth\.uid\(\)\)\s+ELSE auth\.uid\(\)\s+END/
      );
      expect(body).toContain('NOT public.has_store_access_as(v_caller_uid, p_store_id)');
    });

    it('1. comportamiento existente preservado: validaciones B2/B3/B4/B5, WAC y stock', () => {
      const body = fnBody('register_reception');
      expect(body).toContain('ERR_SUPPLIER_REQUIRED');
      expect(body).toContain('ERR_EMPTY_ITEMS');
      expect(body).toContain('ERR_INVALID_UNIT_COST');
      expect(body).toContain('ERR_INVALID_EXCHANGE_RATE');
      expect(body).toContain('ERR_PRODUCT_NOT_IN_STORE');
      expect(body).toContain('public.fn_recalc_wac(');
      expect(body).toContain('public.register_stock_movement(');
      expect(body).toContain("'REGISTER_RECEPTION'");
      // Auditoría extendida con el conteo de productos nuevos creados.
      expect(body).toContain("'new_products_created', v_new_products_count");
    });
  });

  describe('2. delete_pending_reception (NUEVA)', () => {
    it('existe con firma (p_receipt_id uuid, p_user_id uuid DEFAULT NULL) SECURITY DEFINER', () => {
      expect(sql()).toMatch(
        /CREATE OR REPLACE FUNCTION public\.delete_pending_reception\(p_receipt_id uuid, p_user_id uuid DEFAULT NULL::uuid\)\s*\n RETURNS jsonb\s*\n LANGUAGE plpgsql\s*\n SECURITY DEFINER\s*\n SET search_path TO 'public'/
      );
    });

    it('2a. bloquea la fila con FOR UPDATE (concurrencia)', () => {
      expect(fnBody('delete_pending_reception')).toMatch(
        /SELECT \* INTO v_receipt FROM public\.receipts WHERE id = p_receipt_id FOR UPDATE/
      );
    });

    it('2b. guard de estado: SOLO pending (active/voided/reversed rechazados)', () => {
      const body = fnBody('delete_pending_reception');
      expect(body).toMatch(/IF v_receipt\.status <> 'pending' THEN/);
      expect(body).toMatch(
        /ERR_INVALID_STATUS: solo se pueden eliminar recepciones en estado pendiente\/borrador/
      );
    });

    it('2c. autorización multitienda + anti-spoofing (paridad void_pending_reception)', () => {
      const body = fnBody('delete_pending_reception');
      expect(body).toMatch(
        /v_caller_uid uuid := CASE\s+WHEN auth\.role\(\) = 'service_role' THEN COALESCE\(p_user_id, auth\.uid\(\)\)\s+ELSE auth\.uid\(\)\s+END/
      );
      expect(body).toContain('NOT public.has_store_access_as(v_caller_uid, v_store_id)');
      expect(body).toMatch(/RAISE EXCEPTION 'ERR_UNAUTHORIZED'/);
    });

    it('2d. defense-in-depth: rechaza con movimientos o pagos ligados', () => {
      const body = fnBody('delete_pending_reception');
      expect(body).toMatch(/ERR_RECEIPT_HAS_MOVEMENTS: la recepción tiene movimientos de inventario asociados/);
      expect(body).toMatch(/ERR_RECEIPT_HAS_PAYMENTS: la recepción tiene pagos asociados/);
      expect(body).toMatch(/FROM public\.payment_transactions\s+WHERE ref_type = 'receipt' AND ref_id = p_receipt_id/);
    });

    it('2e. elimina líneas + cabecera y deja evento de auditoría', () => {
      const body = fnBody('delete_pending_reception');
      expect(body).toMatch(/DELETE FROM public\.receipt_items WHERE receipt_id = p_receipt_id/);
      expect(body).toMatch(/DELETE FROM public\.receipts WHERE id = p_receipt_id/);
      expect(body).toContain("'DELETE_PENDING_RECEPTION'");
      // La auditoría captura quién, qué y contenido (política de trazabilidad del módulo).
      expect(body).toMatch(/'supplier', v_receipt\.supplier/);
      expect(body).toMatch(/'items_deleted', v_items_deleted/);
      // Orden: la eliminación de líneas y cabecera precede al COMMIT implícito
      // del final de la función — todo dentro de la misma transacción.
      const itemsIdx = body.indexOf('DELETE FROM public.receipt_items');
      const auditIdx = body.indexOf("'DELETE_PENDING_RECEPTION'");
      expect(itemsIdx).toBeGreaterThan(-1);
      expect(auditIdx).toBeGreaterThan(itemsIdx);
    });

    it('2f. GRANT EXECUTE a authenticated y service_role', () => {
      expect(sql()).toMatch(
        /GRANT EXECUTE ON FUNCTION public\.delete_pending_reception\(uuid, uuid\) TO authenticated, service_role;/
      );
    });
  });

  describe('3. RLS receipts_delete_rls — solo borradores (defecto D-D)', () => {
    it('DROP + CREATE con condición de estado pending', () => {
      const s = sql();
      expect(s).toContain('DROP POLICY IF EXISTS receipts_delete_rls ON public.receipts;');
      expect(s).toMatch(
        /CREATE POLICY receipts_delete_rls ON public\.receipts\s*\n\s*FOR DELETE TO authenticated\s*\n\s*USING \([\s\S]*?AND receipts\.status = 'pending'[\s\S]*?\);/
      );
    });

    it('la política conserva el guard de membresía activa de la tienda', () => {
      const s = sql();
      const policyIdx = s.indexOf('CREATE POLICY receipts_delete_rls');
      const policy = s.slice(policyIdx, policyIdx + 1200);
      expect(policy).toMatch(/m\.user_id = auth\.uid\(\)/);
      expect(policy).toMatch(/m\.status = 'active'/);
      expect(policy).toMatch(/m\.store_id = receipts\.store_id/);
    });
  });

  describe('4. Compatibilidad con callers existentes', () => {
    it('no añade parámetros posicionales a register_reception (receive_against_po y sync pasan argumentos nombrados)', () => {
      // La firma debe seguir teniendo exactamente 7 parámetros: cualquier
      // parámetro adicional crearía un OVERLOAD nuevo en PostgreSQL y
      // ambigüedad en PostgREST. (Se cuenta hasta '\n RETURNS' para no
      // cortar en los paréntesis internos de now()).
      const sig = sql().match(
        /CREATE OR REPLACE FUNCTION public\.register_reception\(([\s\S]*?)\)\n RETURNS uuid/
      )?.[1] || '';
      const params = sig.split(',').map(p => p.trim()).filter(p => p.length > 0);
      expect(params).toHaveLength(7);
      expect(params.map(p => p.split(/\s+/)[0])).toEqual([
        'p_store_id', 'p_supplier', 'p_reception_date', 'p_invoice_number',
        'p_items', 'p_user_id', 'p_po_id',
      ]);
    });

    it('los items SIN product_id y SIN new_product siguen cayendo en ERR_PRODUCT_NOT_IN_STORE', () => {
      const body = fnBody('register_reception');
      // El guard B5 sigue presente después del bloque new_product.
      expect(body).toContain('ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %');
    });
  });
});

describe('5. Endurecimiento de exposición (paridad sec_definer_hardening)', () => {
  it('revoca EXECUTE de delete_pending_reception a PUBLIC y anon', () => {
    expect(sql()).toMatch(
      /REVOKE EXECUTE ON FUNCTION public\.delete_pending_reception\(uuid, uuid\) FROM PUBLIC, anon;/
    );
  });
});
