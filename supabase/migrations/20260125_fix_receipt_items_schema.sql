-- Migration: Add missing created_at and updated_at columns to audit-related tables
-- Date: 2026-01-25

-- 1. Add columns to receipt_items
ALTER TABLE public.receipt_items
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 2. Add columns to receipts
ALTER TABLE public.receipts
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- 3. Add created_at to inventory
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
