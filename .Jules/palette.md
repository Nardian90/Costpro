# Palette's Journal - Costpro UX & Accessibility

## 2025-05-14 - Initial Observations
**Learning:** The application uses a custom neumorphic UI system that relies heavily on `div` elements for interactive cards. This breaks standard keyboard navigation (Tab/Enter) and screen reader support.
**Action:** Convert key interactive elements from `div` to `button` or `a` tags and ensure all icon-only interactions have explicit ARIA labels.
 feature/pwa-branding-costpro-10452597342920851460
## 2026-01-17 - PWA & Visual Identity
**Learning:** PWAs in Next.js require `manifest.json` in `public/`, service worker registration (ideally via a Client Component), and specific metadata in `layout.tsx` (using `Metadata` and `viewport` exports). SVGs with filters can effectively provide neumorphic and neon effects for cross-platform icons.
**Action:** Implemented PWA functionality with a custom neumorphic/neon lightning bolt icon and centralized service worker registration in a dedicated client component.
=======
## 2025-05-22 - Inventory Count UI
**Learning:** Cashiers need an intuitive way to reconcile physical vs system stock, especially for products sold in multiple formats (e.g., boxes vs units). A guided "decomposition" modal helps them convert shortages into equivalent saleable units without complex calculations.
**Action:** Implemented `InventoryCountView` with an editable variant decomposition modal that allows manual adjustment of suggested quantities before final confirmation.
main

## 2026-01-20
- Learning: Internal API routes using a global Supabase client with an anon key will fail if RLS is enabled on the target tables (e.g., `profiles`), as the user context is missing.
- Action: Updated `getServerSession` to return the access token and introduced `getSupabaseAuthClient` to create authenticated Supabase clients in server-side routes.

## 2026-01-21 - Multi-store Stock Reliability
**Learning:** In a multi-store system where products are shared, a single `stock_current` column in the `products` table becomes unreliable if updated by triggers from different stores. The API must explicitly join and map stock from the `inventory` table based on the store context of the authenticated user.
**Action:** Refactored `/api/inventory/products` to fetch and map stock from the `inventory` table, ensuring cashiers see accurate stock for their specific store.
