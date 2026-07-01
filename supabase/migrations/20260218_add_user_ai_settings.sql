-- Migration: Add User-Specific AI Settings
-- Date: 2026-02-18
-- Author: Jules

BEGIN;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS ai_provider TEXT DEFAULT 'gemini',
ADD COLUMN IF NOT EXISTS ai_api_key TEXT;

COMMENT ON COLUMN public.profiles.ai_api_key IS 'User-provided API key for LLM. Should be handled with care.';

COMMIT;
