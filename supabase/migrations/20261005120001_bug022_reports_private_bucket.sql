-- ═══════════════════════════════════════════════════════════════════════
-- E2E-PRODUCT-FIX-ROUND1 — BUG-022: bucket de reportes privado
-- Fecha: 2026-10-05 · Base: c9726e5db (main)
-- ═══════════════════════════════════════════════════════════════════════
-- CAUSA RAÍZ (reproducida 2026-10-04, E2E-20261004-7CAE71):
--   El bucket 'reports' (20260221_create_reports_bucket.sql) se creó
--   public=true con la política "Public Access to Reports" (SELECT para
--   CUALQUIER rol, incluido anon) sobre storage.objects. El endpoint
--   /api/reports/generate sube ahí los PDFs (reportes financieros:
--   inventario, ventas, ganancias) y responde con:
--     a) signed URL de 24h (createSignedUrl(fileName, 86400)) — bearer
--        URL accesible sin autenticación durante 24h; y
--     b) fallback a getPublicUrl() si la firma falla — URL 100% pública
--        (funcional porque el bucket es público).
--   GET a cualquiera de las dos URLs SIN sesión → HTTP 200 + PDF.
--   El spec e2e/reports.spec.ts documenta el defecto como test.fail
--   activo (BUG-022): "la URL del reporte es accesible sin autenticación".
--
--   La seguridad real del archivo era nula: la signed URL de 24h era
--   redundante sobre un bucket público de lectura libre.
--
-- CORRECCIÓN (contrato del spec: la URL del reporte requiere autenticación):
--   1. Bucket privado (public=false) + DROP de la política pública.
--   2. La descarga pasa por el endpoint autenticado de la app
--      /api/reports/download/[runId] (withAuth + ownership), que lee el
--      objeto con service_role (único rol con acceso tras este cambio).
--   3. El upload sigue cubierto por "Authenticated Upload to Reports".
--   No se añade política SELECT: la lectura queda exclusivamente en
--   service_role (vía API), maximizando el cierre.
--
-- Rollback: UPDATE storage.buckets SET public=true WHERE id='reports'
-- + recrear "Public Access to Reports" (NO recomendado: reabre BUG-022).
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Bucket privado ──────────────────────────────────────────────────
UPDATE storage.buckets SET public = false WHERE id = 'reports';

-- ── 2. Eliminar la política de lectura pública ──────────────────────────
DROP POLICY IF EXISTS "Public Access to Reports" ON storage.objects;

-- ── 3. GUARD POST (solo lectura de catálogo) ────────────────────────────
DO $post$
DECLARE
  v_public boolean;
  v_policy_cnt int;
BEGIN
  SELECT public INTO v_public FROM storage.buckets WHERE id = 'reports';
  IF v_public IS NOT FALSE THEN
    RAISE EXCEPTION 'BUG-022 GUARD: bucket reports no es privado (public=%)', v_public;
  END IF;

  SELECT count(*) INTO v_policy_cnt FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'Public Access to Reports';
  IF v_policy_cnt <> 0 THEN
    RAISE EXCEPTION 'BUG-022 GUARD: la política pública de reports sigue viva';
  END IF;
END $post$;

COMMIT;
