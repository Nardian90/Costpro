-- ═══════════════════════════════════════════════════════════════════════════
-- CP-ORG-001 §8.2 (continuación, 2026-10-25) — Integridad de payment_transactions
-- ═══════════════════════════════════════════════════════════════════════════
-- DEFECTO DE ESQUEMA DEMOSTRADO CON EVIDENCIA (producción, read-only):
--
--   `payment_transactions.store_id` NO tiene clave foránea, a diferencia de
--   sus tablas hermanas financieras (`transactions.store_id` → CASCADE,
--   `cash_flow_documents.store_id` → CASCADE). Consecuencia observada: la
--   limpieza autorizada 2026-10-26 eliminó 21 tiendas QA y sus documentos de
--   caja (vía CASCADE de cash_flow_documents), pero 33 filas de
--   payment_transactions sobrevivieron como residuos con store_id inexistente
--   y ref_id huérfano (32 cash_flow + 1 service; verificados: 0/32 ref_id
--   existentes, 33/33 transaction_id NULL, creadas 2026-10-23 06:31–15:56 UTC
--   por la cuenta de pruebas, suma 4 730 400 CUP).
--
-- AUDITORÍA §8.2 (read-only, producción): clasificadas como
-- RESIDUOS CONFIRMADOS SIN IMPACTO CONTABLE — invisibles para todos los
-- usuarios por RLS (has_store_access de una tienda inexistente = false),
-- ningún agregador las alcanza (los 5 de caja son por-tienda), cero consultas
-- cliente directas, sin FKs violadas (no existen). Evidencia completa en
-- docs/audits/CP_ORG_001_CIERRE_FINAL.md §8.2.
--
-- CORRECCIÓN PROPUESTA (productiva → irreversible: AUTORIZACIÓN DEL
-- PROPIETARIO requerida; en el PR, NO ejecutada en producción por el agente):
--   1. Archivar las filas residuales en una tabla de archivo de solo-
--      acceso-administrativo (reversibilidad / evidencia).
--   2. Purgarlas usando la vía de restauración DOCUMENTADA del propio
--      trigger de invariantes (app.restore_mode + postgres), no desactivando
--      el trigger: el mecanismo ya existe para restores certificados.
--   3. Añadir la FK store_id → stores(id) ON DELETE CASCADE, idéntica al
--      modelo de transactions y cash_flow_documents, para que JAMÁS vuelva a
--      producirse un residuo de este tipo.
--
-- Nota operativa: con la FK en su lugar, un futuro borrado de tienda con
-- historial de pagos será bloqueado por el trigger PT007
-- (ERR_PAYMENT_DELETE_FORBIDDEN) del propio modelo — coherente con el
-- comportamiento de receipts (NO ACTION) y con la política de borrados
-- autorizados de tiendas (pre-borrado explícito y auditable).
--
-- Idempotente: re-ejecución = 0 archivados, 0 purgadas, FK ya presente.
-- Validada en el proyecto E2E aislado (39 residuos análogos purgados).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabla de archivo (RLS activada SIN policies: solo service/postgres) ──
-- INCLUDING ALL copia la columna GENERATED amount_cup como generada (con
-- solo DEFAULTS quedaría NOT NULL sin expresión y el INSERT archivador fallaría).
CREATE TABLE IF NOT EXISTS public.payment_transactions_purga_20261026_archive (
    LIKE public.payment_transactions INCLUDING ALL
);
ALTER TABLE public.payment_transactions_purga_20261026_archive
    ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS archive_reason TEXT NOT NULL DEFAULT 'CP-ORG-001 §8.2';
ALTER TABLE public.payment_transactions_purga_20261026_archive ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.payment_transactions_purga_20261026_archive IS
    'CP-ORG-001 §8.2: archivo de filas residuales de payment_transactions (store_id inexistente por FK ausente). Solo acceso administrativo (service_role/postgres).';

-- ─── 2. Archivar las residuales (idempotente por id) ────────────────────────
INSERT INTO public.payment_transactions_purga_20261026_archive (
    id, store_id, ref_type, ref_id, amount, payment_method, currency,
    exchange_rate, payment_date, reference, notes, paid_by, created_at,
    updated_at, idempotency_key, transaction_id, direction, archive_reason
)
SELECT
    pt.id, pt.store_id, pt.ref_type, pt.ref_id, pt.amount, pt.payment_method,
    pt.currency, pt.exchange_rate, pt.payment_date, pt.reference, pt.notes,
    pt.paid_by, pt.created_at, pt.updated_at, pt.idempotency_key,
    pt.transaction_id, pt.direction,
    'CP-ORG-001 §8.2: residuo QA 2026-10-23 en tienda eliminada por la limpieza autorizada 2026-10-26; FK store_id ausente'
FROM public.payment_transactions pt
WHERE NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = pt.store_id)
  AND NOT EXISTS (
    SELECT 1 FROM public.payment_transactions_purga_20261026_archive a
    WHERE a.id = pt.id
  );

-- ─── 3. Purga vía restore_mode (mecanismo documentado del trigger) ─────────
-- validate_payment_transactions_invariants permite DELETE solo con
-- app.restore_mode='true' Y current_user en (costpro_snapshot_restorer,
-- postgres). Las migraciones se aplican como postgres.
DO $$
BEGIN
    IF current_user NOT IN ('postgres', 'supabase_admin', 'costpro_snapshot_restorer') THEN
        RAISE EXCEPTION 'CP-ORG-001 §8.2: purga solo ejecutable por rol administrativo de BD';
    END IF;
    PERFORM set_config('app.restore_mode', 'true', false);
END
$$;

DELETE FROM public.payment_transactions pt
WHERE NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = pt.store_id)
  AND EXISTS (
    SELECT 1 FROM public.payment_transactions_purga_20261026_archive a
    WHERE a.id = pt.id
  );

DO $$
BEGIN
    PERFORM set_config('app.restore_mode', 'false', false);
END
$$;

-- ─── 4. FK store_id → stores(id) ON DELETE CASCADE (modelo de hermanas) ─────
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payment_transactions'::regclass
          AND conname = 'payment_transactions_store_id_fkey'
    ) THEN
        ALTER TABLE public.payment_transactions
            ADD CONSTRAINT payment_transactions_store_id_fkey
            FOREIGN KEY (store_id) REFERENCES public.stores(id)
            ON DELETE CASCADE;
    END IF;
END
$$;

-- ─── 5. Verificación local del estado final ────────────────────────────────
DO $$
DECLARE
    v_orphans BIGINT;
    v_fk BOOLEAN;
    v_archived BIGINT;
BEGIN
    SELECT COUNT(*) INTO v_orphans
    FROM public.payment_transactions pt
    WHERE NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = pt.store_id);
    IF v_orphans > 0 THEN
        RAISE EXCEPTION 'CP-ORG-001 §8.2: quedan % residuos de payment_transactions', v_orphans;
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.payment_transactions'::regclass
          AND conname = 'payment_transactions_store_id_fkey'
    ) INTO v_fk;
    IF NOT v_fk THEN
        RAISE EXCEPTION 'CP-ORG-001 §8.2: la FK payment_transactions_store_id_fkey no existe';
    END IF;

    SELECT COUNT(*) INTO v_archived FROM public.payment_transactions_purga_20261026_archive;
    RAISE NOTICE 'CP-ORG-001 §8.2: purga completada — % filas archivadas, 0 residuos, FK presente', v_archived;
END
$$;
