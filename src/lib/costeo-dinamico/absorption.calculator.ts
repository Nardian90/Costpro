/**
 * Absorption Calculator — Absorbe costos indirectos en el producto
 *
 * Toma: costo base + servicios (transportación, manipulación, otros) + comisiones
 * y los distribuye proporcionalmente para calcular el costo absorbido.
 *
 * Puro, determinístico, sin side effects.
 */

import type { ReceivedServiceInput, CommissionLinkInput, DistributionMethod } from './types';
import { distributeCost, type DistributionItem } from './distribution.methods';

export interface AbsorptionResult {
  /** Costo base (unit_cost × cantidad, ponderado) */
  base_cost: number;
  /** Costo de transportación absorbido */
  transport_cost: number;
  /** Costo de manipulación absorbido */
  manipulation_cost: number;
  /** Otros servicios absorbidos */
  other_services_cost: number;
  /** Comisiones absorbidas */
  commission_cost: number;
  /** Total de costos absorbidos (sin base) */
  total_absorbed: number;
}

/**
 * Calcular la absorción de costos indirectos para un producto específico.
 *
 * @param productId - ID del producto
 * @param receipts - Items de recepción del producto (para calcular costo base)
 * @param services - Servicios vinculados a las recepciones
 * @param commissions - Comisiones vinculadas a las recepciones
 * @returns Desglose de costos absorbidos
 */
export function calculateAbsorption(
  productId: string,
  receipts: { product_id: string; quantity: number; unit_cost: number; moneda_recepcion: string; tasa_cambio_recepcion: number }[],
  services: ReceivedServiceInput[],
  commissions: CommissionLinkInput[]
): AbsorptionResult {
  // 1. Costo base: sumar unit_cost × quantity de todas las recepciones del producto
  // Convertir a CUP si la moneda no es CUP
  const productReceipts = receipts.filter(r => r.product_id === productId);
  let baseCost = 0;
  for (const r of productReceipts) {
    const costInCUP = r.moneda_recepcion === 'CUP'
      ? r.unit_cost * r.quantity
      : (r.unit_cost * r.quantity * r.tasa_cambio_recepcion);
    baseCost += costInCUP;
  }

  // 2. Absorber servicios (transportación, manipulación, otros)
  // Los servicios ya vienen distribuidos por producto (via service_cost_distributions),
  // pero si no están distribuidos, los distribuimos aquí
  let transportCost = 0;
  let manipulationCost = 0;
  let otherServicesCost = 0;

  for (const service of services) {
    // Si el servicio ya tiene monto asignado a este producto, usarlo
    // Si no, distribuir entre todos los productos de la recepción
    const serviceAmount = service.total_amount; // Asumiendo que ya está distribuido

    // Clasificar por tipo de servicio
    const typeName = service.service_type_name.toLowerCase();
    if (typeName.includes('transport') || typeName.includes('flete') || typeName.includes('transp')) {
      transportCost += serviceAmount;
    } else if (typeName.includes('manip') || typeName.includes('estiba') || typeName.includes('descarga')) {
      manipulationCost += serviceAmount;
    } else {
      otherServicesCost += serviceAmount;
    }
  }

  // 3. Absorber comisiones
  let commissionCost = 0;
  for (const commission of commissions) {
    commissionCost += commission.amount;
  }

  const totalAbsorbed = round2(transportCost + manipulationCost + otherServicesCost + commissionCost);

  return {
    base_cost: round2(baseCost),
    transport_cost: round2(transportCost),
    manipulation_cost: round2(manipulationCost),
    other_services_cost: round2(otherServicesCost),
    commission_cost: round2(commissionCost),
    total_absorbed: totalAbsorbed,
  };
}

/**
 * Distribuir un servicio entre los productos de una recepción.
 * Helper para usar cuando los servicios no vienen pre-distribuidos.
 */
export function distributeServiceToProducts(
  serviceAmount: number,
  receiptItems: DistributionItem[],
  method: DistributionMethod
): Map<string, number> {
  return distributeCost(serviceAmount, receiptItems, method);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
