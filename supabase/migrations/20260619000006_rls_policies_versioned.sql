-- R2-M3: RLS policies extraidas de la BD y versionadas
-- Estas policies garantizan aislamiento multi-tenant a nivel de BD

DROP POLICY IF EXISTS "Cash closures unified" ON public.cash_closures;
CREATE POLICY "Cash closures unified" ON public.cash_closures FOR ALL TO authenticated USING (has_store_access(store_id));

DROP POLICY IF EXISTS "cash_closures_delete_rls" ON public.cash_closures;
CREATE POLICY "cash_closures_delete_rls" ON public.cash_closures FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_closures.store_id)))));

DROP POLICY IF EXISTS "cash_closures_insert_rls" ON public.cash_closures;
CREATE POLICY "cash_closures_insert_rls" ON public.cash_closures FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_closures.store_id)))));

DROP POLICY IF EXISTS "cash_closures_select_rls" ON public.cash_closures;
CREATE POLICY "cash_closures_select_rls" ON public.cash_closures FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_closures.store_id)))));

DROP POLICY IF EXISTS "cash_closures_update_rls" ON public.cash_closures;
CREATE POLICY "cash_closures_update_rls" ON public.cash_closures FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_closures.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "Cash movements access" ON public.cash_movements;
CREATE POLICY "Cash movements access" ON public.cash_movements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM cash_register_sessions s
  WHERE ((s.id = cash_movements.session_id) AND has_store_access(s.store_id)))));

DROP POLICY IF EXISTS "Cash movements insert" ON public.cash_movements;
CREATE POLICY "Cash movements insert" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM cash_register_sessions s
  WHERE ((s.id = cash_movements.session_id) AND has_store_access(s.store_id)))));

DROP POLICY IF EXISTS "cash_movements_insert" ON public.cash_movements;
CREATE POLICY "cash_movements_insert" ON public.cash_movements FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_movements.store_id)))));

DROP POLICY IF EXISTS "cash_movements_select" ON public.cash_movements;
CREATE POLICY "cash_movements_select" ON public.cash_movements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_movements.store_id)))));

DROP POLICY IF EXISTS "cash_sessions_insert" ON public.cash_sessions;
CREATE POLICY "cash_sessions_insert" ON public.cash_sessions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_sessions.store_id)))));

DROP POLICY IF EXISTS "cash_sessions_select" ON public.cash_sessions;
CREATE POLICY "cash_sessions_select" ON public.cash_sessions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_sessions.store_id)))));

DROP POLICY IF EXISTS "cash_sessions_update" ON public.cash_sessions;
CREATE POLICY "cash_sessions_update" ON public.cash_sessions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = cash_sessions.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "Allow all access to own store data" ON public.inventory_adjustments;
CREATE POLICY "Allow all access to own store data" ON public.inventory_adjustments FOR ALL TO authenticated USING ((store_id IN ( SELECT get_current_user_store_id() AS get_current_user_store_id)));

DROP POLICY IF EXISTS "inventory_adjustments_delete_rls" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_delete_rls" ON public.inventory_adjustments FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = inventory_adjustments.store_id)))));

DROP POLICY IF EXISTS "inventory_adjustments_insert_rls" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_insert_rls" ON public.inventory_adjustments FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = inventory_adjustments.store_id)))));

DROP POLICY IF EXISTS "inventory_adjustments_select_rls" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_select_rls" ON public.inventory_adjustments FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = inventory_adjustments.store_id)))));

DROP POLICY IF EXISTS "inventory_adjustments_update_rls" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_update_rls" ON public.inventory_adjustments FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = inventory_adjustments.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "Admin/manager can delete ofertas" ON public.ofertas;
CREATE POLICY "Admin/manager can delete ofertas" ON public.ofertas FOR DELETE TO authenticated USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))) OR (store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE ((user_store_memberships.user_id = auth.uid()) AND (user_store_memberships.status = 'active'::membership_status) AND (user_store_memberships.role = 'manager'::user_role))))));

DROP POLICY IF EXISTS "Admin/manager/encargado can insert ofertas" ON public.ofertas;
CREATE POLICY "Admin/manager/encargado can insert ofertas" ON public.ofertas FOR INSERT TO authenticated WITH CHECK (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE ((user_store_memberships.user_id = auth.uid()) AND (user_store_memberships.status = 'active'::membership_status) AND (user_store_memberships.role = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'encargado'::user_role]))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "Admin/manager/encargado can update ofertas" ON public.ofertas;
CREATE POLICY "Admin/manager/encargado can update ofertas" ON public.ofertas FOR UPDATE TO authenticated USING (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE ((user_store_memberships.user_id = auth.uid()) AND (user_store_memberships.status = 'active'::membership_status) AND (user_store_memberships.role = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'encargado'::user_role]))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))) WITH CHECK ();

DROP POLICY IF EXISTS "Users can view ofertas from their stores" ON public.ofertas;
CREATE POLICY "Users can view ofertas from their stores" ON public.ofertas FOR SELECT TO authenticated USING (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE ((user_store_memberships.user_id = auth.uid()) AND (user_store_memberships.status = 'active'::membership_status)))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "ofertas_select_rls" ON public.ofertas;
CREATE POLICY "ofertas_select_rls" ON public.ofertas FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = ofertas.store_id)))));

DROP POLICY IF EXISTS "product_cost_sheets_delete_admin" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_delete_admin" ON public.product_cost_sheets FOR DELETE TO authenticated USING (is_global_admin());

DROP POLICY IF EXISTS "product_cost_sheets_insert_roles" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_insert_roles" ON public.product_cost_sheets FOR INSERT TO authenticated WITH CHECK ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text, 'manager'::text, 'encargado'::text, 'costo'::text])));

DROP POLICY IF EXISTS "product_cost_sheets_select_authenticated" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_select_authenticated" ON public.product_cost_sheets FOR SELECT TO authenticated USING ((is_global_admin() OR is_store_member(store_id)));

DROP POLICY IF EXISTS "product_cost_sheets_select_rls" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_select_rls" ON public.product_cost_sheets FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = product_cost_sheets.store_id)))));

DROP POLICY IF EXISTS "product_cost_sheets_update_roles" ON public.product_cost_sheets;
CREATE POLICY "product_cost_sheets_update_roles" ON public.product_cost_sheets FOR UPDATE TO authenticated USING ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text, 'manager'::text, 'encargado'::text, 'costo'::text]))) WITH CHECK ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text, 'manager'::text, 'encargado'::text, 'costo'::text])));

DROP POLICY IF EXISTS "Productos públicos - lectura" ON public.products;
CREATE POLICY "Productos públicos - lectura" ON public.products FOR SELECT TO authenticated USING ((visible_en_tienda = true));

DROP POLICY IF EXISTS "products_delete_rls" ON public.products;
CREATE POLICY "products_delete_rls" ON public.products FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = products.store_id)))));

DROP POLICY IF EXISTS "products_delete_store_access" ON public.products;
CREATE POLICY "products_delete_store_access" ON public.products FOR DELETE TO authenticated USING ((has_store_access(store_id) AND ((tenant_id IS NULL) OR (NOT (tenant_id IS DISTINCT FROM ( SELECT s.tenant_id
   FROM stores s
  WHERE (s.id = products.store_id)))))));

DROP POLICY IF EXISTS "products_insert_rls" ON public.products;
CREATE POLICY "products_insert_rls" ON public.products FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = products.store_id)))));

DROP POLICY IF EXISTS "products_insert_store_access" ON public.products;
CREATE POLICY "products_insert_store_access" ON public.products FOR INSERT TO authenticated WITH CHECK ((has_store_access(store_id) AND ((tenant_id IS NULL) OR (NOT (tenant_id IS DISTINCT FROM ( SELECT s.tenant_id
   FROM stores s
  WHERE (s.id = products.store_id)))))));

DROP POLICY IF EXISTS "products_select_rls" ON public.products;
CREATE POLICY "products_select_rls" ON public.products FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = products.store_id)))));

DROP POLICY IF EXISTS "products_select_store_access" ON public.products;
CREATE POLICY "products_select_store_access" ON public.products FOR SELECT TO authenticated USING ((has_store_access(store_id) AND ((tenant_id IS NULL) OR (NOT (tenant_id IS DISTINCT FROM ( SELECT s.tenant_id
   FROM stores s
  WHERE (s.id = products.store_id)))))));

DROP POLICY IF EXISTS "products_update_rls" ON public.products;
CREATE POLICY "products_update_rls" ON public.products FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = products.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "products_update_store_access" ON public.products;
CREATE POLICY "products_update_store_access" ON public.products FOR UPDATE TO authenticated USING ((has_store_access(store_id) AND ((tenant_id IS NULL) OR (NOT (tenant_id IS DISTINCT FROM ( SELECT s.tenant_id
   FROM stores s
  WHERE (s.id = products.store_id))))))) WITH CHECK ((has_store_access(store_id) AND ((tenant_id IS NULL) OR (NOT (tenant_id IS DISTINCT FROM ( SELECT s.tenant_id
   FROM stores s
  WHERE (s.id = products.store_id)))))));

DROP POLICY IF EXISTS "Purchases unified" ON public.purchase_orders;
CREATE POLICY "Purchases unified" ON public.purchase_orders FOR ALL TO authenticated USING (has_store_access(store_id));

DROP POLICY IF EXISTS "po_ins" ON public.purchase_orders;
CREATE POLICY "po_ins" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE (user_store_memberships.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "po_insert_authenticated" ON public.purchase_orders;
CREATE POLICY "po_insert_authenticated" ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE ((user_store_memberships.user_id = auth.uid()) AND (user_store_memberships.role = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'encargado'::user_role]))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "po_sel" ON public.purchase_orders;
CREATE POLICY "po_sel" ON public.purchase_orders FOR SELECT TO authenticated USING (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE (user_store_memberships.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "po_select_authenticated" ON public.purchase_orders;
CREATE POLICY "po_select_authenticated" ON public.purchase_orders FOR SELECT TO authenticated USING (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE (user_store_memberships.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role))))));

DROP POLICY IF EXISTS "po_upd" ON public.purchase_orders;
CREATE POLICY "po_upd" ON public.purchase_orders FOR UPDATE TO authenticated USING (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE (user_store_memberships.user_id = auth.uid()))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))) WITH CHECK ();

DROP POLICY IF EXISTS "po_update_authenticated" ON public.purchase_orders;
CREATE POLICY "po_update_authenticated" ON public.purchase_orders FOR UPDATE TO authenticated USING (((store_id IN ( SELECT user_store_memberships.store_id
   FROM user_store_memberships
  WHERE ((user_store_memberships.user_id = auth.uid()) AND (user_store_memberships.role = ANY (ARRAY['admin'::user_role, 'manager'::user_role, 'encargado'::user_role]))))) OR (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'admin'::user_role)))))) WITH CHECK ();

DROP POLICY IF EXISTS "purchase_orders_select_rls" ON public.purchase_orders;
CREATE POLICY "purchase_orders_select_rls" ON public.purchase_orders FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = purchase_orders.store_id)))));

DROP POLICY IF EXISTS "Receipts update status" ON public.receipts;
CREATE POLICY "Receipts update status" ON public.receipts FOR UPDATE TO authenticated USING ((is_admin() OR has_store_access(store_id))) WITH CHECK ((is_admin() OR has_store_access(store_id)));

DROP POLICY IF EXISTS "receipts_delete_rls" ON public.receipts;
CREATE POLICY "receipts_delete_rls" ON public.receipts FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = receipts.store_id)))));

DROP POLICY IF EXISTS "receipts_insert_rls" ON public.receipts;
CREATE POLICY "receipts_insert_rls" ON public.receipts FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = receipts.store_id)))));

DROP POLICY IF EXISTS "receipts_select_isolated" ON public.receipts;
CREATE POLICY "receipts_select_isolated" ON public.receipts FOR SELECT TO authenticated USING ((is_admin() OR has_store_access(store_id)));

DROP POLICY IF EXISTS "receipts_select_rls" ON public.receipts;
CREATE POLICY "receipts_select_rls" ON public.receipts FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = receipts.store_id)))));

DROP POLICY IF EXISTS "receipts_update_rls" ON public.receipts;
CREATE POLICY "receipts_update_rls" ON public.receipts FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = receipts.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "Stock movements select" ON public.stock_movements;
CREATE POLICY "Stock movements select" ON public.stock_movements FOR SELECT TO authenticated USING ((is_admin() OR has_store_access(store_id)));

DROP POLICY IF EXISTS "Warehouse can insert stock movements" ON public.stock_movements;
CREATE POLICY "Warehouse can insert stock movements" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK ((has_any_role(ARRAY['admin'::user_role, 'warehouse'::user_role]) AND (store_id = current_user_store_id())));

DROP POLICY IF EXISTS "stock_movements_delete_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_delete_rls" ON public.stock_movements FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = stock_movements.store_id)))));

DROP POLICY IF EXISTS "stock_movements_insert_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_insert_rls" ON public.stock_movements FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = stock_movements.store_id)))));

DROP POLICY IF EXISTS "stock_movements_select_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_select_rls" ON public.stock_movements FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = stock_movements.store_id)))));

DROP POLICY IF EXISTS "stock_movements_update_rls" ON public.stock_movements;
CREATE POLICY "stock_movements_update_rls" ON public.stock_movements FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = stock_movements.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "store_cost_templates_delete_admin" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_delete_admin" ON public.store_cost_templates FOR DELETE TO authenticated USING ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text])));

DROP POLICY IF EXISTS "store_cost_templates_insert_roles" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_insert_roles" ON public.store_cost_templates FOR INSERT TO authenticated WITH CHECK ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text, 'manager'::text, 'encargado'::text])));

DROP POLICY IF EXISTS "store_cost_templates_select_authenticated" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_select_authenticated" ON public.store_cost_templates FOR SELECT TO authenticated USING ((is_global_admin() OR is_store_member(store_id)));

DROP POLICY IF EXISTS "store_cost_templates_select_rls" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_select_rls" ON public.store_cost_templates FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = store_cost_templates.store_id)))));

DROP POLICY IF EXISTS "store_cost_templates_update_roles" ON public.store_cost_templates;
CREATE POLICY "store_cost_templates_update_roles" ON public.store_cost_templates FOR UPDATE TO authenticated USING ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text, 'manager'::text, 'encargado'::text]))) WITH CHECK ((is_global_admin() OR has_store_role(store_id, ARRAY['admin'::text, 'manager'::text, 'encargado'::text])));

DROP POLICY IF EXISTS "Transactions insert" ON public.transactions;
CREATE POLICY "Transactions insert" ON public.transactions FOR INSERT TO authenticated WITH CHECK (((seller_id = ( SELECT auth.uid() AS uid)) AND has_store_access(store_id)));

DROP POLICY IF EXISTS "Transactions select" ON public.transactions;
CREATE POLICY "Transactions select" ON public.transactions FOR SELECT TO authenticated USING (((seller_id = ( SELECT auth.uid() AS uid)) OR is_admin() OR has_store_access(store_id)));

DROP POLICY IF EXISTS "Transactions update status" ON public.transactions;
CREATE POLICY "Transactions update status" ON public.transactions FOR UPDATE TO authenticated USING ((is_admin() OR has_store_access(store_id) OR (seller_id = auth.uid()))) WITH CHECK ((is_admin() OR has_store_access(store_id) OR (seller_id = auth.uid())));

DROP POLICY IF EXISTS "transactions_delete_rls" ON public.transactions;
CREATE POLICY "transactions_delete_rls" ON public.transactions FOR DELETE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = transactions.store_id)))));

DROP POLICY IF EXISTS "transactions_insert_rls" ON public.transactions;
CREATE POLICY "transactions_insert_rls" ON public.transactions FOR INSERT TO authenticated WITH CHECK ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = transactions.store_id)))));

DROP POLICY IF EXISTS "transactions_select_rls" ON public.transactions;
CREATE POLICY "transactions_select_rls" ON public.transactions FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = transactions.store_id)))));

DROP POLICY IF EXISTS "transactions_update_rls" ON public.transactions;
CREATE POLICY "transactions_update_rls" ON public.transactions FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = transactions.store_id))))) WITH CHECK ();

DROP POLICY IF EXISTS "Transfers access" ON public.transfers;
CREATE POLICY "Transfers access" ON public.transfers FOR SELECT TO authenticated USING (((origin_store_id IS NULL) OR has_store_access(origin_store_id) OR (destination_store_id IS NULL) OR has_store_access(destination_store_id)));

DROP POLICY IF EXISTS "transfers_select_rls" ON public.transfers;
CREATE POLICY "transfers_select_rls" ON public.transfers FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM user_store_memberships m
  WHERE ((m.user_id = auth.uid()) AND (m.status = 'active'::membership_status) AND (m.store_id = transfers.origin_store_id)))));

