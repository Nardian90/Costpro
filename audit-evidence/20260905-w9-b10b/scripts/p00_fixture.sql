-- ═══════════════════════════════════════════════════════════════════
-- B-10b · p00_fixture.sql — fase A (estática): tiendas, perfiles,
-- membresías, productos, inventario, transacción, devoluciones legacy
-- y no-reversibles. Devoluciones CANÓNICAS → p00b_fixture_dynamic.sql
-- Todo UUID sintético (hex puro). 0 datos reales tocados. Idempotente.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1) tiendas ─────────────────────────────────────────────────────
INSERT INTO public.stores (id, name, slug, is_active)
VALUES
  ('b10b0000-0000-4000-8000-00000000000a', 'B10B Store A', 'b10b-store-a', true),
  ('b10b0000-0000-4000-8000-00000000000b', 'B10B Store B', 'b10b-store-b', true)
ON CONFLICT DO NOTHING;

-- ── 2) usuarios auth (FK profiles_id_fkey → auth.users) + perfiles ──
INSERT INTO auth.users (id, email, encrypted_password, aud, role, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES
  ('b10b0000-0000-4000-8000-0000000001a1','b10b-u1@test.local','x','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('b10b0000-0000-4000-8000-0000000001b2','b10b-u2@test.local','x','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('b10b0000-0000-4000-8000-0000000001d4','b10b-u3@test.local','x','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('b10b0000-0000-4000-8000-0000000001c3','b10b-ga@test.local','x','authenticated','authenticated',now(),'{"provider":"email","providers":["email"]}','{}',now(),now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role, is_active)
VALUES
  ('b10b0000-0000-4000-8000-0000000001a1', 'b10b-u1@test.local', 'B10B U1 clerk-A', 'clerk', true),
  ('b10b0000-0000-4000-8000-0000000001b2', 'b10b-u2@test.local', 'B10B U2 clerk-B', 'clerk', true),
  ('b10b0000-0000-4000-8000-0000000001d4', 'b10b-u3@test.local', 'B10B U3 no-member', 'usuario', true),
  ('b10b0000-0000-4000-8000-0000000001c3', 'b10b-ga@test.local', 'B10B Global Admin', 'admin', true)
ON CONFLICT (id) DO NOTHING;

-- Reactivar en re-ejecuciones (el cleanup final los soft-deleta)
UPDATE public.profiles SET is_active=true, deleted_at=NULL, deletion_reason=NULL, updated_at=now()
WHERE id IN ('b10b0000-0000-4000-8000-0000000001a1','b10b0000-0000-4000-8000-0000000001b2',
             'b10b0000-0000-4000-8000-0000000001d4','b10b0000-0000-4000-8000-0000000001c3');

-- ── 3) membresías ──────────────────────────────────────────────────
INSERT INTO public.user_store_memberships (user_id, store_id, role, status)
VALUES
  ('b10b0000-0000-4000-8000-0000000001a1', 'b10b0000-0000-4000-8000-00000000000a', 'clerk', 'active'),
  ('b10b0000-0000-4000-8000-0000000001b2', 'b10b0000-0000-4000-8000-00000000000b', 'clerk', 'active'),
  ('b10b0000-0000-4000-8000-0000000001c3', 'b10b0000-0000-4000-8000-00000000000b', 'clerk', 'active')
ON CONFLICT DO NOTHING;
-- U3 (…1d4) SIN membresías. GA (…1c3) es admin global por profiles.role.

-- ── 4) productos + inventario ──────────────────────────────────────
INSERT INTO public.products (id, name, sku, store_id, stock_current, cost_average, price)
VALUES
  ('b10b0000-0000-4000-8000-0000000002a1', 'B10B P1 happy',  'B10B-P1', 'b10b0000-0000-4000-8000-00000000000a', 10, 5, 10),
  ('b10b0000-0000-4000-8000-0000000002a2', 'B10B P2 zero',   'B10B-P2', 'b10b0000-0000-4000-8000-00000000000a',  0, 3, 10),
  ('b10b0000-0000-4000-8000-0000000002a3', 'B10B P3 drain',  'B10B-P3', 'b10b0000-0000-4000-8000-00000000000a',  4, 2, 10),
  ('b10b0000-0000-4000-8000-0000000002a4', 'B10B P4 legacy', 'B10B-P4', 'b10b0000-0000-4000-8000-00000000000a',  5, 7, 10),
  ('b10b0000-0000-4000-8000-0000000002a5', 'B10B P5 ga',     'B10B-P5', 'b10b0000-0000-4000-8000-00000000000a',  2, 1, 10),
  ('b10b0000-0000-4000-8000-0000000002a6', 'B10B P6 concur', 'B10B-P6', 'b10b0000-0000-4000-8000-00000000000a',  3, 1, 10);

INSERT INTO public.inventory (store_id, product_id, quantity, version)
VALUES
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000002a1', 10, 1),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000002a3',  4, 1),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000002a4',  5, 1),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000002a5',  2, 1),
  ('b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000002a6',  3, 1)
ON CONFLICT DO NOTHING;
-- P2 sin fila de inventario (0 stock): la devolución original la crea vía pipeline.

-- ── 5) transacciones originales (DF-07 exige venta; tope acumulado) ──
-- cost_at_sale por item define el uc del movimiento 'return' original
-- (y por tanto el uc complementario esperado en el reverse)
INSERT INTO public.transactions (id, store_id, seller_id, total_amount, status, payment_method)
VALUES
  ('b10b0000-0000-4000-8000-0000000004c1', 'b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000001a1', 30, 'completed', 'cash'),
  ('b10b0000-0000-4000-8000-0000000004c2', 'b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000001a1', 20, 'completed', 'cash'),
  ('b10b0000-0000-4000-8000-0000000004c3', 'b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000001a1', 30, 'completed', 'cash'),
  ('b10b0000-0000-4000-8000-0000000004c4', 'b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000001a1', 10, 'completed', 'cash'),
  ('b10b0000-0000-4000-8000-0000000004c5', 'b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000001a1', 20, 'completed', 'cash'),
  ('b10b0000-0000-4000-8000-0000000004b1', 'b10b0000-0000-4000-8000-00000000000a', 'b10b0000-0000-4000-8000-0000000001a1', 20, 'completed', 'cash')
ON CONFLICT DO NOTHING;
INSERT INTO public.transaction_items (transaction_id, product_id, quantity, price_at_sale, cost_at_sale)
VALUES
  ('b10b0000-0000-4000-8000-0000000004c1', 'b10b0000-0000-4000-8000-0000000002a1', 3, 10, 4.8),
  ('b10b0000-0000-4000-8000-0000000004c2', 'b10b0000-0000-4000-8000-0000000002a2', 2, 10, 3.2),
  ('b10b0000-0000-4000-8000-0000000004c3', 'b10b0000-0000-4000-8000-0000000002a3', 3, 10, 2.5),
  ('b10b0000-0000-4000-8000-0000000004c4', 'b10b0000-0000-4000-8000-0000000002a5', 1, 10, 1.5),
  ('b10b0000-0000-4000-8000-0000000004c5', 'b10b0000-0000-4000-8000-0000000002a6', 2, 10, 1.1),
  ('b10b0000-0000-4000-8000-0000000004b1', 'b10b0000-0000-4000-8000-0000000002a4', 1, 10, 4.5);

-- ── 6) devoluciones legacy (pre-pipeline, SIN movement — espejo de las 13 reales)
INSERT INTO public.devolutions (id, store_id, original_transaction_id, devolution_number, reason,
  total_amount, currency, payment_method, status, processed_by)
VALUES
  ('b10b0000-0000-4000-8000-0000000003b1', 'b10b0000-0000-4000-8000-00000000000a',
   'b10b0000-0000-4000-8000-0000000004b1', 'CN-B10B-L1', 'legacy con cost_at_sale',
   10, 'CUP', 'cash', 'completed', 'b10b0000-0000-4000-8000-0000000001a1'),
  ('b10b0000-0000-4000-8000-0000000003b2', 'b10b0000-0000-4000-8000-00000000000a',
   NULL, 'CN-B10B-L2', 'legacy con fallback WAC',
   10, 'CUP', 'cash', 'completed', 'b10b0000-0000-4000-8000-0000000001a1');
INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total)
VALUES
  ('b10b0000-0000-4000-8000-0000000003b1', 'b10b0000-0000-4000-8000-0000000002a4', 1, 10, 10),
  ('b10b0000-0000-4000-8000-0000000003b2', 'b10b0000-0000-4000-8000-0000000002a4', 1, 10, 10);

-- ── 7) devoluciones en estados NO reversibles ──────────────────────
INSERT INTO public.devolutions (id, store_id, devolution_number, reason, total_amount,
  currency, payment_method, status, processed_by)
VALUES
  ('b10b0000-0000-4000-8000-0000000003a4', 'b10b0000-0000-4000-8000-00000000000a',
   'CN-B10B-P', 'pendiente', 10, 'CUP', 'cash', 'pending',  'b10b0000-0000-4000-8000-0000000001a1'),
  ('b10b0000-0000-4000-8000-0000000003a5', 'b10b0000-0000-4000-8000-00000000000a',
   'CN-B10B-R', 'anulada', 10, 'CUP', 'cash', 'voided', 'b10b0000-0000-4000-8000-0000000001a1');
INSERT INTO public.devolution_items (devolution_id, product_id, quantity, unit_price, total)
VALUES
  ('b10b0000-0000-4000-8000-0000000003a4', 'b10b0000-0000-4000-8000-0000000002a1', 1, 10, 10),
  ('b10b0000-0000-4000-8000-0000000003a5', 'b10b0000-0000-4000-8000-0000000002a1', 1, 10, 10);

-- ── 8) Verificación fase A ─────────────────────────────────────────
SELECT jsonb_build_object(
  'stores', (SELECT count(*) FROM public.stores WHERE id::text LIKE 'b10b0000-0000-4000-8000-00000000000%'),
  'profiles', (SELECT count(*) FROM public.profiles WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000001%'),
  'memberships', (SELECT count(*) FROM public.user_store_memberships WHERE user_id::text LIKE 'b10b0000-0000-4000-8000-0000000001%'),
  'products', (SELECT count(*) FROM public.products WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'inventory', (SELECT count(*) FROM public.inventory WHERE product_id::text LIKE 'b10b0000-0000-4000-8000-0000000002a%'),
  'devs', (SELECT count(*) FROM public.devolutions WHERE id::text LIKE 'b10b0000-0000-4000-8000-0000000003%'),
  'tx1', (SELECT count(*) FROM public.transactions WHERE id='b10b0000-0000-4000-8000-0000000004b1')
) AS fixture_a_state;
