-- ══════════════════════════════════════════════════════════════════════
-- F-30 G1 — Schema sync: CHECK constraints + FKs + UNIQUE + INDEX
-- Resuelve: Iter 1 #1 (race service_number), Iter 2 #1 (no CHECK), Iter 3 #1-2,
--           Iter 8 (8C+5A de validaciones de negocio)
-- ══════════════════════════════════════════════════════════════════════

-- ─── 1. CHECK constraints en received_services ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='received_services_supplier_not_null') THEN
    ALTER TABLE public.received_services
      ADD CONSTRAINT received_services_supplier_not_null
      CHECK (supplier IS NOT NULL AND supplier <> '');
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='received_services_total_amount_positive') THEN
    ALTER TABLE public.received_services
      ADD CONSTRAINT received_services_total_amount_positive
      CHECK (total_amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='received_services_exchange_rate_range') THEN
    ALTER TABLE public.received_services
      ADD CONSTRAINT received_services_exchange_rate_range
      CHECK (exchange_rate >= 0.01 AND exchange_rate <= 10000);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='received_services_payment_terms_days_range') THEN
    ALTER TABLE public.received_services
      ADD CONSTRAINT received_services_payment_terms_days_range
      CHECK (payment_terms_days >= 1 AND payment_terms_days <= 365);
  END IF;
END $$;

-- ─── 2. CHECK constraints en service_cost_distributions ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scd_distribution_amount_positive') THEN
    ALTER TABLE public.service_cost_distributions
      ADD CONSTRAINT scd_distribution_amount_positive CHECK (distribution_amount > 0);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scd_distribution_percentage_range') THEN
    ALTER TABLE public.service_cost_distributions
      ADD CONSTRAINT scd_distribution_percentage_range
      CHECK (distribution_percentage >= 0 AND distribution_percentage <= 100);
  END IF;
END $$;

-- ─── 3. CHECK constraints en service_reception_links ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='srl_allocation_percentage_range') THEN
    ALTER TABLE public.service_reception_links
      ADD CONSTRAINT srl_allocation_percentage_range
      CHECK (allocation_percentage >= 0 AND allocation_percentage <= 100);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='srl_allocated_amount_positive') THEN
    ALTER TABLE public.service_reception_links
      ADD CONSTRAINT srl_allocated_amount_positive CHECK (allocated_amount > 0);
  END IF;
END $$;

-- ─── 4. FKs faltantes en service_cost_distributions ───
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scd_product_id_fkey') THEN
    ALTER TABLE public.service_cost_distributions
      ADD CONSTRAINT scd_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scd_receipt_id_fkey') THEN
    ALTER TABLE public.service_cost_distributions
      ADD CONSTRAINT scd_receipt_id_fkey
      FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='scd_receipt_item_id_fkey') THEN
    ALTER TABLE public.service_cost_distributions
      ADD CONSTRAINT scd_receipt_item_id_fkey
      FOREIGN KEY (receipt_item_id) REFERENCES public.receipt_items(id) ON DELETE CASCADE;
  END IF;
END $$;

-- ─── 5. UNIQUE (store_id, service_number) en received_services ───
CREATE UNIQUE INDEX IF NOT EXISTS uq_received_services_store_service_number
  ON public.received_services (store_id, service_number);

-- ─── 6. UNIQUE (service_id, receipt_item_id) en service_cost_distributions ───
CREATE UNIQUE INDEX IF NOT EXISTS uq_scd_service_receipt_item
  ON public.service_cost_distributions (service_id, receipt_item_id);

-- ─── 7. Index en service_audit_log.created_at ───
CREATE INDEX IF NOT EXISTS idx_sal_created_at
  ON public.service_audit_log (created_at DESC);
