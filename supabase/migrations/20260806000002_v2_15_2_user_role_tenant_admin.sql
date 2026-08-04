-- ============================================================================
-- Migration: 20260806000002_v2_15_2_user_role_tenant_admin.sql
-- Iteración 13 — Add tenant_admin role
-- ============================================================================
-- Añade 'tenant_admin' al enum user_role.
-- Autorizado explícitamente por el usuario (N-C1).
-- ============================================================================

-- ─── UP ──────────────────────────────────────────────────────────────────────

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'tenant_admin';

-- ─── DOWN ────────────────────────────────────────────────────────────────────
-- Postgres no soporta REMOVE VALUE de enums. El valor 'tenant_admin' puede
-- quedarse sin usar sin impacto funcional.
-- ============================================================================
