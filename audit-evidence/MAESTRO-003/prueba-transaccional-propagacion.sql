-- CP-CAT-MAESTRO-003 — BATERÍA TRANSACCIONAL SINTÉTICA (ROLLBACK COMPLETO)
-- Función temporal pg_temp: desaparece con la sesión; ROLLBACK anula todo.
-- Casos: propagación de imagen, intactibilidad comercial, log, guardas D/E.
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.m003_battery() RETURNS jsonb AS $battery$
DECLARE
  v_master uuid := 'cccccccc-0000-0000-0000-00000000c003';
  v_tenant uuid := 'aaaaaaaa-0000-0000-0000-00000000c003';
  v_store_a uuid := 'bbbbbbbb-0000-0000-0000-00000000c003';
  v_store_b uuid := 'bbbbbbbb-0000-0000-0000-00000000c004';
  v_prod_a  uuid := 'dddddddd-0000-0000-0000-00000000c003';
  v_prod_b  uuid := 'dddddddd-0000-0000-0000-00000000c004';
  v_actor   uuid := 'e2222222-2222-2222-2222-222222222222'; -- perfil real preexistente (solo dentro de tx que se revoca)
  v_res jsonb := '{}'::jsonb;
  v_r jsonb;
BEGIN
  -- Datos sintéticos aislados
  INSERT INTO public.tenants (id, name) VALUES (v_tenant, 'TENANT-SINTETICO-M003');
  INSERT INTO public.stores (id, name, tenant_id, is_active, created_at) VALUES
    (v_store_a, 'TIENDA-A-M003', v_tenant, true, now()),
    (v_store_b, 'TIENDA-B-M003', v_tenant, true, now());

  -- Maestro sintético con imagen v1
  INSERT INTO public.master_products (id, tenant_id, sku, name, image_path, is_service, status, created_by)
  VALUES (v_master, v_tenant, 'SKU-M003-TEST', 'Producto Sintético M003', 'product-images/v1-m003.png', false, 'active', v_actor);

  -- Filas locales vinculadas con precios/costos/existencias DIFERENTES
  INSERT INTO public.products (id, tenant_id, store_id, sku, name, price, cost_price, stock_current, min_stock, image_url, master_product_id, is_service) VALUES
    (v_prod_a, v_tenant, v_store_a, 'SKU-M003-TEST', 'Producto Sintético M003', 100.50, 80.00, 25, 5, 'product-images/v1-m003.png', v_master, false),
    (v_prod_b, v_tenant, v_store_b, 'SKU-M003-TEST', 'Producto Sintético M003', 250.00, 200.00, 7, 2, 'product-images/v1-m003.png', v_master, false);

  -- ── CASO A: reemplazo de imagen compartida → propagación por referencia ──
  v_r := public.fn_master_apply_identity_changes(v_master, '{"image_path":"product-images/v2-m003.png"}'::jsonb, v_actor);
  v_res := v_res || jsonb_build_object(
    'A_invocacion', v_r,
    'A_tienda_a_image_url', (SELECT image_url FROM public.products WHERE id=v_prod_a),
    'A_tienda_b_image_url', (SELECT image_url FROM public.products WHERE id=v_prod_b),
    'A_maestro_image_path', (SELECT image_path FROM public.master_products WHERE id=v_master),
    'A_propagacion_ok', ((SELECT image_url FROM public.products WHERE id=v_prod_a) = 'product-images/v2-m003.png'
                      AND (SELECT image_url FROM public.products WHERE id=v_prod_b) = 'product-images/v2-m003.png'),
    -- Compartición por referencia: AMBAS tiendas referencian el MISMO objeto (no duplicado)
    'A_misma_referencia_sin_duplicar', ((SELECT image_url FROM public.products WHERE id=v_prod_a)
                                     =  (SELECT image_url FROM public.products WHERE id=v_prod_b)),
    -- Datos comerciales INTACTOS
    'A2_precio_a', (SELECT price FROM public.products WHERE id=v_prod_a),
    'A2_costo_a', (SELECT cost_price FROM public.products WHERE id=v_prod_a),
    'A2_stock_a', (SELECT stock_current FROM public.products WHERE id=v_prod_a),
    'A2_precio_b', (SELECT price FROM public.products WHERE id=v_prod_b),
    'A2_stock_b', (SELECT stock_current FROM public.products WHERE id=v_prod_b),
    'A2_comercial_intacto', ((SELECT price FROM public.products WHERE id=v_prod_a)=100.50
                          AND (SELECT cost_price FROM public.products WHERE id=v_prod_a)=80.00
                          AND (SELECT stock_current FROM public.products WHERE id=v_prod_a)=25
                          AND (SELECT price FROM public.products WHERE id=v_prod_b)=250.00
                          AND (SELECT stock_current FROM public.products WHERE id=v_prod_b)=7));

  -- ── CASO B: cambio de SKU sigue propagando a filas locales ──
  v_r := public.fn_master_apply_identity_changes(v_master, '{"sku":"SKU-M003-V2"}'::jsonb, v_actor);
  v_res := v_res || jsonb_build_object(
    'B_invocacion', v_r,
    'B_sku_a', (SELECT sku FROM public.products WHERE id=v_prod_a),
    'B_sku_b', (SELECT sku FROM public.products WHERE id=v_prod_b),
    'B_propagacion_sku_ok', ((SELECT sku FROM public.products WHERE id=v_prod_a)='SKU-M003-V2'
                          AND (SELECT sku FROM public.products WHERE id=v_prod_b)='SKU-M003-V2'));

  -- ── CASO C: master_change_log registró image_path y sku con old/new ──
  v_res := v_res || jsonb_build_object(
    'C_log', (SELECT jsonb_agg(jsonb_build_object('field', field, 'old', old_value, 'new', new_value) ORDER BY created_at)
              FROM public.master_change_log WHERE master_product_id=v_master));

  -- ── CASO D: campo no-identidad (price) rechazado ──
  BEGIN
    PERFORM public.fn_master_apply_identity_changes(v_master, '{"price":"999"}'::jsonb, v_actor);
    v_res := v_res || jsonb_build_object('D_rechaza_no_identidad', false, 'D_detalle', 'ACEPTÓ price (FALLO)');
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('D_rechaza_no_identidad', SQLERRM LIKE 'ERR_INVALID_CHANGES%', 'D_detalle', SQLERRM);
  END;

  -- ── CASO E: SKU duplicado en otro maestro rechazado ──
  INSERT INTO public.master_products (id, tenant_id, sku, name, is_service, status, created_by)
  VALUES ('cccccccc-0000-0000-0000-00000000c004', v_tenant, 'SKU-OTRO-M003', 'Otro Maestro M003', false, 'active', v_actor);
  BEGIN
    PERFORM public.fn_master_apply_identity_changes(v_master, '{"sku":"SKU-OTRO-M003"}'::jsonb, v_actor);
    v_res := v_res || jsonb_build_object('E_rechaza_sku_duplicado', false, 'E_detalle', 'ACEPTÓ duplicado (FALLO)');
  EXCEPTION WHEN OTHERS THEN
    v_res := v_res || jsonb_build_object('E_rechaza_sku_duplicado', SQLERRM LIKE 'ERR_MASTER_SKU_EXISTS%', 'E_detalle', SQLERRM);
  END;

  RETURN v_res;
END;
$battery$ LANGUAGE plpgsql;

SELECT pg_temp.m003_battery() AS resultado_bateria;

ROLLBACK;
