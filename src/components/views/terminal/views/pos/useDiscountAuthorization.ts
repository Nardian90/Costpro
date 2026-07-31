/**
 * useDiscountAuthorization — Hook que centraliza la lógica de autorización
 * de supervisor para descuentos que exceden el umbral.
 *
 * V2.12.30: Antes el chequeo solo vivía en POSCartDiscountModal (que es huérfano —
 * no se renderiza en ningún sitio) y solo cubría `type === "percentage"`.
 * Los descuentos por item en SalesCatalogCard/Table NO tenían ningún chequeo.
 *
 * Este hook se usa en:
 *   - POSCartDiscountModal (descuento global del carrito)
 *   - SalesCatalogCard / SalesCatalogTable (descuento por item)
 *
 * Cubre AMBOS tipos:
 *   - percentage: value >= THRESHOLD
 *   - fixed: (value / referenceTotal) * 100 >= THRESHOLD
 *            (calcula el % efectivo sobre el total de referencia)
 *
 * El THRESHOLD por defecto es 15% (configurable).
 */

import { useState, useCallback } from 'react';

export const DISCOUNT_SUPERVISOR_THRESHOLD = 15;

export interface DiscountCheck {
  type: 'percentage' | 'fixed';
  value: number;
  /** Total de referencia para calcular % efectivo de descuentos fijos.
   *  - Descuento global del carrito: getTotal()
   *  - Descuento por item: precio del item × cantidad
   */
  referenceTotal: number;
}

export interface UseDiscountAuthorizationResult {
  /** True si el modal de supervisor está abierto */
  showSupervisorAuth: boolean;
  /** Descuento pendiente de autorizar (o null) */
  pendingDiscount: DiscountCheck | null;
  /** % efectivo del descuento pendiente (para mostrar en el modal) */
  pendingEffectivePercent: number;
  /**
   * Verifica si un descuento requiere autorización.
   * Si requiere, abre el modal y devuelve true.
   * Si no requiere, devuelve false (y el caller debe aplicar el descuento).
   */
  checkDiscount: (check: DiscountCheck) => boolean;
  /** Limpia el estado de autorización pendiente (llamar al cancelar) */
  cancelAuthorization: () => void;
  /** Marca como autorizado (llamar tras PIN válido del supervisor) */
  confirmAuthorization: () => DiscountCheck | null;
}

/**
 * Calcula el % efectivo de un descuento sobre un total de referencia.
 * - percentage: retorna value directamente (ya es %)
 * - fixed: retorna (value / referenceTotal) * 100, redondeado a 1 decimal
 *          Si referenceTotal <= 0, retorna Infinity (siempre requerirá auth)
 */
export function calculateEffectivePercent(check: DiscountCheck): number {
  if (check.type === 'percentage') {
    return check.value;
  }
  // fixed
  if (check.referenceTotal <= 0) return Infinity;
  return (check.value / check.referenceTotal) * 100;
}

export function useDiscountAuthorization(
  threshold: number = DISCOUNT_SUPERVISOR_THRESHOLD
): UseDiscountAuthorizationResult {
  const [showSupervisorAuth, setShowSupervisorAuth] = useState(false);
  const [pendingDiscount, setPendingDiscount] = useState<DiscountCheck | null>(null);
  const [pendingEffectivePercent, setPendingEffectivePercent] = useState(0);

  const checkDiscount = useCallback(
    (check: DiscountCheck): boolean => {
      const effectivePct = calculateEffectivePercent(check);

      if (effectivePct >= threshold) {
        setPendingDiscount(check);
        setPendingEffectivePercent(effectivePct);
        setShowSupervisorAuth(true);
        return true; // requiere autorización
      }
      return false; // no requiere, aplicar directamente
    },
    [threshold]
  );

  const cancelAuthorization = useCallback(() => {
    setShowSupervisorAuth(false);
    setPendingDiscount(null);
    setPendingEffectivePercent(0);
  }, []);

  const confirmAuthorization = useCallback((): DiscountCheck | null => {
    const result = pendingDiscount;
    setShowSupervisorAuth(false);
    setPendingDiscount(null);
    setPendingEffectivePercent(0);
    return result;
  }, [pendingDiscount]);

  return {
    showSupervisorAuth,
    pendingDiscount,
    pendingEffectivePercent,
    checkDiscount,
    cancelAuthorization,
    confirmAuthorization,
  };
}
