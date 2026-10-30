-- ═══════════════════════════════════════════════════════════════════════════
-- MISIÓN CP-CAT-MAESTRO-004 — CORRECCIÓN DESCUBIERTA POR EL PILOTO REAL DE UI
-- ═══════════════════════════════════════════════════════════════════════════
-- DEFECTO: update_master_product inserta en audit_logs con
--   table_name='master_products' y store_id=p_origin_store_id. La edición de
--   identidad desde el panel de gobernanza de la organización (SISTEMA →
--   Organizaciones → Catálogo) llama la RPC SIN tienda de origen (NULL, por
--   diseño: el cambio es a nivel de organización), y el CHECK
--   audit_logs_store_id_check solo tolera store_id NULL para
--   profiles/stores/system → 23514 en toda edición de identidad desde
--   gobernanza (HTTP 400 reproducido en el piloto real 2026-10-30).
--
-- ALCANCE MÍNIMO: ampliar la lista de tablas de nivel organización del CHECK
--   con 'master_products' (semánticamente correcto: la identidad compartida
--   pertenece a la organización, no a una tienda). No se toca ninguna fila,
--   política RLS, función ni permiso. Las demás RPCs del catálogo
--   (create/activate/propose/review) exigen store de origen no nulo y no
--   están afectadas.
--
-- DESPLIEGUE: aplicar a producción mediante el mecanismo oficial
--   (Management API + NOTIFY pgrst). La edición desde gobernanza queda
--   operativa al aplicarse.
-- IDEMPOTENCIA: DROP IF EXISTS + ADD (DO block que evita duplicado).
-- REVERSIBILIDAD: recrear el CHECK original (sin 'master_products').
-- ═══════════════════════════════════════════════════════════════════════════

DO $fix$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'audit_logs_store_id_check'
      AND conrelid = 'public.audit_logs'::regclass
  ) THEN
    ALTER TABLE public.audit_logs DROP CONSTRAINT audit_logs_store_id_check;
  END IF;
END
$fix$;

ALTER TABLE public.audit_logs ADD CONSTRAINT audit_logs_store_id_check
  CHECK (
    store_id IS NOT NULL
    OR table_name = ANY (ARRAY['profiles'::text, 'stores'::text, 'system'::text, 'master_products'::text])
  );

-- Guard fail-closed: el constraint instalado debe tolerar master_products y
-- la función update_master_product debe seguir presente y con su firma.
DO $guard$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'audit_logs_store_id_check'
     AND conrelid = 'public.audit_logs'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION 'CP-CAT-004-GUARD: audit_logs_store_id_check ausente tras la migración';
  END IF;
  IF v_def NOT LIKE '%master_products%' THEN
    RAISE EXCEPTION 'CP-CAT-004-GUARD: el CHECK no tolera table_name=master_products';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'update_master_product'
  ) THEN
    RAISE EXCEPTION 'CP-CAT-004-GUARD: update_master_product ausente';
  END IF;
END
$guard$;
