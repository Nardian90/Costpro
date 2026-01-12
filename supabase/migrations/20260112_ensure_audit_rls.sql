-- Migration: Asegurar RLS, políticas y wrapper SECURITY DEFINER para auditoría
-- Fecha: 2026-01-12

/*
  Objetivos:
  - Habilitar RLS donde corresponda
  - Crear políticas mínimas que permitan escritura sólo vía RPCs (usuarios autenticados)
  - Proveer un wrapper SECURITY DEFINER para `register_reception` si no existe
*/

BEGIN;

-- Habilitar RLS en tablas sensibles (si no están habilitadas)
ALTER TABLE IF EXISTS public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.receipt_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.inventory ENABLE ROW LEVEL SECURITY;

-- Política: permitir SELECT a todos los usuarios autenticados en tablas de lectura necesarias
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='receipts' AND p.polname='allow_select_authenticated') THEN
    EXECUTE 'CREATE POLICY allow_select_authenticated ON public.receipts FOR SELECT USING (auth.role() IS NOT NULL);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='receipt_items' AND p.polname='allow_select_authenticated') THEN
    EXECUTE 'CREATE POLICY allow_select_authenticated ON public.receipt_items FOR SELECT USING (auth.role() IS NOT NULL);';
  END IF;
END$$;

-- Política: bloquear INSERT/UPDATE/DELETE desde cliente directo en tablas de auditoría
-- Permitiremos writes sólo para roles definidos o vía funciones con SECURITY DEFINER
DO $$
BEGIN
  -- receipts: permitir insert sólo si current_setting('request.jwt.claim.role','') = 'admin' OR caller is a SECURITY DEFINER function
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='receipts' AND p.polname='deny_client_writes') THEN
    EXECUTE 'CREATE POLICY deny_client_writes ON public.receipts FOR ALL USING (true) WITH CHECK (false);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='receipt_items' AND p.polname='deny_client_writes') THEN
    EXECUTE 'CREATE POLICY deny_client_writes ON public.receipt_items FOR ALL USING (true) WITH CHECK (false);';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy p JOIN pg_class c ON p.polrelid = c.oid WHERE c.relname='stock_movements' AND p.polname='deny_client_writes') THEN
    EXECUTE 'CREATE POLICY deny_client_writes ON public.stock_movements FOR ALL USING (true) WITH CHECK (false);';
  END IF;
END$$;

-- Crear un wrapper seguro para register_reception si no existe (ejemplo idempotente)
-- Esta función asume que hay una función real `register_reception(payload jsonb)` definida por migraciones previas.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'register_reception_wrapper') THEN
    EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.register_reception_wrapper(payload jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $body$
    DECLARE
      res jsonb;
    BEGIN
      -- Llamar a la función atómica existente. Ajusta el nombre si difiere.
      PERFORM public.register_reception(payload);
      -- Retornar éxito simple. Si la función original retorna datos, es mejor adaptarlo.
      res := jsonb_build_object('status','ok');
      RETURN res;
    END;
    $body$;
    $fn$;
  END IF;
END$$;

COMMIT;
