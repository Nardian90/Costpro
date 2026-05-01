import { PaymentMethod, TaxConfiguration } from "@/types";

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
}

// ── Main POSCart Props ─────────────────────────────────────

export interface POSCartProps {
  items: PosCartItem[];
  onRemoveItem: (productId: string, variantId: string | null) => void;
  onUpdateQuantity: (
    productId: string,
    variantId: string | null,
    quantity: number,
  ) => void;
  onClearCart: () => void;
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTaxAmount: () => number;
  getTotal: () => number;
  discount: CartDiscount;
  setDiscount: (discount: CartDiscount) => void;
  appliedTaxes: TaxConfiguration[];
  toggleTax: (tax: TaxConfiguration) => void;
  isProcessing: boolean;
  isMobile?: boolean;
  onCheckout: (
    paymentMethod: PaymentMethod,
    discount?: CartDiscount,
  ) => Promise<void>;
  onClose: () => void;
  lastSale?: LastSale;
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
  item: PosCartItem;
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

export interface POSCartSummaryProps {
  items: PosCartItem[];
  getSubtotal: () => number;
  getDiscountAmount: () => number;
  getTotal: () => number;
  discount: CartDiscount;
  prorateGlobalPayment?: (totalCash: number, totalTransfer: number) => void;
  selectedPayment: PaymentMethod;
  onSetSelectedPayment: (method: PaymentMethod) => void;
  isMobile: boolean;
}

export interface POSCartActionsProps {
  isProcessing: boolean;
  itemCount: number;
  selectedPayment: PaymentMethod;
  onSetSelectedPayment: (method: PaymentMethod) => void;
  onCheckout: (
    paymentMethod: PaymentMethod,
    discount?: CartDiscount,
  ) => Promise<void>;
  discount: CartDiscount;
  setDiscount: (discount: CartDiscount) => void;
  showClearConfirm: boolean;
  onSetShowClearConfirm: (show: boolean) => void;
  onClearCart: () => void;
  onClose: () => void;
  showOptions: boolean;
  onSetShowOptions: (show: boolean) => void;
}

export interface POSCartDiscountProps {
  discount: CartDiscount;
  setDiscount: (discount: CartDiscount) => void;
}

export interface SuccessViewProps {
  onGeneratePDF: () => void;
  onShareWhatsApp: () => void;
  onExportAsImage: () => void;
  onClearLastSale?: () => void;
}
