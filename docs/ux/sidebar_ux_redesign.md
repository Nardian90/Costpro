# Costpro Sidebar: UX Redesign & Enterprise Architecture

## 1. Architectural Decisions

### Context-First Navigation
The sidebar is now organized by broad business domains rather than a flat list of features.
- **Estratégico**: High-level business intelligence.
- **Operaciones Tienda**: Daily front-facing and warehouse tasks.
- **IPV Builder**: Deep institutional data processing.
- **Configuración**: Administrative and system maintenance.
- **Más Recursos**: Auxiliary information (Legal, Wiki, Help).

### Progressive Disclosure
- **Level 1**: High-level groups (max 5 visible).
- **Level 2**: Domain-specific submodules.
- **Level 3**: Specific actions/items.
We split the "Almacén" module into "Gestión Inventario" (Catalog, Stock) and "Logística" (Receipts, Transfers) to ensure no sub-menu contains more than 5-7 items, reducing visual overwhelm.

### Encapsulation
The **IPV Builder** module remains structurally identical to its previous implementation internally, but is now properly encapsulated as a Level 1 module in the new architecture.

## 2. UX Priority Rules
1. **Frequency of Use**: KPI Dashboard and POS are at the top of their respective groups.
2. **Cognitive Load**: Removed all emojis from primary labels to provide a clean, professional "Enterprise" aesthetic.
3. **Scanability**: Group headers are now uppercase with increased letter-spacing to clearly separate sections.
4. **Persistence**: The expanded/collapsed state is stored in `localStorage` (`costpro.sidebar.state`), ensuring users don't have to re-open sections on every refresh.

## 3. Accessibility Features
- **ARIA Roles**:
  - `role="navigation"` on the main container.
  - `role="menubar"` and `role="menuitem"` for the navigation list.
  - `role="group"` for top-level modules.
- **Keyboard Navigation**:
  - Focus-visible rings on all interactive elements.
  - ESC key to close the sidebar.
  - Logical tab order through the hierarchy.
- **Screen Reader Support**:
  - `aria-label` on all buttons to provide descriptive context beyond the visible label.
  - `aria-expanded` state for collapsible menus.
  - `aria-current="page"` for the active view.

## 4. Validation Checklist
- [x] **Depth**: No module exceeds 3 levels of nesting.
- [x] **Scroll Control**: No sub-menu has more than 8 items; most have 3-5.
- [x] **IPV Integrity**: IPV sub-items and tabs work exactly as before.
- [x] **Accessibility**: ARIA labels and focus states verified.
- [x] **Persistence**: `localStorage` state verified.
- [x] **Feature Flags**: `featureFlag` property available in `NavModule` type for future-ready deployment.
- [x] **TypeScript**: Zero `any` types used; strict interfaces for `NavModule`.

## 5. Mapping of Old Options
| Old Label | New Location |
|-----------|--------------|
| MÓDULO ESTRATÉGICO | ESTRATÉGICO (L1) |
| Punto de Venta | OPERACIONES TIENDA -> Punto de Venta (L2) |
| Módulo almacén | OPERACIONES TIENDA -> Gestión Inventario (L2) & Logística (L2) |
| IPV BUILDER | IPV BUILDER (L1) |
| Administración | CONFIGURACIÓN (L1) |
| NORMATIVAS / LEGAL | MÁS RECURSOS (L1) -> Legal y Ayuda (L2) |
