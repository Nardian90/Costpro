# Changelog - CostPro

## [5.4.0] - 2026-01-25
### Added
- **Mobile-First POS Experience**: Refactored the point-of-sale (POS) shopping cart to use a `Drawer` (bottom sheet) component on mobile devices (≤ 768px).
- **Thumb-Zone Optimization**: Moved the `ActionMenu` (primary actions) to the bottom of the screen on mobile devices for better reachability.
- **Mobile-First Micro-Guide**: Added a new training section in the Help Center explaining the optimized mobile workflows.
- **Improved Accessibility**: Enhanced touch targets and visual feedback for cart operations on small screens.

### Changed
- **Version Upgrade**: System version bumped to v5.4.0 (MOBILE-FIRST).
- **POS Logic**: Decoupled cart display logic from main catalog view using conditional rendering based on device type.

---

## [5.3.0] - 2026-01-24
### Added
- **Multi-Store SKU Hardening**: Implementation of store-scoped unique SKUs.
- **Store-Based Inventory Matching**: New logic for matching inventory items based on the active store context.
- **Audit Logs v2**: Enhanced traceability for multi-store operations.
