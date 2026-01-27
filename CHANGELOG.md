# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.5.2] - 2026-01-26

### Added
- Centralized `importService` (`src/services/import-service.ts`) for standardized CSV parsing using PapaParse and strict Zod validation.
- New `catalogImportRowSchema` and `receptionImportRowSchema` in `src/validation/schemas.ts` to enforce business rules at the entry point.

### Changed
- Hardened Catalog and Product Reception import flows by migrating from dispersed manual parsing to the centralized `importService`.
- Improved error feedback with precise row identification (index + 2) and Zod-driven error messages.

## [5.5.0] - 2026-01-26

### Added
- New "CostPro para Niños" section in Help view for visual onboarding using storytelling.
- Componentized Audit view with a visual, human-readable timeline.
- Enhanced Manager role permissions: now has access to Users and Stores management views.

### Changed
- Hardened Product Reception flow: mandatory store context selection is now enforced before searching or importing products.
- Improved audit log resilience: supports both UUID and Text record IDs.
- Optimized Audit Timeline performance with "Show More" pagination.

### Security
- Reinforced Row-Level Security (RLS) policies for audit log access.

## [5.4.0] - 2026-01-25

### Added
- Mobile-first TPV redesign with Drawer-based shopping cart.
- ActionMenu component with "Thumb Zone" (bottom) positioning support.
- Interactive mobile operational guide in Help section.

### Changed
- Unified inventory views using the atomic ProductCard component.
- Improved store selection UX in the multi-store header.

## [5.3.0] - 2026-01-24

### Added
- Multi-Store SKU isolation (Composite Key: store_id + sku).
- Mandatory SKU validation in Catalog and Reception services.
- New SVG diagram for SKU isolation in Help section.

## [5.2.0] - 2024-11-15

### Added
- Enterprise Multi-Store support.
- Dynamic role hierarchies and branch isolation using Supabase RLS.
