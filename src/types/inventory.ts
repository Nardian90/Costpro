export interface InventoryItem {
  productId: string;
  sku: string;
  name: string;
  quantity: number;
  version: number;
}

export interface InventoryMovement {
  movementId: string;
  timestamp: string;
  quantityChange: number;
  movementType: string;
}

export interface AdjustInventoryResponse {
  productId: string;
  newQuantity: number;
  newVersion: number;
}
