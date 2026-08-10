import { Product, ProductVariant, PaymentMethod } from '@/types';

// ── Types ──────────────────────────────────────────────────────

export interface SalesCatalogRow {
  product: Product;
  selectedVariantId: string | null;
  selectedVariant: ProductVariant | null;
  quantity: number;
  price: number;
  cost: number;
  discountType: 'percentage' | 'fixed' | null;
  discountValue: number;
  paymentMethod: PaymentMethod;
  cashPaid: number;
  transferPaid: number;
  // PR-4.4D: nuevas columnas para soporte de importación histórica
  zellePaid: number;            // Zelle en CUP (incluye USD convertido si aplica)
  usdOriginal: number;          // USD original del Excel (trazabilidad)
  usdExchangeRate: number;      // Tasa USD→CUP usada (default 680)
  commission: number;           // Comisión informativa (no altera total)
  operationDate: string | null; // Fecha histórica ISO (null = usar NOW())
  documentNumber: string | null;// Documento para agrupar items en 1 venta
  priceDiffersFromCatalog: boolean; // WARNING: precio histórico ≠ catálogo
}

export type StockFilter =
  | 'all'
  | 'in_stock'
  | 'out_of_stock'
  | 'with_movements'
  | 'with_quantity'
  | 'without_quantity';
export type ViewMode = 'table' | 'card';
export type SortConfig = { key: string; direction: 'asc' | 'desc' } | null;

// ── Helpers ───────────────────────────────────────────────────

export const calcSubtotal = (row: SalesCatalogRow): number => {
  const base = row.price * row.quantity;
  if (!row.discountType || row.discountValue <= 0) return base;
  if (row.discountType === 'percentage') return base * (1 - row.discountValue / 100);
  return Math.max(0, (row.price - row.discountValue) * row.quantity);
};

// PR-4.4D: total pagado = cash + transfer + zelle (incluye USD convertido)
export const calcTotalPaid = (row: SalesCatalogRow): number => {
  return (row.cashPaid || 0) + (row.transferPaid || 0) + (row.zellePaid || 0);
};

// PR-4.4D: zelle total = zelle directo + USD convertido
export const calcZelleTotal = (row: SalesCatalogRow): number => {
  const usdConverted = (row.usdOriginal || 0) * (row.usdExchangeRate || 680);
  return (row.zellePaid || 0) + usdConverted;
};

// PR-4.4D: valida que el pago total coincida con el subtotal
export const hasPaymentMismatch = (row: SalesCatalogRow): boolean => {
  if (row.quantity <= 0) return false;
  const sub = calcSubtotal(row);
  const paid = calcTotalPaid(row);
  return Math.abs(paid - sub) > 0.01;
};

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; icon: null }[] = [
  { value: 'cash', label: 'Efectivo', icon: null },
  { value: 'transfer', label: 'Transf.', icon: null },
  { value: 'zelle', label: 'Zelle', icon: null },
  { value: 'mixed', label: 'Mixto', icon: null },
];

export const hasAnyMixedPayment = (rows: Map<string, SalesCatalogRow>): boolean => {
  let found = false;
  rows.forEach((r) => {
    if (r.quantity > 0 && r.paymentMethod === 'mixed') found = true;
  });
  return found;
};

export const hasDiscrepancy = (row: SalesCatalogRow): boolean => {
  // PR-4.4D: usa calcTotalPaid que incluye zelle
  if (row.quantity <= 0 || row.paymentMethod !== 'mixed') return false;
  return Math.abs(calcTotalPaid(row) - calcSubtotal(row)) > 0.01;
};

export const autoAssignPayment = (r: SalesCatalogRow): SalesCatalogRow => {
  const sub = calcSubtotal(r);
  switch (r.paymentMethod) {
    case 'cash':
      return { ...r, cashPaid: sub, transferPaid: 0, zellePaid: 0 };
    case 'transfer':
      return { ...r, cashPaid: 0, transferPaid: sub, zellePaid: 0 };
    case 'zelle':
      return { ...r, cashPaid: 0, transferPaid: 0, zellePaid: sub };
    case 'mixed':
    default:
      return r;
  }
};

// ── Sort comparator ───────────────────────────────────────────

export const compareFn = (a: Product, b: Product, config: SortConfig): number => {
  if (!config) return 0;
  const { key, direction } = config;
  const mult = direction === 'asc' ? 1 : -1;

  switch (key) {
    case 'name':
      return mult * a.name.localeCompare(b.name);
    case 'sku':
      return mult * (a.sku || '').localeCompare(b.sku || '');
    case 'stock':
      return mult * ((a.stock_current ?? 0) - (b.stock_current ?? 0));
    case 'cost':
      return mult * ((a.cost_price || 0) - (b.cost_price || 0));
    case 'price':
      return mult * ((a.price || 0) - (b.price || 0));
    default:
      return 0;
  }
};
