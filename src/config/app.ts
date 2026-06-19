/**
 * CostPro Application Configuration Constants
 * Centralized source of truth for version, contact info, and branding.
 */
export const APP_VERSION = '5.8.0';
export const APP_VERSION_SHORT = '5.8';
export const APP_DISPLAY_VERSION = 'v5.8';

export const SUPPORT_WHATSAPP = '+53 53183215';
export const BRAND_ORIGIN = 'Cuba';
export const BRAND_NAME = 'CostPro';

// ── Plan Limits ──────────────────────────────────────────────────
/**
 * Maximum number of active stores allowed per plan.
 * Shared between the API route (enforcement) and the frontend (UI hints).
 * The RPC `create_store_with_membership` also enforces these limits atomically.
 */
export const PLAN_STORE_LIMITS: Record<string, number> = {
  basico: 1,
  profesional: 3,
  enterprise: 10,
} as const;

/** Store template identifiers — used in Zod schemas, forms, and storefront router */
export const STORE_TEMPLATES = ['construccion', 'minimalista', 'moderna', 'clasica'] as const;
export type StoreTemplate = (typeof STORE_TEMPLATES)[number];

/** FIX-QC-1: Single source of truth for roles allowed to mutate stores.
 * Used by API routes (route handlers), store-api-client.ts, and RLS policies.
 * Admin can always perform any operation; this list defines the minimum
 * set of roles that can create/update/delete stores.
 */
export const STORE_MUTATION_ROLES = ['admin', 'manager', 'encargado'] as const;
export type StoreMutationRole = (typeof STORE_MUTATION_ROLES)[number];
