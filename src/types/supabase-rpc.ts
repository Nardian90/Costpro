import { Product, ProductVariant, UserRole } from "./index";

export interface GetProductsForPosResponse extends Product {
  product_variants: ProductVariant[] | null;
}

export interface DashboardKpiResponse {
  total_sales: number;
  total_cost: number;
  total_profit: number;
  transaction_count: number;
  avg_ticket: number;
  total_cash: number;
  total_card: number;
}

export interface CreateSaleParams {
  p_store_id: string | null;
  p_seller_id: string;
  p_payment_method: string;
  p_total_amount: number;
  p_subtotal: number;
  p_discount_type: string;
  p_discount_value: number;
  p_items: {
    product_id: string;
    variant_id: string | null;
    quantity: number;
    price: number;
    cost: number;
  }[];
}
