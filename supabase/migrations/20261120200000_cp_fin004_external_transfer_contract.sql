-- ============================================================================
-- CP-FIN-004 — ANEXO VINCULANTE POS-BACKEND (M1 de 2)
-- Contrato canónico de medios de pago: external_transfer (Transf. Exterior)
--
-- MISIÓN: CP-FIN-ENERVIDA-CONTROLLED-ACCOUNTING-REBUILD-AND-CONFIGURATION-001
-- ANEXO: «CORRECCIÓN DEL CONTRATO DE MEDIOS DE PAGO POS-BACKEND Y
--         RECONSTRUCCIÓN HISTÓRICA USD» (2026-11-20).
--
-- PRINCIPIO: el frontend del POS es la referencia correcta (3 opciones:
-- Efectivo / Transferencia / Transferencia Exterior). El backend adopta el
-- identificador canónico `external_transfer` para Transf. Exterior y deja
-- `zelle` como VALOR HEREDADO (solo legible; jamás persistido en registros
-- nuevos — normalización en ingestión, M2). Zelle es el CANAL de la
-- transferencia exterior en ENERVIDA, no el medio de pago.
--
-- Este archivo M1 es DDL PURO y NO USA el valor nuevo del enum (requisito de
-- ALTER TYPE ... ADD VALUE dentro del lote transaccional único del canal
-- canónico de aplicación). El uso (DML, funciones, reglas, normalización
-- histórica) vive en M2 = 20261120210000.
--
-- Idempotente: re-aplicable sin daño (IF NOT EXISTS / ON CONFLICT / guards).
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Enum payment_method_enum: + 'external_transfer' (valor canónico de
--    Transf. Exterior). 'zelle' PERMANECE como valor heredado (los enum de
--    PostgreSQL no admiten borrado de miembros; los datos pre-normalización
--    siguen legibles y los escritores nuevos jamás lo persisten).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TYPE public.payment_method_enum ADD VALUE IF NOT EXISTS 'external_transfer' AFTER 'zelle';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. transactions: pool canónico de Transf. Exterior.
--    zelle_amount queda como columna heredada (solo lectura de legado); los
--    escritores nuevos usan external_transfer_amount.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS external_transfer_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.transactions.external_transfer_amount IS
  'CP-FIN-004: pool canónico de Transf. Exterior (CUP-equivalente). Sustituye a zelle_amount (heredada, solo lectura) para registros nuevos.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. transaction_items: atribución de pago por ítem para Transf. Exterior.
--    Espejo canónico de zelle_paid/zelle_currency/zelle_discount_* (heredadas).
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.transaction_items
  ADD COLUMN IF NOT EXISTS external_transfer_paid numeric,
  ADD COLUMN IF NOT EXISTS external_transfer_currency text,
  ADD COLUMN IF NOT EXISTS external_transfer_discount_type text,
  ADD COLUMN IF NOT EXISTS external_transfer_discount_value numeric,
  ADD COLUMN IF NOT EXISTS external_transfer_discount_currency text;

COMMENT ON COLUMN public.transaction_items.external_transfer_paid IS
  'CP-FIN-004: atribución por ítem del cobro por Transf. Exterior (nominal en la moneda del cobro). Espejo canónico de zelle_paid (heredada).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. fin_account_mapping — mapeo canónico (medio × moneda → cuenta):
--    + external_transfer USD/EUR → ACT_TRANSF_EXTERIOR (filas canónicas).
--    + zelle USD/EUR → filas heredadas DESACTIVADAS (is_active=false): la
--      resolución canónica solo acepta el identificador nuevo; el legado se
--      normaliza ANTES de resolver (M2). CHECK ampliado para admitir ambos
--      valores (las filas heredadas siguen en la tabla).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conrelid = 'public.fin_account_mapping'::regclass
               AND conname = 'fin_map_method_check'
               AND pg_get_constraintdef(oid) NOT LIKE '%external_transfer%') THEN
    ALTER TABLE public.fin_account_mapping DROP CONSTRAINT fin_map_method_check;
    ALTER TABLE public.fin_account_mapping
      ADD CONSTRAINT fin_map_method_check
      CHECK (payment_method IN ('cash', 'transfer', 'zelle', 'external_transfer'));
  END IF;
END $$;

INSERT INTO public.fin_account_mapping (payment_method, currency, category_code, is_active, notes)
VALUES
  ('external_transfer', 'USD', 'ACT_TRANSF_EXTERIOR', true,
   'Transferencia exterior (canónico CP-FIN-004; canal Zelle en ENERVIDA) USD'),
  ('external_transfer', 'EUR', 'ACT_TRANSF_EXTERIOR', true,
   'Transferencia exterior (canónico CP-FIN-004) EUR'),
  ('external_transfer', 'CUP', 'ACT_BANCOS', false,
   'CP-FIN-004: combinación NO ofrecida por el POS (Transf. Exterior es riel divisa) — fila inactiva documental'),
  ('external_transfer', 'MLC', 'ACT_BANCOS', false,
   'CP-FIN-004: combinación NO ofrecida por el POS — fila inactiva documental')
ON CONFLICT (payment_method, currency) DO UPDATE
  SET category_code = EXCLUDED.category_code,
      notes = EXCLUDED.notes,
      updated_at = now();

-- Filas heredadas zelle: quedan como constancia (compatibilidad controlada)
-- pero NO resuelven cuentas para registros nuevos — el identificador canónico
-- es external_transfer.
UPDATE public.fin_account_mapping
  SET is_active = false,
      notes = 'HEREDADO (CP-FIN-004): representación histórica previa al contrato external_transfer. No usar para registros nuevos.',
      updated_at = now()
WHERE payment_method = 'zelle' AND is_active;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. fin_metric_catalog — métricas canónicas external_transfer (los nombres
--    de métrica se derivan dinámicamente del método persistido en
--    fin_compute_metrics: 'cob_' || metodo || '_' || moneda || '_cup').
--    Las métricas zelle quedan etiquetadas como heredadas (los asientos de
--    generaciones superseded las conservan).
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.fin_metric_catalog (document_type, metric, label, unit, for_event)
VALUES
  ('VENTA', 'cob_external_transfer_usd_cup', 'Cobrado por Transf. Exterior USD (valor CUP)', 'CUP', 'reconocimiento'),
  ('VENTA', 'cob_external_transfer_usd_cup_origin', 'Nominal USD cobrado por Transf. Exterior', 'USD', 'reconocimiento'),
  ('VENTA', 'cob_external_transfer_eur_cup', 'Cobrado por Transf. Exterior EUR (valor CUP)', 'CUP', 'reconocimiento'),
  ('VENTA', 'cob_external_transfer_eur_cup_origin', 'Nominal EUR cobrado por Transf. Exterior', 'EUR', 'reconocimiento'),
  ('DEVOLUCION_VENTA', 'reembolso_external_transfer_usd_cup', 'Reembolsado por Transf. Exterior (valor CUP)', 'CUP', 'reconocimiento')
ON CONFLICT (document_type, metric) DO UPDATE
  SET label = EXCLUDED.label, unit = EXCLUDED.unit;

UPDATE public.fin_metric_catalog
  SET label = label || ' (HEREDADO pre CP-FIN-004)'
  WHERE metric IN ('cob_zelle_usd_cup', 'cob_zelle_usd_cup_origin', 'reembolso_zelle_usd_cup')
    AND label NOT LIKE '%HEREDADO%';
