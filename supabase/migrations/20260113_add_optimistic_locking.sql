-- Migration: Add optimistic locking to inventory
-- Date: 2026-01-13

BEGIN;

-- Add a version column to the inventory table for optimistic locking
ALTER TABLE public.inventory
ADD COLUMN version integer NOT NULL DEFAULT 0;

COMMIT;
