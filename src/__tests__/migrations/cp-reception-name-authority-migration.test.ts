/**
 * CP-LOG-RECEPTION-MASTER-NAME-AUTHORITY-001 — contrato estático de la
 * migración 20261117120000_cp_reception_import_name_authority.sql.
 *
 * Garantías verificadas (misión §4/§5/§9/§14):
 *   1. classify: salida ADITIVA 'effective_name' con AUTORIDAD DEL MAESTRO
 *      (v_effective_name := v_master_name cuando el maestro existe).
 *   2. resolve: la fila local vinculada nace SIEMPRE con el nombre canónico
 *      del maestro — NUNCA con el del Excel; en carrera multitienda se relee
 *      el nombre del GANADOR; resultados con 'product_name'; sin UPDATE de
 *      master_products.name; aislamiento por fila preservado.
 *   3. register_reception: CASO A4/A5 con v_master_name (canónico), auditoría
 *      'local_name_requested' conservada, marcador 'name_source =
 *      master_canonical'; firma y contratos intactos.
 *   4. Firmas y ACL preservados (contrato additive-only).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MIGRATION = 'supabase/migrations/20261117120000_cp_reception_import_name_authority.sql';
const PREV_CLASSIFY = 'supabase/migrations/20261116140100_cp_reception_import_classification.sql';

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

describe('20261117120000 — autoridad del nombre del Catálogo Maestro (misión §4-§5)', () => {
  const s = read(MIGRATION);
  const prev = read(PREV_CLASSIFY);

  it('classify: firma PRESERVADA (additive-only, sin cambios de contrato)', () => {
    // Misma firma que la migración previa (20261116140100).
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.fn_classify_reception_import_row\(\s*p_tenant_id uuid,\s*p_store_id uuid,\s*p_connected boolean,\s*p_row jsonb,\s*p_caller_uid uuid\s*\)/);
    // Sigue siendo STABLE + SECURITY DEFINER con search_path fijado.
    expect(s).toMatch(/RETURNS jsonb\s+LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path TO 'public'/);
  });

  it('classify: AUTORIDAD DEL MAESTRO — v_effective_name := v_master_name si el maestro existe', () => {
    expect(s).toMatch(/IF v_master_id IS NOT NULL THEN\s+v_effective_name := v_master_name;/);
    // Verdaderamente nuevo / no conectada: el Excel nombra lo que se crea.
    expect(s).toMatch(/v_effective_name := v_name;/);
    // Salida ADITIVA: la clave 'effective_name' en el resultado.
    expect(s).toMatch(/'effective_name', v_effective_name/);
    // Fidelidad preservada: 'name' y 'master_name' siguen en la salida.
    expect(s).toMatch(/'name', COALESCE\(v_name, v_master_name\)/);
    expect(s).toMatch(/'master_name', v_master_name/);
  });

  it('classify: el nombre del maestro NO se repara ni sustituye con el Excel (§11.12)', () => {
    // Ninguna rama asigna el nombre del Excel al maestro existente.
    expect(s).not.toMatch(/v_master_name\s*:=\s*v_name\s*--\s*reparar/);
    // La candidatura por nombre exacto sigue siendo SOLO auxiliar (review).
    expect(s).toMatch(/ERR_NAME_MATCH_REQUIRES_REVIEW/);
  });

  it('resolve: v_master_name explícito desde la clasificación (autoridad §4)', () => {
    expect(s).toMatch(/v_master_name := NULLIF\(v_class->>'master_name', ''\);/);
  });

  it('resolve: la fila local NACE con el nombre CANÓNICO del maestro (§5, nunca el Excel)', () => {
    // Los ÚNICOS INSERT INTO public.products de resolve (activate_local y
    // new_master) usan el nombre canónico del maestro en la columna name.
    const productsInserts = s.match(/INSERT INTO public\.products \([\s\S]{0,400}?VALUES[\s\S]{0,400}?RETURNING id INTO v_product_id/g) || [];
    expect(productsInserts.length).toBe(2); // activate_local + new_master
    for (const ins of productsInserts) {
      expect(ins).toMatch(/COALESCE\(v_master_name, v_class->>'effective_name'\)/);
      expect(ins).not.toMatch(/COALESCE\(v_name,/); // el Excel NO nombra filas locales
    }
    // La creación del MAESTRO (clase D, única vía legítima del Excel) queda
    // explícita y diferenciada.
    expect(s).toMatch(/INSERT INTO public\.master_products[\s\S]{0,300}COALESCE\(v_name, v_class->>'effective_name'\)/);
    // El patrón Excel-primero de la migración previa está ERRADICADO en filas locales.
    expect(s).not.toMatch(/COALESCE\(v_name, v_class->>'name'\)/);
  });

  it('resolve: CERO UPDATE de master_products.name en todo el escritor (§5)', () => {
    expect(s).not.toMatch(/UPDATE\s+public\.master_products\s+SET\s+name/i);
    // El único UPDATE de master_products permitido en el flujo es el de
    // STATUS en reactivate_master_product (fuera de resolve).
    const resolveBody = s.slice(
      s.indexOf('2) resolve_reception_import_rows'),
      s.indexOf('3) register_reception'),
    );
    expect(resolveBody).not.toMatch(/UPDATE\s+public\.master_products/i);
  });

  it('resolve: carrera multitienda (§9) relee el nombre DEL GANADOR bajo FOR UPDATE', () => {
    expect(s).toMatch(/EXCEPTION WHEN unique_violation THEN[\s\S]{0,600}?SELECT id, status, name\s+INTO v_master_id, v_master_status, v_master_name\s+FROM public\.master_products[\s\S]{0,200}?FOR UPDATE/);
  });

  it('resolve: resultados con product_name canónico para la línea de recepción (§7)', () => {
    expect(s).toMatch(/'product_name', COALESCE\(v_master_name, v_class->>'effective_name'\)/);
    expect(s).toMatch(/'product_name', v_master_name/);
  });

  it('resolve: contrato PRESERVADO — status/total/locals_*/computed_by y aislamiento por fila', () => {
    expect(s).toMatch(/'status', CASE WHEN v_blocked > 0 THEN 'completed_with_errors' ELSE 'success' END/);
    expect(s).toMatch(/'locals_created', v_local_created/);
    expect(s).toMatch(/'locals_activated', v_local_activated/);
    expect(s).toMatch(/'computed_by', 'backend'/);
    expect(s).toMatch(/ERR_ROW_PROCESSING/);
    expect(s).toMatch(/WHEN OTHERS THEN/);
    // Firma intacta (misma que 20261116140100).
    expect(s).toMatch(/CREATE OR REPLACE FUNCTION public\.resolve_reception_import_rows\(\s*p_store_id uuid,\s*p_rows jsonb,\s*p_confirm_reactivation jsonb DEFAULT NULL,\s*p_user_id uuid DEFAULT NULL\s*\)/);
    expect(s).toMatch(/GRANT EXECUTE ON FUNCTION public\.resolve_reception_import_rows\(uuid, jsonb, jsonb, uuid\) TO authenticated, service_role/);
  });

  it('resolve: la reactivación (clase C) no toca el nombre — solo status (§11.13)', () => {
    expect(s).toMatch(/PERFORM public\.reactivate_master_product\(v_master_id, p_store_id, v_caller_uid\);/);
    // Ninguna escritura de nombre alrededor de la reactivación.
    expect(s).not.toMatch(/reactivate_master_product[\s\S]{0,400}UPDATE\s+public\.master_products/i);
  });

  it('register_reception: CASO A4/A5 con v_master_name canónico y trazabilidad conservada', () => {
    // Filas locales vinculadas con el nombre del maestro (A4 y A5). El caso B
    // (tienda NO conectada, sin maestro) conserva el nombre del alta por
    // diseño histórico — se excluye del alcance de esta aserción.
    const body = s.slice(s.indexOf('-- 3) register_reception — CASO A4/A5'));
    const caseBCut = body.indexOf('CASO B · tienda NO conectada');
    const connectedBody = body.slice(0, caseBCut > 0 ? caseBCut : body.length);
    // Los ÚNICOS INSERT INTO public.products de la parte conectada (A4 y A5)
    // nacen con v_master_name; NUNCA con el nombre del payload.
    const productsInserts = connectedBody.match(/INSERT INTO public\.products \([\s\S]{0,900}?RETURNING id INTO v_product_id/g) || [];
    expect(productsInserts.length).toBe(2); // A4 + A5
    for (const ins of productsInserts) {
      expect(ins).toMatch(/v_master_name/);
      expect(ins).not.toMatch(/btrim\(v_new_product->>'name'\)/);
    }
    expect(body).toMatch(/'name_source', 'master_canonical'/);
    expect(body).toMatch(/'local_name_requested', btrim\(v_new_product->>'name'\)/);
    // Firma y fail-closed A5/A6/A7 intactos.
    expect(body).toMatch(/RETURNS uuid\s+LANGUAGE plpgsql\s+VOLATILE\s+SECURITY DEFINER/);
    expect(body).toMatch(/ERR_UNAUTHORIZED_MASTER_CREATE/);
    expect(body).toMatch(/ERR_MASTER_ARCHIVED/);
    expect(body).toMatch(/ERR_MASTER_LINK_CONFLICT/);
  });

  it('register_reception: caso B (tienda NO conectada) preserva el comportamiento histórico', () => {
    const body = s.slice(s.indexOf('3) register_reception'));
    expect(body).toMatch(/CASO B · tienda NO conectada[\s\S]{0,700}?btrim\(v_new_product->>'name'\)/);
  });

  it('guard fail-closed de la migración: contratos de autoridad del nombre', () => {
    expect(s).toMatch(/CP_LOG_NAME_AUTHORITY_GUARD/);
    expect(s).toMatch(/resolve sin debe prioriza|resolve aún prioriza el nombre del Excel/);
    expect(s).toMatch(/trg_products_master_identity_guard ausente/);
  });
});
