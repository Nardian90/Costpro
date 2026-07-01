-- Migration: Add financial and commercial fields to ofertas table
-- Date: 2026-06-12

-- Add new columns
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS descuento DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS itbis DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS total DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS moneda TEXT NOT NULL DEFAULT 'CUP';
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS validez TEXT NOT NULL DEFAULT '30 días';
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS condiciones_pago TEXT NOT NULL DEFAULT 'Pago en la fecha de entrega';
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS condiciones_entrega TEXT NOT NULL DEFAULT 'Según acuerdo entre las partes';
ALTER TABLE public.ofertas ADD COLUMN IF NOT EXISTS notas TEXT NOT NULL DEFAULT '';

-- Backfill total from subtotal for existing records
UPDATE public.ofertas SET total = subtotal WHERE total = 0 AND subtotal > 0;
