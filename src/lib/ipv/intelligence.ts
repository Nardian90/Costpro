import { type Product, type BankTransaction, type ReconciliationLine } from '../dexie';

/**
 * Calcula la puntuación de efectividad de precio (0-100).
 * Considera frecuencia de uso, redondez y utilidad histórica.
 */
export function calculatePriceEffectiveness(
  product: Product,
  lines: ReconciliationLine[]
): number {
  if (product.precio_cents <= 0) return 0;

  // 1. Frecuencia de uso (hasta 40 pts)
  const usageCount = lines.filter(l => l.product_cod === product.cod).length;
  const usageScore = Math.min(usageCount * 4, 40);

  // 2. Redondez/Aritmética (hasta 40 pts)
  // Precios que terminan en 0 o 5 son más fáciles de combinar
  let arithmeticScore = 0;
  if (product.precio_cents % 10 === 0) arithmeticScore = 40;
  else if (product.precio_cents % 5 === 0) arithmeticScore = 30;
  else if (product.precio_cents % 1 === 0) arithmeticScore = 20;
  else if ((product.precio_cents * 2) % 1 === 0) arithmeticScore = 10;

  // 3. Valor estratégico (hasta 20 pts)
  const isStrategic = [1, 2, 5, 10, 20, 25, 50, 100].includes(product.precio_cents);
  const strategicScore = isStrategic ? 20 : 0;

  return usageScore + arithmeticScore + strategicScore;
}

/**
 * Sugiere un precio alternativo para mejorar el matching.
 */
export function suggestAlternativePrice(product: Product): { price?: number; reason?: string } {
  const currentPrice = product.precio_cents;

  // No sugerir si ya es "redondo"
  if (currentPrice % 5 === 0) return {};

  // Sugerir el múltiplo de 5 más cercano
  const suggested = Math.round(currentPrice / 5) * 5;

  if (suggested === 0) return {};
  if (suggested === currentPrice) return {};

  return {
    price: suggested,
    reason: `El precio ${currentPrice} genera residuos difíciles de conciliar. Un precio de ${suggested} facilitaría combinaciones exactas.`
  };
}

/**
 * Determina si un producto es un buen candidato para comodín.
 */
export function checkWildcardCandidate(product: Product): boolean {
  // Un comodín es barato y de precio muy redondo
  const isCheap = product.precio_cents > 0 && product.precio_cents <= 50;
  const isVeryRound = [1, 2, 5, 10, 20, 50].includes(product.precio_cents);

  return isCheap && isVeryRound;
}

/**
 * Calcula prioridad dinámica (1-5, donde 1 es más prioritario).
 */
export function calculateDynamicPriority(
  product: Product,
  stats: { stock: number; salesQty: number; salesValue: number }
): number {
  // Lógica:
  // - Mucho stock y muchas ventas = Prio 1
  // - Poco stock = Prio baja (para no agotar)
  // - Sin ventas = Prio media

  if (stats.stock <= 0) return 5;

  let score = 3; // Base

  if (stats.salesQty > 50) score -= 1;
  if (stats.salesQty > 100) score -= 1;

  if (stats.stock > 200) score -= 1;

  if (stats.salesValue > 1000) score -= 1;

  return Math.max(1, Math.min(5, score));
}
