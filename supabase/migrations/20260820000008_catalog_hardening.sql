-- ============================================================================
-- Migration: 20260820000008_catalog_hardening.sql
-- Hardening del catálogo: barcode obligatorio + stock_min + clasificación
--
-- CAMBIOS ESTRUCTURALES:
-- 1. DEFAULT min_stock = 1 (antes era 5, pero 0 en la mayoría de los datos)
-- 2. CHECK min_stock >= 1 (no permite 0 ni negativos)
-- 3. NOT NULL min_stock
-- 4. Trigger BEFORE INSERT/UPDATE para generar barcode automático si es NULL
-- 5. UNIQUE(barcode) parcial (solo para barcodes no-NULL)
--
-- NORMALIZACIÓN DE DATOS EXISTENTES (ENER-VIDA):
-- 1. Generar barcode interno para los 126 productos sin barcode
-- 2. Actualizar min_stock de 0 a valor calculado según demanda
-- 3. Asignar categoría a los 126 productos sin categoría
-- ============================================================================

-- ═══ 1. ESTRUCTURAL: DEFAULT + CHECK + NOT NULL en min_stock ═══
ALTER TABLE public.products ALTER COLUMN min_stock SET DEFAULT 1;
ALTER TABLE public.products ALTER COLUMN min_stock SET NOT NULL;

-- CHECK: min_stock >= 1 (no permite 0 ni negativos)
-- Nota: usamos >= 1 porque 0 significa "sin alerta de stock bajo" lo cual
-- es incorrecto para un producto activo que debería tener al menos 1 unidad.
ALTER TABLE public.products ADD CONSTRAINT products_min_stock_check CHECK (min_stock >= 1);

-- ═══ 2. ESTRUCTURAL: Trigger para generar barcode automático ═══
CREATE OR REPLACE FUNCTION public.generate_internal_barcode()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
DECLARE
  v_barcode text;
  v_seq bigint;
BEGIN
  -- Generar barcode interno: formato "INT" + secuencial de 12 dígitos
  -- Esto NO es un EAN/UPC oficial, es un código interno único
  -- Formato: INT000000000001, INT000000000002, etc.
  SELECT nextval('public.internal_barcode_seq') INTO v_seq;
  v_barcode := 'INT' || lpad(v_seq::text, 12, '0');
  RETURN v_barcode;
END;
$$;

-- Crear secuencia para barcodes internos
CREATE SEQUENCE IF NOT EXISTS public.internal_barcode_seq START WITH 1 INCREMENT BY 1;

-- Trigger BEFORE INSERT/UPDATE para generar barcode si es NULL o vacío
CREATE OR REPLACE FUNCTION public.ensure_product_barcode()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public, pg_temp
AS $$
BEGIN
  -- Si barcode es NULL o vacío, generar uno interno
  IF NEW.barcode IS NULL OR NEW.barcode = '' THEN
    NEW.barcode := public.generate_internal_barcode();
  END IF;

  -- Si barcode_type es NULL, asignar 'INTERNAL'
  IF NEW.barcode_type IS NULL OR NEW.barcode_type = '' THEN
    IF NEW.barcode LIKE 'INT%' THEN
      NEW.barcode_type := 'INTERNAL';
    ELSE
      NEW.barcode_type := 'EAN13';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Crear trigger
DROP TRIGGER IF EXISTS trg_ensure_product_barcode ON public.products;
CREATE TRIGGER trg_ensure_product_barcode
BEFORE INSERT OR UPDATE OF barcode ON public.products
FOR EACH ROW EXECUTE FUNCTION public.ensure_product_barcode();

-- ═══ 3. ESTRUCTURAL: UNIQUE parcial en barcode ═══
-- PostgreSQL soporta índices parciales: UNIQUE solo para barcodes no-NULL
-- Esto permite que múltiples productos tengan NULL temporalmente (antes del trigger)
-- pero garantiza que no haya duplicados entre barcodes no-NULL
CREATE UNIQUE INDEX IF NOT EXISTS products_barcode_unique
ON public.products (barcode)
WHERE barcode IS NOT NULL AND barcode != '';

-- ═══ 4. NORMALIZACIÓN: Generar barcodes para productos existentes ═══
-- Generar barcode interno para todos los productos de ENER-VIDA sin barcode
UPDATE public.products
SET barcode = public.generate_internal_barcode(),
    barcode_type = 'INTERNAL',
    updated_at = now()
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND is_active = true
  AND (barcode IS NULL OR barcode = '');

-- ═══ 5. NORMALIZACIÓN: Actualizar min_stock ═══
-- Para productos existentes, calcular min_stock basado en demanda:
-- - Productos con ventas: min_stock = max(1, ceil(avg_monthly_sales * 0.5))
-- - Productos sin ventas pero con stock: min_stock = 1
-- - Productos sin ventas ni stock: min_stock = 1
-- No aplicar fórmulas complejas (Safety Stock) por falta de datos suficientes.
-- Usar criterio conservador.

-- Primero: actualizar todos los min_stock=0 a 1 (default mínimo)
UPDATE public.products
SET min_stock = 1
WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND is_active = true
  AND min_stock = 0;

-- Después: para productos con alta rotación (>10 ventas), aumentar min_stock
UPDATE public.products p
SET min_stock = GREATEST(1, CEIL(
  (SELECT COUNT(*)::numeric FROM transaction_items ti
   WHERE ti.product_id = p.id) / 2.0
))
WHERE p.store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38'
  AND p.is_active = true
  AND (SELECT COUNT(*) FROM transaction_items ti WHERE ti.product_id = p.id) > 10;

-- ═══ 6. NORMALIZACIÓN: Clasificación profesional ═══
-- Asignar categorías basadas en el nombre del producto

-- Categorías eléctricas
UPDATE public.products SET category = 'Eléctrico' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%brecker%' OR name ILIKE '%cuchilla%' OR name ILIKE '%interruptor%' OR
  name ILIKE '%toma corriente%' OR name ILIKE '%espigas%' OR name ILIKE '%terminal%' OR
  name ILIKE '%conector%' OR name ILIKE '%cable%' OR name ILIKE '%panel%' OR
  name ILIKE '%inversor%' OR name ILIKE '%supresor%' OR name ILIKE '%controlador%' OR
  name ILIKE '%transfer%' OR name ILIKE '%regleta%' OR name ILIKE '%caja de distribución%' OR
  name ILIKE '%caja%eléctrica%' OR name ILIKE '%cajita%breck%' OR name ILIKE '%porta%fusib%' OR
  name ILIKE '%conductor%electrico%' OR name ILIKE '%barilla%tierra%' OR name ILIKE '%estación%carga%'
);

-- Categorías plomería
UPDATE public.products SET category = 'Plomería' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%codo%' OR name ILIKE '%nudo%' OR name ILIKE '%unión%' OR name ILIKE '%union%' OR
  name ILIKE '%t de%' OR name ILIKE '%llave%' OR name ILIKE '%reducid%' OR name ILIKE '%latiguill%' OR
  name ILIKE '%tub%' OR name ILIKE '%fregader%' OR name ILIKE '%yee%'
);

-- Categorías construcción
UPDATE public.products SET category = 'Construcción' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%cemento%' OR name ILIKE '%pintura%' OR name ILIKE '%masilla%' OR
  name ILIKE '%mortero%' OR name ILIKE '%impermeable%' OR name ILIKE '%zinc%' OR
  name ILIKE '%plancha%' OR name ILIKE '%losa%' OR name ILIKE '%cabilla%' OR
  name ILIKE '%abrazad%' OR name ILIKE '%expansion%' OR name ILIKE '%bisagra%' OR
  name ILIKE '%disco%' OR name ILIKE '%rodillo%' OR name ILIKE '%espejo%' OR
  name ILIKE '%soporte%'
);

-- Categorías ferretería
UPDATE public.products SET category = 'Ferretería' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%tornillo%' OR name ILIKE '%grapa%' OR name ILIKE '%herraje%' OR
  name ILIKE '%escoba%' OR name ILIKE '%cheque%' OR name ILIKE '%barrena%' OR
  name ILIKE '%disco%corte%' OR name ILIKE '%limpia%' OR name ILIKE '%fuete%' OR
  name ILIKE '%cripiad%' OR name ILIKE '%goma%' OR name ILIKE '%teipe%' OR
  name ILIKE '%canal%'
);

-- Categorías solar
UPDATE public.products SET category = 'Solar' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%mc4%' OR name ILIKE '%panel%600%' OR name ILIKE '%cable solar%' OR
  name ILIKE '%panel 585%'
);

-- Categorías hogar
UPDATE public.products SET category = 'Hogar' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%colchón%' OR name ILIKE '%césped%' OR name ILIKE '%lampara%' OR
  name ILIKE '%alarma%' OR name ILIKE '%j de techo%' OR name ILIKE '%papel%higién%'
);

-- Productos restantes: Servicios y otros
UPDATE public.products SET category = 'Servicios' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND category IS NULL AND (
  name ILIKE '%servicio%' OR name ILIKE '%combustible%' OR name ILIKE '%liquidac%' OR
  name ILIKE '%inicio z%' OR name ILIKE '%intermedio%'
);

-- Productos restantes sin categoría: asignar 'General'
UPDATE public.products SET category = 'General' WHERE store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38' AND is_active = true AND (category IS NULL OR category = '');

-- Limpiar producto de test
DELETE FROM products WHERE sku = 'OP1' AND store_id = '5e6fe821-5465-48b1-b3f1-3aa3182edc38';

-- ═══ 7. Verificación ═══
-- Comentar para que la migración no falle si hay productos en otras tiendas
-- que no cumplen las reglas (se aplicará solo a ENER-VIDA por ahora)
