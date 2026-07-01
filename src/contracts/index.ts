/**
 * @file Punto de entrada para los contratos de datos de la aplicación.
 * @description Exporta todas las interfaces de contratos y fábricas
 * desde un único módulo para facilitar su importación y uso
 * en toda la aplicación, promoviendo un punto de verdad único.
 *
 * @see {@link /docs/dias/dia-6-consolidacion.md}
 *
 * @author Jules
 * @version 1.0.0
 * @since 2024-01-22
 */

// User Contracts
export * from './user';

// Inventory Contracts
export * from './inventory';

// CostSheet Contracts
export * from './cost-sheet';

// Oferta Contracts
export * from './oferta';

// Store Contracts
export * from './store';

// Store Cost Template Contracts (FC Automatizada)
export * from './store-cost-template';

// Product Cost Sheet Contracts (FC Automatizada)
export * from './product-cost-sheet';
