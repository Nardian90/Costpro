-- Migration: Add missing created_at columns to audit-related tables
-- Date: 2026-01-25

-- 1. Add created_at to receipt_items
ALTER TABLE public.receipt_items
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Add created_at to inventory (also missing and used in register_reception RPC)
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Ensure updated_at exists where needed for consistency
ALTER TABLE public.receipt_items
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
