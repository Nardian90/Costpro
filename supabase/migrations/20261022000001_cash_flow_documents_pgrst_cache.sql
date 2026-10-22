-- 20261022000001_cash_flow_documents_pgrst_cache.sql
-- MISIÓN 2026-10-22 · Parte A — «No se pudieron cargar los movimientos» (PGRST200).
--
-- CAUSA RAÍZ (demostrada contra la BD viva, lecturas autorizadas):
--   · La FK autoreferencial cash_flow_documents_related_document_id_fkey
--     EXISTE y está VALIDADA en PostgreSQL (pg_constraint, convalidated=true)
--     con el nombre exacto que usaba el código como hint de PostgREST.
--   · La CACHÉ DE ESQUEMA de PostgREST quedó desincronizada: el embed
--     `cash_flow_documents!cash_flow_documents_related_document_id_fkey`
--     devolvía PGRST200 («Could not find a relationship between
--     'cash_flow_documents' and 'cash_flow_documents' in the schema cache»),
--     mientras que el hint por COLUMNA (`!related_document_id`) resolvía —
--     la caché guarda el self-FK bajo un nombre de constraint anterior.
--   · Origen de la desincronización: migraciones aplicadas vía Management
--     API (scripts/apply-migration-mgmt.ts) ejecutan SQL SIN enviar
--     `NOTIFY pgrst, 'reload schema'` (el SQL editor de Supabase lo envía
--     automáticamente; la API de gestión, no).
--
-- CORRECCIÓN (dos piezas, ver PR):
--   1. CÓDIGO (src/hooks/api/useCashFlow.ts): el embed usa ahora el hint por
--      NOMBRE DE COLUMNA `!related_document_id` — resuelve bajo la caché
--      actual Y bajo una caché recién cargada, e inmune a recreaciones de
--      constraints. Verificado contra la API viva antes/después.
--   2. ESTA MIGRACIÓN: reafirma la FK de forma idempotente y NOTIFICA la
--      recarga de la caché de PostgREST al final — de modo que el flujo
--      estándar de aplicar migraciones (SQL editor o los scripts del
--      proyecto, ahora actualizados para auto-notificar) deje la caché
--      sincronizada con el catálogo real.
--
-- SEGURIDAD: sin cambios de datos, sin cambios de modelo (la FK ya existe),
-- sin tocar RLS ni políticas. Idempotente: puede ejecutarse repetidamente.

BEGIN;

-- Reafirmación idempotente de la FK autoreferencial (no-op si ya existe):
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'cash_flow_documents_related_document_id_fkey'
      AND conrelid = 'public.cash_flow_documents'::regclass
  ) THEN
    ALTER TABLE public.cash_flow_documents
      ADD CONSTRAINT cash_flow_documents_related_document_id_fkey
      FOREIGN KEY (related_document_id) REFERENCES public.cash_flow_documents(id);
  END IF;
END
$$;

COMMIT;

-- Recarga de la caché de esquema de PostgREST (procedimiento documentado de
-- Supabase). El SQL editor lo envía automáticamente; al aplicar esta
-- migración por script/Management API este NOTIFY restaura la sincronía.
NOTIFY pgrst, 'reload schema';
