/**
 * Distribution Methods — 4 métodos para distribuir costos indirectos
 * entre los productos de una recepción.
 *
 * Determinístico, puro, sin side effects.
 */

import type { DistributionMethod } from './types';

export interface DistributionItem {
  product_id: string;
  quantity: number;
  unit_cost: number; // Costo unitario en CUP
  weight?: number; // Peso por unidad (opcional)
}

/**
 * Distribuye un monto total entre los items según el método elegido.
 *
 * @param totalAmount - Monto total a distribuir (ej: flete total $1000)
 * @param items - Items de la recepción
 * @param method - Método de distribución
 * @returns Map<product_id, amount> con el monto asignado a cada producto
 */
export function distributeCost(
  totalAmount: number,
  items: DistributionItem[],
  method: DistributionMethod
): Map<string, number> {
  if (items.length === 0) return new Map();
  if (totalAmount <= 0) return new Map(items.map(i => [i.product_id, 0]));

  const result = new Map<string, number>();

  switch (method) {
    case 'quantity':
      return distributeByQuantity(totalAmount, items);
    case 'cost_value':
      return distributeByCostValue(totalAmount, items);
    case 'weight':
      return distributeByWeight(totalAmount, items);
    case 'manual':
      // Manual: el monto ya viene asignado por producto, no se distribuye
      // Cada producto recibe el monto que se le asignó directamente
      return new Map(items.map(i => [i.product_id, totalAmount / items.length]));
    default:
      return distributeByCostValue(totalAmount, items);
  }
}

/**
 * Distribución por cantidad:
 * monto_producto = total × (cantidad_producto / cantidad_total)
 */
function distributeByQuantity(totalAmount: number, items: DistributionItem[]): Map<string, number> {
  const totalQty = items.reduce((sum, i) => sum + i.quantity, 0);
  if (totalQty === 0) return new Map(items.map(i => [i.product_id, 0]));

  const result = new Map<string, number>();
  for (const item of items) {
    const proportion = item.quantity / totalQty;
    result.set(item.product_id, round2(totalAmount * proportion));
  }
  return result;
}

/**
 * Distribución por valor del costo (DEFAULT):
 * monto_producto = total × (costo_producto / costo_total)
 */
function distributeByCostValue(totalAmount: number, items: DistributionItem[]): Map<string, number> {
  const totalCost = items.reduce((sum, i) => sum + (i.quantity * i.unit_cost), 0);
  if (totalCost === 0) return distributeByQuantity(totalAmount, items); // fallback

  const result = new Map<string, number>();
  for (const item of items) {
    const itemCost = item.quantity * item.unit_cost;
    const proportion = itemCost / totalCost;
    result.set(item.product_id, round2(totalAmount * proportion));
  }
  return result;
}

/**
 * Distribución por peso:
 * monto_producto = total × (peso_producto / peso_total)
 */
function distributeByWeight(totalAmount: number, items: DistributionItem[]): Map<string, number> {
  const totalWeight = items.reduce((sum, i) => sum + (i.quantity * (i.weight || 0)), 0);
  if (totalWeight === 0) return distributeByCostValue(totalAmount, items); // fallback

  const result = new Map<string, number>();
  for (const item of items) {
    const itemWeight = item.quantity * (item.weight || 0);
    const proportion = itemWeight / totalWeight;
    result.set(item.product_id, round2(totalAmount * proportion));
  }
  return result;
}

/** Redondear a 2 decimales (centavos) */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
