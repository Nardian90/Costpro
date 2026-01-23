/**
 * @file Contrato de datos estricto para las entidades de Inventario.
 * @description Centraliza las definiciones de tipos para el inventario,
 * eliminando `null` y `undefined` para garantizar consistencia.
 */
export interface InventoryItemContract {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  version: number;
}

/**
 * Fábrica para crear objetos InventoryItemContract con valores predeterminados seguros.
 */
export const InventoryItemFactory = {
  create: (
    initialValues?: Partial<InventoryItemContract>
  ): InventoryItemContract => ({
    productId: '',
    sku: '',
    name: '',
    quantity: 0,
    version: 0,
    ...initialValues,
  }),
};

export interface InventoryMovementContract {
  movementId: string;
  timestamp: string;
  quantityChange: number;
  movementType: string;
}

/**
 * Fábrica para crear objetos InventoryMovementContract con valores predeterminados seguros.
 */
export const InventoryMovementFactory = {
  create: (
    initialValues?: Partial<InventoryMovementContract>
  ): InventoryMovementContract => ({
    movementId: '',
    timestamp: new Date().toISOString(),
    quantityChange: 0,
    movementType: 'adjustment',
    ...initialValues,
  }),
};
