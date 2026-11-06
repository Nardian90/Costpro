-- ============================================================================
-- CP-STORES-BANK-BRANCH (2026-11-05)
-- Misión: AMPLIAR GESTIÓN DE TIENDAS Y DESARROLLAR EL CLASIFICADOR MAESTRO
--         DE CLIENTES Y PROVEEDORES — Objetivo A.
-- ----------------------------------------------------------------------------
-- Añade el campo `bank_branch` (Sucursal bancaria) a la tabla `public.stores`.
--
-- Requisitos de la misión:
--   * Campo por tienda (independiente para cada tienda), gestionado desde
--     «Inicio → OPERACIÓN → Gestión de Tiendas → Seleccionar tienda → Info».
--   * Persistente, editable (crear/modificar/eliminar el valor) y sujeto a
--     los permisos existentes (RLS `stores_update_member_roles` ya cubre
--     UPDATE; no se crean políticas nuevas ni se relajan las vigentes).
--   * Se integra a los PDF que usan la identificación de la tienda
--     (Factura SC-2-12, campo «Sucursal bancaria» de la banda del proveedor).
--     Cuando el valor está vacío el PDF degrada a la línea de cumplimentación
--     manual — NUNCA se inventa un valor.
--
-- Seguridad:
--   * Migración ADITIVA e idempotente (IF NOT EXISTS). No toca datos: todas
--     las filas quedan con bank_branch NULL (= campo sin asignar).
--   * Reversible: ALTER TABLE public.stores DROP COLUMN IF EXISTS bank_branch;
--   * No altera la superficie pública de la vitrina (la policy de lectura
--     pública `cp_sec_027` selecciona columnas explícitas y no incluye esta).
-- ============================================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS bank_branch TEXT;

COMMENT ON COLUMN public.stores.bank_branch IS
  'Sucursal bancaria de la tienda (Objetivo A · CP-STORES-BANK-BRANCH). '
  'Dato de identificación independiente por tienda; se usa en los PDF de la '
  'familia Res. 11/2007 (SC-2-12). NULL = sin asignar (el PDF dibuja la línea '
  'de cumplimentación manual, jamás un valor inventado).';

-- Verificación post-migración (patrón defensivo del repo): la columna debe
-- existir. NOTA (2026-11-05): en producción la columna fue añadida ad-hoc en
-- una sesión anterior (sin migración en el repo) y la tienda de prueba
-- «COSTPRO (Prueba)» ya tiene un valor legítimo informado por el usuario —
-- esta migración NO toca datos, solo los pone bajo control de versiones.
DO $$
DECLARE
  v_missing int;
BEGIN
  SELECT count(*) INTO v_missing
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'stores'
    AND column_name  = 'bank_branch';

  IF v_missing = 0 THEN
    RAISE EXCEPTION 'CP-STORES-BANK-BRANCH: la columna stores.bank_branch no existe tras la migración';
  END IF;
END $$;
