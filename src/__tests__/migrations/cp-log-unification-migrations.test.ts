/**
 * cp-log-unification-migrations.test.ts — CP-LOG-RECEPTIONS-SERVICES-POS-
 * UNIFICATION-001. Contratos estáticos de las DOS migraciones de la misión:
 *
 *  20261121130000_cp_log_unification_master_visibility.sql
 *    · get_products_for_reception: unión maestra para tiendas conectadas
 *      (catalog_store_links) + columnas ADITIVAS al final (category, source,
 *      master_product_id) + firma de parámetros INTACTA.
 *    · get_products_for_pos: unión maestra + columnas aditivas (source,
 *      master_product_id) + firma INTACTA (uuid, text, text, integer, integer).
 *    · register_supplier_payment(_batch): estado de la receipt en el lock +
 *      gate ERR_RECEIPT_NOT_PAYABLE para voided/reversed, conservando la
 *      semántica ADN-009 (normalización zelle, INSERT sin amount_cup generado,
 *      idempotencia original).
 *
 *  20261121130100_cp_log_unification_pos_transfer_reference.sql
 *    · create_sale_v2: el loop de componentes lee `reference` y lo persiste en
 *      payment_transactions.reference; la clave de idempotencia por componente
 *      incorpora el ÍNDICE (dos transferencias con referencias distintas no
 *      colisionan); la firma de parámetros queda INTACTA.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = join(process.cwd(), 'supabase/migrations');
const MIG_MASTER = readFileSync(
  join(MIG_DIR, '20261121130000_cp_log_unification_master_visibility.sql'),
  'utf-8',
);
const MIG_REF = readFileSync(
  join(MIG_DIR, '20261121130100_cp_log_unification_pos_transfer_reference.sql'),
  'utf-8',
);

describe('MIG 20261121130000 · get_products_for_reception — unión maestra', () => {
  it('mantiene la FIRMA de parámetros histórica (uuid, text, integer, integer)', () => {
    expect(MIG_MASTER).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_products_for_reception\(p_store_id uuid, p_search_term text DEFAULT ''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 50\)/,
    );
  });

  it('columnas nuevas SOLO al final de la tabla de retorno (aditivo posicional)', () => {
    expect(MIG_MASTER).toMatch(
      /RETURNS TABLE\(id uuid, name text, sku text, barcode text, cost_price numeric, price numeric, unit_of_measure text, stock_current numeric, min_stock numeric, is_active boolean, total_count bigint, category text, source text, master_product_id uuid\)/,
    );
  });

  it('rama maestra: SOLO tiendas conectadas, SOLO maestros activos sin fila local', () => {
    expect(MIG_MASTER).toMatch(/is_catalog_store_connected\(v_tenant, p_store_id\)/);
    expect(MIG_MASTER).toMatch(/m\.status = 'active'/);
    expect(MIG_MASTER).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM public\.products p2\s*WHERE p2\.master_product_id = m\.id\s*AND p2\.store_id = p_store_id/);
  });

  it('operativos de la fila solo-maestro en CERO (el maestro no porta datos comerciales)', () => {
    const receptionFn = MIG_MASTER.match(/get_products_for_reception[\s\S]*?\$function\$;/)![0];
    // rama (a) local: fuente explícita
    expect(receptionFn).toMatch(/'local'::text AS source/);
    // rama (b) maestra (posicional): cost 0, price 0, stock 0, min_stock 1,
    // is_active true, category NULL, source 'master', master_product_id = m.id
    const masterBranch = receptionFn.slice(receptionFn.indexOf('UNION ALL'));
    expect(masterBranch).toMatch(
      /m\.barcode,\s*0::numeric,\s*0::numeric,\s*m\.unit_of_measure,\s*0::numeric,\s*1::numeric,\s*true,\s*NULL::text,\s*'master'::text,\s*m\.id/,
    );
  });

  it('la barrera de autorización REM-R2-READ se conserva intacta', () => {
    expect(MIG_MASTER).toMatch(/ERR_UNAUTHORIZED_STORE: NULL/);
    expect(MIG_MASTER).toMatch(/has_store_access\(p_store_id\)/);
  });
});

describe('MIG 20261121130000 · get_products_for_pos — unión maestra', () => {
  it('firma de parámetros INTACTA (la que asegura el test de CP-OPERATIONAL-CLASS-002)', () => {
    expect(MIG_MASTER).toMatch(
      /CREATE OR REPLACE FUNCTION public\.get_products_for_pos\(\s*p_store_id uuid DEFAULT NULL::uuid,\s*p_search_term text DEFAULT NULL::text,\s*p_category text DEFAULT NULL::text,\s*p_limit integer DEFAULT 500,\s*p_offset integer DEFAULT 0\s*\)/,
    );
  });

  it('columnas aditivas source/master_product_id al FINAL del RETURNS TABLE', () => {
    expect(MIG_MASTER).toMatch(
      /operational_class public\.product_operational_class,\s*-- CP-LOG-UNIFICATION-001 \(aditivo al final\): procedencia de la fila\.\s*source text,\s*master_product_id uuid\s*\)/,
    );
  });

  it('la rama local permanece byte-idéntica: imagen master-first, variantes, has_movements', () => {
    expect(MIG_MASTER).toMatch(/NULLIF\(\(SELECT mm\.image_path FROM public\.master_products mm WHERE mm\.id = p\.master_product_id\), ''\)/);
    expect(MIG_MASTER).toMatch(/jsonb_agg\(jsonb_build_object\('id', pv\.id/);
    expect(MIG_MASTER).toMatch(/'local'::text AS source/);
  });

  it('rama maestra: badge fuente + operativos cero + is_service del maestro', () => {
    expect(MIG_MASTER).toMatch(/m\.is_service,/);
    expect(MIG_MASTER).toMatch(/'master'::text,\s*m\.id\s*FROM public\.master_products m/);
  });
});

describe('MIG 20261121130000 · gate de estado de receipts en el motor de pagos', () => {
  it('el SELECT del lock de receipts ahora lee el status (batch y motor individual)', () => {
    expect(MIG_MASTER).toMatch(
      /SELECT store_id, total_cost, 'CUP', 1, status\s*INTO v_doc_store_id, v_doc_total, v_doc_currency, v_doc_rate, v_doc_status\s*FROM public\.receipts WHERE id = p_ref_id FOR UPDATE/,
    );
    expect(MIG_MASTER).toMatch(
      /SELECT store_id, total_cost, 'CUP', 1, status\s*INTO v_doc_store_id, v_total, v_doc_currency, v_doc_rate, v_doc_status\s*FROM public\.receipts WHERE id = p_ref_id FOR UPDATE/,
    );
  });

  it('gate ERR_RECEIPT_NOT_PAYABLE para voided/reversed en AMBOS caminos', () => {
    const occurrences = MIG_MASTER.match(/ERR_RECEIPT_NOT_PAYABLE/g) || [];
    // batch + motor + guards DO-block
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
    expect(MIG_MASTER).toMatch(
      /IF p_ref_type = 'receipt' AND COALESCE\(v_doc_status, 'active'\) IN \('voided', 'reversed'\) THEN/,
    );
  });

  it('semántica ADN-009 conservada: zelle se NORMALIZA (no se rechaza) en el motor individual', () => {
    expect(MIG_REF).not.toContain('register_supplier_payment'); // sin cambios en la 2ª migración
    const engine = MIG_MASTER.match(/CREATE OR REPLACE FUNCTION public\.register_supplier_payment\(p_store_id uuid[\s\S]*?\$function\$;/)![0];
    expect(engine).toMatch(/= 'zelle' THEN p_payment_method := 'external_transfer'/);
    // el INSERT histórico NO incluye amount_cup (columna GENERATED)
    expect(engine).not.toMatch(/INSERT INTO public\.payment_transactions \(\s*store_id[\s\S]*?amount_cup,/);
    // idempotencia original intacta (sin btrim adicional)
    expect(engine).toMatch(/IF p_idempotency_key IS NOT NULL THEN/);
  });
});

describe('MIG 20261121130100 · create_sale_v2 — referencia de transferencia por componente', () => {
  it('firma de parámetros INTACTA (reemisión sin cambios de contrato)', () => {
    expect(MIG_REF).toMatch(/CREATE OR REPLACE FUNCTION public\.create_sale_v2\(/);
    // 33 parámetros nominales: reemisión completa con retorno jsonb original
    expect(MIG_REF).toMatch(/\n RETURNS jsonb\n/);
    expect(MIG_REF).toMatch(/p_payment_components jsonb DEFAULT NULL::jsonb, p_customer_code text DEFAULT NULL::text, p_customer_address text DEFAULT NULL::text\)/);
  });

  it('el loop de componentes lee la referencia y la persiste', () => {
    expect(MIG_REF).toMatch(/v_comp_ref := left\(NULLIF\(btrim\(COALESCE\(v_comp->>'reference', ''\)\), ''\), 400\)/);
    expect(MIG_REF).toMatch(/payment_date, paid_by, idempotency_key, reference/);
    expect(MIG_REF).toMatch(/v_comp_ref\s*\)\s*RETURNING id INTO v_pt_id/);
  });

  it('la clave de idempotencia por componente incorpora el ÍNDICE (sin colisión entre referencias)', () => {
    expect(MIG_REF).toMatch(/'pay-' \|\| v_comp_method \|\| '-' \|\| v_comp_cur \|\| '-' \|\| v_comp_idx::text \|\| '-' \|\| v_tx_id::text/);
  });

  it('la referencia viaja solo por el camino de componentes (pools legacy intactos)', () => {
    const poolBlocks = MIG_REF.match(/v_transfer_amt > 0 AND NOT v_components_ok[\s\S]{0,700}/)![0];
    expect(poolBlocks).not.toContain('v_comp_ref');
  });
});
