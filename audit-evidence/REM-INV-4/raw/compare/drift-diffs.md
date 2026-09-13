# REM-INV-4 — Diffs de cuerpos: Git (estado final declarado) vs LIVE

Cada sección: identidad LIVE, fuente Git del estado final, y diff unificado del cuerpo.


## has_any_role(required_roles user_role[])  oid=21790

- Git final: 20260118_multi_store_rls.sql (md5 cuerpo ad396fa554aa)
- LIVE: oid 21790 (md5 prosrc 5767448d42a5) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260118_multi_store_rls.sql
+++ LIVE:oid21790
@@ -4,14 +4,14 @@
     r user_role;
 BEGIN
     SELECT role INTO v_actual_role FROM public.profiles WHERE id = auth.uid();
-
+    
     FOREACH r IN ARRAY required_roles
     LOOP
         IF v_actual_role = r THEN RETURN true; END IF;
         IF v_actual_role = 'encargado' AND r = 'manager' THEN RETURN true; END IF;
         IF v_actual_role = 'usuario' AND (r = 'clerk' OR r = 'warehouse') THEN RETURN true; END IF;
     END LOOP;
-
+    
     RETURN false;
 END;
 
```

## fn_process_receipt(p_items jsonb, p_user_id uuid, p_reference text)  oid=26950

- Git final: 20260326_multi_tenant_hardening.sql (md5 cuerpo b32dfcca5b9b)
- LIVE: oid 26950 (md5 prosrc 99a3aed010e6) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260326_multi_tenant_hardening.sql
+++ LIVE:oid26950
@@ -3,19 +3,19 @@
     v_receipt_id uuid;
     v_item jsonb;
     v_prod_id uuid;
-    v_qty int;
+    v_qty numeric;
     v_cost numeric;
-    v_current_stock int;
+    v_current_stock numeric;
     v_current_avg_cost numeric;
-    v_new_stock int;
-    v_new_avg_cost numeric;
+    v_new_stock numeric;
     v_total_receipt numeric := 0;
     v_new_details jsonb;
     v_sku text;
+    v_store_id uuid;
     v_auth_user_id uuid := auth.uid();
 BEGIN
     IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
-        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch';
+        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
     END IF;
 
     INSERT INTO public.receipts (user_id, status, reference_doc)
@@ -25,40 +25,47 @@
     FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
     LOOP
         v_sku := v_item->>'sku';
-        v_qty := (v_item->>'quantity')::int;
+        v_qty := (v_item->>'quantity')::numeric;
         v_cost := (v_item->>'unit_cost')::numeric;
         v_new_details := v_item->'new_product_details';
 
-        IF v_sku IS NULL OR v_sku = '' THEN
-            RAISE EXCEPTION 'SKU es obligatorio';
+        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
+            SELECT s.id INTO v_store_id FROM public.stores s ORDER BY s.created_at LIMIT 1;
+            INSERT INTO public.products (name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id)
+            VALUES (
+                v_new_details->>'name', v_sku, v_cost, COALESCE((v_new_details->>'price')::numeric, 0),
+                COALESCE(v_new_details->>'unit_of_measure','unidad'), v_new_details->>'supplier',
+                v_new_details->>'image_url', 0, 0, v_store_id)
+            RETURNING id INTO v_prod_id;
+            v_current_stock := 0; v_current_avg_cost := 0;
+        ELSE
+            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku LIMIT 1;
+            IF v_prod_id IS NULL THEN
+                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_sku;
+            END IF;
+            SELECT store_id INTO v_store_id FROM public.products WHERE id = v_prod_id;
+            SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost
+            FROM public.products WHERE id = v_prod_id FOR UPDATE;
         END IF;
 
-        IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser positiva'; END IF;
+        v_new_stock := COALESCE(v_current_stock,0) + v_qty;
 
-        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
-            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku;
-            IF v_prod_id IS NULL THEN
-                INSERT INTO public.products (name, sku, cost_price, price, stock_current, cost_average)
-                VALUES (v_new_details->>'name', v_sku, v_cost, (v_new_details->>'price')::numeric, 0, 0)
-                RETURNING id INTO v_prod_id;
-            END IF;
-        ELSE
-             v_prod_id := (v_item->>'product_id')::uuid;
-             IF v_prod_id IS NULL THEN SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku; END IF;
-             IF v_prod_id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado: %', v_sku; END IF;
-        END IF;
+        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
+        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost, 1.0);
 
-        SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_prod_id FOR UPDATE;
-        v_new_stock := COALESCE(v_current_stock, 0) + v_qty;
-        v_new_avg_cost := CASE WHEN v_new_stock > 0 THEN ((COALESCE(v_current_stock,0) * COALESCE(v_current_avg_cost,0)) + (v_qty * v_cost)) / v_new_stock ELSE v_cost END;
+        -- DF-01: WAC primero (S_prev) vía escritor único; stock vía MOVIMIENTO canónico
+        -- (corrige además el desync products↔inventory del legacy); SIN espejo cost_price (D-02)
+        PERFORM public.fn_recalc_wac(v_store_id, v_prod_id, 'direct_ingest', v_qty, v_cost,
+                   jsonb_build_object('rpc','fn_process_receipt','receipt_id',v_receipt_id));
+        PERFORM public.register_stock_movement(
+          p_product_id := v_prod_id, p_store_id := v_store_id, p_user_id := p_user_id,
+          p_quantity := v_qty, p_movement_type := 'purchase', p_reason := 'Ingesta directa',
+          p_sale_id := v_receipt_id, p_unit_cost := v_cost,
+          p_operation_date := now(), p_skip_access_check := TRUE);
 
-        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost) VALUES (v_receipt_id, v_prod_id, v_qty, v_cost);
-        UPDATE public.products SET stock_current = v_new_stock, cost_average = v_new_avg_cost, cost_price = v_cost WHERE id = v_prod_id;
-        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
-        VALUES (v_prod_id, 'IN_RECEIPT', v_qty, v_receipt_id, p_user_id, v_new_stock);
         v_total_receipt := v_total_receipt + (v_qty * v_cost);
     END LOOP;
+
     UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
     RETURN v_receipt_id;
-END;
-
+END 
```

## log_transaction_changes()  oid=28126

- Git final: 20240325000000_harden_audit_triggers.sql (md5 cuerpo 3116c725681d)
- LIVE: oid 28126 (md5 prosrc 8b1e75fc728c) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20240325000000_harden_audit_triggers.sql
+++ LIVE:oid28126
@@ -12,11 +12,11 @@
 
         INSERT INTO audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
         VALUES (
-            COALESCE(auth.uid(), v_user_id),
-            'UPDATE_STATUS',
-            TG_TABLE_NAME,
-            NEW.id,
-            jsonb_build_object('old', OLD.status),
+            COALESCE(auth.uid(), v_user_id), 
+            'UPDATE_STATUS', 
+            TG_TABLE_NAME, 
+            NEW.id, 
+            jsonb_build_object('old', OLD.status), 
             jsonb_build_object('new', NEW.status),
             NEW.store_id
         );
```

## cancel_reception(p_reception_id uuid)  oid=34760

- Git final: 20260127_canonical_stock_movement.sql (md5 cuerpo 4caa630cefc9)
- LIVE: oid 34760 (md5 prosrc 529d9515419f) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260127_canonical_stock_movement.sql
+++ LIVE:oid34760
@@ -3,17 +3,30 @@
     v_store_id UUID;
     v_user_id UUID;
     v_item RECORD;
+    v_current_stock NUMERIC;
+    v_new_stock NUMERIC;
 BEGIN
     v_user_id := auth.uid()::UUID;
     IF v_user_id IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
 
-    -- Get store_id from receipt
     SELECT store_id INTO v_store_id FROM public.receipts WHERE id = p_reception_id;
     IF v_store_id IS NULL THEN RAISE EXCEPTION 'Reception not found'; END IF;
 
-    -- Register movements to revert stock
-    FOR v_item IN SELECT product_id, quantity FROM public.receipt_items WHERE receipt_id = p_reception_id
+    FOR v_item IN SELECT product_id, quantity, unit_cost FROM public.receipt_items WHERE receipt_id = p_reception_id
     LOOP
+        SELECT stock_current INTO v_current_stock
+        FROM public.products WHERE id = v_item.product_id FOR UPDATE;
+
+        v_new_stock := COALESCE(v_current_stock,0) - v_item.quantity;
+
+        IF v_new_stock > 0 THEN
+            -- DF-01: inversa exacta del blend de la entrada (q<0) vía escritor único.
+            -- Antes: base cost_price (defecto) + espejo cp. Compat: stock 0 → WAC último conocido.
+            PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_cancel',
+                         -v_item.quantity, v_item.unit_cost,
+                         jsonb_build_object('rpc','cancel_reception','receipt_id',p_reception_id));
+        END IF;
+
         PERFORM public.register_stock_movement(
             p_product_id := v_item.product_id,
             p_store_id := v_store_id,
@@ -22,11 +35,9 @@
             p_movement_type := 'adjustment',
             p_reason := 'Cancelación de recepción: ' || p_reception_id::TEXT,
             p_sale_id := NULL,
-            p_unit_cost := 0
+            p_unit_cost := v_item.unit_cost
         );
     END LOOP;
 
-    -- Mark as voided
     UPDATE public.receipts SET status = 'voided', updated_at = now() WHERE id = p_reception_id;
-END;
-
+END 
```

## audit_store_access_changes()  oid=38098

- Git final: 20260118_multi_store_audit.sql (md5 cuerpo cc62e1f76609)
- LIVE: oid 38098 (md5 prosrc a40a477e3603) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260118_multi_store_audit.sql
+++ LIVE:oid38098
@@ -3,19 +3,19 @@
     IF (TG_OP = 'INSERT') THEN
         INSERT INTO public.audit_logs (user_id, action, table_name, record_id, new_data)
         VALUES (
-            auth.uid(),
-            'ASSIGN_STORE',
-            'user_store_access',
-            NEW.id,
+            auth.uid(), 
+            'ASSIGN_STORE', 
+            'user_store_access', 
+            NEW.id, 
             jsonb_build_object('user_id', NEW.user_id, 'store_id', NEW.store_id)
         );
     ELSIF (TG_OP = 'DELETE') THEN
         INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data)
         VALUES (
-            auth.uid(),
-            'REMOVE_STORE_ACCESS',
-            'user_store_access',
-            OLD.id,
+            auth.uid(), 
+            'REMOVE_STORE_ACCESS', 
+            'user_store_access', 
+            OLD.id, 
             jsonb_build_object('user_id', OLD.user_id, 'store_id', OLD.store_id)
         );
     END IF;
```

## enforce_encargado_store_limit()  oid=38667

- Git final: 20260118_multi_store_logic.sql (md5 cuerpo 2ca7d5c49b6c)
- LIVE: oid 38667 (md5 prosrc 9b7d4f760b70) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260118_multi_store_logic.sql
+++ LIVE:oid38667
@@ -6,7 +6,7 @@
 BEGIN
     IF NEW.created_by IS NULL THEN RETURN NEW; END IF;
 
-    SELECT role, max_stores_limit INTO v_creator_role, v_limit
+    SELECT role, max_stores_limit INTO v_creator_role, v_limit 
     FROM public.profiles WHERE id = NEW.created_by;
 
     IF v_creator_role = 'encargado' THEN
```

## enforce_encargado_user_limit()  oid=38669

- Git final: 20260118_multi_store_logic.sql (md5 cuerpo 165c6b29890d)
- LIVE: oid 38669 (md5 prosrc 355442366948) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260118_multi_store_logic.sql
+++ LIVE:oid38669
@@ -6,7 +6,7 @@
 BEGIN
     IF NEW.created_by IS NULL THEN RETURN NEW; END IF;
 
-    SELECT role, max_users_limit INTO v_creator_role, v_limit
+    SELECT role, max_users_limit INTO v_creator_role, v_limit 
     FROM public.profiles WHERE id = NEW.created_by;
 
     IF v_creator_role = 'encargado' THEN
```

## managed_create_store(p_name text, p_address text)  oid=38673

- Git final: 20260118_multi_store_managed_ops.sql (md5 cuerpo f9002a163540)
- LIVE: oid 38673 (md5 prosrc db00285198d0) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260118_multi_store_managed_ops.sql
+++ LIVE:oid38673
@@ -1,13 +1,20 @@
 
 DECLARE
     v_store_id uuid;
+    v_role user_role;
 BEGIN
+    -- 🛡️ RBAC Check: Only admins or specifically empowered roles can create stores.
+    -- (The existing trigger enforce_encargado_store_limit might allow it, but let's be explicit here)
+    SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
+    
+    IF v_role IS NULL OR v_role NOT IN ('admin', 'encargado') THEN
+        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Insufficient permissions to create a store.';
+    END IF;
+
     INSERT INTO public.stores (name, address, created_by)
     VALUES (p_name, p_address, auth.uid())
     RETURNING id INTO v_store_id;
 
-    -- Note: trigger_auto_assign_store_to_creator handles the access entry.
-
     RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'message', 'Store created');
 END;
 
```

## manage_user_memberships(p_user_id uuid, p_memberships jsonb)  oid=43261

- Git final: 20260223_unify_and_cleanup_memberships.sql (md5 cuerpo 950c6a40f7d0)
- LIVE: oid 43261 (md5 prosrc bd754a75b7d9) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260223_unify_and_cleanup_memberships.sql
+++ LIVE:oid43261
@@ -41,7 +41,7 @@
                         (m->>'role')::public.user_role,
                         COALESCE((m->>'status')::public.membership_status, 'active')
                     )
-                    ON CONFLICT (user_id, store_id) DO UPDATE SET
+                    ON CONFLICT (user_id, store_id) DO UPDATE SET 
                         role = EXCLUDED.role,
                         status = EXCLUDED.status,
                         updated_at = now();
```

## get_users_for_encargado(p_user_id uuid)  oid=44368

- Git final: 20260223_harden_user_management.sql (md5 cuerpo 5dec8b4931dc)
- LIVE: oid 44368 (md5 prosrc 3e5c5c703780) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260223_harden_user_management.sql
+++ LIVE:oid44368
@@ -1,14 +1,12 @@
 
 BEGIN
     RETURN QUERY
-    SELECT DISTINCT usm.user_id
-    FROM public.user_store_memberships usm
-    WHERE usm.store_id IN (
+    SELECT DISTINCT usa.user_id
+    FROM user_store_access usa
+    WHERE usa.store_id IN (
         SELECT store_id
-        FROM public.user_store_memberships
+        FROM user_store_access
         WHERE user_id = p_user_id
-          AND role IN ('encargado', 'manager')
-          AND status = 'active'
     );
 END;
 
```

## get_my_role()  oid=47075

- Git final: 20260209_fix_critical_rls_issues.sql (md5 cuerpo 1b81790370a1)
- LIVE: oid 47075 (md5 prosrc 80f57711b484) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260209_fix_critical_rls_issues.sql
+++ LIVE:oid47075
@@ -2,11 +2,12 @@
 DECLARE
   v_role text;
 BEGIN
-  SELECT role::text INTO v_role 
-  FROM public.profiles 
-  WHERE id = auth.uid();
+  SELECT 
+    lower(COALESCE(r.name, p.role::text)) INTO v_role
+  FROM public.profiles p
+  LEFT JOIN public.roles r ON p.role_id = r.id
+  WHERE p.id = auth.uid();
   
-  -- Return default if user profile doesn't exist (shouldn't happen in prod, but defensive)
   RETURN COALESCE(v_role, 'usuario');
 END;
 
```

## get_audit_logs(p_store_id uuid, p_search_term text, p_date_from timestamp without time zone, p_date_to timestamp without time zone, p_limit integer)  oid=48498

- Git final: 20260227_fix_rpc_structures.sql (md5 cuerpo 7ca1055af0a6)
- LIVE: oid 48498 (md5 prosrc f93ce9494a16) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260227_fix_rpc_structures.sql
+++ LIVE:oid48498
@@ -1,50 +1,50 @@
 
-DECLARE
-    v_user_id uuid;
-    v_is_admin boolean;
-BEGIN
-    v_user_id := auth.uid();
-    v_is_admin := public.is_admin();
+                                                                                                                                                                                                                                                        DECLARE
+                                                                                                                                                                                                                                                            v_user_id uuid;
+                                                                                                                                                                                                                                                                v_is_admin boolean;
+                                                                                                                                                                                                                                                                BEGIN
+                                                                                                                                                                                                                                                                    v_user_id := auth.uid();
+                                                                                                                                                                                                                                                                        v_is_admin := public.is_admin();
 
-    IF p_limit IS NULL THEN
-        p_limit := 1000;
-    END IF;
+                                                                                                                                                                                                                                                                            IF p_limit IS NULL THEN
+                                                                                                                                                                                                                                                                                    p_limit := 1000;
+                                                                                                                                                                                                                                                                                        END IF;
 
-    RETURN QUERY
-    SELECT
-        al.id,
-        al.created_at,
-        al.user_id,
-        al.action,
-        al.table_name,
-        al.record_id::TEXT,
-        al.old_data,
-        al.new_data,
-        al.metadata,
-        al.store_id,
-        s.name as store_name,
-        (
-            SELECT jsonb_build_object(
-                'full_name', p.full_name,
-                'role', p.role
-            )
-            FROM public.profiles p
-            WHERE p.id = al.user_id
-        ) as profile
-    FROM public.audit_logs al
-    LEFT JOIN public.stores s ON al.store_id = s.id
-    WHERE
-        (v_is_admin OR al.store_id IS NULL OR public.has_store_access(al.store_id))
-        AND (p_store_id IS NULL OR al.store_id = p_store_id)
-        AND (p_date_from IS NULL OR al.created_at >= p_date_from)
-        AND (p_date_to IS NULL OR al.created_at <= p_date_to)
-        AND (
-            p_search_term IS NULL OR p_search_term = ''
-            OR al.action ILIKE ('%' || p_search_term || '%')
-            OR al.table_name ILIKE ('%' || p_search_term || '%')
-            OR al.record_id::TEXT ILIKE ('%' || p_search_term || '%')
-        )
-    ORDER BY al.created_at DESC
-    LIMIT p_limit;
-END;
-
+                                                                                                                                                                                                                                                                                            RETURN QUERY
+                                                                                                                                                                                                                                                                                                SELECT
+                                                                                                                                                                                                                                                                                                        al.id,
+                                                                                                                                                                                                                                                                                                                al.created_at,
+                                                                                                                                                                                                                                                                                                                        al.user_id,
+                                                                                                                                                                                                                                                                                                                                al.action,
+                                                                                                                                                                                                                                                                                                                                        al.table_name,
+                                                                                                                                                                                                                                                                                                                                                al.record_id::TEXT,
+                                                                                                                                                                                                                                                                                                                                                        al.old_data,
+                                                                                                                                                                                                                                                                                                                                                                al.new_data,
+                                                                                                                                                                                                                                                                                                                                                                        al.metadata,
+                                                                                                                                                                                                                                                                                                                                                                                al.store_id,
+                                                                                                                                                                                                                                                                                                                                                                                        s.name as store_name,
+                                                                                                                                                                                                                                                                                                                                                                                                (
+                                                                                                                                                                                                                                                                                                                                                                                                            SELECT jsonb_build_object(
+                                                                                                                                                                                                                                                                                                                                                                                                                            'full_name', p.full_name,
+                                                                                                                                                                                                                                                                                                                                                                                                                                            'role', p.role
+                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                    FROM public.profiles p
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE p.id = al.user_id
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ) as profile
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM public.audit_logs al
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                LEFT JOIN public.stores s ON al.store_id = s.id
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    WHERE
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            (v_is_admin OR al.store_id IS NULL OR public.has_store_access(al.store_id))
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    AND (p_store_id IS NULL OR al.store_id = p_store_id)
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            AND (p_date_from IS NULL OR al.created_at >= p_date_from)
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    AND (p_date_to IS NULL OR al.created_at <= p_date_to)
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            AND (
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        p_search_term IS NULL OR p_search_term = ''
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    OR al.action ILIKE ('%' || p_search_term || '%')
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                OR al.table_name ILIKE ('%' || p_search_term || '%')
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            OR al.record_id::TEXT ILIKE ('%' || p_search_term || '%')
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ORDER BY al.created_at DESC
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            LIMIT p_limit;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            END;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
```

## get_dashboard_kpis(p_store_id uuid, p_date_from timestamp with time zone, p_date_to timestamp with time zone)  oid=51374

- Git final: 20260128_fix_dashboard_ambiguity.sql (md5 cuerpo 2b0df55f9f82)
- LIVE: oid 51374 (md5 prosrc 32598365cfd9) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260128_fix_dashboard_ambiguity.sql
+++ LIVE:oid51374
@@ -26,13 +26,13 @@
   )
   SELECT
     COALESCE(SUM(ft.total_amount), 0)::numeric AS total_sales,
-    CASE
-      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL
-      ELSE SUM(tc.transaction_cost)
+    CASE 
+      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL 
+      ELSE SUM(tc.transaction_cost) 
     END::numeric AS total_cost,
-    CASE
-      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL
-      ELSE SUM(ft.total_amount - COALESCE(tc.transaction_cost, 0))
+    CASE 
+      WHEN SUM(tc.missing_costs) > 0 OR (SUM(ft.total_amount) > 0 AND SUM(tc.transaction_cost) IS NULL) THEN NULL 
+      ELSE SUM(ft.total_amount - COALESCE(tc.transaction_cost, 0)) 
     END::numeric AS total_profit,
     COUNT(ft.id)::bigint AS transaction_count,
     COALESCE(AVG(ft.total_amount), 0)::numeric AS avg_ticket,
```

## get_sales_since_last_closure(p_store_id uuid)  oid=51380

- Git final: 20260228_fix_sales_since_last_closure_fallback.sql (md5 cuerpo 157d3df93e96)
- LIVE: oid 51380 (md5 prosrc c9f43cfecf9a) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260228_fix_sales_since_last_closure_fallback.sql
+++ LIVE:oid51380
@@ -1,29 +1,29 @@
 
-DECLARE
-    v_last_closure_at timestamptz;
-BEGIN
-    -- Find the last CLOSED closure for this store, using closed_at as the period marker
-    SELECT closed_at INTO v_last_closure_at
-    FROM public.cash_closures
-    WHERE store_id = p_store_id AND status = 'cerrado'
-    ORDER BY closed_at DESC
-    LIMIT 1;
+                DECLARE
+                    v_last_closure_at timestamptz;
+                    BEGIN
+                        -- Find the last CLOSED closure for this store, using closed_at as the period marker
+                            SELECT closed_at INTO v_last_closure_at
+                                FROM public.cash_closures
+                                    WHERE store_id = p_store_id AND status = 'cerrado'
+                                        ORDER BY closed_at DESC
+                                            LIMIT 1;
 
-    -- Fallback: If no closed closure exists, default to the beginning of time (1970-01-01)
-    -- instead of date_trunc('day', now()), so that it reflects the full balance.
-    IF v_last_closure_at IS NULL THEN
-        v_last_closure_at := '1970-01-01 00:00:00+00'::timestamptz;
-    END IF;
+                                                -- Fallback: If no closed closure exists, default to the beginning of time (1970-01-01)
+                                                    -- instead of date_trunc('day', now()), so that it reflects the full balance.
+                                                        IF v_last_closure_at IS NULL THEN
+                                                                v_last_closure_at := '1970-01-01 00:00:00+00'::timestamptz;
+                                                                    END IF;
 
-    RETURN QUERY
-    SELECT
-        COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
-        COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::numeric AS total_cash,
-        COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::numeric AS total_transfer,
-        v_last_closure_at AS last_closure_at
-    FROM public.transactions
-    WHERE store_id = p_store_id
-      AND status = 'completed'
-      AND created_at > v_last_closure_at;
-END;
-
+                                                                        RETURN QUERY
+                                                                            SELECT
+                                                                                    COALESCE(SUM(total_amount), 0)::numeric AS total_sales,
+                                                                                            COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0)::numeric AS total_cash,
+                                                                                                    COALESCE(SUM(CASE WHEN payment_method = 'transfer' THEN total_amount ELSE 0 END), 0)::numeric AS total_transfer,
+                                                                                                            v_last_closure_at AS last_closure_at
+                                                                                                                FROM public.transactions
+                                                                                                                    WHERE store_id = p_store_id
+                                                                                                                          AND status = 'completed'
+                                                                                                                                AND created_at > v_last_closure_at;
+                                                                                                                                END;
+                                                                                                                                
```

## audit_product_changes()  oid=52507

- Git final: 20260215_fix_sale_price_error.sql (md5 cuerpo b5d13dfaca1e)
- LIVE: oid 52507 (md5 prosrc 04a72348b8ed) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260215_fix_sale_price_error.sql
+++ LIVE:oid52507
@@ -1,33 +1,29 @@
 
-BEGIN
-    INSERT INTO public.audit_logs (
-        user_id,
-        action,
-        table_name,
-        record_id,
-        old_data,
-        new_data,
-        store_id
-    )
-    VALUES (
-        auth.uid(),
-        'UPDATE_PRODUCT',
-        'products',
-        NEW.id,
-        jsonb_build_object(
-            'name', OLD.name,
-            'price', OLD.price,
-            'cost_price', OLD.cost_price,
-            'sku', OLD.sku
-        ),
-        jsonb_build_object(
-            'name', NEW.name,
-            'price', NEW.price,
-            'cost_price', NEW.cost_price,
-            'sku', NEW.sku
-        ),
-        NEW.store_id
-    );
-    RETURN NEW;
-END;
-
+    BEGIN
+        INSERT INTO public.audit_logs (
+            user_id, action, table_name, record_id, old_data, new_data, store_id
+        )
+        VALUES (
+            auth.uid(),
+            'UPDATE_PRODUCT',
+            'products',
+            NEW.id,
+            jsonb_build_object(
+                'name', OLD.name,
+                'price', OLD.price,
+                'cost_price', OLD.cost_price,
+                'sku', OLD.sku,
+                'price_currency', OLD.price_currency
+            ),
+            jsonb_build_object(
+                'name', NEW.name,
+                'price', NEW.price,
+                'cost_price', NEW.cost_price,
+                'sku', NEW.sku,
+                'price_currency', NEW.price_currency
+            ),
+            NEW.store_id
+        );
+        RETURN NEW;
+    END;
+    
```

## audit_store_changes()  oid=52509

- Git final: 20260303_fix_store_audit_and_enable_management.sql (md5 cuerpo 1d673d9dcd6f)
- LIVE: oid 52509 (md5 prosrc d390ed6f87b8) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260303_fix_store_audit_and_enable_management.sql
+++ LIVE:oid52509
@@ -35,8 +35,7 @@
             OLD.id
         );
     END IF;
-
-    -- Return value for AFTER triggers is ignored, but let's be consistent
+    
     IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
 END;
 
```

## has_role(p_user_id uuid, p_required_role user_role)  oid=54235

- Git final: 20260212_fix_has_role_overload.sql (md5 cuerpo 63b78f6bed02)
- LIVE: oid 54235 (md5 prosrc 575fd3cdc020) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260212_fix_has_role_overload.sql
+++ LIVE:oid54235
@@ -1,17 +1,13 @@
 
-DECLARE
-    v_actual_role public.user_role;
+DECLARE v_actual_role public.user_role;
 BEGIN
     SELECT role INTO v_actual_role FROM public.profiles WHERE id = p_user_id;
+    IF v_actual_role IS NULL THEN RETURN false; END IF;
 
-    IF v_actual_role IS NULL THEN
-        RETURN false;
-    END IF;
-
-    -- Compatibility mapping (mirroring the 1-arg version)
+    -- Role Hierarchy Logic
+    IF v_actual_role = 'admin' THEN RETURN true; END IF;
     IF v_actual_role = 'encargado' AND p_required_role = 'manager' THEN RETURN true; END IF;
     IF v_actual_role = 'usuario' AND (p_required_role = 'clerk' OR p_required_role = 'warehouse') THEN RETURN true; END IF;
 
     RETURN v_actual_role = p_required_role;
-END;
-
+END; 
```

## has_role(p_required_role user_role)  oid=54236

- Git final: 20260212_fix_has_role_overload.sql (md5 cuerpo 63b78f6bed02)
- LIVE: oid 54236 (md5 prosrc 9723391e0113) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260212_fix_has_role_overload.sql
+++ LIVE:oid54236
@@ -1,17 +1,4 @@
 
-DECLARE
-    v_actual_role public.user_role;
 BEGIN
-    SELECT role INTO v_actual_role FROM public.profiles WHERE id = p_user_id;
-
-    IF v_actual_role IS NULL THEN
-        RETURN false;
-    END IF;
-
-    -- Compatibility mapping (mirroring the 1-arg version)
-    IF v_actual_role = 'encargado' AND p_required_role = 'manager' THEN RETURN true; END IF;
-    IF v_actual_role = 'usuario' AND (p_required_role = 'clerk' OR p_required_role = 'warehouse') THEN RETURN true; END IF;
-
-    RETURN v_actual_role = p_required_role;
-END;
-
+    RETURN public.has_role(auth.uid(), p_required_role);
+END; 
```

## get_product_stock_ledger_paginated(p_product_id uuid, p_store_id uuid, p_limit integer, p_offset integer)  oid=59843

- Git final: 20260227_fix_rpc_structures.sql (md5 cuerpo 3a9a4da80366)
- LIVE: oid 59843 (md5 prosrc 13e7905bad2f) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260227_fix_rpc_structures.sql
+++ LIVE:oid59843
@@ -1,39 +1,39 @@
 
-BEGIN
-  RETURN QUERY
-  WITH movements AS (
-    SELECT
-      m.id as movement_id,
-      m.created_at,
-      m.movement_type::TEXT as type,
-      COALESCE(m.reference_id::TEXT, 'S/Ref') as ref_id,
-      COALESCE(m.reference_doc::TEXT, 'S/Doc') as ref_doc,
-      m.quantity_change::NUMERIC as q_change,
-      CASE WHEN m.quantity_change > 0 THEN m.quantity_change::NUMERIC ELSE 0 END as q_entry,
-      CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change)::NUMERIC ELSE 0 END as q_exit,
-      -- Use the calculated balance to ensure accuracy, but call it balance_after for UI compatibility
-      SUM(m.quantity_change) OVER (ORDER BY m.created_at ASC, m.id ASC)::NUMERIC as balance,
-      m.unit_cost::NUMERIC as u_cost,
-      COUNT(*) OVER() as total_records
-    FROM public.stock_movements m
-    WHERE m.product_id = p_product_id
-      AND (p_store_id IS NULL OR m.store_id = p_store_id)
-  )
-  SELECT
-    m.movement_id,
-    m.created_at,
-    m.type,
-    m.ref_id,
-    m.ref_doc,
-    m.q_change,
-    m.q_entry,
-    m.q_exit,
-    m.balance,
-    m.u_cost,
-    m.total_records
-  FROM movements m
-  ORDER BY m.created_at DESC
-  LIMIT p_limit
-  OFFSET p_offset;
-END;
-
+                              BEGIN
+                                RETURN QUERY
+                                  WITH movements AS (
+                                      SELECT
+                                            m.id as movement_id,
+                                                  m.created_at,
+                                                        m.movement_type::TEXT as type,
+                                                              COALESCE(m.reference_id::TEXT, 'S/Ref') as ref_id,
+                                                                    COALESCE(m.reference_doc::TEXT, 'S/Doc') as ref_doc,
+                                                                          m.quantity_change::NUMERIC as q_change,
+                                                                                CASE WHEN m.quantity_change > 0 THEN m.quantity_change::NUMERIC ELSE 0 END as q_entry,
+                                                                                      CASE WHEN m.quantity_change < 0 THEN ABS(m.quantity_change)::NUMERIC ELSE 0 END as q_exit,
+                                                                                            -- Use the calculated balance to ensure accuracy, but call it balance_after for UI compatibility
+                                                                                                  SUM(m.quantity_change) OVER (ORDER BY m.created_at ASC, m.id ASC)::NUMERIC as balance,
+                                                                                                        m.unit_cost::NUMERIC as u_cost,
+                                                                                                              COUNT(*) OVER() as total_records
+                                                                                                                  FROM public.stock_movements m
+                                                                                                                      WHERE m.product_id = p_product_id
+                                                                                                                            AND (p_store_id IS NULL OR m.store_id = p_store_id)
+                                                                                                                              )
+                                                                                                                                SELECT
+                                                                                                                                    m.movement_id,
+                                                                                                                                        m.created_at,
+                                                                                                                                            m.type,
+                                                                                                                                                m.ref_id,
+                                                                                                                                                    m.ref_doc,
+                                                                                                                                                        m.q_change,
+                                                                                                                                                            m.q_entry,
+                                                                                                                                                                m.q_exit,
+                                                                                                                                                                    m.balance,
+                                                                                                                                                                        m.u_cost,
+                                                                                                                                                                            m.total_records
+                                                                                                                                                                              FROM movements m
+                                                                                                                                                                                ORDER BY m.created_at DESC
+                                                                                                                                                                                  LIMIT p_limit
+                                                                                                                                                                                    OFFSET p_offset;
+                                                                                                                                                                                    END;
+                                                                                                                                                                                    
```

## update_transaction_taxes(p_transaction_id uuid, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric)  oid=59867

- Git final: 20260228_implement_taxes.sql (md5 cuerpo 94a0c28a9e9a)
- LIVE: oid 59867 (md5 prosrc 5923cf78c997) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260228_implement_taxes.sql
+++ LIVE:oid59867
@@ -1,42 +1,42 @@
 
-DECLARE
-    v_old_tax_amount numeric;
-    v_store_id uuid;
-BEGIN
-    -- Check permissions (only manager or admin)
-    IF NOT (public.is_admin() OR public.has_role('manager') OR public.has_role('encargado')) THEN
-        RAISE EXCEPTION 'Unauthorized: Only managers can update taxes of confirmed sales';
-    END IF;
+                                                                                                                                                                                                                                                                                                                                                                                                                        DECLARE
+                                                                                                                                                                                                                                                                                                                                                                                                                            v_old_tax_amount numeric;
+                                                                                                                                                                                                                                                                                                                                                                                                                                v_store_id uuid;
+                                                                                                                                                                                                                                                                                                                                                                                                                                BEGIN
+                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Check permissions (only manager or admin)
+                                                                                                                                                                                                                                                                                                                                                                                                                                        IF NOT (public.is_admin() OR public.has_role('manager') OR public.has_role('encargado')) THEN
+                                                                                                                                                                                                                                                                                                                                                                                                                                                RAISE EXCEPTION 'Unauthorized: Only managers can update taxes of confirmed sales';
+                                                                                                                                                                                                                                                                                                                                                                                                                                                    END IF;
 
-    SELECT tax_amount, store_id INTO v_old_tax_amount, v_store_id
-    FROM public.transactions
-    WHERE id = p_transaction_id;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                        SELECT tax_amount, store_id INTO v_old_tax_amount, v_store_id
+                                                                                                                                                                                                                                                                                                                                                                                                                                                            FROM public.transactions
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE id = p_transaction_id;
 
-    IF NOT FOUND THEN
-        RAISE EXCEPTION 'Transaction not found';
-    END IF;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                    IF NOT FOUND THEN
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                            RAISE EXCEPTION 'Transaction not found';
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                END IF;
 
-    -- Update transaction
-    UPDATE public.transactions
-    SET
-        applied_taxes = p_applied_taxes,
-        tax_amount = p_tax_amount,
-        total_amount = p_total_amount,
-        updated_at = now()
-    WHERE id = p_transaction_id;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Update transaction
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        UPDATE public.transactions
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            SET
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    applied_taxes = p_applied_taxes,
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            tax_amount = p_tax_amount,
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    total_amount = p_total_amount,
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            updated_at = now()
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                WHERE id = p_transaction_id;
 
-    -- Audit Log
-    INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
-    VALUES (
-        auth.uid(),
-        'UPDATE_TRANSACTION_TAXES',
-        'transactions',
-        p_transaction_id,
-        jsonb_build_object('tax_amount', v_old_tax_amount),
-        jsonb_build_object('tax_amount', p_tax_amount, 'total_amount', p_total_amount, 'applied_taxes', p_applied_taxes),
-        v_store_id
-    );
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    -- Audit Log
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        INSERT INTO public.audit_logs (user_id, action, table_name, record_id, old_data, new_data, store_id)
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            VALUES (
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    auth.uid(),
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            'UPDATE_TRANSACTION_TAXES',
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    'transactions',
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            p_transaction_id,
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    jsonb_build_object('tax_amount', v_old_tax_amount),
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            jsonb_build_object('tax_amount', p_tax_amount, 'total_amount', p_total_amount, 'applied_taxes', p_applied_taxes),
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    v_store_id
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        );
 
-    RETURN true;
-END;
-
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            RETURN true;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            END;
+                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            
```

## check_reception_cost_variation()  oid=63381

- Git final: 20260301_control_fallos_harden.sql (md5 cuerpo eb770694e1e9)
- LIVE: oid 63381 (md5 prosrc 1424892eba9a) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260301_control_fallos_harden.sql
+++ LIVE:oid63381
@@ -3,7 +3,7 @@
     v_avg_cost NUMERIC;
 BEGIN
     SELECT COALESCE(cost_price, 0) INTO v_avg_cost FROM public.products WHERE id = NEW.product_id;
-
+    
     IF v_avg_cost > 0 AND (NEW.unit_cost > v_avg_cost * 2.0 OR NEW.unit_cost < v_avg_cost * 0.2) THEN
         -- For now we just log a warning in the DB console or metadata
         -- Future: INSERT INTO audit_logs
```

## is_role_not_changed(p_user_id uuid, p_new_role user_role, p_new_role_id uuid)  oid=75761

- Git final: 20260305_fix_profiles_rls_final.sql (md5 cuerpo 3bfcdeb6cad3)
- LIVE: oid 75761 (md5 prosrc a345cded52ff) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260305_fix_profiles_rls_final.sql
+++ LIVE:oid75761
@@ -6,8 +6,8 @@
   SELECT role, role_id INTO v_old_role, v_old_role_id
   FROM public.profiles
   WHERE id = p_user_id;
-
-  RETURN (p_new_role IS NOT DISTINCT FROM v_old_role)
+  
+  RETURN (p_new_role IS NOT DISTINCT FROM v_old_role) 
      AND (p_new_role_id IS NOT DISTINCT FROM v_old_role_id);
 END;
 
```

## managed_delete_user(p_user_id uuid)  oid=79083

- Git final: 20260317_fix_safe_delete_user.sql (md5 cuerpo 3770a6aa0977)
- LIVE: oid 79083 (md5 prosrc 0e2c65659af7) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260317_fix_safe_delete_user.sql
+++ LIVE:oid79083
@@ -18,7 +18,7 @@
     -- Perform deletion (Cascades to memberships and other metadata)
     -- We explicitly delete memberships first just in case
     DELETE FROM public.user_store_memberships WHERE user_id = p_user_id;
-
+    
     -- Deleting from profiles
     DELETE FROM public.profiles WHERE id = p_user_id;
 
```

## log_audit_event(p_action text, p_payload jsonb, p_store_id uuid)  oid=88135

- Git final: 20260324_total_remediation.sql (md5 cuerpo 9392dfdda2bb)
- LIVE: oid 88135 (md5 prosrc a700956c0e79) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260324_total_remediation.sql
+++ LIVE:oid88135
@@ -6,19 +6,20 @@
     v_event_id UUID;
     v_tenant_id UUID;
     v_role TEXT;
+    v_timestamp TIMESTAMPTZ;
+    v_ts_str TEXT;
 BEGIN
+    PERFORM pg_advisory_xact_lock(20240325);
+    v_timestamp := (now() AT TIME ZONE 'utc');
+    v_ts_str := to_char(v_timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"');
     SELECT tenant_id, role::text INTO v_tenant_id, v_role FROM public.profiles WHERE id = auth.uid();
-    SELECT event_hash INTO v_prev_hash FROM public.audit_events ORDER BY utc_timestamp DESC LIMIT 1;
-
+    -- Use seq_id for deterministic last record
+    SELECT event_hash INTO v_prev_hash FROM public.audit_events ORDER BY seq_id DESC LIMIT 1;
     v_payload_hash := encode(extensions.digest(p_payload::text, 'sha256'), 'hex');
-    v_event_hash := encode(extensions.digest(v_payload_hash || COALESCE(v_prev_hash, '') || now()::text, 'sha256'), 'hex');
-
-    INSERT INTO public.audit_events (
-        actor_id, role, tenant_id, store_id, action, payload_hash, previous_event_hash, event_hash
-    ) VALUES (
-        auth.uid(), v_role, v_tenant_id, p_store_id, p_action, v_payload_hash, v_prev_hash, v_event_hash
-    ) RETURNING id INTO v_event_id;
-
+    v_event_hash := encode(extensions.digest(v_payload_hash || COALESCE(v_prev_hash, '') || v_ts_str, 'sha256'), 'hex');
+    INSERT INTO public.audit_events (actor_id, role, tenant_id, store_id, action, payload_hash, previous_event_hash, event_hash, utc_timestamp)
+    VALUES (auth.uid(), v_role, v_tenant_id, p_store_id, p_action, v_payload_hash, v_prev_hash, v_event_hash, v_timestamp)
+    RETURNING id INTO v_event_id;
     RETURN v_event_id;
 END;
 
```

## managed_create_user(p_max_users integer, p_max_stores integer, p_role text, p_full_name text, p_email text, p_creator_id uuid, p_target_user_id uuid, p_store_id uuid, p_memberships jsonb)  oid=88184

- Git final: 20260326_multi_tenant_hardening.sql (md5 cuerpo 3fd25e2139da)
- LIVE: oid 88184 (md5 prosrc 1dcf4b1c3d55) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260326_multi_tenant_hardening.sql
+++ LIVE:oid88184
@@ -1,48 +1,90 @@
 
 DECLARE
-    v_user_id uuid;
-    v_role_id uuid;
-    v_active_store_id uuid;
+    v_role_id UUID;
+    v_role_enum user_role;
+    v_role_name TEXT;
+    v_user_id UUID;
+    v_active_store_id UUID;
+    v_creator_role user_role;
+    v_auth_uid uuid := auth.uid();
     m JSONB;
-    v_creator_role user_role;
 BEGIN
-    SELECT role INTO v_creator_role FROM public.profiles WHERE id = auth.uid();
+    -- 🛡️ identity Verification
+    IF p_creator_id IS NOT NULL AND p_creator_id != v_auth_uid THEN
+         RAISE EXCEPTION 'ERR_UNAUTHORIZED: Creator ID mismatch.';
+    END IF;
+
+    -- 🛡️ RBAC Check
+    SELECT role INTO v_creator_role FROM public.profiles WHERE id = v_auth_uid;
     IF v_creator_role IS NULL OR v_creator_role NOT IN ('admin', 'encargado') THEN
         RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins and managers can create users.';
     END IF;
 
-    v_active_store_id := COALESCE((p_memberships->0->>'store_id')::UUID, p_store_id);
+    -- Normalize Role Name
+    v_role_name := lower(p_role);
+    IF v_role_name IN ('cajero', 'clerk') THEN v_role_enum := 'clerk'::user_role;
+    ELSIF v_role_name IN ('almacenero', 'warehouse') THEN v_role_enum := 'warehouse'::user_role;
+    ELSIF v_role_name IN ('encargado', 'manager') THEN v_role_enum := 'encargado'::user_role;
+    ELSIF v_role_name IN ('admin') THEN v_role_enum := 'admin'::user_role;
+    ELSE v_role_enum := 'costo'::user_role;
+    END IF;
 
-    IF v_creator_role = 'encargado' AND v_active_store_id IS NOT NULL THEN
-        IF NOT public.has_store_access(v_active_store_id) THEN
-            RAISE EXCEPTION 'ERR_UNAUTHORIZED: No access to store %', v_active_store_id;
+    -- 🛡️ ROLE HIERARCHY CHECK (CRITICAL FIX)
+    IF v_role_enum = 'admin' AND v_creator_role != 'admin' THEN
+        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Only admins can create other admins.';
+    END IF;
+
+    -- Get Role ID from table
+    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = lower(v_role_enum::text) LIMIT 1;
+    
+    IF v_role_id IS NULL THEN
+        SELECT id INTO v_role_id FROM public.roles WHERE name = 'costo' LIMIT 1;
+        v_role_enum := 'costo'::user_role;
+    END IF;
+
+    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());
+
+    -- Determine initial active_store_id
+    IF p_memberships IS NOT NULL AND jsonb_array_length(p_memberships) > 0 THEN
+        v_active_store_id := (p_memberships->0->>'store_id')::UUID;
+    ELSE
+        v_active_store_id := p_store_id;
+    END IF;
+
+    -- Create or update profile
+    INSERT INTO public.profiles (
+        id, email, full_name, role, role_id, active_store_id, is_active, max_stores_limit, max_users_limit, created_by
+    ) VALUES (
+        v_user_id, p_email, p_full_name, v_role_enum, v_role_id, v_active_store_id, true, p_max_stores, p_max_users, v_auth_uid
+    )
+    ON CONFLICT (id) DO UPDATE SET
+        full_name = EXCLUDED.full_name,
+        role = EXCLUDED.role,
+        role_id = EXCLUDED.role_id,
+        active_store_id = EXCLUDED.active_store_id,
+        is_active = EXCLUDED.is_active,
+        max_stores_limit = EXCLUDED.max_stores_limit,
+        max_users_limit = EXCLUDED.max_users_limit;
+
+    -- Handle memberships
+    IF p_memberships IS NOT NULL THEN
+        DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
+        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships)
+        LOOP
+             -- Only allow adding memberships to stores the creator has access to
+             IF v_creator_role = 'admin' OR public.has_store_access((m->>'store_id')::UUID) THEN
+                INSERT INTO public.user_store_memberships (user_id, store_id, role)
+                VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role);
+             END IF;
+        END LOOP;
+    ELSIF p_store_id IS NOT NULL THEN
+        IF v_creator_role = 'admin' OR public.has_store_access(p_store_id) THEN
+            INSERT INTO public.user_store_memberships (user_id, store_id, role)
+            VALUES (v_user_id, p_store_id, v_role_enum)
+            ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
         END IF;
     END IF;
 
-    SELECT id INTO v_role_id FROM public.roles WHERE lower(name) = lower(p_role::text) OR (name = 'Cajero' AND p_role = 'clerk') OR (name = 'Almacenero' AND p_role = 'warehouse') LIMIT 1;
-    v_user_id := COALESCE(p_target_user_id, gen_random_uuid());
-
-    INSERT INTO public.profiles (id, email, full_name, role, role_id, active_store_id, is_active, created_by, max_stores_limit, max_users_limit, created_at, updated_at)
-    VALUES (v_user_id, p_email, p_full_name, p_role, v_role_id, v_active_store_id, true, auth.uid(), p_max_stores, p_max_users, now(), now())
-    ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, role = EXCLUDED.role, role_id = EXCLUDED.role_id, active_store_id = EXCLUDED.active_store_id, updated_at = now()
-    RETURNING id INTO v_user_id;
-
-    IF p_memberships IS NOT NULL THEN
-        IF v_creator_role != 'admin' THEN
-            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id AND store_id IN (SELECT store_id FROM public.user_store_memberships WHERE user_id = auth.uid() AND role IN ('encargado', 'manager'));
-        ELSE
-            DELETE FROM public.user_store_memberships WHERE user_id = v_user_id;
-        END IF;
-        FOR m IN SELECT * FROM jsonb_array_elements(p_memberships) LOOP
-            IF (m->>'store_id') IS NOT NULL AND (m->>'store_id') <> '' THEN
-                IF v_creator_role = 'admin' OR public.has_store_access((m->>'store_id')::UUID) THEN
-                    INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES (v_user_id, (m->>'store_id')::UUID, (m->>'role')::user_role) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
-                END IF;
-            END IF;
-        END LOOP;
-    ELSIF p_store_id IS NOT NULL THEN
-        INSERT INTO public.user_store_memberships (user_id, store_id, role) VALUES (v_user_id, p_store_id, p_role) ON CONFLICT (user_id, store_id) DO UPDATE SET role = EXCLUDED.role;
-    END IF;
     RETURN jsonb_build_object('success', true, 'user_id', v_user_id);
 END;
 
```

## cancel_transfer(p_transfer_id uuid, p_user_id uuid)  oid=130873

- Git final: 20260802000002_v2_12_42_transfer_remediation.sql (md5 cuerpo 381d4db2d513)
- LIVE: oid 130873 (md5 prosrc 2a5a9ce7940f) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260802000002_v2_12_42_transfer_remediation.sql
+++ LIVE:oid130873
@@ -4,29 +4,26 @@
   v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
 BEGIN
   SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
-  IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
-  IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;
+  IF NOT FOUND THEN
+    RAISE EXCEPTION 'ERR_TRANSFER_NOT_FOUND';
+  END IF;
+  IF v_transfer.status != 'PENDIENTE' THEN
+    RAISE EXCEPTION 'ERR_NOT_PENDING: solo se pueden cancelar transferencias PENDIENTE (estado actual: %)', v_transfer.status;
+  END IF;
 
-  -- Autorización: caller debe tener acceso al origen
+  -- V2.5 H3: autorización — caller debe tener acceso al origen
   IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.origin_store_id) THEN
     RAISE EXCEPTION 'ERR_UNAUTHORIZED';
   END IF;
 
-  -- Actualizar estado
   UPDATE public.transfers
-    SET status = 'CANCELADA', notes = COALESCE(notes, '') || ' [CANCELADA: ' || p_reason || ']'
+    SET status = 'CANCELADA', updated_at = NOW()
     WHERE id = p_transfer_id;
 
-  -- Liberar reservas ACTIVE
-  UPDATE public.inventory_reservations
-    SET status = 'RELEASED', released_at = NOW()
-    WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id AND status = 'ACTIVE';
-
-  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
-  VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_cancelled', 'transfers', p_transfer_id,
-    jsonb_build_object('reason', p_reason, 'reservations_released',
-      (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'RELEASED')));
-
-  RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
+  RETURN jsonb_build_object(
+    'status', 'success',
+    'transfer_id', p_transfer_id,
+    'new_status', 'CANCELADA'
+  );
 END;
 
```

## fn_process_receipt(p_items jsonb, p_user_id uuid, p_store_id uuid, p_reference text)  oid=130964

- Git final: 20260326_multi_tenant_hardening.sql (md5 cuerpo b32dfcca5b9b)
- LIVE: oid 130964 (md5 prosrc ee57bdfc693d) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260326_multi_tenant_hardening.sql
+++ LIVE:oid130964
@@ -3,62 +3,70 @@
     v_receipt_id uuid;
     v_item jsonb;
     v_prod_id uuid;
-    v_qty int;
+    v_qty numeric;
     v_cost numeric;
-    v_current_stock int;
+    v_current_stock numeric;
     v_current_avg_cost numeric;
-    v_new_stock int;
-    v_new_avg_cost numeric;
+    v_new_stock numeric;
     v_total_receipt numeric := 0;
     v_new_details jsonb;
     v_sku text;
+    v_store uuid := p_store_id;
     v_auth_user_id uuid := auth.uid();
 BEGIN
     IF v_auth_user_id IS NOT NULL AND v_auth_user_id != p_user_id THEN
-        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch';
+        RAISE EXCEPTION 'ERR_UNAUTHORIZED: Identity mismatch. p_user_id (%) does not match auth.uid() (%)', p_user_id, v_auth_user_id;
     END IF;
 
-    INSERT INTO public.receipts (user_id, status, reference_doc)
-    VALUES (p_user_id, 'active', p_reference)
+    INSERT INTO public.receipts (user_id, store_id, status, reference_doc)
+    VALUES (p_user_id, v_store, 'active', p_reference)
     RETURNING id INTO v_receipt_id;
 
     FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
     LOOP
         v_sku := v_item->>'sku';
-        v_qty := (v_item->>'quantity')::int;
+        v_qty := (v_item->>'quantity')::numeric;
         v_cost := (v_item->>'unit_cost')::numeric;
         v_new_details := v_item->'new_product_details';
 
-        IF v_sku IS NULL OR v_sku = '' THEN
-            RAISE EXCEPTION 'SKU es obligatorio';
+        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
+            INSERT INTO public.products (name, sku, cost_price, price, unit_of_measure, supplier, image_url, stock_current, cost_average, store_id)
+            VALUES (
+                v_new_details->>'name', v_sku, v_cost, COALESCE((v_new_details->>'price')::numeric, 0),
+                COALESCE(v_new_details->>'unit_of_measure','unidad'), v_new_details->>'supplier',
+                v_new_details->>'image_url', 0, 0, v_store)
+            RETURNING id INTO v_prod_id;
+            v_current_stock := 0; v_current_avg_cost := 0;
+        ELSE
+            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku AND store_id = v_store;
+            IF v_prod_id IS NULL THEN
+                SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku LIMIT 1;
+            END IF;
+            IF v_prod_id IS NULL THEN
+                RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_sku;
+            END IF;
+            SELECT store_id INTO v_store FROM public.products WHERE id = v_prod_id;
+            SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost
+            FROM public.products WHERE id = v_prod_id FOR UPDATE;
         END IF;
 
-        IF v_qty <= 0 THEN RAISE EXCEPTION 'Cantidad debe ser positiva'; END IF;
+        v_new_stock := COALESCE(v_current_stock,0) + v_qty;
 
-        IF v_new_details IS NOT NULL AND v_new_details != 'null'::jsonb THEN
-            SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku;
-            IF v_prod_id IS NULL THEN
-                INSERT INTO public.products (name, sku, cost_price, price, stock_current, cost_average)
-                VALUES (v_new_details->>'name', v_sku, v_cost, (v_new_details->>'price')::numeric, 0, 0)
-                RETURNING id INTO v_prod_id;
-            END IF;
-        ELSE
-             v_prod_id := (v_item->>'product_id')::uuid;
-             IF v_prod_id IS NULL THEN SELECT id INTO v_prod_id FROM public.products WHERE sku = v_sku; END IF;
-             IF v_prod_id IS NULL THEN RAISE EXCEPTION 'Producto no encontrado: %', v_sku; END IF;
-        END IF;
+        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost, tasa_cambio_recepcion)
+        VALUES (v_receipt_id, v_prod_id, v_qty, v_cost, 1.0);
 
-        SELECT stock_current, cost_average INTO v_current_stock, v_current_avg_cost FROM public.products WHERE id = v_prod_id FOR UPDATE;
-        v_new_stock := COALESCE(v_current_stock, 0) + v_qty;
-        v_new_avg_cost := CASE WHEN v_new_stock > 0 THEN ((COALESCE(v_current_stock,0) * COALESCE(v_current_avg_cost,0)) + (v_qty * v_cost)) / v_new_stock ELSE v_cost END;
+        -- DF-01: mismo contrato que la 3-arg (WAC primero, movimiento canónico)
+        PERFORM public.fn_recalc_wac(v_store, v_prod_id, 'direct_ingest', v_qty, v_cost,
+                   jsonb_build_object('rpc','fn_process_receipt4','receipt_id',v_receipt_id));
+        PERFORM public.register_stock_movement(
+          p_product_id := v_prod_id, p_store_id := v_store, p_user_id := p_user_id,
+          p_quantity := v_qty, p_movement_type := 'purchase', p_reason := 'Ingesta directa',
+          p_sale_id := v_receipt_id, p_unit_cost := v_cost,
+          p_operation_date := now(), p_skip_access_check := TRUE);
 
-        INSERT INTO public.receipt_items (receipt_id, product_id, quantity, unit_cost) VALUES (v_receipt_id, v_prod_id, v_qty, v_cost);
-        UPDATE public.products SET stock_current = v_new_stock, cost_average = v_new_avg_cost, cost_price = v_cost WHERE id = v_prod_id;
-        INSERT INTO public.inventory_movements (product_id, type, quantity_change, reference_id, user_id, balance_after)
-        VALUES (v_prod_id, 'IN_RECEIPT', v_qty, v_receipt_id, p_user_id, v_new_stock);
         v_total_receipt := v_total_receipt + (v_qty * v_cost);
     END LOOP;
+
     UPDATE public.receipts SET total_cost = v_total_receipt WHERE id = v_receipt_id;
     RETURN v_receipt_id;
-END;
-
+END 
```

## process_initial_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric, p_reference_doc text, p_movement_date timestamp with time zone)  oid=131362

- Git final: 20260127_canonical_stock_movement.sql (md5 cuerpo 4013981e7dfd)
- LIVE: oid 131362 (md5 prosrc 725a8ccd477b) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260127_canonical_stock_movement.sql
+++ LIVE:oid131362
@@ -1,37 +1,9 @@
 
-DECLARE
-    v_current_stock integer;
 BEGIN
-    -- Validar cantidad
-    IF p_quantity < 0 THEN
-        RAISE EXCEPTION 'ERR_INVALID_QUANTITY: Initial stock cannot be negative';
-    END IF;
-
-    -- Verificar si ya existe stock para este producto
-    SELECT quantity INTO v_current_stock
-    FROM public.inventory
-    WHERE store_id = p_store_id AND product_id = p_product_id;
-
-    IF v_current_stock IS NOT NULL AND v_current_stock > 0 THEN
-        RAISE EXCEPTION 'ERR_STOCK_EXISTS: Product already has stock. Use adjustment instead.';
-    END IF;
-
-    -- Insertar movimiento de stock
     PERFORM public.register_stock_movement(
-        p_product_id := p_product_id,
-        p_store_id := p_store_id,
-        p_user_id := auth.uid(),
-        p_quantity := p_quantity,
-        p_movement_type := 'initial',
-        p_reason := p_reference_doc,
-        p_sale_id := NULL,
-        p_unit_cost := 0
+        p_product_id := p_product_id, p_store_id := p_store_id, p_user_id := auth.uid(),
+        p_quantity := p_quantity, p_movement_type := 'initial', p_reason := p_reference_doc
     );
-
-    RETURN jsonb_build_object(
-        'success', true,
-        'message', 'Initial stock processed successfully',
-        'new_quantity', p_quantity
-    );
+    RETURN jsonb_build_object('success', true, 'new_quantity', p_quantity);
 END;
 
```

## deduct_stock(p_store_id uuid, p_product_id uuid, p_quantity numeric)  oid=131395

- Git final: 20260127_canonical_stock_movement.sql (md5 cuerpo 343a5dcca1b9)
- LIVE: oid 131395 (md5 prosrc 669feb8d5470) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260127_canonical_stock_movement.sql
+++ LIVE:oid131395
@@ -1,14 +1,6 @@
 
 BEGIN
-  PERFORM public.register_stock_movement(
-    p_product_id := p_product_id,
-    p_store_id := p_store_id,
-    p_user_id := auth.uid(),
-    p_quantity := -p_quantity,
-    p_movement_type := 'adjustment',
-    p_reason := 'Direct deduction via deduct_stock',
-    p_sale_id := NULL,
-    p_unit_cost := 0
-  );
+  -- hint: auth.uid()
+  PERFORM public.register_stock_movement(p_product_id := p_product_id, p_store_id := p_store_id, p_user_id := auth.uid(), p_quantity := -p_quantity, p_movement_type := 'adjustment', p_reason := 'Direct deduction', p_unit_cost := 0);
 END;
 
```

## has_store_role(p_store_id uuid, p_roles text[])  oid=131888

- Git final: 20260820000001_security_fix_spoofable_caller_uid.sql (md5 cuerpo 53dd721499bf)
- LIVE: oid 131888 (md5 prosrc bf4b1761a6cc) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260820000001_security_fix_spoofable_caller_uid.sql
+++ LIVE:oid131888
@@ -1,19 +1,12 @@
 
-  SELECT CASE WHEN auth.role() = 'service_role' THEN
-    EXISTS (
-      SELECT 1 FROM public.user_store_memberships m
-      WHERE m.user_id = p_user_id
-        AND m.store_id = p_store_id
-        AND m.status = 'active'
-        AND m.role::text = ANY(p_roles)
-    )
-  ELSE
-    EXISTS (
-      SELECT 1 FROM public.user_store_memberships m
-      WHERE m.user_id = auth.uid()
-        AND m.store_id = p_store_id
-        AND m.status = 'active'
-        AND m.role::text = ANY(p_roles)
-    )
-  END
+BEGIN
+  RETURN EXISTS (
+    SELECT 1
+    FROM public.user_store_memberships m
+    WHERE m.user_id = auth.uid()
+      AND m.store_id = p_store_id
+      AND m.status = 'active'
+      AND m.role::text = ANY(p_roles)
+  );
+END;
 
```

## soft_delete_store(p_store_id uuid, p_deleted_by uuid)  oid=131945

- Git final: 20260802000001_v2_12_41_fase0_remediacion.sql (md5 cuerpo 3ad3fd0fc465)
- LIVE: oid 131945 (md5 prosrc ee3f201799b9) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260802000001_v2_12_41_fase0_remediacion.sql
+++ LIVE:oid131945
@@ -1,62 +1,36 @@
 
 DECLARE
-  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
-    THEN COALESCE(p_deleted_by, auth.uid()) ELSE auth.uid() END;
   v_result JSONB;
-  v_validation JSONB;
-  v_blockers TEXT;
+  v_caller_role TEXT;
 BEGIN
-  -- Anti-spoofing: verificar que el caller tiene acceso
-  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
-    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
+  -- AUTH CHECK: Solo admin
+  IF auth.uid() IS NOT NULL THEN
+    SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid();
+    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
+      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede soft-delete stores';
+    END IF;
   END IF;
 
-  -- Verificar que la tienda existe y está activa
   IF NOT EXISTS (SELECT 1 FROM stores WHERE id = p_store_id AND is_active = true) THEN
     RAISE EXCEPTION 'Tienda no encontrada o ya inactiva';
   END IF;
 
-  -- H-007/008/009: Validar dependencias empresariales antes de eliminar
-  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(p_store_id, 'soft_delete');
-
-  IF NOT (v_validation->>'can_modify')::boolean THEN
-    SELECT string_agg(blocker->>'message', '; ')
-    INTO v_blockers
-    FROM jsonb_array_elements(v_validation->'blockers') AS blocker;
-
-    RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', COALESCE(v_blockers, 'Hay dependencias pendientes');
-  END IF;
-
-  -- 1. Soft-delete the store
   UPDATE stores SET is_active = false WHERE id = p_store_id;
-
-  -- 2. Revoke all memberships
-  UPDATE user_store_memberships
-  SET status = 'revoked'
-  WHERE store_id = p_store_id AND status = 'active';
-
-  -- 3. Clear active_store_id references
+  UPDATE user_store_memberships SET status = 'revoked' WHERE store_id = p_store_id AND status = 'active';
   UPDATE profiles SET active_store_id = NULL WHERE active_store_id = p_store_id;
 
-  -- 4. Log the deletion (usar v_caller_uid, no p_deleted_by)
   INSERT INTO audit_logs (action, table_name, record_id, store_id, metadata)
   VALUES (
     'store_soft_deleted', 'stores', p_store_id, p_store_id,
-    jsonb_build_object(
-      'deleted_by', v_caller_uid,
-      'deleted_at', now(),
-      'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked')
-    )
+    jsonb_build_object('deleted_by', p_deleted_by, 'deleted_at', now())
   );
 
-  -- 5. Retornar resultado con count correcto (H-013 fix)
   SELECT jsonb_build_object(
-    'store_id', p_store_id,
-    'is_active', false,
+    'store_id', p_store_id, 'is_active', false,
     'memberships_revoked', (SELECT count(*) FROM user_store_memberships WHERE store_id = p_store_id AND status = 'revoked'),
-    'profiles_cleared', (SELECT count(*) FROM profiles WHERE id IN (
+    'profiles_cleared', (SELECT count(*) FROM profiles WHERE active_store_id IS NULL AND id IN (
       SELECT user_id FROM user_store_memberships WHERE store_id = p_store_id
-    ) AND active_store_id IS NULL)
+    ))
   ) INTO v_result;
 
   RETURN v_result;
```

## get_usage_forecast()  oid=132940

- Git final: 20260626000001_usage_tracking.sql (md5 cuerpo a8be75354c56)
- LIVE: oid 132940 (md5 prosrc 4b256a97c922) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260626000001_usage_tracking.sql
+++ LIVE:oid132940
@@ -1,5 +1,4 @@
 
-#variable_conflict use_column
 DECLARE
   v_month_start TIMESTAMPTZ := date_trunc('month', now());
   v_day_of_month INTEGER := EXTRACT(DAY FROM now());
@@ -7,40 +6,36 @@
   v_days_remaining INTEGER;
 BEGIN
   v_days_remaining := v_days_in_month - v_day_of_month;
-
   RETURN QUERY
   SELECT
     t.metric_type,
     t.service,
     CASE
-      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(today.sum_value, 0)::DOUBLE PRECISION
-      ELSE COALESCE(today.sum_count, 0)::DOUBLE PRECISION
+      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(today.sum_value, 0)
+      ELSE COALESCE(today.sum_count, 0)
     END,
     CASE
-      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(last7.avg_daily_value, 0)::DOUBLE PRECISION
-      ELSE COALESCE(last7.avg_daily_count, 0)::DOUBLE PRECISION
+      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(last7.avg_daily_value, 0)
+      ELSE COALESCE(last7.avg_daily_count, 0)
     END,
     CASE
-      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(month_so_far.sum_value, 0)::DOUBLE PRECISION
-      ELSE COALESCE(month_so_far.sum_count, 0)::DOUBLE PRECISION
+      WHEN t.unit IN ('bytes', 'ms') THEN COALESCE(month_so_far.sum_value, 0)
+      ELSE COALESCE(month_so_far.sum_count, 0)
     END,
     CASE
       WHEN t.unit IN ('bytes', 'ms') THEN
-        (COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining)::DOUBLE PRECISION
+        COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining
       ELSE
-        (COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining)::DOUBLE PRECISION
+        COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining
     END,
     t.monthly_limit,
     CASE
+      WHEN t.monthly_limit > 0 AND t.unit IN ('bytes', 'ms') THEN
+        ROUND((COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining) / t.monthly_limit * 100, 2)
       WHEN t.monthly_limit > 0 THEN
-        CASE
-          WHEN t.unit IN ('bytes', 'ms') THEN
-            ROUND(((COALESCE(month_so_far.sum_value, 0) + COALESCE(last7.avg_daily_value, 0) * v_days_remaining) / t.monthly_limit * 100)::numeric, 2)
-          ELSE
-            ROUND(((COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining) / t.monthly_limit * 100)::numeric, 2)
-        END
+        ROUND((COALESCE(month_so_far.sum_count, 0) + COALESCE(last7.avg_daily_count, 0) * v_days_remaining) / t.monthly_limit * 100, 2)
       ELSE 0
-    END::DOUBLE PRECISION,
+    END,
     t.unit,
     t.warning_pct,
     t.risk_pct,
```

## register_stock_movement(p_product_id uuid, p_store_id uuid, p_quantity numeric, p_movement_type text, p_reason text, p_user_id uuid, p_variant_id uuid, p_sale_id uuid, p_unit_cost numeric, p_notes text, p_operation_date timestamp with time zone, p_skip_access_check boolean)  oid=133204

- Git final: 20260626000005_qa_batch2_rpc_fixes.sql (md5 cuerpo 31dd0e2c408a)
- LIVE: oid 133204 (md5 prosrc 0182a6cf3039) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260626000005_qa_batch2_rpc_fixes.sql
+++ LIVE:oid133204
@@ -30,14 +30,10 @@
     FROM public.service_cost_distributions scd
     JOIN public.receipts r ON r.id = scd.receipt_id
     WHERE scd.product_id = p_product_id AND r.store_id = p_store_id AND r.status != 'voided';
-
-    UPDATE public.products SET cost_average = (
-      SELECT CASE WHEN SUM(sm.quantity_change) = 0 THEN 0
-        ELSE ROUND((SUM(sm.unit_cost * sm.quantity_change) + v_dist_costs) / SUM(sm.quantity_change), 4)
-      END
-      FROM public.stock_movements sm
-      WHERE sm.product_id = p_product_id AND sm.store_id = p_store_id AND sm.quantity_change > 0
-    ), updated_at = v_eff WHERE id = p_product_id AND store_id = p_store_id;
+    -- A2 WAC HOTFIX (v2.22.0): WAC update removed from register_stock_movement.
+    -- The trigger trg_update_product_wac handles WAC for receipt_items.
+    -- For other paths (transfers, devolutions, etc.), cost_average stays as-is
+    -- until Grupo B/C adds WAC logic to those specific RPCs.
   END IF;
 
   INSERT INTO public.business_events (event_type, entity_id, payload, created_at) VALUES (
@@ -46,5 +42,5 @@
     v_eff
   );
   RETURN jsonb_build_object('status','ok','new_quantity',v_new_qty,'new_version',v_new_version);
-END;
+END
 
```

## confirm_transfer(p_transfer_id uuid, p_user_id uuid, p_operation_date timestamp with time zone)  oid=133208

- Git final: 20260802000005_v2_12_44_transfer_confirm_remediation.sql (md5 cuerpo 8d3e541a7a02)
- LIVE: oid 133208 (md5 prosrc 91cb7a90d277) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260802000005_v2_12_44_transfer_confirm_remediation.sql
+++ LIVE:oid133208
@@ -9,98 +9,93 @@
   v_available NUMERIC;
   v_rows_affected INTEGER;
   v_ref_doc TEXT;
+  v_new_wac NUMERIC;
+  v_dest_before NUMERIC;
 BEGIN
   SELECT * INTO v_transfer FROM public.transfers WHERE id = p_transfer_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Transfer not found'; END IF;
   IF v_transfer.status <> 'PENDIENTE' THEN RAISE EXCEPTION 'ERR_TRANSFER_NOT_PENDING'; END IF;
 
-  -- Autorización: caller debe tener acceso al destino
   IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_transfer.destination_store_id) THEN
     RAISE EXCEPTION 'ERR_UNAUTHORIZED';
   END IF;
 
-  -- Approval check
   IF COALESCE(v_transfer.requires_approval, false) = true AND v_transfer.approved_at IS NULL THEN
     RAISE EXCEPTION 'ERR_TRANSFER_REQUIRES_APPROVAL';
   END IF;
 
-  -- H-039: Validar stock disponible usando get_available_stock
-  -- stock_available = stock_current - SUM(reservas ACTIVE)
-  -- La reserva de ESTA transferencia está incluida en las ACTIVE,
-  -- así que stock_available ya refleja que estas unidades están comprometadas.
-  -- Si stock_available >= qty, hay suficiente para consumir la reserva.
   FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
     SELECT * INTO v_stock_info FROM public.get_available_stock(v_transfer.origin_store_id, v_item.product_id);
-
     IF NOT (v_stock_info->>'found')::boolean THEN
       RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND_AT_CONFIRM: %', v_item.product_id;
     END IF;
-
     v_available := (v_stock_info->>'stock_available')::numeric;
-    -- v_available ya incluye la resta de la reserva de esta transferencia
-    -- Si v_available < 0, significa que otras operaciones consumieron el stock físico
     IF v_available < 0 THEN
-      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, stock_fisico=%, reservado=%, disponible=%, solicitado=%',
-        v_item.product_id,
-        (v_stock_info->>'stock_current'),
-        (v_stock_info->>'stock_reserved'),
-        v_available,
-        v_item.quantity;
+      RAISE EXCEPTION 'ERR_INSUFFICIENT_STOCK_AT_CONFIRM: producto %, disponible=%, solicitado=%',
+        v_item.product_id, v_available, v_item.quantity;
     END IF;
   END LOOP;
 
-  -- Actualizar estado
+  -- DF-06: lock determinista de filas de producto (origen y destino) antes de mover valor
+  FOR v_item IN
+    SELECT product_id AS pid, origin_store_id AS sid FROM public.transfer_items ti
+      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
+    UNION
+    SELECT destination_product_id AS pid, destination_store_id AS sid FROM public.transfer_items ti
+      JOIN public.transfers t ON t.id = ti.transfer_id WHERE ti.transfer_id = p_transfer_id
+    ORDER BY sid, pid
+  LOOP
+    PERFORM 1 FROM public.products WHERE id = v_item.pid AND store_id = v_item.sid FOR UPDATE;
+  END LOOP;
+
   UPDATE public.transfers
     SET status = 'CONFIRMADA', confirmed_at = NOW(), confirmed_by = v_caller_uid
     WHERE id = p_transfer_id;
 
-  -- TC-3 H-045: reference_doc legible
-  v_ref_doc := 'TRANSFERENCIA ' || UPPER(left(v_transfer.id::text, 8)) || ' ' ||
-               left(v_transfer.origin_store_id::text, 8) || '→' ||
-               left(v_transfer.destination_store_id::text, 8);
+  v_ref_doc := 'TRANSFERENCIA ' || UPPER(left(v_transfer.id::text, 8));
 
-  -- Procesar items: consumir reserva + mover stock
   FOR v_item IN SELECT * FROM public.transfer_items WHERE transfer_id = p_transfer_id LOOP
-
-    -- H-041: Consumir reserva — validar que afectó exactamente 1 fila
     UPDATE public.inventory_reservations
       SET status = 'CONSUMED', consumed_at = NOW()
-      WHERE reference_type = 'TRANSFER'
-        AND reference_id = p_transfer_id
-        AND product_id = v_item.product_id
-        AND status = 'ACTIVE';
-
+      WHERE reference_type = 'TRANSFER' AND reference_id = p_transfer_id
+        AND product_id = v_item.product_id AND status = 'ACTIVE';
     GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
     IF v_rows_affected = 0 THEN
-      RAISE EXCEPTION 'ERR_RESERVATION_NOT_FOUND: No hay reserva ACTIVE para transferencia % producto %',
-        p_transfer_id, v_item.product_id;
+      RAISE EXCEPTION 'ERR_RESERVATION_NOT_FOUND: transferencia % producto %', p_transfer_id, v_item.product_id;
     END IF;
 
-    -- Descontar stock del origen (transfer_out)
+    -- DF-06: blend D-01 en destino con uc_transfer congelado, ANTES del dest-in
+    -- (kardex del destino lee ca_new). Semilla de destino nuevo = blend con S=0.
+    SELECT stock_current INTO v_dest_before FROM public.products
+      WHERE id = v_item.destination_product_id AND store_id = v_transfer.destination_store_id;
+    v_new_wac := public.fn_recalc_wac(
+      v_transfer.destination_store_id, v_item.destination_product_id, 'transfer_in',
+      v_item.quantity, v_item.unit_cost,
+      jsonb_build_object('rpc','confirm_transfer','transfer_id',p_transfer_id,'item_id',v_item.id));
+
     v_mov := public.register_stock_movement(
       v_item.product_id, v_transfer.origin_store_id, -v_item.quantity,
-      'transfer_out', v_ref_doc, v_caller_uid, NULL, NULL,
+      'transfer_out', v_ref_doc, v_caller_uid, NULL,
+      p_transfer_id,
       v_item.unit_cost, NULL, p_operation_date, TRUE
     );
     v_movements := array_append(v_movements, v_mov);
 
-    -- Añadir stock al destino (transfer_in) — usar destination_product_id
     v_mov := public.register_stock_movement(
       v_item.destination_product_id, v_transfer.destination_store_id, v_item.quantity,
-      'transfer_in', v_ref_doc, v_caller_uid, NULL, NULL,
-      v_item.unit_cost, NULL, p_operation_date, FALSE
+      'transfer_in', v_ref_doc, v_caller_uid, NULL,
+      p_transfer_id,
+      v_item.unit_cost, NULL, p_operation_date, TRUE
     );
     v_movements := array_append(v_movements, v_mov);
   END LOOP;
 
   INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
   VALUES (v_caller_uid, v_transfer.origin_store_id, 'transfer_confirmed', 'transfers', p_transfer_id,
-    jsonb_build_object('dest', v_transfer.destination_store_id, 'at', NOW(),
-      'requires_approval_was', COALESCE(v_transfer.requires_approval, false),
-      'was_approved', v_transfer.approved_at IS NOT NULL,
+    jsonb_build_object('dest', v_transfer.destination_store_id,
       'reservations_consumed', (SELECT count(*) FROM public.inventory_reservations WHERE reference_id = p_transfer_id AND status = 'CONSUMED'),
-      'reference_doc', v_ref_doc));
+      'reference_doc', v_ref_doc,
+      'dest_blend_df06', true));
 
   RETURN jsonb_build_object('status', 'success', 'transfer_id', p_transfer_id);
-END;
-
+END 
```

## has_store_access_as(p_user_id uuid, p_store_id uuid)  oid=136268

- Git final: 20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql (md5 cuerpo 2b4e588cf482)
- LIVE: oid 136268 (md5 prosrc 9844954f9389) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260726000002_v1_2_devolutions_customers_quotations_kardex_fiscal.sql
+++ LIVE:oid136268
@@ -1,9 +1,14 @@
 
-DECLARE v_role TEXT;
+DECLARE
+    v_role TEXT;
 BEGIN
     IF p_user_id IS NULL OR p_store_id IS NULL THEN RETURN false; END IF;
+    
+    -- Check if admin
     SELECT role INTO v_role FROM public.profiles WHERE id = p_user_id;
     IF v_role = 'admin' THEN RETURN true; END IF;
+    
+    -- Check membership
     RETURN EXISTS (
         SELECT 1 FROM public.user_store_memberships
         WHERE user_id = p_user_id AND store_id = p_store_id AND status = 'active'
```

## perform_inventory_adjustment(p_store_id uuid, p_product_id uuid, p_quantity_delta numeric, p_reason text, p_user_id uuid, p_unit_cost_adjustment numeric, p_operation_date timestamp with time zone)  oid=136711

- Git final: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql (md5 cuerpo dbe5fc5b5ce9)
- LIVE: oid 136711 (md5 prosrc 067685e8c5b5) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260727000008_v2_12_12_fix_is_not_null_pattern.sql
+++ LIVE:oid136711
@@ -3,20 +3,16 @@
   v_stock_actual NUMERIC;
   v_costo_promedio_actual NUMERIC;
   v_nuevo_stock NUMERIC;
-  v_nuevo_costo_total NUMERIC;
-  v_nuevo_costo_unitario NUMERIC;
   v_costo_unitario_movimiento NUMERIC;
   v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
   v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
 BEGIN
-  -- V2.5 H2a: autorización por TIENDA
   IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
     RAISE EXCEPTION 'ERR_UNAUTHORIZED';
   END IF;
 
   PERFORM public.validate_operation_date(p_operation_date);
 
-  -- V2.5.5: usar products.stock_current (inventory.quantity tiene trigger inmutable)
   SELECT COALESCE(stock_current, 0), COALESCE(cost_average, cost_price, 0)
     INTO v_stock_actual, v_costo_promedio_actual
   FROM public.products WHERE id = p_product_id AND store_id = p_store_id FOR UPDATE;
@@ -26,21 +22,19 @@
   END IF;
 
   v_nuevo_stock := GREATEST(0, v_stock_actual + p_quantity_delta);
+  v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
 
-  IF p_quantity_delta < 0 THEN
-    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
-  ELSE
-    v_costo_unitario_movimiento := COALESCE(p_unit_cost_adjustment, v_costo_promedio_actual);
-    v_nuevo_costo_total := (v_stock_actual * v_costo_promedio_actual) + (p_quantity_delta * v_costo_unitario_movimiento);
-    v_nuevo_costo_unitario := CASE WHEN v_nuevo_stock > 0 THEN v_nuevo_costo_total / v_nuevo_stock ELSE 0 END;
+  IF p_quantity_delta > 0 THEN
+    -- DF-01: blend vía escritor único (antes: CASE dentro del UPDATE)
+    PERFORM public.fn_recalc_wac(p_store_id, p_product_id, 'adjustment_plus',
+                 p_quantity_delta, v_costo_unitario_movimiento,
+                 jsonb_build_object('rpc','perform_inventory_adjustment','reason',p_reason));
   END IF;
+  -- Δ<0: WAC invariante (correcto por diseño A1/salida pura)
 
-  -- V2.5.5: UPDATE en products (no en inventory que tiene trigger)
   UPDATE public.products
-    SET stock_current = v_nuevo_stock,
-        cost_average = CASE WHEN p_quantity_delta > 0 THEN v_nuevo_costo_unitario ELSE cost_average END,
-        updated_at = v_effective_date
-    WHERE id = p_product_id AND store_id = p_store_id;
+    SET stock_current = v_nuevo_stock, updated_at = v_effective_date
+  WHERE id = p_product_id AND store_id = p_store_id;
 
   PERFORM public.register_stock_movement(
     p_product_id := p_product_id,
@@ -51,9 +45,9 @@
     p_unit_cost := v_costo_unitario_movimiento,
     p_reason := p_reason,
     p_operation_date := v_effective_date,
-    p_skip_access_check := (v_caller_uid IS NULL)  -- V2.5.5: bypass si service_role
+    p_skip_access_check := (v_caller_uid IS NULL)
   );
 
-  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock, 'new_cost_average', v_costo_promedio_actual);
-END;
-
+  RETURN jsonb_build_object('success', true, 'new_stock', v_nuevo_stock,
+    'new_cost_average', (SELECT cost_average FROM public.products WHERE id=p_product_id AND store_id=p_store_id));
+END 
```

## confirm_pending_reception(p_receipt_id uuid, p_user_id uuid, p_operation_date timestamp with time zone)  oid=136713

- Git final: 20260810000080_pr4_4f_fix_decimal_reception.sql (md5 cuerpo 6acb16fdead8)
- LIVE: oid 136713 (md5 prosrc 6c5b10f97f8b) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260810000080_pr4_4f_fix_decimal_reception.sql
+++ LIVE:oid136713
@@ -6,11 +6,7 @@
   v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
   v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
   v_unit_cost_cup numeric;
-  v_units_to_add numeric;  -- PR-4.4F: changed from integer to numeric to preserve decimals
-  v_current_stock numeric;
-  v_current_avg numeric;
-  v_new_stock numeric;
-  v_new_avg numeric;
+  v_units_to_add numeric;
 BEGIN
   SELECT * INTO v_receipt FROM public.receipts WHERE id = p_receipt_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
@@ -25,27 +21,19 @@
     v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
     v_units_to_add := v_item.quantity;
 
-    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
-    FROM public.products WHERE id = v_item.product_id FOR UPDATE;
+    -- Orden doctrina W62-01 §6: WAC primero → movimiento después (kardex ve ca_new)
+    PERFORM public.fn_recalc_wac(v_store_id, v_item.product_id, 'reception_in',
+                    v_units_to_add, v_unit_cost_cup,
+                    jsonb_build_object('rpc','confirm_pending_reception','receipt_id',p_receipt_id));
 
-    v_new_stock := COALESCE(v_current_stock, 0) + v_units_to_add;
-    v_new_avg := CASE WHEN v_new_stock > 0
-      THEN (COALESCE(v_current_stock,0)*COALESCE(v_current_avg,0) + v_item.quantity*v_unit_cost_cup) / v_new_stock
-      ELSE v_unit_cost_cup END;
-
-    UPDATE products
-    SET cost_average = v_new_avg, updated_at = v_effective_date
-    WHERE id = v_item.product_id;
+    UPDATE products SET updated_at = v_effective_date WHERE id = v_item.product_id AND store_id = v_store_id;
 
     INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
     VALUES (v_item.product_id, v_store_id, 'purchase'::movement_type, v_units_to_add, v_unit_cost_cup, 'Confirmacion recepcion', v_effective_date, v_caller_uid, v_effective_date);
   END LOOP;
 
   UPDATE receipts
-  SET status = 'active',
-      reception_date = v_effective_date,
-      total_cost = public.calculate_receipt_total_cup(p_receipt_id),
-      updated_at = v_effective_date
+  SET status = 'active', reception_date = v_effective_date,
+      total_cost = public.calculate_receipt_total_cup(p_receipt_id), updated_at = v_effective_date
   WHERE id = p_receipt_id AND status = 'pending';
-END;
-
+END 
```

## void_reception_with_reversal(p_receipt_id uuid, p_user_id uuid, p_reason text, p_operation_date timestamp with time zone)  oid=136714

- Git final: 20260727000008_v2_12_12_fix_is_not_null_pattern.sql (md5 cuerpo 06047218f8d1)
- LIVE: oid 136714 (md5 prosrc e86eae10b3f0) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260727000008_v2_12_12_fix_is_not_null_pattern.sql
+++ LIVE:oid136714
@@ -1,50 +1,38 @@
 
 DECLARE
-  v_store_id UUID;
+  v_receipt RECORD;
   v_item RECORD;
-  v_current_stock NUMERIC;
-  v_current_avg NUMERIC;
+  v_old_stock NUMERIC;
   v_new_stock NUMERIC;
-  v_new_avg NUMERIC;
   v_unit_cost_cup NUMERIC;
-  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_operation_date, NOW());
-  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
+  v_effective_date timestamptz := COALESCE(p_operation_date, NOW());
 BEGIN
-  SELECT store_id INTO v_store_id FROM receipts
-  WHERE id = p_receipt_id AND status = 'active' FOR UPDATE;
-  IF v_store_id IS NULL THEN
-    RAISE EXCEPTION 'Recepcion no encontrada o no esta activa';
-  END IF;
+  SELECT * INTO v_receipt FROM receipts WHERE id = p_receipt_id FOR UPDATE;
+  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_FOUND'; END IF;
+  IF v_receipt.status NOT IN ('active') THEN RAISE EXCEPTION 'ERR_RECEIPT_NOT_ACTIVE: %', v_receipt.status; END IF;
 
-  -- V2.5 H2d: autorización por tienda
-  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_store_id) THEN
-    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
-  END IF;
-
-  PERFORM public.validate_operation_date(p_operation_date, v_store_id);
-
-  FOR v_item IN
-    SELECT product_id, quantity, unit_cost, tasa_cambio_recepcion
-    FROM receipt_items WHERE receipt_id = p_receipt_id
-  LOOP
+  FOR v_item IN SELECT * FROM receipt_items WHERE receipt_id = p_receipt_id LOOP
     v_unit_cost_cup := v_item.unit_cost * COALESCE(v_item.tasa_cambio_recepcion, 1.0);
 
-    SELECT stock_current, cost_average INTO v_current_stock, v_current_avg
-    FROM products WHERE id = v_item.product_id FOR UPDATE;
-    v_new_stock := COALESCE(v_current_stock, 0) - v_item.quantity;
+    SELECT stock_current INTO v_old_stock FROM products WHERE id = v_item.product_id AND store_id = v_receipt.store_id FOR UPDATE;
+    v_new_stock := GREATEST(0, COALESCE(v_old_stock,0) - v_item.quantity);
 
-    IF v_new_stock <= 0 THEN
-      v_new_avg := v_current_avg;
-    ELSE
-      v_new_avg := (COALESCE(v_current_stock, 0) * COALESCE(v_current_avg, 0)
-                   - v_item.quantity * v_unit_cost_cup) / v_new_stock;
+    IF v_new_stock > 0 THEN
+      PERFORM public.fn_recalc_wac(v_receipt.store_id, v_item.product_id, 'reception_void',
+                     -v_item.quantity, v_unit_cost_cup,
+                     jsonb_build_object('rpc','void_reception_with_reversal','receipt_id',p_receipt_id));
     END IF;
 
-    UPDATE products
-      SET stock_current = GREATEST(0, v_new_stock), cost_average = v_new_avg, updated_at = v_effective_date
-      WHERE id = v_item.product_id;
+    UPDATE products SET stock_current = v_new_stock, updated_at = v_effective_date
+    WHERE id = v_item.product_id AND store_id = v_receipt.store_id;
+
+    INSERT INTO stock_movements (product_id, store_id, movement_type, quantity_change, unit_cost, reference_doc, created_at, created_by, movement_date)
+    VALUES (v_item.product_id, v_receipt.store_id, 'purchase_reverse'::movement_type, -v_item.quantity, v_unit_cost_cup, 'Void recepción: ' || COALESCE(p_reason,''), v_effective_date, p_user_id, v_effective_date);
   END LOOP;
 
-  UPDATE receipts SET status = 'voided', updated_at = v_effective_date WHERE id = p_receipt_id;
-END;
+  UPDATE receipts SET status='voided', reversed_at=v_effective_date, reversed_by=p_user_id, reversal_reason=p_reason WHERE id=p_receipt_id;
 
+  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
+  VALUES (p_user_id, v_receipt.store_id, 'RECEIPT_VOIDED_WITH_REVERSAL', 'receipts', p_receipt_id,
+          jsonb_build_object('reason', p_reason));
+END 
```

## create_devolution(p_store_id uuid, p_items jsonb, p_reason text, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_currency text, p_exchange_rate numeric)  oid=136967

- Git final: 20260727000006_v2_12_9_spoofing_p_user_id.sql (md5 cuerpo 92a0d6d20925)
- LIVE: oid 136967 (md5 prosrc 5676c618180f) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260727000006_v2_12_9_spoofing_p_user_id.sql
+++ LIVE:oid136967
@@ -1,27 +1,67 @@
 
-DECLARE v_devolution_id UUID; v_dev_number TEXT; v_item JSONB; v_total NUMERIC := 0;
-    v_pid UUID; v_qty NUMERIC; v_price NUMERIC; v_item_total NUMERIC;
-    v_uid UUID := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
+DECLARE
+  v_caller_uid uuid := CASE WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
+  v_devolution_id uuid := gen_random_uuid();
+  v_item jsonb;
+  v_pid uuid;
+  v_qty numeric;
+  v_price numeric;
+  v_devolution_cost numeric;
+  v_total numeric := 0;
+  v_dev_number text;
 BEGIN
-    IF NOT public.has_store_access_as(v_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
-    v_dev_number := 'DEV-' || EXTRACT(YEAR FROM now())::TEXT || '-' || LPAD((EXTRACT(EPOCH FROM now())::BIGINT % 1000000)::TEXT, 6, '0');
-    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
-        v_qty := (v_item->>'quantity')::NUMERIC; v_price := (v_item->>'unit_price')::NUMERIC;
-        v_total := v_total + (v_qty * v_price);
-    END LOOP;
-    INSERT INTO public.devolutions (store_id, original_transaction_id, devolution_number, reason, total_amount, currency, payment_method, status, customer_id, customer_name, notes, processed_by)
-    VALUES (p_store_id, p_original_transaction_id, v_dev_number, p_reason, v_total, 'CUP', p_payment_method, 'completed', p_customer_id, p_customer_name, p_notes, v_uid)
-    RETURNING id INTO v_devolution_id;
-    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
-        v_pid := (v_item->>'product_id')::UUID; v_qty := (v_item->>'quantity')::NUMERIC;
-        v_price := (v_item->>'unit_price')::NUMERIC; v_item_total := v_qty * v_price;
-        INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
-        VALUES (v_devolution_id, v_pid, v_qty, v_price, v_item_total, v_item->>'reason');
-        UPDATE public.products SET stock_current = stock_current + v_qty WHERE id = v_pid;
-        INSERT INTO public.kardex_entries (store_id, product_id, movement_type, quantity, unit_cost, total_value, balance_quantity, balance_unit_cost, balance_total_value, reference_type, reference_id, reference_description, created_by)
-        SELECT p_store_id, v_pid, 'devolution_in', v_qty, v_price, v_item_total, stock_current, cost_average, stock_current * cost_average, 'devolution', v_devolution_id, 'Devolucion ' || v_dev_number, v_uid
-        FROM public.products WHERE id = v_pid;
-    END LOOP;
-    RETURN jsonb_build_object('status', 'success', 'devolution_id', v_devolution_id, 'devolution_number', v_dev_number, 'total', v_total);
-END;
+  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
+    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
+  END IF;
 
+  v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);
+
+  INSERT INTO public.devolutions (
+    id, store_id, original_transaction_id, devolution_number, reason, total_amount,
+    currency, payment_method, status, customer_id, customer_name, notes, processed_by, created_at
+  ) VALUES (
+    v_devolution_id, p_store_id, p_original_transaction_id, v_dev_number, p_reason, 0,
+    COALESCE(p_currency, 'CUP'), COALESCE(p_payment_method, 'cash'), 'completed', p_customer_id, p_customer_name, p_notes, v_caller_uid, NOW()
+  );
+
+  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
+    v_pid := (v_item->>'product_id')::uuid;
+    v_qty := (v_item->>'quantity')::numeric;
+    v_price := COALESCE((v_item->>'unit_price')::numeric, (v_item->>'price')::numeric, 0);
+
+    INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total, reason)
+    VALUES (v_devolution_id, v_pid, v_qty, v_price, v_qty * v_price, COALESCE(v_item->>'reason', p_reason));
+
+    v_total := v_total + (v_qty * v_price);
+
+    v_devolution_cost := NULL;
+    IF p_original_transaction_id IS NOT NULL THEN
+      SELECT cost_at_sale INTO v_devolution_cost
+      FROM public.transaction_items
+      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
+    END IF;
+    IF v_devolution_cost IS NULL THEN
+      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
+    END IF;
+    v_devolution_cost := COALESCE(v_devolution_cost, 0);
+
+    -- DF-01: entrada de stock A1 NEUTRA — SIN blend WAC (antes: blend propio L75-85 = defecto)
+    PERFORM public.register_stock_movement(
+      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
+      p_quantity := v_qty, p_movement_type := 'return',
+      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
+      p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
+      p_operation_date := NOW(), p_skip_access_check := TRUE
+    );
+  END LOOP;
+
+  UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;
+
+  INSERT INTO public.audit_logs (user_id, store_id, action, table_name, record_id, metadata)
+  VALUES (v_caller_uid, p_store_id, 'DEVOLUTION_CREATED', 'devolutions', v_devolution_id,
+    jsonb_build_object('devolution_number', v_dev_number, 'original_transaction_id', p_original_transaction_id,
+      'total_amount', v_total, 'items_count', jsonb_array_length(p_items), 'wac_neutral_a1', true));
+
+  RETURN jsonb_build_object('status','success','devolution_id',v_devolution_id,
+    'devolution_number',v_dev_number,'total_amount',v_total);
+END 
```

## validate_store_can_be_modified(p_store_id uuid, p_check_type text)  oid=137398

- Git final: 20260802000001_v2_12_41_fase0_remediacion.sql (md5 cuerpo d6a1d6237e77)
- LIVE: oid 137398 (md5 prosrc fca47bf45c01) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260802000001_v2_12_41_fase0_remediacion.sql
+++ LIVE:oid137398
@@ -6,79 +6,90 @@
   v_open_ots INTEGER := 0;
   v_open_cash_sessions INTEGER := 0;
   v_pending_receipts INTEGER := 0;
+  v_active_reservations INTEGER := 0;
+  v_open_purchase_orders INTEGER := 0;
 BEGIN
-  -- Transferencias pendientes donde la tienda es ORIGEN
-  -- FIX: los valores del enum transfer_status están en español
   SELECT COUNT(*) INTO v_pending_transfers_out
   FROM transfers
   WHERE origin_store_id = p_store_id
     AND status IN ('PENDIENTE', 'CONFIRMADA');
-
   IF v_pending_transfers_out > 0 THEN
     v_blockers := array_append(v_blockers, jsonb_build_object(
-      'type', 'transfers_out',
-      'count', v_pending_transfers_out,
+      'store_id', p_store_id, 'type', 'OPEN_TRANSFERS_OUT', 'count', v_pending_transfers_out,
       'message', format('Hay %s transferencias salientes pendientes', v_pending_transfers_out)
     ));
   END IF;
 
-  -- Transferencias pendientes donde la tienda es DESTINO
   SELECT COUNT(*) INTO v_pending_transfers_in
   FROM transfers
   WHERE destination_store_id = p_store_id
     AND status IN ('PENDIENTE', 'CONFIRMADA');
-
   IF v_pending_transfers_in > 0 THEN
     v_blockers := array_append(v_blockers, jsonb_build_object(
-      'type', 'transfers_in',
-      'count', v_pending_transfers_in,
+      'store_id', p_store_id, 'type', 'OPEN_TRANSFERS_IN', 'count', v_pending_transfers_in,
       'message', format('Hay %s transferencias entrantes pendientes', v_pending_transfers_in)
     ));
   END IF;
 
-  -- Órdenes de producción/trabajo abiertas
   SELECT COUNT(*) INTO v_open_ots
   FROM production_orders
   WHERE store_id = p_store_id
     AND status IN ('draft', 'approved', 'in_progress', 'paused');
-
   IF v_open_ots > 0 THEN
     v_blockers := array_append(v_blockers, jsonb_build_object(
-      'type', 'open_ots',
-      'count', v_open_ots,
-      'message', format('Hay %s órdenes de trabajo abiertas', v_open_ots)
+      'store_id', p_store_id, 'type', 'OPEN_PRODUCTION_ORDERS', 'count', v_open_ots,
+      'message', format('Hay %s órdenes de producción abiertas', v_open_ots)
     ));
   END IF;
 
-  -- Sesiones de caja abiertas
   SELECT COUNT(*) INTO v_open_cash_sessions
   FROM cash_sessions
   WHERE store_id = p_store_id
     AND status = 'open';
-
   IF v_open_cash_sessions > 0 THEN
     v_blockers := array_append(v_blockers, jsonb_build_object(
-      'type', 'open_cash_sessions',
-      'count', v_open_cash_sessions,
+      'store_id', p_store_id, 'type', 'OPEN_CASH_SESSION', 'count', v_open_cash_sessions,
       'message', format('Hay %s sesiones de caja abiertas', v_open_cash_sessions)
     ));
   END IF;
 
-  -- Recepciones pendientes de confirmar
   SELECT COUNT(*) INTO v_pending_receipts
   FROM receipts
   WHERE store_id = p_store_id
-    AND status = 'pending';
-
+    AND status IN ('pending', 'active');
   IF v_pending_receipts > 0 THEN
     v_blockers := array_append(v_blockers, jsonb_build_object(
-      'type', 'pending_receipts',
-      'count', v_pending_receipts,
-      'message', format('Hay %s recepciones pendientes de confirmar', v_pending_receipts)
+      'store_id', p_store_id, 'type', 'PENDING_RECEIPTS', 'count', v_pending_receipts,
+      'message', format('Hay %s recepciones pendientes', v_pending_receipts)
+    ));
+  END IF;
+
+  SELECT COUNT(*) INTO v_active_reservations
+  FROM inventory_reservations
+  WHERE store_id = p_store_id
+    AND status = 'ACTIVE';
+  IF v_active_reservations > 0 THEN
+    v_blockers := array_append(v_blockers, jsonb_build_object(
+      'store_id', p_store_id, 'type', 'ACTIVE_INVENTORY_RESERVATIONS', 'count', v_active_reservations,
+      'message', format('Hay %s reservas de inventario activas', v_active_reservations)
+    ));
+  END IF;
+
+  -- FIX: purchase_status_enum uses lowercase: draft, received, cancelled
+  -- 'draft' is the only open state; 'received' and 'cancelled' are closed states
+  SELECT COUNT(*) INTO v_open_purchase_orders
+  FROM purchase_orders
+  WHERE store_id = p_store_id
+    AND status = 'draft';
+  IF v_open_purchase_orders > 0 THEN
+    v_blockers := array_append(v_blockers, jsonb_build_object(
+      'store_id', p_store_id, 'type', 'OPEN_PURCHASE_ORDERS', 'count', v_open_purchase_orders,
+      'message', format('Hay %s órdenes de compra en borrador', v_open_purchase_orders)
     ));
   END IF;
 
   RETURN jsonb_build_object(
+    'can_delete', array_length(v_blockers, 1) IS NULL,
     'can_modify', array_length(v_blockers, 1) IS NULL,
     'blockers', COALESCE(array_to_json(v_blockers)::jsonb, '[]'::jsonb)
   );
```

## reset_store_data(target_store_id uuid, p_keep_catalog boolean, p_user_id uuid)  oid=137399

- Git final: 20260820000005_post_restore_reconciliation.sql (md5 cuerpo d44bd557c178)
- LIVE: oid 137399 (md5 prosrc bc649bdbf142) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260820000005_post_restore_reconciliation.sql
+++ LIVE:oid137399
@@ -1,67 +1,190 @@
+
 
 DECLARE
-  target_store_id uuid := p_store_id;
+  v_caller_uid UUID := CASE WHEN auth.role() = 'service_role'
+    THEN COALESCE(p_user_id, auth.uid()) ELSE auth.uid() END;
+  v_validation JSONB;
+  v_blockers TEXT;
 BEGIN
-  -- Validación de acceso
-  IF NOT public.has_management_access_as(auth.uid(), target_store_id) THEN
-    RAISE EXCEPTION 'ERR_UNAUTHORIZED: Caller must be admin, manager or encargado of the store.';
+  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, target_store_id) THEN
+    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
   END IF;
 
-  -- Activar restore_mode para bypassear triggers de validación
+  -- SECURITY H2: require management role (admin/manager/encargado) for destructive ops
+  IF NOT public.has_management_access_as(v_caller_uid, target_store_id) THEN
+    RAISE EXCEPTION 'ERR_MANAGEMENT_ACCESS_REQUIRED: reset requires admin/manager/encargado role';
+  END IF;
+
+  SELECT * INTO v_validation FROM public.validate_store_can_be_modified(target_store_id, 'reset');
+  IF NOT (v_validation->>'can_modify')::boolean THEN
+    SELECT string_agg(blocker->>'message', '; ')
+    INTO v_blockers
+    FROM jsonb_array_elements(v_validation->'blockers') AS blocker
+    WHERE blocker->>'type' IN ('transfers_in', 'open_cash_sessions');
+    IF v_blockers IS NOT NULL AND v_blockers != '' THEN
+      RAISE EXCEPTION 'ERR_STORE_HAS_DEPENDENCIES: %', v_blockers;
+    END IF;
+  END IF;
+
+  -- Enable restore_mode locally so that triggers with bypass pattern allow DELETEs.
+  -- This is the canonical pattern for maintenance RPCs (see restore_transaction_snapshot).
+  -- The setting is LOCAL to this transaction and does NOT affect other sessions.
   PERFORM set_config('app.restore_mode', 'true', true);
 
-  BEGIN
-    -- ── 1. Datos transaccionales ──
-    DELETE FROM payment_transactions WHERE store_id = target_store_id;
-    DELETE FROM transaction_items WHERE transaction_id IN (
-      SELECT id FROM transactions WHERE store_id = target_store_id
-    );
-    DELETE FROM transactions WHERE store_id = target_store_id;
-    DELETE FROM stock_movements WHERE store_id = target_store_id;
-    DELETE FROM inventory_movements WHERE store_id = target_store_id;
-    DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
-    DELETE FROM receipts WHERE store_id = target_store_id;
-    DELETE FROM inventory WHERE store_id = target_store_id;
-    DELETE FROM cash_closures WHERE store_id = target_store_id;
+  -- ── 1. Borrar TODAS las tablas operacionales ──
 
-    -- ── 2. Catálogo de productos ──
-    IF p_keep_catalog THEN
-      UPDATE products
-      SET
-        stock_current = 0,
-        cost_average = 0,
-        updated_at = NOW()
-      WHERE store_id = target_store_id;
-    ELSE
-      DELETE FROM product_variants WHERE product_id IN (
-        SELECT id FROM products WHERE store_id = target_store_id
-      );
-      DELETE FROM products WHERE store_id = target_store_id;
-    END IF;
+  -- FIX: payment_transactions FIRST (FK ON DELETE RESTRICT to transactions)
+  DELETE FROM payment_transactions WHERE store_id = target_store_id;
 
-    -- ── 3. Reconciliación post-restore ──
-    -- Después de bypassear triggers, sincronizar products.stock_current
-    -- con inventory.quantity. En este punto inventory fue borrado (step 1),
-    -- así que todos los productos tendrán stock_current = 0 (correcto para
-    -- un reset). La reconciliación es defensiva: si en el futuro se
-    -- reconstruye inventory SIN disparar triggers (otro restore), este
-    -- código asegura consistencia.
-    UPDATE products p
-    SET stock_current = COALESCE(
-      (SELECT SUM(inv.quantity) FROM inventory inv
-       WHERE inv.product_id = p.id AND inv.store_id = p.store_id),
-      0
-    )
-    WHERE p.store_id = target_store_id;
+  -- Hijas de transactions (now safe — payment_transactions already deleted)
+  DELETE FROM transaction_items WHERE transaction_id IN (
+    SELECT id FROM transactions WHERE store_id = target_store_id
+  );
+  DELETE FROM transactions WHERE store_id = target_store_id;
 
-    -- Desactivar restore_mode
-    PERFORM set_config('app.restore_mode', 'false', true);
+  -- Hijas de receipts
+  DELETE FROM receipt_items WHERE receipt_id IN (
+    SELECT id FROM receipts WHERE store_id = target_store_id
+  );
+  DELETE FROM receipts WHERE store_id = target_store_id;
 
-    RAISE NOTICE 'Store % reset completed. Keep catalog: %. Post-restore reconciliation done.', target_store_id, p_keep_catalog;
-  EXCEPTION WHEN OTHERS THEN
-    -- Asegurar que restore_mode se desactiva incluso si hay error
-    PERFORM set_config('app.restore_mode', 'false', true);
-    RAISE;
-  END;
+  -- Devoluciones
+  DELETE FROM devolution_items WHERE devolution_id IN (
+    SELECT id FROM devolutions WHERE store_id = target_store_id
+  );
+  DELETE FROM devolutions WHERE store_id = target_store_id;
+
+  -- Cotizaciones
+  DELETE FROM quotation_items WHERE quotation_id IN (
+    SELECT id FROM quotations WHERE store_id = target_store_id
+  );
+  DELETE FROM quotations WHERE store_id = target_store_id;
+
+  -- Clientes
+  DELETE FROM customers WHERE store_id = target_store_id;
+
+  -- Bancos
+  DELETE FROM bank_statement_items WHERE bank_statement_id IN (
+    SELECT id FROM bank_statements WHERE store_id = target_store_id
+  );
+  DELETE FROM bank_statements WHERE store_id = target_store_id;
+
+  -- Kardex
+  DELETE FROM kardex_entries WHERE store_id = target_store_id;
+
+  -- Conteos físicos
+  DELETE FROM physical_count_items WHERE count_id IN (
+    SELECT id FROM physical_counts WHERE store_id = target_store_id
+  );
+  DELETE FROM physical_counts WHERE store_id = target_store_id;
+
+  -- Stock movements
+  DELETE FROM stock_movements WHERE store_id = target_store_id;
+
+  -- Cash
+  DELETE FROM cash_closures WHERE store_id = target_store_id;
+  DELETE FROM cash_sessions WHERE store_id = target_store_id;
+  DELETE FROM cash_movements WHERE store_id = target_store_id;
+  DELETE FROM cash_register_sessions WHERE store_id = target_store_id;
+
+  -- Inventory adjustments
+  DELETE FROM inventory_adjustment_items WHERE adjustment_id IN (
+    SELECT id FROM inventory_adjustments WHERE store_id = target_store_id
+  );
+  DELETE FROM inventory_adjustments WHERE store_id = target_store_id;
+
+  -- Transfers
+  DELETE FROM transfer_items WHERE transfer_id IN (
+    SELECT id FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id
+  );
+  DELETE FROM transfers WHERE origin_store_id = target_store_id OR destination_store_id = target_store_id;
+  DELETE FROM transfer_approval_rules WHERE store_id = target_store_id;
+
+  -- Purchase orders
... [87 líneas más]
```

## create_pre_restore_snapshot(p_store_id uuid)  oid=137570

- Git final: 20260802000007_v2_12_46_restore_rpc_preview.sql (md5 cuerpo 39376923494f)
- LIVE: oid 137570 (md5 prosrc d1928efec1e0) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260802000007_v2_12_46_restore_rpc_preview.sql
+++ LIVE:oid137570
@@ -7,13 +7,12 @@
   v_transfers JSONB;
   v_reservations JSONB;
   v_checksums JSONB;
-  t RECORD;
+  rec RECORD;
   v_count BIGINT;
   v_md5 TEXT;
-  v_total_size BIGINT := 0;
 BEGIN
-  -- 1. Conteos por tabla (pg_stat_user_tables da n_live_tup)
-  SELECT jsonb_object_agg(tablename, n_live_tup) INTO v_table_counts
+  -- 1. Conteos por tabla (pg_stat_user_tables uses relname, not tablename)
+  SELECT jsonb_object_agg(relname, n_live_tup) INTO v_table_counts
   FROM pg_stat_user_tables
   WHERE schemaname = 'public'
     AND relname IN (
@@ -21,12 +20,12 @@
       WHERE excluded_from_restore = FALSE
     );
 
-  -- 2. Inventory completo (obligatorio — es la fuente primaria de verdad)
+  -- 2. Inventory completo
   SELECT jsonb_agg(to_jsonb(i) ORDER BY i.product_id) INTO v_inventory
   FROM public.inventory i
   WHERE i.store_id = p_store_id;
 
-  -- 3. products.stock_current (obligatorio — consistencia post-restore)
+  -- 3. products.stock_current
   SELECT jsonb_agg(jsonb_build_object(
     'id', p.id, 'sku', p.sku, 'stock_current', p.stock_current,
     'cost_average', p.cost_average, 'updated_at', p.updated_at
@@ -34,57 +33,57 @@
   FROM public.products p
   WHERE p.store_id = p_store_id;
 
-  -- 4. transfers pendientes (obligatorio — affectan inventory_reservations)
-  SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at) INTO v_transfers
-  FROM public.transfers t
-  WHERE t.origin_store_id = p_store_id OR t.destination_store_id = p_store_id;
+  -- 4. transfers pendientes
+  SELECT jsonb_agg(to_jsonb(tr) ORDER BY tr.created_at) INTO v_transfers
+  FROM public.transfers tr
+  WHERE tr.origin_store_id = p_store_id OR tr.destination_store_id = p_store_id;
 
-  -- 5. inventory_reservations activas (obligatorio — estado actual)
-  SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at) INTO v_reservations
-  FROM public.inventory_reservations r
-  WHERE r.store_id = p_store_id AND r.status = 'ACTIVE';
+  -- 5. inventory_reservations activas
+  SELECT jsonb_agg(to_jsonb(rv) ORDER BY rv.created_at) INTO v_reservations
+  FROM public.inventory_reservations rv
+  WHERE rv.store_id = p_store_id AND rv.status = 'ACTIVE';
 
-  -- 6. Checksums de tablas críticas (primary + audit)
+  -- 6. Checksums de tablas críticas
   v_checksums := '{}'::jsonb;
-  FOR t IN
+  FOR rec IN
     SELECT table_name, filter_strategy FROM public.backup_table_registry
     WHERE source_of_truth IN ('primary', 'audit')
       AND excluded_from_restore = FALSE
     ORDER BY table_name
   LOOP
     BEGIN
-      IF t.filter_strategy = 'via_origin_dest' THEN
+      IF rec.filter_strategy = 'via_origin_dest' THEN
         EXECUTE format(
           'SELECT count(*) FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1',
-          t.table_name
+          rec.table_name
         ) INTO v_count USING p_store_id;
         EXECUTE format(
           'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE origin_store_id = $1 OR destination_store_id = $1',
-          t.table_name
+          rec.table_name
         ) INTO v_md5 USING p_store_id;
-      ELSIF t.filter_strategy = 'via_entity_id' THEN
+      ELSIF rec.filter_strategy = 'via_entity_id' THEN
         EXECUTE format(
           'SELECT count(*) FROM public.%I WHERE entity_id = $1::text',
-          t.table_name
+          rec.table_name
         ) INTO v_count USING p_store_id;
         EXECUTE format(
           'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE entity_id = $1::text',
-          t.table_name
+          rec.table_name
         ) INTO v_md5 USING p_store_id;
       ELSE
         EXECUTE format(
           'SELECT count(*) FROM public.%I WHERE store_id = $1',
-          t.table_name
+          rec.table_name
         ) INTO v_count USING p_store_id;
         EXECUTE format(
           'SELECT COALESCE(md5(string_agg(id::text, '','' ORDER BY id)), '''') FROM public.%I WHERE store_id = $1',
-          t.table_name
+          rec.table_name
         ) INTO v_md5 USING p_store_id;
       END IF;
-      v_checksums := jsonb_set(v_checksums, ARRAY[t.table_name],
+      v_checksums := jsonb_set(v_checksums, ARRAY[rec.table_name],
                                jsonb_build_object('count', v_count, 'checksum', v_md5));
     EXCEPTION WHEN OTHERS THEN
-      v_checksums := jsonb_set(v_checksums, ARRAY[t.table_name],
+      v_checksums := jsonb_set(v_checksums, ARRAY[rec.table_name],
                                jsonb_build_object('count', v_count, 'checksum', NULL, 'error', SQLERRM));
     END;
   END LOOP;
```

## restore_store_backup(p_store_id uuid, p_backup_payload jsonb, p_mode text, p_confirmation_token text)  oid=137580

- Git final: 20260802000008_v2_12_47_restore_rpc_execute.sql (md5 cuerpo 9c16981a8b81)
- LIVE: oid 137580 (md5 prosrc fe49ee4a4b89) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260802000008_v2_12_47_restore_rpc_execute.sql
+++ LIVE:oid137580
@@ -26,49 +26,59 @@
   v_tables_processed INTEGER := 0;
   v_tables_failed INTEGER := 0;
   v_existing_session_id UUID;
-  v_stored_token TEXT;
   v_filter_strategy TEXT;
+  v_parent_table TEXT;
+  v_parent_fk TEXT;
   v_writable_cols TEXT[];
   v_cols_sql TEXT;
   v_insert_sql TEXT;
-  v_delete_sql TEXT;
   v_rows_inserted BIGINT;
-  v_rows_deleted BIGINT;
-  v_inv_product_id UUID;
-  v_inv_qty NUMERIC;
   v_inv_row JSONB;
   v_sync_count INTEGER;
+  v_tier_ordered_tables TEXT[];
+  v_cols_only TEXT;
+  v_caller_role TEXT;
+  v_token_session_id UUID;
 BEGIN
   -- ============================================================
-  -- PHASE 0: VALIDATE (común a preview y execute)
-  -- ============================================================
-  v_initiator := COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::UUID);
+  -- SECURITY CHECK: Only admin can call this function
+  -- ============================================================
+  -- When called with user JWT (not service role), auth.uid() returns the user's ID
+  -- We check their role in profiles
+  v_initiator := auth.uid();
+  IF v_initiator IS NOT NULL AND v_initiator != '00000000-0000-0000-0000-000000000000'::UUID THEN
+    SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_initiator;
+    IF v_caller_role IS NULL OR v_caller_role != 'admin' THEN
+      RAISE EXCEPTION 'ERR_PERMISSION_DENIED: Solo admin puede ejecutar restore_store_backup (rol actual: %)', COALESCE(v_caller_role, 'NULL');
+    END IF;
+  END IF;
+  -- If auth.uid() is NULL, it's the service role — allow
+
+  v_initiator := COALESCE(v_initiator, '00000000-0000-0000-0000-000000000000'::UUID);
 
   SELECT EXISTS(SELECT 1 FROM public.stores WHERE id = p_store_id) INTO v_store_exists;
   IF NOT v_store_exists THEN
-    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND: Tienda % no existe', p_store_id;
+    RAISE EXCEPTION 'ERR_STORE_NOT_FOUND';
   END IF;
 
   v_backup_format := p_backup_payload->'meta'->>'format';
   IF v_backup_format IS NULL OR v_backup_format != 'costpro-store-backup' THEN
-    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT: Se espera format=costpro-store-backup, got %', v_backup_format;
+    RAISE EXCEPTION 'ERR_INVALID_BACKUP_FORMAT';
   END IF;
 
   v_backup_store_id := p_backup_payload->'meta'->>'storeId';
   IF v_backup_store_id IS NULL THEN
-    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID: meta.storeId es requerido';
+    RAISE EXCEPTION 'ERR_BACKUP_MISSING_STORE_ID';
   END IF;
 
   v_backup_version := p_backup_payload->'meta'->>'version';
 
-  -- CREATE SESSION
   INSERT INTO public.restore_sessions (
     store_id, initiated_by, status, mode, backup_payload
   ) VALUES (
     p_store_id, v_initiator, 'PREPARING', p_mode, p_backup_payload
   ) RETURNING id INTO v_session_id;
 
-  -- VALIDATE: backup tables vs registry
   SELECT array_agg(key) INTO v_tables_in_backup
   FROM (SELECT key FROM jsonb_object_keys(p_backup_payload->'tables') AS key) k;
 
@@ -86,105 +96,71 @@
   FROM unnest(v_active_registry_tables) AS t
   WHERE NOT (t = ANY(v_tables_in_backup));
 
-  -- source_of_truth invariants
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
-    'table_name', table_name,
-    'expected_source_of_truth', expected_sot,
-    'actual_source_of_truth', source_of_truth
+    'table_name', table_name, 'expected', expected_sot, 'actual', source_of_truth
   )), '[]'::jsonb) INTO v_source_of_truth_violations
   FROM (VALUES
-    ('inventory', 'primary'),
-    ('stock_movements', 'audit'),
-    ('kardex_entries', 'audit'),
-    ('products', 'primary')
+    ('inventory', 'primary'), ('stock_movements', 'audit'),
+    ('kardex_entries', 'audit'), ('products', 'primary')
   ) AS v(table_name, expected_sot)
   JOIN public.backup_table_registry r USING (table_name)
   WHERE r.source_of_truth != v.expected_sot;
 
-  -- tier ordering
   SELECT COALESCE(jsonb_agg(jsonb_build_object(
-    'child_table', r.table_name,
-    'parent_table', r.parent_table,
-    'issue', 'parent not found before child in backup ordering'
+    'child_table', r.table_name, 'parent_table', r.parent_table,
+    'issue', 'parent not found before child'
   )), '[]'::jsonb) INTO v_tier_violations
   FROM public.backup_table_registry r
-  WHERE r.excluded_from_restore = FALSE
-    AND r.parent_table IS NOT NULL
+  WHERE r.excluded_from_restore = FALSE AND r.parent_table IS NOT NULL
     AND r.table_name = ANY(v_tables_in_backup)
     AND NOT EXISTS (
       SELECT 1 FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o(t, ord)
-      WHERE o.t = r.parent_table
-        AND o.ord < (
-          SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
-          WHERE o2.t = r.table_name
-        )
+      WHERE o.t = r.parent_table AND o.ord < (
+        SELECT MIN(ord) FROM unnest(v_tables_in_backup) WITH ORDINALITY AS o2(t, ord)
+        WHERE o2.t = r.table_name
+      )
     );
 
-  -- COUNT rows per table
   FOR rec IN SELECT table_name FROM unnest(v_tables_in_backup) AS table_name LOOP
     v_rows := p_backup_payload->'tables'->rec.table_name;
     v_row_count := CASE WHEN jsonb_typeof(v_rows) = 'array'
-                        THEN jsonb_array_length(v_rows)
-                        ELSE 0 END;
+                        THEN jsonb_array_length(v_rows) ELSE 0 END;
     v_total_rows := v_total_rows + v_row_count;
     v_table_stats := jsonb_set(v_table_stats, ARRAY[rec.table_name], to_jsonb(v_row_count));
   END LOOP;
 
-  -- FK INTEGRITY CHECK
   SELECT public.validate_pre_restore_fk_integrity(p_store_id) INTO v_fk_integrity;
 
-  -- DETERMINE preview_passed
   v_preview_passed := TRUE;
-
   IF v_missing_tables IS NOT NULL AND array_length(v_missing_tables, 1) > 0 THEN
     PERFORM 1 FROM unnest(v_missing_tables) AS mt
-    WHERE NOT EXISTS (
-      SELECT 1 FROM public.backup_table_registry r WHERE r.table_name = mt
-    );
-    IF FOUND THEN
-      v_preview_passed := FALSE;
-    END IF;
-  END IF;
-
-  IF v_tier_violations != '[]'::jsonb THEN
-    v_preview_passed := FALSE;
-  END IF;
-
-  IF v_source_of_truth_violations != '[]'::jsonb THEN
-    v_preview_passed := FALSE;
-  END IF;
-
-  -- UPDATE SESSION
+    WHERE NOT EXISTS (SELECT 1 FROM public.backup_table_registry r WHERE r.table_name = mt);
... [459 líneas más]
```

## release_expired_reservations()  oid=137974

- Git final: 20260804000001_v2_13_10_fix_release_expired_reservations_cast.sql (md5 cuerpo 7f6bfbbc2408)
- LIVE: oid 137974 (md5 prosrc fc2877b3fcf8) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260804000001_v2_13_10_fix_release_expired_reservations_cast.sql
+++ LIVE:oid137974
@@ -9,13 +9,10 @@
     FROM public.inventory_reservations
     WHERE status = 'ACTIVE' AND expires_at < now()
     LIMIT 1;
-
   UPDATE public.inventory_reservations
     SET status = 'RELEASED', released_at = now()
     WHERE status = 'ACTIVE' AND expires_at < now();
-
   GET DIAGNOSTICS v_count = ROW_COUNT;
-
   -- FIX: audit_logs.record_id es uuid, no text. Usar v_sample_id directo.
   -- Si v_count = 0, v_sample_id es NULL y el INSERT se skipnea (no hay rows).
   IF v_count > 0 AND v_sample_id IS NOT NULL THEN
@@ -23,7 +20,6 @@
     VALUES ('RESERVATION_EXPIRED', 'inventory_reservations', v_sample_id, v_sample_store_id, NULL,
       jsonb_build_object('count', v_count, 'reason', 'auto-release expired reservations'));
   END IF;
-
   RETURN v_count;
 END;
 
```

## create_store_with_membership(p_name text, p_address text, p_created_by uuid, p_max_stores integer, p_logo_url text, p_reeup text, p_nit text, p_bank_account text, p_phone text, p_email text, p_slug text, p_plantilla text, p_signature_url text, p_stamp_url text, p_latitude double precision, p_longitude double precision, p_tenant_id uuid)  oid=138143

- Git final: 20260806000005_v2_15_5_create_store_with_tenant.sql (md5 cuerpo 84c76c4ffac4)
- LIVE: oid 138143 (md5 prosrc da512cbcbbc4) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260806000005_v2_15_5_create_store_with_tenant.sql
+++ LIVE:oid138143
@@ -1,3 +1,4 @@
+
 
 DECLARE
   v_store_id uuid;
@@ -42,9 +43,10 @@
 
   -- Audit log
   INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
-  VALUES ('store_created', 'stores', v_store_id::text, v_store_id, v_caller_uid,
+  VALUES ('store_created', 'stores', v_store_id, v_store_id, v_caller_uid,
     jsonb_build_object('store_name', p_name, 'tenant_id', v_tenant));
 
   RETURN jsonb_build_object('success', true, 'store_id', v_store_id, 'tenant_id', v_tenant);
 END;
 
+
```

## get_tenant_sales_summary(p_tenant_id uuid, p_days integer)  oid=138147

- Git final: 20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql (md5 cuerpo 5b322fc330b2)
- LIVE: oid 138147 (md5 prosrc 5457b3a01f32) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260807000008_v2_21_0_rls_fix_get_tenant_sales_summary.sql
+++ LIVE:oid138147
@@ -3,10 +3,6 @@
   v_result jsonb;
   v_uid uuid := auth.uid();
 BEGIN
-  -- FIX RLS-B5: Aceptar 3 casos:
-  --   1. Admin global (is_admin() = true)
-  --   2. Owner del tenant (owner_id = auth.uid())
-  --   3. Service_role call (auth.uid() IS NULL — API route ya validó)
   IF v_uid IS NOT NULL
      AND NOT public.is_admin()
      AND NOT EXISTS(
@@ -14,7 +10,6 @@
      ) THEN
     RAISE EXCEPTION 'ERR_UNAUTHORIZED';
   END IF;
-
   SELECT jsonb_build_object(
     'tenant_id', p_tenant_id,
     'days', p_days,
@@ -47,7 +42,6 @@
         AND created_at >= now() - (p_days || ' days')::interval
     ), 0)
   ) INTO v_result;
-
   RETURN v_result;
 END;
 
```

## audit_cash_closures_changes()  oid=138218

- Git final: 20260809000004_v2_18_4_audit_triggers.sql (md5 cuerpo 3bf574b11d4a)
- LIVE: oid 138218 (md5 prosrc 2da87471545b) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260809000004_v2_18_4_audit_triggers.sql
+++ LIVE:oid138218
@@ -1,45 +1 @@
-
-DECLARE
-  v_action text;
-  v_record_id text;
-  v_store_id uuid;
-  v_user_id uuid;
-BEGIN
-  v_user_id := auth.uid();
-
-  IF TG_OP = 'INSERT' THEN
-    v_action := 'CASH_CLOSURE_CREATED';
-    v_record_id := NEW.id::text;
-    v_store_id := NEW.store_id;
-  ELSIF TG_OP = 'UPDATE' THEN
-    v_action := 'CASH_CLOSURE_UPDATED';
-    v_record_id := NEW.id::text;
-    v_store_id := NEW.store_id;
-  ELSIF TG_OP = 'DELETE' THEN
-    v_action := 'CASH_CLOSURE_DELETED';
-    v_record_id := OLD.id::text;
-    v_store_id := OLD.store_id;
-  END IF;
-
-  -- No duplicar audit si ya viene de close_cash_shift o reopen_cash_shift
-  -- (esos RPCs ya escriben su propio audit log atómico)
-  IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'cerrado' AND OLD.status = 'pendiente' THEN
-    -- close_cash_shift ya escribió el audit — skip
-    RETURN NEW;
-  END IF;
-  IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'pendiente' AND OLD.status = 'cerrado' THEN
-    -- reopen_cash_shift ya escribió el audit — skip
-    RETURN NEW;
-  END IF;
-
-  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
-  VALUES (v_action, 'cash_closures', v_record_id, v_store_id, v_user_id,
-    jsonb_build_object(
-      'tg_op', TG_OP,
-      'old_status', CASE WHEN TG_OP != 'INSERT' THEN OLD.status ELSE NULL END,
-      'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END
-    ));
-
-  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
-END;
-
+ DECLARE v_action text; v_record_id uuid; v_store_id uuid; v_user_id uuid; BEGIN v_user_id := auth.uid(); IF TG_OP = 'INSERT' THEN v_action := 'CASH_CLOSURE_CREATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'UPDATE' THEN v_action := 'CASH_CLOSURE_UPDATED'; v_record_id := NEW.id; v_store_id := NEW.store_id; ELSIF TG_OP = 'DELETE' THEN v_action := 'CASH_CLOSURE_DELETED'; v_record_id := OLD.id; v_store_id := OLD.store_id; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'cerrado' AND OLD.status = 'pendiente' THEN RETURN NEW; END IF; IF v_action = 'CASH_CLOSURE_UPDATED' AND NEW.status = 'pendiente' AND OLD.status = 'cerrado' THEN RETURN NEW; END IF; INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata) VALUES (v_action, 'cash_closures', v_record_id, v_store_id, v_user_id, jsonb_build_object('tg_op', TG_OP, 'old_status', CASE WHEN TG_OP != 'INSERT' THEN OLD.status ELSE NULL END, 'new_status', CASE WHEN TG_OP != 'DELETE' THEN NEW.status ELSE NULL END)); RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END; 
```

## audit_commission_payments_changes()  oid=138220

- Git final: 20260809000004_v2_18_4_audit_triggers.sql (md5 cuerpo 7d77d1a92ceb)
- LIVE: oid 138220 (md5 prosrc c44c9d9e6c8a) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260809000004_v2_18_4_audit_triggers.sql
+++ LIVE:oid138220
@@ -16,7 +16,7 @@
 
   INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
   VALUES (v_action, 'commission_payments',
-    CASE WHEN TG_OP != 'DELETE' THEN NEW.id::text ELSE OLD.id::text END,
+    CASE WHEN TG_OP != 'DELETE' THEN NEW.id ELSE OLD.id END,
     CASE WHEN TG_OP != 'DELETE' THEN NEW.store_id ELSE OLD.store_id END,
     auth.uid(),
     jsonb_build_object(
```

## close_cash_shift(p_closure_id uuid, p_declared_cash numeric, p_declared_vouchers numeric, p_notes text, p_user_id uuid)  oid=138285

- Git final: 20260911000000_rem_sec1_security_boundaries.sql (md5 cuerpo 45f9c4ea1fcf)
- LIVE: oid 138285 (md5 prosrc b176bb225db3) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260911000000_rem_sec1_security_boundaries.sql
+++ LIVE:oid138285
@@ -23,7 +23,6 @@
   IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, v_closure.store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
   PERFORM pg_advisory_xact_lock(hashtext(v_closure.store_id::text));
 
-  -- Recalcular (mismo código de 11.4)
   SELECT COALESCE(SUM(cash_amount), 0) INTO v_cash_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
   SELECT COALESCE(SUM(transfer_amount), 0) INTO v_transfer_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
   SELECT COALESCE(SUM(zelle_amount), 0) INTO v_zelle_sales FROM public.transactions WHERE store_id = v_closure.store_id AND status = 'completed' AND created_at > v_closure.created_at AND created_at <= NOW();
@@ -43,7 +42,6 @@
     notes = p_notes
   WHERE id = p_closure_id;
 
-  -- Audit log del cierre (mismo de 11.4)
   INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
   VALUES ('CASH_CLOSURE_FINALIZED', 'cash_closures', p_closure_id, v_closure.store_id, v_caller_uid,
     jsonb_build_object('declared_cash', p_declared_cash, 'declared_vouchers', p_declared_vouchers,
@@ -52,17 +50,9 @@
       'cash_sales', v_cash_sales, 'transfer_sales', v_transfer_sales, 'zelle_sales', v_zelle_sales,
       'cash_payments', v_cash_payments, 'cash_commissions', v_cash_commissions, 'v2_close', true));
 
-  -- ═══════════════════════════════════════════════════════════════════════
-  -- Iteración Fiscal (F-C2): Generar Z Report atómicamente (Aclaración 2)
-  -- Estrictamente aditivo — no modifica la lógica anterior.
-  -- Si este bloque falla, el error es específico para que el cajero sepa
-  -- que el problema es el Z Report, no el cierre en sí.
-  -- ═══════════════════════════════════════════════════════════════════════
   BEGIN
-    -- Generar número secuencial
     v_z_number := public.next_document_number(v_closure.store_id, 'z_report', v_caller_uid);
 
-    -- Agregar datos fiscales adicionales
     SELECT COALESCE(SUM(tax_amount), 0) INTO v_tax_total
       FROM public.transactions
       WHERE store_id = v_closure.store_id AND status = 'completed'
@@ -73,7 +63,6 @@
       WHERE store_id = v_closure.store_id AND status = 'completed'
         AND created_at > v_closure.created_at AND created_at <= NOW();
 
-    -- INSERT Z Report
     INSERT INTO public.z_reports (
       cash_closure_id, store_id, z_report_number, report_date,
       total_sales, total_cash, total_transfer, total_zelle, total_tax,
@@ -90,14 +79,12 @@
     )
     RETURNING id INTO v_z_id;
 
-    -- Audit log del Z Report
     INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
     VALUES ('Z_REPORT_GENERATED', 'z_reports', v_z_id, v_closure.store_id, v_caller_uid,
       jsonb_build_object('z_report_number', v_z_number, 'cash_closure_id', p_closure_id,
         'total_sales', v_cash_sales + v_transfer_sales + v_zelle_sales, 'total_tax', v_tax_total));
 
   EXCEPTION WHEN OTHERS THEN
-    -- Aclaración 2: error específico para Z Report
     RAISE EXCEPTION 'ERR_Z_REPORT_GENERATION_FAILED: %', SQLERRM;
   END;
 
```

## current_user_store_ids()  oid=138373

- Git final: 20260807000004_v2_21_0_rls_helper_functions.sql (md5 cuerpo 7aa4f04c3ab7)
- LIVE: oid 138373 (md5 prosrc 317799d87c0d) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260807000004_v2_21_0_rls_helper_functions.sql
+++ LIVE:oid138373
@@ -3,13 +3,11 @@
   v_result uuid[];
 BEGIN
   IF public.is_admin() THEN
-    -- Admin: todas las stores activas de su tenant
     SELECT array_agg(id) INTO v_result
     FROM public.stores
     WHERE tenant_id = public.current_user_tenant_id()
       AND is_active = true;
   ELSE
-    -- Non-admin: stores con membership activa
     SELECT array_agg(store_id) INTO v_result
     FROM public.user_store_memberships
     WHERE user_id = auth.uid()
```

## is_admin_with_access(p_store_id uuid)  oid=138374

- Git final: 20260807000004_v2_21_0_rls_helper_functions.sql (md5 cuerpo 2c7c10af3e4e)
- LIVE: oid 138374 (md5 prosrc 0015e76b5eb9) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260807000004_v2_21_0_rls_helper_functions.sql
+++ LIVE:oid138374
@@ -4,17 +4,12 @@
   v_user_tenant uuid;
   v_store_tenant uuid;
 BEGIN
-  -- Si no es admin, debe usar has_store_access() normal
   v_is_admin := public.is_admin();
   IF NOT v_is_admin THEN
     RETURN public.has_store_access(p_store_id);
   END IF;
-
-  -- Si es admin, verificar que el store pertenece a su tenant
   v_user_tenant := public.current_user_tenant_id();
   SELECT tenant_id INTO v_store_tenant FROM public.stores WHERE id = p_store_id;
-
-  -- Si el store no tiene tenant (legacy) o coincide con el del admin → allow
   RETURN v_store_tenant IS NULL OR v_store_tenant = v_user_tenant;
 END;
 
```

## register_reception(p_store_id uuid, p_supplier text, p_reception_date timestamp with time zone, p_invoice_number text, p_items jsonb, p_user_id uuid, p_po_id uuid)  oid=138536

- Git final: register_reception_rpc.sql (md5 cuerpo e8f0b7cc8f1c)
- LIVE: oid 138536 (md5 prosrc 843db128859a) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:register_reception_rpc.sql
+++ LIVE:oid138536
@@ -1,249 +1,158 @@
 
 DECLARE
-    v_reception_id UUID;
-    v_item JSONB;
-    v_product_id UUID;
-    v_quantity NUMERIC;
-    v_unit_cost NUMERIC;
-    v_total_cost NUMERIC := 0;
-    v_items_count INT := 0;
-    v_user_id UUID;
-    v_user_store_id UUID;
+  v_receipt_id UUID := gen_random_uuid();
+  v_caller_uid UUID := CASE
+    WHEN auth.role() = 'service_role' THEN COALESCE(p_user_id, auth.uid())
+    ELSE auth.uid()
+  END;
+  v_user_id UUID := COALESCE(v_caller_uid, '00000000-0000-0000-0000-000000000000'::uuid);
+  v_total_cost NUMERIC := 0;
+  v_item JSONB;
+  v_product_id UUID;
+  v_quantity NUMERIC;
+  v_unit_cost NUMERIC;
+  v_moneda TEXT;
+  v_tasa NUMERIC;
+  v_unit_cost_cup NUMERIC;
+  v_variant_id UUID;
+  v_conversion_factor NUMERIC := 1;
+  v_units_to_add NUMERIC;
+  v_effective_date TIMESTAMP WITH TIME ZONE := COALESCE(p_reception_date, NOW());
+  v_uc_base NUMERIC;
 BEGIN
-    -- Obtener usuario autenticado (evita pasar user_id desde el cliente)
-    IF auth.uid() IS NULL THEN
-        RAISE EXCEPTION 'Authentication required';
+  PERFORM public.validate_operation_date(p_reception_date, p_store_id);
+
+  IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
+    RAISE EXCEPTION 'Unauthorized store access';
+  END IF;
+
+  -- B2 (v2.23.0): Supplier is required
+  IF p_supplier IS NULL OR p_supplier = '' THEN
+    RAISE EXCEPTION 'ERR_SUPPLIER_REQUIRED: supplier is mandatory';
+  END IF;
+
+  -- B3 (v2.23.0): Items array must not be empty
+  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
+    RAISE EXCEPTION 'ERR_EMPTY_ITEMS: at least one item is required';
+  END IF;
+
+  INSERT INTO public.receipts (
+    id, store_id, user_id, supplier, reception_date,
+    reference_doc, total_cost, status, created_at, updated_at,
+    po_id   -- ← nueva columna
+  ) VALUES (
+    v_receipt_id, p_store_id, v_user_id, p_supplier,
+    v_effective_date, p_invoice_number, 0, 'active', v_effective_date, v_effective_date,
+    p_po_id   -- ← pasa NULL si no viene
+  );
+
+  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
+  LOOP
+    v_product_id := (v_item->>'product_id')::UUID;
+    v_quantity := (v_item->>'quantity')::NUMERIC;
+    v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0);
+
+    -- B4 (v2.23.0): Reject items with unit_cost <= 0
+    IF v_unit_cost <= 0 THEN
+      RAISE EXCEPTION 'ERR_INVALID_UNIT_COST: unit_cost must be > 0 for product %', v_product_id;
     END IF;
-    v_user_id := auth.uid()::UUID;
-    -- ================================================================
-    -- VALIDACIONES PREVIAS
-    -- ================================================================
-    
-    -- Validar store_id existe y pertenece al usuario (profiles guarda la asociación tienda)
-    v_user_store_id := public.current_user_store_id();
-    IF v_user_store_id IS NULL THEN
-        RAISE EXCEPTION 'User has no store assigned';
-    END IF;
-    IF v_user_store_id != p_store_id THEN
-        RAISE EXCEPTION 'Invalid store_id for user';
+    v_moneda := COALESCE(v_item->>'moneda_recepcion', 'CUP');
+    v_tasa := COALESCE((v_item->>'tasa_cambio_recepcion')::NUMERIC, 1.0);
+
+    -- C1 (v2.23.0): Validate exchange rate is within reasonable range
+    IF v_tasa < 0.01 OR v_tasa > 10000 THEN
+      RAISE EXCEPTION 'ERR_INVALID_EXCHANGE_RATE: tasa_cambio_recepcion % is out of range [0.01, 10000]', v_tasa;
     END IF;
 
-    -- Validar proveedor
-    IF p_supplier IS NULL OR TRIM(p_supplier) = '' THEN
-        RAISE EXCEPTION 'Supplier is required';
+    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
+    v_conversion_factor := 1.0;
+    IF v_variant_id IS NOT NULL THEN
+      SELECT conversion_factor INTO v_conversion_factor FROM public.product_variants WHERE id = v_variant_id;
+      v_conversion_factor := COALESCE(v_conversion_factor, 1.0);
     END IF;
 
-    -- Validar fecha
-    IF p_reception_date IS NULL THEN
-        RAISE EXCEPTION 'Reception date is required';
+    -- C2 (v2.23.0): Warning if product has expired lots (non-blocking)
+    IF EXISTS (
+      SELECT 1 FROM public.product_lots
+      WHERE product_id = v_product_id AND store_id = p_store_id
+        AND expiration_date IS NOT NULL
+        AND expiration_date < v_effective_date
+        AND quantity_remaining > 0
+    ) THEN
+      RAISE WARNING 'C2: Product % has expired lots in store %', v_product_id, p_store_id;
     END IF;
 
-    -- Validar fecha no es futura
-    IF p_reception_date > CURRENT_DATE THEN
-        RAISE EXCEPTION 'Reception date cannot be in the future';
+    v_units_to_add := v_quantity * v_conversion_factor;
+    v_unit_cost_cup := v_unit_cost * v_tasa;
+
+    -- B5 (v2.23.0): Product must exist in store — RAISE EXCEPTION (not CONTINUE)
+    IF NOT EXISTS (
+      SELECT 1 FROM public.products
+      WHERE id = v_product_id AND store_id = p_store_id
+    ) THEN
+      RAISE EXCEPTION 'ERR_PRODUCT_NOT_IN_STORE: product % does not exist in store %', v_product_id, p_store_id;
     END IF;
 
-    -- Validar número de factura
-    IF p_invoice_number IS NULL OR TRIM(p_invoice_number) = '' THEN
-        RAISE EXCEPTION 'Invoice number is required';
-    END IF;
+    INSERT INTO public.receipt_items (
+      receipt_id, product_id, variant_id, quantity, unit_cost,
+      moneda_recepcion, tasa_cambio_recepcion,
+      created_at, updated_at
+    ) VALUES (
+      v_receipt_id, v_product_id, v_variant_id, v_quantity, v_unit_cost,
+      v_moneda, v_tasa,
+      v_effective_date, v_effective_date
+    );
 
-    -- Validar que no exista duplicado de factura para este proveedor (comparamos reference_doc en receipts)
-    IF EXISTS (
-        SELECT 1 FROM receipts r
-        JOIN public.profiles p ON p.id = r.user_id
-        WHERE p.store_id = p_store_id
-          AND r.reference_doc = FORMAT('%s | %s', TRIM(p_supplier), TRIM(p_invoice_number))
-    ) THEN
-        RAISE EXCEPTION 'Duplicate invoice for this supplier in this store';
-    END IF;
+    -- REM-F4-04 (gate 20260908-rem-f4-04): el camino real de recepción termina
+    -- en el escritor canónico. El trigger trg_update_product_wac (referenciado
+    -- por el comentario A1 v2.22.0) NO existe en la BD viva y
+    -- register_stock_movement ya no escribe WAC (A2 v2.22.0).
+    -- Orden doctrina W62-01 §6 (idéntico a confirm_pending_reception):
+    -- WAC primero → movimiento después (kardex ve ca_new).
... [230 líneas más]
```

## check_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text)  oid=138689

- Git final: 20260810000012_v2_26_hotfix3_idempotency_registry.sql (md5 cuerpo 70bec988441c)
- LIVE: oid 138689 (md5 prosrc 1dd2aac68168) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260810000012_v2_26_hotfix3_idempotency_registry.sql
+++ LIVE:oid138689
@@ -1,24 +1,40 @@
 
-DECLARE v_existing jsonb;
+DECLARE v_existing_result jsonb;
+  v_existing_hash text;
+  v_inserted_id uuid;
 BEGIN
   IF p_key IS NULL THEN RETURN NULL; END IF;
-  
-  SELECT result INTO v_existing FROM idempotency_registry
+
+  INSERT INTO idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
+  VALUES (p_key, p_operation, p_record_id, p_param_hash, jsonb_build_object('status', 'pending'))
+  ON CONFLICT (idempotency_key, operation) DO NOTHING
+  RETURNING id INTO v_inserted_id;
+
+  IF v_inserted_id IS NOT NULL THEN
+    RETURN NULL;
+  END IF;
+
+  SELECT result, param_hash INTO v_existing_result, v_existing_hash
+  FROM idempotency_registry
   WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
-  
-  IF v_existing IS NOT NULL THEN
-    SELECT param_hash INTO v_existing FROM idempotency_registry
+
+  IF v_existing_hash != p_param_hash THEN
+    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
+  END IF;
+
+  IF v_existing_result->>'status' = 'pending' THEN
+    PERFORM pg_sleep(0.1);
+    SELECT result INTO v_existing_result
+    FROM idempotency_registry
     WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
-    
-    IF v_existing::text != p_param_hash THEN
-      RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REUSE';
+    IF v_existing_result->>'status' = 'pending' THEN
+      PERFORM pg_sleep(0.2);
+      SELECT result INTO v_existing_result
+      FROM idempotency_registry
+      WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
     END IF;
-    
-    SELECT result INTO v_existing FROM idempotency_registry
-    WHERE idempotency_key = p_key AND operation = p_operation LIMIT 1;
-    RETURN v_existing;
   END IF;
-  
-  RETURN NULL;
+
+  RETURN v_existing_result;
 END;
 
```

## register_idempotency(p_key text, p_operation text, p_record_id uuid, p_param_hash text, p_result jsonb)  oid=138690

- Git final: 20260810000012_v2_26_hotfix3_idempotency_registry.sql (md5 cuerpo 5e3ad7cd1489)
- LIVE: oid 138690 (md5 prosrc eebc1bedca26) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260810000012_v2_26_hotfix3_idempotency_registry.sql
+++ LIVE:oid138690
@@ -1,8 +1,9 @@
 
 BEGIN
   IF p_key IS NULL THEN RETURN; END IF;
-  INSERT INTO idempotency_registry (idempotency_key, operation, record_id, param_hash, result)
-  VALUES (p_key, p_operation, p_record_id, p_param_hash, p_result)
-  ON CONFLICT (idempotency_key, operation) DO NOTHING;
+  -- UPDATE el registro creado por check_idempotency (status='pending')
+  UPDATE idempotency_registry
+  SET result = p_result
+  WHERE idempotency_key = p_key AND operation = p_operation AND param_hash = p_param_hash;
 END;
 
```

## create_devolution_v2(p_store_id uuid, p_items jsonb, p_reason text, p_user_id uuid, p_original_transaction_id uuid, p_payment_method text, p_customer_id uuid, p_customer_name text, p_notes text, p_idempotency_key text)  oid=138865

- Git final: 20260810000041_pr4_3_1_fixes.sql (md5 cuerpo bcc6bc3fd29b)
- LIVE: oid 138865 (md5 prosrc 75c4b5bdc1e1) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260810000041_pr4_3_1_fixes.sql
+++ LIVE:oid138865
@@ -10,8 +10,12 @@
   v_dev_number text;
   v_devolution_cost numeric;
   v_total numeric := 0;
+  v_sold_qty numeric;
+  v_devolved_qty numeric;
+  v_locked_sale uuid;
+  v_session_id uuid;
+  v_pt_id uuid;
 BEGIN
-  -- Idempotencia
   IF p_idempotency_key IS NOT NULL THEN
     SELECT id INTO v_existing FROM public.devolutions WHERE idempotency_key = p_idempotency_key LIMIT 1;
     IF v_existing IS NOT NULL THEN
@@ -19,19 +23,51 @@
     END IF;
   END IF;
 
-  -- Autorización (patrón canónico v2.12.12)
   IF v_caller_uid IS NULL OR NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
     RAISE EXCEPTION 'ERR_UNAUTHORIZED';
   END IF;
 
-  -- Validar cross-store (preservado de v2.19.4)
-  IF p_original_transaction_id IS NOT NULL THEN
-    IF NOT EXISTS (SELECT 1 FROM public.transactions WHERE id = p_original_transaction_id AND store_id = p_store_id) THEN
-      RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
-    END IF;
+  -- DF-07: LOCK venta original PRIMERO
+  IF p_original_transaction_id IS NULL THEN
+    RAISE EXCEPTION 'ERR_DEVOLUTION_NO_ORIGINAL: tope acumulado exige venta original';
+  END IF;
+  SELECT id INTO v_locked_sale FROM public.transactions
+    WHERE id = p_original_transaction_id AND store_id = p_store_id
+    FOR UPDATE;
+  IF v_locked_sale IS NULL THEN
+    RAISE EXCEPTION 'ERR_CROSS_STORE: original_transaction_id does not belong to store_id';
   END IF;
 
-  -- Numeración secuencial (preservado de v2.19.4 / F-H1)
+  -- DF-07: tope por (venta, producto) DESPUÉS del lock
+  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
+    v_pid := (v_item->>'product_id')::uuid;
+    v_qty := (v_item->>'quantity')::numeric;
+    IF v_qty IS NULL OR v_qty <= 0 THEN
+      RAISE EXCEPTION 'ERR_INVALID_QUANTITY: qty=%', v_qty;
+    END IF;
+
+    SELECT COALESCE(SUM(ti.quantity), 0) INTO v_sold_qty
+    FROM public.transaction_items ti
+    WHERE ti.transaction_id = p_original_transaction_id AND ti.product_id = v_pid;
+
+    SELECT COALESCE(SUM(di.quantity), 0) INTO v_devolved_qty
+    FROM public.devolution_items di
+    JOIN public.devolutions d ON d.id = di.devolution_id
+    WHERE d.original_transaction_id = p_original_transaction_id
+      AND di.product_id = v_pid
+      AND d.status IN ('pending','completed');
+
+    IF v_devolved_qty + v_qty > v_sold_qty THEN
+      RAISE EXCEPTION 'ERR_DEVOLUTION_CAP_EXCEEDED: producto % vendido=% devuelto=% solicitado=% (tope acumulado, lock de venta adquirido)',
+        v_pid, v_sold_qty, v_devolved_qty, v_qty;
+    END IF;
+  END LOOP;
+
+  -- Método permitido
+  IF p_payment_method NOT IN ('cash','transfer','zelle','store_credit') THEN
+    RAISE EXCEPTION 'ERR_DEVOLUTION_INVALID_METHOD: %', p_payment_method;
+  END IF;
+
   v_dev_number := public.next_document_number(p_store_id, 'credit_note', v_caller_uid);
 
   INSERT INTO public.devolutions (
@@ -54,45 +90,71 @@
 
     v_total := v_total + (v_qty * v_price);
 
-    -- PR-4.3: determinar costo histórico correcto para kardex
-    -- 1. Intentar cost_at_sale de la transacción original
     v_devolution_cost := NULL;
     IF p_original_transaction_id IS NOT NULL THEN
       SELECT cost_at_sale INTO v_devolution_cost
       FROM public.transaction_items
-      WHERE transaction_id = p_original_transaction_id
-        AND product_id = v_pid
-      LIMIT 1;
+      WHERE transaction_id = p_original_transaction_id AND product_id = v_pid LIMIT 1;
     END IF;
-
-    -- 2. Fallback: WAC actual (documentado como fallback operativo, no histórico)
     IF v_devolution_cost IS NULL THEN
-      SELECT cost_average INTO v_devolution_cost
-      FROM public.products WHERE id = v_pid;
+      SELECT cost_average INTO v_devolution_cost FROM public.products WHERE id = v_pid;
     END IF;
-
     v_devolution_cost := COALESCE(v_devolution_cost, 0);
 
-    -- register_stock_movement con costo correcto → trigger genera kardex
     PERFORM public.register_stock_movement(
-      p_product_id := v_pid,
-      p_store_id := p_store_id,
-      p_user_id := v_caller_uid,
-      p_quantity := v_qty,
-      p_movement_type := 'return',
-      p_sale_id := v_devolution_id,
-      p_unit_cost := v_devolution_cost,
+      p_product_id := v_pid, p_store_id := p_store_id, p_user_id := v_caller_uid,
+      p_quantity := v_qty, p_movement_type := 'return',
+      p_sale_id := v_devolution_id, p_unit_cost := v_devolution_cost,
       p_reason := ('Devolución: ' || COALESCE(p_reason, ''))::text,
-      p_operation_date := NOW(),
-      p_skip_access_check := TRUE
+      p_operation_date := NOW(), p_skip_access_check := TRUE
     );
-
-    -- PR-4.3: INSERT directo a kardex_entries ELIMINADO
-    -- El trigger auto_kardex_on_stock_movement ahora genera la kardex con
-    -- movement_type='devolution_in' y unit_cost=v_devolution_cost (correcto)
   END LOOP;
 
   UPDATE public.devolutions SET total_amount = v_total WHERE id = v_devolution_id;
+
+  -- ═══ DF-03: CONTRA-ASIENTO FINANCIERO en la MISMA TX ═══
+  IF v_total <= 0 THEN
+    RAISE EXCEPTION 'ERR_DEVOLUTION_AMOUNT_POSITIVE';
+  END IF;
+
+  IF p_payment_method IN ('cash','transfer','zelle') THEN
+    -- sesión de caja abierta de la tienda (find-or-create para que el out nunca se pierda)
+    SELECT id INTO v_session_id FROM public.cash_register_sessions
+      WHERE store_id = p_store_id AND status = 'open'
+      ORDER BY opened_at DESC LIMIT 1;
+    IF v_session_id IS NULL THEN
+      INSERT INTO public.cash_register_sessions (store_id, cashier_id, opening_cash, opened_at, status)
+      VALUES (p_store_id, v_caller_uid, 0, NOW(), 'open')
+      RETURNING id INTO v_session_id;
+    END IF;
+
+    -- contra-asiento de caja: out por el total devuelto
+    INSERT INTO public.cash_movements (session_id, movement_type, method, amount, reason, store_id)
+    VALUES (v_session_id, 'out', p_payment_method::payment_method_enum, v_total,
+            'Devolución ' || v_dev_number || ': ' || COALESCE(p_reason,''), p_store_id);
+
+    -- asiento financiero trazable: venta → devolución → reversión
+    INSERT INTO public.payment_transactions (
+      store_id, ref_type, ref_id, transaction_id,
+      amount, payment_method, currency, exchange_rate,
+      payment_date, direction, paid_by, idempotency_key
+    ) VALUES (
+      p_store_id, 'devolution', v_devolution_id, p_original_transaction_id,
+      v_total, p_payment_method, 'CUP', 1.0,
+      NOW(), 'refund', v_caller_uid, 'dev-' || v_devolution_id::text || '-refund'
+    ) RETURNING id INTO v_pt_id;
+
+  ELSIF p_payment_method = 'store_credit' THEN
+    IF p_customer_id IS NULL THEN
+      RAISE EXCEPTION 'ERR_STORE_CREDIT_REQUIRES_CUSTOMER';
... [36 líneas más]
```

## create_sale_v2(p_store_id uuid, p_seller_id uuid, p_items jsonb, p_payment_method text, p_discount_type text, p_discount_value numeric, p_applied_taxes jsonb, p_tax_amount numeric, p_total_amount numeric, p_subtotal numeric, p_cash_amount numeric, p_transfer_amount numeric, p_zelle_amount numeric, p_sale_currency text, p_sale_exchange_rate numeric, p_customer_id uuid, p_customer_name text, p_supervisor_user_id uuid, p_idempotency_key text, p_operation_date timestamp with time zone, p_user_id uuid)  oid=141788

- Git final: 20260812000002_pr4_4i_create_sale_v2_payments.sql (md5 cuerpo 8743baec2d4b)
- LIVE: oid 141788 (md5 prosrc 7edb09b6b6f8) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260812000002_pr4_4i_create_sale_v2_payments.sql
+++ LIVE:oid141788
@@ -26,10 +26,10 @@
   v_cash_amt numeric := p_cash_amount;
   v_transfer_amt numeric := p_transfer_amount;
   v_zelle_amt numeric := p_zelle_amount;
-  -- PR-4.4I: variables para payment_transactions
   v_pt_id uuid;
   v_zelle_original_amount numeric;
   v_sum_payments numeric;
+  v_wac_prev numeric;
 BEGIN
   -- 1. Advisory lock por store (serializa ventas concurrentes)
   PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
@@ -64,8 +64,9 @@
     v_zelle_amt := p_total_amount;
   END IF;
 
-  -- 6. Primera pasada: SELECT FOR UPDATE + recalcular subtotal
-  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
+  -- 6. Primera pasada — orden determinista por product_id (doctrina W62-05 §2.3):
+  --    FOR UPDATE de la fila del producto (serializa stock+WAC) + validaciones.
+  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id') LOOP
     v_pid := (v_item->>'product_id')::uuid;
     v_qty := (v_item->>'quantity')::numeric;
     v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
@@ -78,15 +79,28 @@
     END IF;
     v_units := v_qty * v_conversion_factor;
 
-    SELECT quantity INTO v_stock
-      FROM public.inventory
-      WHERE product_id = v_pid AND store_id = p_store_id
+    SELECT stock_current, cost_average INTO v_stock, v_wac_prev
+      FROM public.products
+      WHERE id = v_pid AND store_id = p_store_id
       FOR UPDATE;
 
     IF v_stock IS NULL THEN
-      SELECT stock_current INTO v_stock FROM public.products WHERE id = v_pid FOR UPDATE;
+      -- fallback legacy: producto sin tienda (servicios globales)
+      SELECT stock_current, cost_average INTO v_stock, v_wac_prev
+        FROM public.products WHERE id = v_pid FOR UPDATE;
     END IF;
     v_stock := COALESCE(v_stock, 0);
+
+    -- DF-02: costo SIEMPRE del servidor (WAC_prev bajo lock)
+    IF v_wac_prev IS NULL THEN
+      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
+    END IF;
+    IF v_wac_prev = 0 THEN
+      IF NOT EXISTS (SELECT 1 FROM public.w62_zero_cost_flags
+                     WHERE store_id = p_store_id AND product_id = v_pid AND scope = 'sale') THEN
+        RAISE EXCEPTION 'ERR_PRODUCT_ZERO_WAC_NOT_DOCUMENTED: %', v_pid;
+      END IF;
+    END IF;
 
     -- Saltar validación de stock para servicios
     IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
@@ -104,7 +118,8 @@
       v_price := COALESCE(v_product_price, 0);
     END IF;
 
-    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);
+    -- DF-02: claves cost_at_sale/cost del request IGNORADAS (no error)
+    v_cost := v_wac_prev;
 
     v_calculated_subtotal := v_calculated_subtotal + (v_price * v_qty);
   END LOOP;
@@ -184,8 +199,8 @@
     p_customer_id, p_customer_name
   );
 
-  -- 14. Segunda pasada: stock movement + INSERT transaction_items
-  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
+  -- 14. Segunda pasada: stock movement + transaction_items — MISMA autoridad de costo
+  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) ORDER BY (value->>'product_id') LOOP
     v_pid := (v_item->>'product_id')::uuid;
     v_qty := (v_item->>'quantity')::numeric;
     v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
@@ -206,7 +221,18 @@
       SELECT price INTO v_product_price FROM public.products WHERE id = v_pid;
       v_price := COALESCE(v_product_price, 0);
     END IF;
-    v_cost := COALESCE((v_item->>'cost_at_sale')::numeric, (v_item->>'cost')::numeric, 0);
+
+    -- DF-02: re-lectura bajo FOR UPDATE (misma TX; sin ventana TOCTOU)
+    SELECT cost_average INTO v_cost
+      FROM public.products
+      WHERE id = v_pid AND store_id = p_store_id
+      FOR UPDATE;
+    IF v_cost IS NULL THEN
+      SELECT cost_average INTO v_cost FROM public.products WHERE id = v_pid FOR UPDATE;
+    END IF;
+    IF v_cost IS NULL THEN
+      RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_pid;
+    END IF;
 
     -- Stock movement (solo si NO es servicio)
     IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = v_pid AND is_service = true) THEN
@@ -218,7 +244,6 @@
       );
     END IF;
 
-    -- INSERT transaction_items
     INSERT INTO public.transaction_items (
       transaction_id, product_id, variant_id, quantity, price_at_sale, cost_at_sale, created_at,
       cash_paid, transfer_paid, zelle_paid, currency, exchange_rate,
@@ -253,14 +278,7 @@
     );
   END LOOP;
 
-  -- ═══════════════════════════════════════════════════════════════════
-  -- 15. PR-4.4I: INSERT payment_transactions (fuente autoritativa de pagos)
-  -- ═══════════════════════════════════════════════════════════════════
-  -- Cada pago se persiste individualmente con su moneda y tasa.
-  -- amount_cup es GENERATED (no se inserta — la BD lo calcula).
-  -- El trigger trg_validate_payment_invariants valida invariantes I1a, I9-TXN, etc.
-
-  -- 15a. Pago cash (siempre CUP, rate=1)
+  -- 15. payment_transactions (fuente autoritativa de pagos)
   IF v_cash_amt > 0 THEN
     INSERT INTO public.payment_transactions (
       store_id, ref_type, ref_id, transaction_id,
@@ -273,7 +291,6 @@
     ) RETURNING id INTO v_pt_id;
   END IF;
 
-  -- 15b. Pago transfer (siempre CUP, rate=1)
   IF v_transfer_amt > 0 THEN
     INSERT INTO public.payment_transactions (
       store_id, ref_type, ref_id, transaction_id,
@@ -286,27 +303,16 @@
     ) RETURNING id INTO v_pt_id;
   END IF;
 
-  -- 15c. Pago Zelle (USD/EUR, rate > 1)
-  -- p_sale_currency se interpreta como currency del pago Zelle
-  -- p_sale_exchange_rate se interpreta como tasa del pago Zelle
   IF v_zelle_amt > 0 THEN
-    -- Validar: Zelle requiere tasa > 1
     IF p_sale_currency = 'CUP' OR p_sale_exchange_rate IS NULL OR p_sale_exchange_rate <= 1 THEN
       RAISE EXCEPTION 'ERR_ZELLE_REQUIRES_RATE: zelle payment requires p_sale_currency != CUP and p_sale_exchange_rate > 1. Got: currency=%, rate=%',
-        p_sale_currency, p_sale_exchange_rate
-        USING ERRCODE = 'PT009';
-    END IF;
-
-    -- Validar: currency domain
+        p_sale_currency, p_sale_exchange_rate USING ERRCODE = 'PT009';
+    END IF;
     IF p_sale_currency NOT IN ('USD', 'EUR', 'MLC') THEN
       RAISE EXCEPTION 'ERR_INVALID_CURRENCY: p_sale_currency must be USD, EUR, or MLC. Got: %',
-        p_sale_currency
-        USING ERRCODE = 'PT004';
-    END IF;
-
-    -- Monto original en moneda nativa
+        p_sale_currency USING ERRCODE = 'PT004';
+    END IF;
     v_zelle_original_amount := v_zelle_amt / p_sale_exchange_rate;
... [31 líneas más]
```

## validate_payment_transactions_invariants()  oid=142115

- Git final: 20260812000001_pr4_4i_payment_transactions_hardening.sql (md5 cuerpo 46bb2153d24e)
- LIVE: oid 142115 (md5 prosrc c95512f62fd7) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260812000001_pr4_4i_payment_transactions_hardening.sql
+++ LIVE:oid142115
@@ -1,70 +1 @@
-
-DECLARE
-  v_existing_rate numeric;
-  v_lock_old bigint;
-  v_lock_new bigint;
-  v_total_amount numeric;
-  v_sum_payments numeric;
-BEGIN
-  IF TG_OP = 'DELETE' THEN
-    RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN: payment_transactions rows cannot be deleted. Use reversal/void flow.'
-      USING ERRCODE = 'PT007';
-  END IF;
-
-  IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN
-    RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1: currency=CUP requires exchange_rate=1, got %', NEW.exchange_rate
-      USING ERRCODE = 'PT003';
-  END IF;
-
-  IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN
-    RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1: currency=% requires exchange_rate > 1, got %', NEW.currency, NEW.exchange_rate
-      USING ERRCODE = 'PT004';
-  END IF;
-
-  IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN
-    RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP: payment_method=zelle requires currency in (USD, EUR, MLC). Got CUP.'
-      USING ERRCODE = 'PT005';
-  END IF;
-
-  -- I1a + I9-TXN con advisory lock
-  IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN
-    v_lock_old := hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0);
-    v_lock_new := hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0);
-    IF v_lock_old < v_lock_new THEN
-      PERFORM pg_advisory_xact_lock(v_lock_old);
-      PERFORM pg_advisory_xact_lock(v_lock_new);
-    ELSIF v_lock_old > v_lock_new THEN
-      PERFORM pg_advisory_xact_lock(v_lock_new);
-      PERFORM pg_advisory_xact_lock(v_lock_old);
-    ELSE
-      PERFORM pg_advisory_xact_lock(v_lock_new);
-    END IF;
-  ELSIF NEW.transaction_id IS NOT NULL THEN
-    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0));
-  END IF;
-
-  IF NEW.transaction_id IS NOT NULL THEN
-    SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id;
-    SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments
-    FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id;
-
-    IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN
-      RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL: existing=% + new=% > total_amount=%', v_sum_payments, NEW.amount_cup, v_total_amount
-        USING ERRCODE = 'PT001';
-    END IF;
-
-    SELECT exchange_rate INTO v_existing_rate
-    FROM public.payment_transactions
-    WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id
-    LIMIT 1;
-
-    IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN
-      RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES: transaction_id=% has %/% with rate=%, cannot add rate=%',
-        NEW.transaction_id, NEW.payment_method, NEW.currency, v_existing_rate, NEW.exchange_rate
-        USING ERRCODE = 'PT006';
-    END IF;
-  END IF;
-
-  RETURN NEW;
-END;
-
+ BEGIN IF current_setting('app.restore_mode', true) = 'true' AND current_user IN ('costpro_snapshot_restorer', 'postgres') THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF; IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'ERR_PAYMENT_DELETE_FORBIDDEN' USING ERRCODE = 'PT007'; END IF; IF NEW.currency = 'CUP' AND NEW.exchange_rate != 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_CUP_RATE_MUST_BE_1' USING ERRCODE = 'PT003'; END IF; IF NEW.currency != 'CUP' AND NEW.exchange_rate <= 1 THEN RAISE EXCEPTION 'ERR_PAYMENT_FOREIGN_RATE_MUST_EXCEED_1' USING ERRCODE = 'PT004'; END IF; IF NEW.payment_method = 'zelle' AND NEW.currency = 'CUP' THEN RAISE EXCEPTION 'ERR_ZELLE_NOT_FOR_CUP' USING ERRCODE = 'PT005'; END IF; IF TG_OP = 'UPDATE' AND OLD.transaction_id IS DISTINCT FROM NEW.transaction_id THEN PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(OLD.transaction_id::text, ''), 0)); PERFORM pg_advisory_xact_lock(hashtextextended(COALESCE(NEW.transaction_id::text, ''), 0)); ELSIF NEW.transaction_id IS NOT NULL THEN PERFORM pg_advisory_xact_lock(hashtextextended(NEW.transaction_id::text, 0)); END IF; /* DF-03: los refunds (direction='refund') son contra-asientos de trazabilidad — NO se suman como pago hacia el total del documento */ IF NEW.transaction_id IS NOT NULL AND NEW.direction <> 'refund' THEN DECLARE v_total_amount numeric; v_sum_payments numeric; v_existing_rate numeric; BEGIN SELECT total_amount INTO v_total_amount FROM public.transactions WHERE id = NEW.transaction_id; SELECT COALESCE(SUM(amount_cup), 0) INTO v_sum_payments FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND id != NEW.id AND direction <> 'refund'; IF v_sum_payments + NEW.amount_cup > v_total_amount + 0.01 THEN RAISE EXCEPTION 'ERR_PAYMENT_EXCEEDS_TOTAL' USING ERRCODE = 'PT001'; END IF; SELECT exchange_rate INTO v_existing_rate FROM public.payment_transactions WHERE transaction_id = NEW.transaction_id AND payment_method = NEW.payment_method AND currency = NEW.currency AND id != NEW.id AND direction <> 'refund' LIMIT 1; IF FOUND AND ABS(v_existing_rate - NEW.exchange_rate) > 0.000001 THEN RAISE EXCEPTION 'ERR_MULTIPLE_EXCHANGE_RATES' USING ERRCODE = 'PT006'; END IF; END; END IF; RETURN NEW; END 
```

## adjust_total_amount(p_transaction_id uuid, p_new_total numeric, p_reason text)  oid=142121

- Git final: 20260812000001_pr4_4i_payment_transactions_hardening.sql (md5 cuerpo 4da1e2832be3)
- LIVE: oid 142121 (md5 prosrc f3da5a49245f) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260812000001_pr4_4i_payment_transactions_hardening.sql
+++ LIVE:oid142121
@@ -1,80 +1,27 @@
 
-DECLARE
-  v_actor uuid;
-  v_old_total numeric;
-  v_store_id uuid;
-  v_paid_total numeric;
-  v_lock_key bigint;
+DECLARE v_actor uuid; v_old_total numeric; v_store_id uuid; v_paid_total numeric; v_lock_key bigint;
 BEGIN
   v_actor := auth.uid();
-  IF v_actor IS NULL THEN
-    RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014';
-  END IF;
-
-  IF NOT public.is_admin() THEN
-    RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015';
-  END IF;
-
-  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
-    RAISE EXCEPTION 'ERR_REASON_REQUIRED: p_reason cannot be empty' USING ERRCODE = 'PT013';
-  END IF;
-
-  IF p_new_total IS NULL OR p_new_total < 0 THEN
-    RAISE EXCEPTION 'ERR_INVALID_TOTAL: p_new_total must be >= 0 and non-null, got %', p_new_total
-      USING ERRCODE = 'PT012';
-  END IF;
-
+  IF v_actor IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED' USING ERRCODE = 'PT014'; END IF;
+  IF NOT public.is_admin() THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED' USING ERRCODE = 'PT015'; END IF;
+  IF p_reason IS NULL OR btrim(p_reason) = '' THEN RAISE EXCEPTION 'ERR_REASON_REQUIRED' USING ERRCODE = 'PT013'; END IF;
+  IF p_new_total IS NULL OR p_new_total < 0 THEN RAISE EXCEPTION 'ERR_INVALID_TOTAL' USING ERRCODE = 'PT012'; END IF;
   v_lock_key := hashtextextended(p_transaction_id::text, 0);
   PERFORM pg_advisory_xact_lock(v_lock_key);
-
-  SELECT total_amount, store_id
-    INTO v_old_total, v_store_id
-  FROM public.transactions
-  WHERE id = p_transaction_id
-  FOR UPDATE;
-
-  IF NOT FOUND THEN
-    RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016';
-  END IF;
-
-  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total
-  FROM public.payment_transactions
-  WHERE transaction_id = p_transaction_id;
-
-  IF v_paid_total > p_new_total + 0.01 THEN
-    RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS: existing payments=% > new_total=%. Cannot violate I1a.',
-      v_paid_total, p_new_total
-      USING ERRCODE = 'PT002';
-  END IF;
-
+  SELECT total_amount, store_id INTO v_old_total, v_store_id FROM public.transactions WHERE id = p_transaction_id FOR UPDATE;
+  IF NOT FOUND THEN RAISE EXCEPTION 'ERR_TRANSACTION_NOT_FOUND' USING ERRCODE = 'PT016'; END IF;
+  SELECT COALESCE(SUM(amount_cup), 0) INTO v_paid_total FROM public.payment_transactions WHERE transaction_id = p_transaction_id;
+  IF v_paid_total > p_new_total + 0.01 THEN RAISE EXCEPTION 'ERR_TOTAL_BELOW_PAYMENTS' USING ERRCODE = 'PT002'; END IF;
   IF v_old_total = p_new_total THEN
-    INSERT INTO public.audit_logs (
-      action, table_name, record_id, store_id, user_id, metadata
-    ) VALUES (
-      'ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
-      jsonb_build_object(
-        'total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP',
-        'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor
-      )
-    );
+    INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
+    VALUES ('ADJUST_TOTAL_AMOUNT_NO_OP', 'transactions', p_transaction_id, v_store_id, v_actor,
+      jsonb_build_object('total_amount', v_old_total, 'reason', p_reason, 'result', 'NO_OP', 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
     RETURN true;
   END IF;
-
-  UPDATE public.transactions
-    SET total_amount = p_new_total
-    WHERE id = p_transaction_id;
-
-  INSERT INTO public.audit_logs (
-    action, table_name, record_id, store_id, user_id, metadata
-  ) VALUES (
-    'ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
-    jsonb_build_object(
-      'old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason,
-      'paid_total_at_time', v_paid_total,
-      'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor
-    )
-  );
-
+  UPDATE public.transactions SET total_amount = p_new_total WHERE id = p_transaction_id;
+  INSERT INTO public.audit_logs (action, table_name, record_id, store_id, user_id, metadata)
+  VALUES ('ADJUST_TOTAL_AMOUNT', 'transactions', p_transaction_id, v_store_id, v_actor,
+    jsonb_build_object('old_total', v_old_total, 'new_total', p_new_total, 'reason', p_reason, 'paid_total_at_time', v_paid_total, 'executed_as', current_user, 'session_user', session_user, 'auth_uid', v_actor));
   RETURN true;
 END;
 
```

## create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text)  oid=142308

- Git final: 20260817000001_vale_salida.sql (md5 cuerpo 7820e82dc0cf)
- LIVE: oid 142308 (md5 prosrc 9916fa048d2c) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260817000001_vale_salida.sql
+++ LIVE:oid142308
@@ -1,134 +1,4 @@
 
-DECLARE
-  v_caller_uid   uuid;
-  v_slip_id      uuid := gen_random_uuid();
-  v_slip_number  text;
-  v_total_cost   numeric := 0;
-  v_item         jsonb;
-  v_product_id   uuid;
-  v_variant_id   uuid;
-  v_po_item_id   uuid;
-  v_quantity     numeric;
-  v_unit_cost    numeric;
-  v_param_hash   text;
-  v_existing     jsonb;
-  v_seen_po_items uuid[] := ARRAY[]::uuid[];
-  v_order_status text;
-  v_po_product   uuid;
-  v_po_variant   uuid;
 BEGIN
-  v_caller_uid := CASE WHEN auth.role() = 'service_role'
-                       THEN COALESCE(p_user_id, auth.uid())
-                       ELSE auth.uid() END;
-  IF v_caller_uid IS NULL THEN
-    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
-  END IF;
-
-  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
-    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
-  END IF;
-
-  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
-    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
-  END IF;
-
-  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
-    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
-  END IF;
-
-  IF p_production_order_id IS NULL THEN
-    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
-      RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
-    END IF;
-  END IF;
-
-  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
-
-  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
-  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
-  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
-
-  IF p_production_order_id IS NOT NULL THEN
-    SELECT status INTO v_order_status
-    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
-    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
-    IF v_order_status NOT IN ('approved','in_progress') THEN
-      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
-    END IF;
-  END IF;
-
-  v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);
-
-  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, created_by, tenant_id)
-  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
-    (SELECT tenant_id FROM stores WHERE id = p_store_id));
-
-  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
-    v_product_id := (v_item->>'product_id')::uuid;
-    v_quantity := (v_item->>'quantity')::numeric;
-    v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
-    v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;
-
-    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
-    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;
-
-    IF p_production_order_id IS NOT NULL THEN
-      IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
-      IF v_po_item_id = ANY(v_seen_po_items) THEN RAISE EXCEPTION 'ERR_DUPLICATE_PO_ITEM: %', v_po_item_id; END IF;
-      v_seen_po_items := v_seen_po_items || v_po_item_id;
-
-      SELECT product_id, variant_id INTO v_po_product, v_po_variant
-      FROM production_order_items WHERE id = v_po_item_id AND order_id = p_production_order_id;
-      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PO_ITEM_NOT_FOUND'; END IF;
-      IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
-      IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;
-
-      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
-      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
-      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;
-
-      PERFORM withdraw_production_item(
-        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
-        p_store_id := p_store_id, p_user_id := v_caller_uid,
-        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
-        p_server_side_cost := TRUE
-      );
-    ELSE
-      IF v_variant_id IS NOT NULL THEN
-        IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
-          RAISE EXCEPTION 'ERR_VARIANT_NOT_BELONG_TO_PRODUCT';
-        END IF;
-      END IF;
-
-      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
-      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
-      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;
-
-      PERFORM register_stock_movement(
-        p_product_id := v_product_id, p_store_id := p_store_id, p_user_id := v_caller_uid,
-        p_quantity := -v_quantity, p_movement_type := 'issue_slip_out',
-        p_sale_id := v_slip_id, p_unit_cost := v_unit_cost,
-        p_reason := 'Vale de Salida ' || v_slip_number, p_notes := COALESCE(p_notes, ''),
-        p_variant_id := v_variant_id, p_skip_access_check := TRUE
-      );
-    END IF;
-
-    INSERT INTO issue_slip_items (slip_id, product_id, variant_id, production_order_item_id, quantity, unit_cost, total_cost)
-    VALUES (v_slip_id, v_product_id, v_variant_id, v_po_item_id, v_quantity, v_unit_cost, v_quantity * v_unit_cost);
-
-    v_total_cost := v_total_cost + (v_quantity * v_unit_cost);
-  END LOOP;
-
-  UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;
-
-  INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
-  VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
-    jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
-      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));
-
-  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
-    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));
-
-  RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
-END;
-
+  RETURN public.create_vale_salida(p_store_id, p_items, p_production_order_id, p_notes, p_idempotency_key, NULL);
+END 
```

## create_vale_salida(p_store_id uuid, p_items jsonb, p_production_order_id uuid, p_notes text, p_idempotency_key text, p_user_id uuid)  oid=142325

- Git final: 20260817000001_vale_salida.sql (md5 cuerpo 7820e82dc0cf)
- LIVE: oid 142325 (md5 prosrc 655e93defaa4) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260817000001_vale_salida.sql
+++ LIVE:oid142325
@@ -1,76 +1,45 @@
 
 DECLARE
-  v_caller_uid   uuid;
   v_slip_id      uuid := gen_random_uuid();
   v_slip_number  text;
+  v_caller_uid   uuid;
+  v_product_id   uuid;
+  v_variant_id   uuid;
+  v_quantity     numeric;
+  v_unit_cost    numeric;
   v_total_cost   numeric := 0;
   v_item         jsonb;
-  v_product_id   uuid;
-  v_variant_id   uuid;
   v_po_item_id   uuid;
-  v_quantity     numeric;
-  v_unit_cost    numeric;
-  v_param_hash   text;
-  v_existing     jsonb;
-  v_seen_po_items uuid[] := ARRAY[]::uuid[];
-  v_order_status text;
   v_po_product   uuid;
   v_po_variant   uuid;
+  v_seen_po_items uuid[] := ARRAY[]::uuid[];
+  v_existing_result JSONB;
+  v_param_hash TEXT;
 BEGIN
   v_caller_uid := CASE WHEN auth.role() = 'service_role'
                        THEN COALESCE(p_user_id, auth.uid())
                        ELSE auth.uid() END;
-  IF v_caller_uid IS NULL THEN
-    RAISE EXCEPTION 'ERR_UNAUTHENTICATED';
-  END IF;
+  IF v_caller_uid IS NULL THEN RAISE EXCEPTION 'ERR_UNAUTHENTICATED'; END IF;
+  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN RAISE EXCEPTION 'ERR_UNAUTHORIZED'; END IF;
 
-  IF NOT public.has_store_access_as(v_caller_uid, p_store_id) THEN
-    RAISE EXCEPTION 'ERR_UNAUTHORIZED';
-  END IF;
-
-  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
-    RAISE EXCEPTION 'ERR_IDEMPOTENCY_KEY_REQUIRED';
-  END IF;
-
-  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
-    RAISE EXCEPTION 'ERR_EMPTY_ITEMS';
-  END IF;
-
-  IF p_production_order_id IS NULL THEN
-    IF p_notes IS NULL OR btrim(p_notes) = '' THEN
-      RAISE EXCEPTION 'ERR_NOTES_REQUIRED';
-    END IF;
-  END IF;
-
-  PERFORM pg_advisory_xact_lock(hashtext(p_store_id::text));
-
-  v_param_hash := md5(p_store_id::text || '|' || p_items::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
-  v_existing := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
-  IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
-
-  IF p_production_order_id IS NOT NULL THEN
-    SELECT status INTO v_order_status
-    FROM production_orders WHERE id = p_production_order_id AND store_id = p_store_id FOR UPDATE;
-    IF NOT FOUND THEN RAISE EXCEPTION 'ERR_ORDER_NOT_FOUND'; END IF;
-    IF v_order_status NOT IN ('approved','in_progress') THEN
-      RAISE EXCEPTION 'ERR_ORDER_NOT_EDITABLE: %', v_order_status;
-    END IF;
+  IF p_idempotency_key IS NOT NULL THEN
+    v_param_hash := md5(p_store_id::text || '|' || COALESCE(p_production_order_id::text,'') || '|' || COALESCE(p_notes,''));
+    v_existing_result := public.check_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash);
+    IF v_existing_result IS NOT NULL THEN RETURN v_existing_result; END IF;
   END IF;
 
   v_slip_number := public.next_document_number(p_store_id, 'vale_salida', v_caller_uid);
 
-  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, created_by, tenant_id)
-  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, COALESCE(p_notes, ''), v_caller_uid,
-    (SELECT tenant_id FROM stores WHERE id = p_store_id));
+  INSERT INTO issue_slips (id, store_id, slip_number, production_order_id, notes, total_cost, created_by)
+  VALUES (v_slip_id, p_store_id, v_slip_number, p_production_order_id, p_notes, 0, v_caller_uid);
 
   FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
     v_product_id := (v_item->>'product_id')::uuid;
-    v_quantity := (v_item->>'quantity')::numeric;
     v_variant_id := NULLIF(v_item->>'variant_id','')::uuid;
+    v_quantity   := (v_item->>'quantity')::numeric;
     v_po_item_id := NULLIF(v_item->>'production_order_item_id','')::uuid;
 
-    IF v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
-    IF p_production_order_id IS NULL AND v_po_item_id IS NOT NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_WITHOUT_ORDER: cannot associate a production_order_item_id without a production_order_id'; END IF;
+    IF v_quantity IS NULL OR v_quantity <= 0 THEN RAISE EXCEPTION 'ERR_INVALID_QUANTITY'; END IF;
 
     IF p_production_order_id IS NOT NULL THEN
       IF v_po_item_id IS NULL THEN RAISE EXCEPTION 'ERR_PO_ITEM_REQUIRED'; END IF;
@@ -83,16 +52,15 @@
       IF v_po_product IS DISTINCT FROM v_product_id THEN RAISE EXCEPTION 'ERR_PRODUCT_MISMATCH'; END IF;
       IF v_po_variant IS DISTINCT FROM v_variant_id THEN RAISE EXCEPTION 'ERR_VARIANT_MISMATCH'; END IF;
 
-      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id FOR UPDATE;
-      IF NOT FOUND THEN RAISE EXCEPTION 'ERR_PRODUCT_NOT_FOUND: %', v_product_id; END IF;
-      IF v_unit_cost IS NULL THEN RAISE EXCEPTION 'ERR_PRODUCT_COST_UNAVAILABLE: %', v_product_id; END IF;
-
-      PERFORM withdraw_production_item(
-        p_item_id := v_po_item_id, p_qty := v_quantity, p_unit_cost := v_unit_cost,
+      -- DF-09: firma consolidada v3 — costo SIEMPRE server-side (sin p_unit_cost)
+      PERFORM public.withdraw_production_item_v3(
+        p_item_id := v_po_item_id, p_qty := v_quantity,
         p_store_id := p_store_id, p_user_id := v_caller_uid,
-        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number,
-        p_server_side_cost := TRUE
+        p_idempotency_key := NULL,
+        p_reference_id := v_slip_id, p_reference_doc := 'Vale de Salida ' || v_slip_number
       );
+      -- el costo usado por v3 (server-side) para el asiento del vale:
+      SELECT cost_average INTO v_unit_cost FROM products WHERE id = v_product_id AND store_id = p_store_id;
     ELSE
       IF v_variant_id IS NOT NULL THEN
         IF NOT EXISTS (SELECT 1 FROM product_variants WHERE id = v_variant_id AND product_id = v_product_id) THEN
@@ -121,14 +89,15 @@
 
   UPDATE issue_slips SET total_cost = v_total_cost WHERE id = v_slip_id;
 
+  IF p_idempotency_key IS NOT NULL THEN
+    PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
+      jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));
+  END IF;
+
   INSERT INTO audit_logs (action, table_name, record_id, store_id, user_id, metadata)
   VALUES ('CREATE_VALE_SALIDA', 'issue_slips', v_slip_id, p_store_id, v_caller_uid,
     jsonb_build_object('slip_number', v_slip_number, 'total_cost', v_total_cost,
-      'production_order_id', p_production_order_id, 'items_count', jsonb_array_length(p_items)));
-
-  PERFORM public.register_idempotency(p_idempotency_key, 'vale_salida', v_slip_id, v_param_hash,
-    jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost));
+      'withdraw_signature', 'v3_server_side_df09'));
 
   RETURN jsonb_build_object('status','success','slip_id',v_slip_id,'slip_number',v_slip_number,'total_cost',v_total_cost);
-END;
-
+END 
```

## has_management_access_as(p_user_id uuid, p_store_id uuid)  oid=142421

- Git final: 20260818000001_security_hardening_h1_h2_h3.sql (md5 cuerpo 35c7da6a7109)
- LIVE: oid 142421 (md5 prosrc ed29082390d6) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260818000001_security_hardening_h1_h2_h3.sql
+++ LIVE:oid142421
@@ -1,9 +1,6 @@
 
-  -- service_role always passes
   SELECT CASE WHEN auth.role() = 'service_role' THEN true
     ELSE
-      -- Check if user has admin/manager/encargado role in their profile
-      -- OR has a membership with manager/admin role for the store
       EXISTS (
         SELECT 1 FROM profiles
         WHERE id = p_user_id
```

## ensure_product_barcode()  oid=142600

- Git final: 20260820000010_fix_barcode_type_and_rpc_trim.sql (md5 cuerpo 2d047fd26613)
- LIVE: oid 142600 (md5 prosrc f14324e9aebb) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260820000010_fix_barcode_type_and_rpc_trim.sql
+++ LIVE:oid142600
@@ -1,15 +1,20 @@
 
-BEGIN
-  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
-    NEW.barcode := public.generate_internal_barcode();
-    NEW.barcode_type := 'INTERNAL';
-  ELSE
-    IF NEW.barcode LIKE 'INT%' THEN
-      NEW.barcode_type := 'INTERNAL';
-    ELSIF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
-      NEW.barcode_type := 'EAN13';
-    END IF;
-  END IF;
-  RETURN NEW;
-END;
+    BEGIN
+      -- If barcode is NULL or empty, generate an internal one
+      IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
+        NEW.barcode := public.generate_internal_barcode();
+        NEW.barcode_type := 'INTERNAL';
+      ELSE
+        -- If barcode was provided, check if it looks like an internal one
+        IF NEW.barcode LIKE 'INT%' THEN
+          NEW.barcode_type := 'INTERNAL';
+        ELSIF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
+          -- User provided a commercial barcode without specifying type
+          -- Default to EAN13 for commercial barcodes
+          NEW.barcode_type := 'EAN13';
+        END IF;
+      END IF;
 
+      RETURN NEW;
+    END;
+    
```

## bulk_update_products(_products jsonb)  oid=142629

- Git final: 20260124_enforce_store_sku_uniqueness.sql (md5 cuerpo 3a29a1744794)
- LIVE: oid 142629 (md5 prosrc 85e578c6b5a3) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260124_enforce_store_sku_uniqueness.sql
+++ LIVE:oid142629
@@ -1,48 +1,81 @@
 
-DECLARE
-    v_inserted_count int;
-    v_updated_count int;
-BEGIN
-    WITH upserted AS (
-        INSERT INTO products (
-            store_id,
-            sku,
-            name,
-            cost_price,
-            price,
-            image_url,
-            category,
-            unit_of_measure,
-            updated_at
-        )
-        SELECT
-            (p->>'store_id')::UUID,
-            p->>'sku',
-            p->>'name',
-            COALESCE((p->>'cost_price')::NUMERIC, 0),
-            COALESCE((p->>'price')::NUMERIC, 0),
-            p->>'image_url',
-            p->>'category',
-            p->>'unit_of_measure',
-            NOW()
-        FROM jsonb_array_elements(_products) AS p
-        WHERE p->>'sku' IS NOT NULL AND p->>'store_id' IS NOT NULL
-        ON CONFLICT (store_id, sku) DO UPDATE SET
-            name = EXCLUDED.name,
-            price = EXCLUDED.price,
-            cost_price = EXCLUDED.cost_price,
-            image_url = EXCLUDED.image_url,
-            category = EXCLUDED.category,
-            unit_of_measure = EXCLUDED.unit_of_measure,
-            updated_at = NOW()
-        RETURNING xmax
-    )
-    SELECT
-        SUM(CASE WHEN xmax::text::int > 0 THEN 1 ELSE 0 END),
-        SUM(CASE WHEN xmax = 0 THEN 1 ELSE 0 END)
-    INTO v_updated_count, v_inserted_count
-    FROM upserted;
+    DECLARE
+        v_inserted_count int;
+        v_updated_count int;
+        v_row jsonb;
+        v_sku text;
+        v_store_id uuid;
+        v_price numeric;
+        v_cost numeric;
+        v_currency text;
+        v_name text;
+        v_image_url text;
+        v_category text;
+        v_unit text;
+        v_xmax text;
+    BEGIN
+        v_inserted_count := 0;
+        v_updated_count := 0;
 
-    RETURN QUERY SELECT COALESCE(v_updated_count, 0), COALESCE(v_inserted_count, 0);
-END;
+        FOR v_row IN SELECT * FROM jsonb_array_elements(_products)
+        LOOP
+            v_sku := v_row->>'sku';
+            v_store_id := (v_row->>'store_id')::uuid;
+            v_name := v_row->>'name';
+            v_price := COALESCE((v_row->>'price')::numeric, 0);
+            v_cost := COALESCE((v_row->>'cost_price')::numeric, 0);
+            v_currency := COALESCE(UPPER(v_row->>'price_currency'), 'CUP');
+            v_image_url := v_row->>'image_url';
+            v_category := v_row->>'category';
+            v_unit := v_row->>'unit_of_measure';
 
+            IF v_sku IS NULL OR v_store_id IS NULL THEN
+                CONTINUE;
+            END IF;
+
+            IF v_currency NOT IN ('CUP', 'USD', 'EUR', 'MLC') THEN
+                RETURN QUERY SELECT 0, 0, 'Moneda inválida: ' || v_currency || ' SKU ' || v_sku;
+                RETURN;
+            END IF;
+
+            IF v_currency = 'CUP' AND v_price > 0 AND v_cost > 0 AND v_price < v_cost THEN
+                RETURN QUERY SELECT 0, 0, 'Precio CUP menor que costo SKU ' || v_sku;
+                RETURN;
+            END IF;
+
+            BEGIN
+                WITH upserted AS (
+                    INSERT INTO products (
+                        store_id, sku, name, cost_price, price, price_currency,
+                        image_url, category, unit_of_measure, updated_at
+                    ) VALUES (
+                        v_store_id, v_sku, v_name, v_cost, v_price, v_currency,
+                        v_image_url, v_category, v_unit, NOW()
+                    )
+                    ON CONFLICT (sku, store_id) DO UPDATE SET
+                        name = EXCLUDED.name,
+                        price = EXCLUDED.price,
+                        cost_price = EXCLUDED.cost_price,
+                        price_currency = EXCLUDED.price_currency,
+                        image_url = EXCLUDED.image_url,
+                        category = EXCLUDED.category,
+                        unit_of_measure = EXCLUDED.unit_of_measure,
+                        updated_at = NOW()
+                    RETURNING xmax::text AS xmax_text
+                )
+                SELECT xmax_text FROM upserted INTO v_xmax;
+
+                IF v_xmax IS NOT NULL AND v_xmax::int > 0 THEN
+                    v_updated_count := v_updated_count + 1;
+                ELSE
+                    v_inserted_count := v_inserted_count + 1;
+                END IF;
+            EXCEPTION WHEN OTHERS THEN
+                RETURN QUERY SELECT 0, 0, 'Error SKU ' || v_sku || ': ' || SQLERRM;
+                RETURN;
+            END;
+        END LOOP;
+
+        RETURN QUERY SELECT v_updated_count, v_inserted_count, NULL::text;
+    END;
+    
```

## get_paginated_products_v2(p_limit integer, p_offset integer, p_store_id uuid, p_search_term text, p_category text, p_sort_key text, p_sort_dir text, p_stock_filter text, p_active_filter text)  oid=142661

- Git final: 20260823000002_get_paginated_products_v2_add_fields.sql (md5 cuerpo f1b2dcfb271f)
- LIVE: oid 142661 (md5 prosrc 700216efd15f) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260823000002_get_paginated_products_v2_add_fields.sql
+++ LIVE:oid142661
@@ -1,86 +1,84 @@
 
-BEGIN
-  -- Auth checks
-  IF auth.uid() IS NULL THEN
-    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
-  END IF;
-  IF p_store_id IS NULL AND NOT public.is_admin() THEN
-    RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
-  END IF;
-  IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
-    RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
-  END IF;
+    BEGIN
+      IF auth.uid() IS NULL THEN
+        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
+      END IF;
+      IF p_store_id IS NULL AND NOT public.is_admin() THEN
+        RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
+      END IF;
+      IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
+        RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
+      END IF;
 
-  RETURN QUERY
-  SELECT
-    p.id, p.name, p.sku, p.barcode, p.barcode_type,
-    p.category, p.price, p.precio_empresa, p.precio_empresa_currency, COALESCE(p.price_currency, 'CUP'),
-    p.cost_price, p.min_stock, p.image_url, p.description,
-    p.unit_of_measure, p.supplier,
-    COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
-              WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric AS stock_current,
-    p.cost_average,
-    p.store_id, p.is_active,
-    EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
-            UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
-            UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
-    p.visible_en_tienda,
-    COALESCE(p.price_visible, true),
-    COALESCE(p.stock_visible, true),
-    COALESCE(p.on_promotion, false),
-    p.created_at, p.updated_at,
-    -- is_complete: True si tiene name, sku, price, cost_price, category, unit_of_measure
-    (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
-     AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
-     AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
-    COUNT(*) OVER()::bigint AS total_count
-  FROM public.products p
-  WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
-    AND public.has_store_access(p.store_id)
-    AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
-         (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
-    AND (p_search_term IS NULL OR p_search_term = '' OR
-         p.name ILIKE ('%' || p_search_term || '%') OR
-         p.sku ILIKE ('%' || p_search_term || '%') OR
-         COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%'))
-    AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
-    AND (p_active_filter = 'all' OR
-         (p_active_filter = 'active' AND p.is_active = true) OR
-         (p_active_filter = 'inactive' AND p.is_active = false))
-    AND (p_stock_filter = 'all' OR
-         (p_stock_filter = 'out' AND
-          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
-                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= 0) OR
-         (p_stock_filter = 'low' AND
-          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
-                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > 0 AND
-          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
-                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= COALESCE(p.min_stock, 0)) OR
-         (p_stock_filter = 'ok' AND
-          COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
-                    WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > COALESCE(p.min_stock, 0)))
-  ORDER BY
-    CASE WHEN p_sort_dir = 'asc' THEN
-      CASE p_sort_key
-        WHEN 'name' THEN p.name
-        WHEN 'sku' THEN COALESCE(p.sku, '')
-        WHEN 'price' THEN LPAD(p.price::text, 20, '0')
-        WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
-        WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
-        ELSE p.name
-      END
-    END ASC NULLS LAST,
-    CASE WHEN p_sort_dir = 'desc' THEN
-      CASE p_sort_key
-        WHEN 'name' THEN p.name
-        WHEN 'sku' THEN COALESCE(p.sku, '')
-        WHEN 'price' THEN LPAD(p.price::text, 20, '0')
-        WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
-        WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
-        ELSE p.name
-      END
-    END DESC NULLS LAST,
-    p.id ASC
-  LIMIT p_limit OFFSET p_offset;
-END;
-
+      RETURN QUERY
+      SELECT
+        p.id, p.name, p.sku, p.barcode, p.barcode_type,
+        p.category, p.price, p.precio_empresa, p.precio_empresa_currency, COALESCE(p.price_currency, 'CUP'),
+        p.cost_price, p.min_stock, p.image_url, p.description,
+        p.unit_of_measure, p.supplier,
+        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
+                  WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric AS stock_current,
+        p.cost_average,
+        p.store_id, p.is_active,
+        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
+                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
+                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
+        p.visible_en_tienda,
+        COALESCE(p.price_visible, true),
+        COALESCE(p.stock_visible, true),
+        COALESCE(p.on_promotion, false),
+        p.created_at, p.updated_at,
+        (COALESCE(p.name, '') <> '' AND COALESCE(p.sku, '') <> '' AND p.price > 0
+         AND p.cost_price IS NOT NULL AND COALESCE(p.category, '') <> ''
+         AND COALESCE(p.unit_of_measure, '') <> '') AS is_complete,
+        COUNT(*) OVER()::bigint AS total_count
+      FROM public.products p
+      WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
+        AND public.has_store_access(p.store_id)
+        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM
+             (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
+        AND (p_search_term IS NULL OR p_search_term = '' OR
+             p.name ILIKE ('%' || p_search_term || '%') OR
+             p.sku ILIKE ('%' || p_search_term || '%') OR
+             COALESCE(p.barcode, '') ILIKE ('%' || p_search_term || '%'))
+        AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
+        AND (p_active_filter = 'all' OR
+             (p_active_filter = 'active' AND p.is_active = true) OR
+             (p_active_filter = 'inactive' AND p.is_active = false))
+        AND (p_stock_filter = 'all' OR
+             (p_stock_filter = 'out' AND
+              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
+                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= 0) OR
+             (p_stock_filter = 'low' AND
+              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
+                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > 0 AND
+              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
+                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) <= COALESCE(p.min_stock, 0)) OR
+             (p_stock_filter = 'ok' AND
+              COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv
+                        WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0) > COALESCE(p.min_stock, 0)))
+      ORDER BY
+        CASE WHEN p_sort_dir = 'asc' THEN
+          CASE p_sort_key
+            WHEN 'name' THEN p.name
+            WHEN 'sku' THEN COALESCE(p.sku, '')
+            WHEN 'price' THEN LPAD(p.price::text, 20, '0')
+            WHEN 'cost_price' THEN LPAD(p.cost_price::text, 20, '0')
+            WHEN 'stock_current' THEN LPAD(COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::text, 20, '0')
+            ELSE p.name
+          END
+        END ASC NULLS LAST,
+        CASE WHEN p_sort_dir = 'desc' THEN
+          CASE p_sort_key
+            WHEN 'name' THEN p.name
... [11 líneas más]
```

## get_products_for_pos(p_store_id uuid, p_search_term text, p_category text, p_limit integer, p_offset integer)  oid=142663

- Git final: 20260823000002_get_paginated_products_v2_add_fields.sql (md5 cuerpo cd640765bf3e)
- LIVE: oid 142663 (md5 prosrc 73092e43bf8a) FIRMA: args Git y LIVE difieren (revisar)
```diff
--- GIT:20260823000002_get_paginated_products_v2_add_fields.sql
+++ LIVE:oid142663
@@ -1,48 +1,48 @@
 
-    DECLARE
-      v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
-      v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
-      v_search text := trim(coalesce(p_search_term, ''));
-    BEGIN
-      IF auth.uid() IS NULL THEN
-        RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
-      END IF;
-      IF p_store_id IS NULL AND NOT public.is_admin() THEN
-        RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
-      END IF;
-      IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
-        RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
-      END IF;
+        DECLARE
+          v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 5000);
+          v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
+          v_search text := trim(coalesce(p_search_term, ''));
+        BEGIN
+          IF auth.uid() IS NULL THEN
+            RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
+          END IF;
+          IF p_store_id IS NULL AND NOT public.is_admin() THEN
+            RAISE EXCEPTION 'p_store_id is required' USING ERRCODE = '42501';
+          END IF;
+          IF p_store_id IS NOT NULL AND NOT public.has_store_access(p_store_id) THEN
+            RAISE EXCEPTION 'Unauthorized store access' USING ERRCODE = '42501';
+          END IF;
 
-      RETURN QUERY
-      SELECT
-        p.id, p.name, p.description, p.sku, p.price, p.cost_price, p.image_url,
-        p.category, p.unit_of_measure, p.supplier, p.created_at, p.updated_at,
-        COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
-        p.cost_average, p.min_stock::integer, p.store_id, p.is_active,
-        EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
-                UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
-                UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
-        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price, 'conversion_factor', pv.conversion_factor)) FROM public.product_variants pv WHERE pv.product_id = p.id), '[]'::jsonb),
-        COALESCE(p.price_currency, 'CUP'),
-        p.barcode,
-        p.barcode_type,
-        p.visible_en_tienda,
-        p.precio_empresa,
-        p.precio_empresa_currency,
-        COALESCE(p.on_promotion, false)
-      FROM public.products p
-      WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
-        AND public.has_store_access(p.store_id)
-        AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
-        AND (
-          v_search = ''
-          OR p.name ILIKE ('%' || v_search || '%')
-          OR p.sku ILIKE ('%' || v_search || '%')
-          OR COALESCE(p.barcode, '') = v_search
-        )
-        AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
-      ORDER BY p.name
-      LIMIT v_limit OFFSET v_offset;
-    END;
-
+          RETURN QUERY
+          SELECT
+            p.id, p.name, p.description, p.sku, p.price, p.cost_price, p.image_url,
+            p.category, p.unit_of_measure, p.supplier, p.created_at, p.updated_at,
+            COALESCE((SELECT SUM(inv.quantity) FROM public.inventory inv WHERE inv.product_id = p.id AND inv.store_id = p.store_id), 0)::numeric,
+            p.cost_average, p.min_stock::integer, p.store_id, p.is_active,
+            EXISTS (SELECT 1 FROM public.transaction_items ti WHERE ti.product_id = p.id
+                    UNION ALL SELECT 1 FROM public.stock_movements sm WHERE sm.product_id = p.id
+                    UNION ALL SELECT 1 FROM public.receipt_items ri WHERE ri.product_id = p.id) AS has_movements,
+            COALESCE((SELECT jsonb_agg(jsonb_build_object('id', pv.id, 'name', pv.name, 'sku', pv.sku, 'price', pv.price, 'conversion_factor', pv.conversion_factor)) FROM public.product_variants pv WHERE pv.product_id = p.id), '[]'::jsonb),
+            COALESCE(p.price_currency, 'CUP'),
+            p.barcode,
+            p.barcode_type,
+            p.visible_en_tienda,
+            p.precio_empresa,
+            p.precio_empresa_currency,
+            COALESCE(p.on_promotion, false)
+          FROM public.products p
+          WHERE (p_store_id IS NULL OR p.store_id = p_store_id)
+            AND public.has_store_access(p.store_id)
+            AND (p.tenant_id IS NULL OR p.tenant_id IS NOT DISTINCT FROM (SELECT s.tenant_id FROM public.stores s WHERE s.id = p.store_id))
+            AND (
+              v_search = ''
+              OR p.name ILIKE ('%' || v_search || '%')
+              OR p.sku ILIKE ('%' || v_search || '%')
+              OR COALESCE(p.barcode, '') = v_search
+            )
+            AND (p_category IS NULL OR p_category = '' OR p.category = p_category)
+          ORDER BY p.name
+          LIMIT v_limit OFFSET v_offset;
+        END;
+    
```
