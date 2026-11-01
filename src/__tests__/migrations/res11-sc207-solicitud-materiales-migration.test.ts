/**
 * MISIÓN RESOLUCIÓN 11 (2026-10-31) — Verificación estática de la migración
 * 20261031120000_res11_sc207_solicitud_materiales.sql.
 *
 * Contrato crítico (las restricciones viven en el SERVIDOR, no en la UI):
 *
 *   1. Tablas material_requests / material_request_items con los 9 DATOS DE
 *      USO OBLIGATORIO del modelo SC-2-07 (Res. 11/2007 MFP, Anexo Único):
 *      fecha de emisión (1), entidad+código (2), almacén+código (3),
 *      área/centro de costo/OP-OT (4), código+descripción+UM+cantidad (5),
 *      solicitante+fecha (6), funcionario que autoriza+fecha (7),
 *      empleado del almacén que recibe+fecha (8), número consecutivo (9).
 *   2. RLS de aislamiento multitienda (patrón issue_slips) + grants de solo
 *      lectura (escrituras SOLO vía RPC SECURITY DEFINER).
 *   3. next_document_number extendido con 'material_request' (prefijo SM) —
 *      supersete estricto: los tipos existentes conservan prefijos.
 *   4. RPCs del flujo documental (create/update/submit/confirm/reopen/void):
 *      guard anti-spoofing, has_store_access_as, FOR UPDATE, guards de
 *      estado (draft/in_review), auditoría por transición.
 *   5. Trust boundary: descripciones/códigos/UM y nombre del almacén se
 *      resuelven servidor (snapshots), nunca del cliente.
 *   6. ACL: GRANT authenticated/service_role + REVOKE PUBLIC/anon.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261031120000_res11_sc207_solicitud_materiales.sql';

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

describe('migración 20261031120000 — Solicitud de Materiales (SC-2-07, Res. 11/2007)', () => {
  it('existe el archivo de migración', () => {
    expect(sql().length).toBeGreaterThan(20000);
  });

  describe('1. Tablas — datos de uso obligatorio del modelo SC-2-07', () => {
    it('material_requests con los datos 1–4, 6–9 del modelo', () => {
      const s = sql();
      expect(s).toMatch(/CREATE TABLE IF NOT EXISTS public\.material_requests \(/);
      // Dato 1/6: fecha de emisión (default hoy, no nula).
      expect(s).toMatch(/fecha_emision date NOT NULL DEFAULT CURRENT_DATE/);
      // Dato 2: código de entidad (el nombre es la tienda activa, automático).
      expect(s).toMatch(/entidad_codigo text/);
      // Dato 3: almacén al que se efectúa la Solicitud.
      expect(s).toMatch(/warehouse_id uuid/);
      expect(s).toMatch(/almacen_nombre text NOT NULL/);
      expect(s).toMatch(/almacen_codigo text/);
      // Dato 4: área / centro de costo / OP-OT.
      expect(s).toMatch(/area_nombre text NOT NULL/);
      expect(s).toMatch(/area_codigo text/);
      expect(s).toMatch(/centro_costo text/);
      expect(s).toMatch(/production_order_id uuid/);
      // Dato 6: solicitante (created_by) + fecha de envío.
      expect(s).toMatch(/submitted_at timestamptz/);
      // Dato 7: funcionario que autoriza + fecha.
      expect(s).toMatch(/authorized_by uuid/);
      expect(s).toMatch(/authorized_at timestamptz/);
      // Dato 8: empleado del almacén que recibe + fecha.
      expect(s).toMatch(/received_by uuid/);
      expect(s).toMatch(/received_at timestamptz/);
      // Dato 9: número consecutivo.
      expect(s).toMatch(/request_number text NOT NULL/);
      // Anulación trazable (nunca borrado físico).
      expect(s).toMatch(/voided_at timestamptz/);
      expect(s).toMatch(/voided_by uuid/);
      expect(s).toMatch(/void_reason text/);
    });

    it('estados del flujo documental: draft | in_review | confirmed | voided (CHECK)', () => {
      expect(sql()).toMatch(
        /CONSTRAINT material_requests_status_check\s*\n\s*CHECK \(status = ANY \(ARRAY\['draft'::text, 'in_review'::text, 'confirmed'::text, 'voided'::text\]\)\)/
      );
    });

    it('material_request_items — dato 5: código, descripción, UM y cantidad', () => {
      const s = sql();
      expect(s).toMatch(/CREATE TABLE IF NOT EXISTS public\.material_request_items \(/);
      expect(s).toMatch(/product_id uuid NOT NULL/);
      expect(s).toMatch(/sku text NOT NULL DEFAULT ''::text/);
      expect(s).toMatch(/descripcion text NOT NULL DEFAULT ''::text/);
      expect(s).toMatch(/unit_of_measure text NOT NULL DEFAULT ''::text/);
      expect(s).toMatch(/quantity numeric\(14,4\) NOT NULL/);
      expect(s).toMatch(/CONSTRAINT material_request_items_quantity_check CHECK \(quantity > \(0\)::numeric\)/);
      // Un producto no se repite en la misma solicitud.
      expect(s).toMatch(/CONSTRAINT material_request_items_unique_product UNIQUE \(request_id, product_id\)/);
    });

    it('número consecutivo único por tienda e índices de consulta', () => {
      const s = sql();
      expect(s).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_material_requests_store_number\s*\n\s*ON public\.material_requests \(store_id, request_number\)/);
      expect(s).toMatch(/idx_material_requests_store_created/);
      expect(s).toMatch(/idx_material_requests_status/);
    });
  });

  describe('2. RLS — aislamiento multitienda (patrón issue_slips)', () => {
    it('RLS ENABLE + FORCE en las dos tablas', () => {
      const s = sql();
      expect(s).toMatch(/ALTER TABLE public\.material_requests ENABLE ROW LEVEL SECURITY;/);
      expect(s).toMatch(/ALTER TABLE public\.material_requests FORCE ROW LEVEL SECURITY;/);
      expect(s).toMatch(/ALTER TABLE public\.material_request_items ENABLE ROW LEVEL SECURITY;/);
      expect(s).toMatch(/ALTER TABLE public\.material_request_items FORCE ROW LEVEL SECURITY;/);
    });

    it('políticas de aislamiento por current_user_store_ids', () => {
      const s = sql();
      expect(s).toMatch(
        /CREATE POLICY material_requests_store_isolation ON public\.material_requests\s*\n\s*FOR ALL TO authenticated\s*\n\s*USING \(store_id = ANY \(public\.current_user_store_ids\(\)\)\)\s*\n\s*WITH CHECK \(store_id = ANY \(public\.current_user_store_ids\(\)\)\);/
      );
      expect(s).toMatch(
        /CREATE POLICY material_request_items_store_isolation ON public\.material_request_items/
      );
    });

    it('escrituras SOLO vía RPC: SELECT a authenticated, ALL a service_role, REVOKE anon', () => {
      const s = sql();
      expect(s).toMatch(/REVOKE ALL ON public\.material_requests FROM anon, authenticated;/);
      expect(s).toMatch(/GRANT SELECT ON public\.material_requests TO authenticated;/);
      expect(s).toMatch(/GRANT ALL ON public\.material_requests TO service_role;/);
      expect(s).toMatch(/REVOKE ALL ON public\.material_request_items FROM anon, authenticated;/);
      expect(s).toMatch(/GRANT SELECT ON public\.material_request_items TO authenticated;/);
      expect(s).toMatch(/GRANT ALL ON public\.material_request_items TO service_role;/);
    });
  });

  describe('3. Numeración SM-NNNNNN-YYYY (dato 9)', () => {
    it('document_sequences acepta material_request (CHECK extendido, supersete)', () => {
      const s = sql();
      expect(s).toMatch(/ALTER TABLE public\.document_sequences DROP CONSTRAINT document_sequences_document_type_check;/);
      expect(s).toMatch(/'material_request'::text\]\)/);
      // Los 6 tipos existentes siguen presentes (supersete estricto).
      for (const t of ["'invoice'", "'credit_note'", "'quotation'", "'z_report'", "'vale_salida'", "'cash_flow'"]) {
        expect(s).toContain(t);
      }
    });

    it('next_document_number: material_request → prefijo SM, validación extendida', () => {
      const s = sql();
      expect(s).toMatch(/'material_request'\) THEN\s+RAISE EXCEPTION 'ERR_INVALID_DOCUMENT_TYPE/);
      expect(s).toContain("WHEN 'material_request' THEN 'SM'");
      // Los prefijos existentes se conservan (comportamiento idéntico).
      expect(s).toContain("WHEN 'invoice' THEN 'FAC'");
      expect(s).toContain("WHEN 'vale_salida' THEN 'VS'");
      expect(s).toContain("WHEN 'cash_flow' THEN 'IE'");
      // Atomicidad preservada (SELECT FOR UPDATE sobre document_sequences).
      expect(s).toMatch(/WHERE store_id = p_store_id AND document_type = p_document_type AND year = v_year\s*\n\s*FOR UPDATE;/);
    });
  });

  describe('4. create_material_request — creación en borrador (datos 1–6)', () => {
    it('guard anti-spoofing + autorización multitienda', () => {
      const body = fnBody('create_material_request');
      expect(body).toMatch(
        /v_caller_uid uuid := CASE\s+WHEN auth\.role\(\) = 'service_role' THEN COALESCE\(p_user_id, auth\.uid\(\)\)\s+ELSE auth\.uid\(\)\s+END/
      );
      expect(body).toMatch(
        /IF v_caller_uid IS NULL OR NOT public\.has_store_access_as\(v_caller_uid, p_store_id\) THEN/
      );
    });

    it('trust boundary: almacén y datos de producto resueltos SIEMPRE servidor', () => {
      const body = fnBody('create_material_request');
      // Dato 3: si hay warehouse_id, nombre/código salen de warehouses (tienda).
      expect(body).toMatch(/SELECT w\.name, w\.code INTO v_almacen_nombre, v_almacen_codigo\s*\n\s*FROM public\.warehouses w\s*\n\s*WHERE w\.id = p_warehouse_id AND w\.store_id = p_store_id AND w\.is_active = true/);
      expect(body).toMatch(/ERR_WAREHOUSE_NOT_FOUND/);
      expect(body).toMatch(/ERR_WAREHOUSE_NAME_REQUIRED/);
      // Dato 2: código de entidad — cliente → reeup → nit (puede quedar en blanco).
      expect(body).toMatch(/SELECT s\.reeup, s\.nit, s\.tenant_id INTO v_reeup, v_nit, v_tenant/);
      // Dato 5: sku/descripción/UM snapshots servidor desde products.
      expect(body).toMatch(/SELECT p\.sku, p\.name, p\.unit_of_measure INTO v_sku, v_descripcion, v_um/);
      expect(body).toMatch(/WHERE p\.id = v_product_id AND p\.store_id = p_store_id/);
    });

    it('validaciones: fecha no futura/no >6 meses, área y almacén requeridos, items válidos', () => {
      const body = fnBody('create_material_request');
      expect(body).toMatch(/ERR_FUTURE_DATED_DOCUMENT/);
      expect(body).toMatch(/ERR_BACKDATED_DOCUMENT/);
      expect(body).toMatch(/ERR_AREA_REQUIRED/);
      expect(body).toMatch(/ERR_EMPTY_ITEMS/);
      expect(body).toMatch(/ERR_INVALID_QUANTITY/);
      expect(body).toMatch(/ERR_DUPLICATE_PRODUCT/);
      expect(body).toMatch(/ERR_PRODUCT_NOT_FOUND/);
      expect(body).toMatch(/ERR_ORDER_NOT_FOUND/);
    });

    it('nace en borrador con número consecutivo, idempotencia y auditoría', () => {
      const body = fnBody('create_material_request');
      expect(body).toMatch(/public\.next_document_number\(p_store_id, 'material_request', v_caller_uid\)/);
      expect(body).toMatch(/'draft', v_fecha_emision/);
      expect(body).toMatch(/public\.check_idempotency\(p_idempotency_key, 'material_request'/);
      expect(body).toMatch(/public\.register_idempotency\(p_idempotency_key, 'material_request'/);
      expect(body).toMatch(/'CREATE_MATERIAL_REQUEST'/);
      expect(body).toMatch(/'normativa', 'Res\. 11\/2007 MFP — Modelo SC-2-07 Solicitud de Entrega'/);
    });
  });

  describe('5. Flujo documental — transiciones con lock y guard de estado', () => {
    it('update_material_request: SOLO borrador, reemplazo transaccional de líneas', () => {
      const body = fnBody('update_material_request');
      expect(body).toMatch(/SELECT \* INTO v_req FROM public\.material_requests WHERE id = p_request_id FOR UPDATE/);
      expect(body).toMatch(/ERR_NOT_DRAFT: solo se pueden editar solicitudes en borrador/);
      expect(body).toMatch(/DELETE FROM public\.material_request_items WHERE request_id = p_request_id/);
      expect(body).toMatch(/'UPDATE_MATERIAL_REQUEST'/);
    });

    it('submit_material_request: draft → in_review con fecha de la Solicitud (dato 6)', () => {
      const body = fnBody('submit_material_request');
      expect(body).toMatch(/WHERE id = p_request_id FOR UPDATE/);
      expect(body).toMatch(/ERR_NOT_DRAFT: solo se pueden enviar a revisión/);
      expect(body).toMatch(/SET status = 'in_review', submitted_at = now\(\)/);
      expect(body).toMatch(/ERR_EMPTY_ITEMS/);
      expect(body).toMatch(/'SUBMIT_MATERIAL_REQUEST'/);
    });

    it('confirm_material_request: in_review → confirmed registrando los datos 7 y 8', () => {
      const body = fnBody('confirm_material_request');
      expect(body).toMatch(/ERR_NOT_IN_REVIEW: solo se pueden confirmar solicitudes en revisión/);
      expect(body).toMatch(
        /SET status = 'confirmed',\s*\n\s*authorized_by = v_caller_uid,\s*\n\s*authorized_at = now\(\),\s*\n\s*received_by = v_caller_uid,\s*\n\s*received_at = now\(\)/
      );
      expect(body).toMatch(/'CONFIRM_MATERIAL_REQUEST'/);
      expect(body).toMatch(/'nota_modelo', 'Datos 7 y 8 del SC-2-07 registrados en la confirmación'/);
    });

    it('reopen_material_request: in_review → draft con motivo y contador', () => {
      const body = fnBody('reopen_material_request');
      expect(body).toMatch(/ERR_NOT_IN_REVIEW: solo se pueden devolver a borrador/);
      expect(body).toMatch(/ERR_REASON_REQUIRED/);
      expect(body).toMatch(/reopen_count = reopen_count \+ 1/);
      expect(body).toMatch(/last_reopen_reason = btrim\(p_reason\)/);
      expect(body).toMatch(/'REOPEN_MATERIAL_REQUEST'/);
    });

    it('void_material_request: draft|in_review → voided con motivo (nunca borra)', () => {
      const body = fnBody('void_material_request');
      expect(body).toMatch(/IF v_req\.status NOT IN \('draft', 'in_review'\) THEN/);
      expect(body).toMatch(/ERR_NOT_VOIDABLE/);
      expect(body).toMatch(/ERR_REASON_REQUIRED/);
      expect(body).toMatch(/SET status = 'voided',\s*\n\s*voided_at = now\(\),\s*\n\s*voided_by = v_caller_uid,\s*\n\s*void_reason = btrim\(p_reason\)/);
      expect(body).toMatch(/'VOID_MATERIAL_REQUEST'/);
      // No hay DELETE: la anulación es un estado, no un borrado físico.
      expect(body).not.toMatch(/DELETE FROM public\.material_requests/);
    });

    it('todas las RPC de transición usan FOR UPDATE (concurrencia: 1 gana)', () => {
      for (const fn of ['update_material_request', 'submit_material_request', 'confirm_material_request', 'reopen_material_request', 'void_material_request']) {
        expect(fnBody(fn)).toMatch(/WHERE id = p_request_id FOR UPDATE/);
      }
    });

    it('todas las RPC revalidan autorización multitienda con has_store_access_as', () => {
      for (const fn of ['update_material_request', 'submit_material_request', 'confirm_material_request', 'reopen_material_request', 'void_material_request']) {
        expect(fnBody(fn)).toMatch(
          /IF v_caller_uid IS NULL OR NOT public\.has_store_access_as\(v_caller_uid, v_req\.store_id\) THEN/
        );
      }
    });
  });

  describe('6. ACL — patrón sec_definer_hardening', () => {
    it('GRANT authenticated/service_role + REVOKE PUBLIC/anon en las 6 RPC', () => {
      const s = sql();
      const fns: Array<[string, string]> = [
        ['create_material_request', '(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, text, uuid)'],
        ['update_material_request', '(uuid, date, uuid, text, text, text, text, text, text, uuid, text, jsonb, uuid)'],
        ['submit_material_request', '(uuid, uuid)'],
        ['confirm_material_request', '(uuid, uuid)'],
        ['reopen_material_request', '(uuid, text, uuid)'],
        ['void_material_request', '(uuid, text, uuid)'],
      ];
      for (const [name, sig] of fns) {
        // toMatch con STRING = comparación por subcadena (sin regex → sin escape).
        expect(s).toMatch(`GRANT EXECUTE ON FUNCTION public.${name}${sig} TO authenticated, service_role;`);
        expect(s).toMatch(`REVOKE EXECUTE ON FUNCTION public.${name}${sig} FROM PUBLIC, anon;`);
      }
    });
  });
});
