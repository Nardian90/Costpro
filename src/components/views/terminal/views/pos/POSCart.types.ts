import { PaymentMethod, TaxConfiguration } from "@/types";
import { CartItem } from "@/store/cart";

// ── Cart Item ──────────────────────────────────────────────

export interface PosCartItemProduct {
  name: string;
  stock_current: number;
  public_image_url?: string;
  image_url?: string;
}

export interface PosCartItemVariant {
  name: string;
}

export interface PosCartItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
  price: number;
  subtotal: number;
  product: PosCartItemProduct;
  variant: PosCartItemVariant | null;
  discount_type: "percentage" | "fixed" | null;
  discount_value: number;
  cash_paid: number;
  transfer_paid: number;
}

// ── Discount ───────────────────────────────────────────────

export type CartDiscount = {
  type: "fixed" | "percentage";
  value: number;
} | null;

// ── Last Sale ──────────────────────────────────────────────

export interface SaleItem {
  product: { name: string };
  quantity: number;
  price: number;
  subtotal: number;
}

export interface LastSale {
  id: string;
  date: string;
  items: SaleItem[];
  subtotal: number;
  discount: { type: "fixed" | "percentage"; value: number } | null;
  total: number;
  paymentMethod: string;
  // POS-3b audit P0.1: cliente asociado a la venta (si aplica).
  customerName?: string;
  customerId?: string | null;
}

// ── Main POSCart Props ─────────────────────────────────────

export interface POSCartProps {
  items: CartItem[];
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onUpdateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
  ) => void;
  onClearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount?: () => number;
  getTotal: () => number;
  discount: CartDiscount;
  setDiscount: (discount: CartDiscount) => void;
  // Note: appliedTaxes & toggleTax are reserved for future tax integration
  appliedTaxes?: TaxConfiguration[];
  toggleTax?: (tax: TaxConfiguration) => void;
  isProcessing: boolean;
  isMobile?: boolean;
  onCheckout: (
    paymentMethod: PaymentMethod,
    discount?: CartDiscount,
  ) => Promise<void>;
  onClose: () => void;
  lastSale?: LastSale | null;
  onClearLastSale?: () => void;
  updateItemDiscount?: (
    productId: string,
    variantId: string | null,
    type: "percentage" | "fixed" | null,
    value: number,
  ) => void;
  updateItemPayment?: (
    productId: string,
    variantId: string | null,
    cashPaid: number,
    transferPaid: number,
  ) => void;
  prorateGlobalPayment?: (totalCash: number, totalTransfer: number) => void;
}

// ── Sub-component Props ────────────────────────────────────

export interface POSCartItemProps {
  item: CartItem;
  isEasyReading: boolean;
  onUpdateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
  ) => void;
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onViewImage: (url: string, name: string) => void;
  updateItemDiscount?: (
    productId: string,
    variantId: string | null,
    type: "percentage" | "fixed" | null,
    value: number,
  ) => void;
  updateItemPayment?: (
    productId: string,
    variantId: string | null,
    cashPaid: number,
    transferPaid: number,
  ) => void;
}

// POS-3b audit P1.1: POSCartSummaryProps y POSCartActionsProps eliminados.
// Sus componentes (POSCartSummary.tsx, POSCartActions.tsx) fueron reemplazados
// por POSCartCheckoutPanel.tsx y eliminados por ser huérfanos.

export interface POSCartDiscountProps {
  discount: CartDiscount;
  setDiscount: (discount: CartDiscount) => void;
}

export interface POSCartSuccessViewProps {
  onGeneratePDF: () => void;
  onShareWhatsApp: () => void;
  onExportAsImage: () => void;
  onClearLastSale?: () => void;
}
