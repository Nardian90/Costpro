/**
 * @file Contrato de datos estricto para las entidades de Inventario.
 * @description Centraliza las definiciones de tipos para el inventario,
 * eliminando `null` y `undefined` para garantizar consistencia.
 */
export interface InventoryItem {
  productId: string;
  storeId: string;
  sku: string;
  name: string;
  quantity: number;
  version: number;
}

/**
 * Fábrica para crear objetos InventoryItem con valores predeterminados seguros.
 */
export const InventoryItemFactory = {
  create: (
    initialValues?: Partial<InventoryItem>
  ): InventoryItem => ({
    productId: '',
    storeId: '',
    sku: '',
    name: '',
    quantity: 0,
    version: 0,
    ...initialValues,
  }),
};

export interface InventoryMovement {
  movementId: string;
  timestamp: string;
  quantityChange: number;
  movementType: string;
}

/**
 * Fábrica para crear objetos InventoryMovement con valores predeterminados seguros.
 */
export const InventoryMovementFactory = {
  create: (
    initialValues?: Partial<InventoryMovement>
  ): InventoryMovement => ({
    movementId: '',
    timestamp: new Date().toISOString(),
    quantityChange: 0,
    movementType: 'adjustment',
    ...initialValues,
  }),
};

export interface AdjustInventoryResponse {
  productId: string;
  newQuantity: number;
  newVersion: number;
}
