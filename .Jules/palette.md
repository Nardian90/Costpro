# Palette's Journal - Costpro UX & Accessibility

## 2025-05-14 - Initial Observations
**Learning:** The application uses a custom neumorphic UI system that relies heavily on `div` elements for interactive cards. This breaks standard keyboard navigation (Tab/Enter) and screen reader support.
**Action:** Convert key interactive elements from `div` to `button` or `a` tags and ensure all icon-only interactions have explicit ARIA labels.

## 2025-05-22 - Inventory Count UI
**Learning:** Cashiers need an intuitive way to reconcile physical vs system stock, especially for products sold in multiple formats (e.g., boxes vs units). A guided "decomposition" modal helps them convert shortages into equivalent saleable units without complex calculations.
**Action:** Implemented `InventoryCountView` with an editable variant decomposition modal that allows manual adjustment of suggested quantities before final confirmation.
