/**
 * ElegantCatalogTemplate — Re-export facade.
 *
 * The actual implementation lives in the `elegant/` subdirectory,
 * organized into focused modules for maintainability.
 *
 * Architecture:
 *   elegant/constants.ts    → Layout dimensions (A4, grid, margins)
 *   elegant/types.ts        → Shared RGB type
 *   elegant/image-helpers.ts → Image loading, QR, contain-fit math
 *   elegant/drawing.ts      → Primitive shapes & decorative elements
 *   elegant/tags.ts         → Product tag logic & category icons
 *   elegant/components.ts   → Footer, header, category band, product card
 *   elegant/cover.ts        → Cover page with hero product
 *   elegant/body.ts         → Body pages with smart pagination
 *   elegant/index.ts        → Main orchestrator (TemplateRenderer)
 */

export { renderElegantCatalogTemplate } from "./elegant/index";
