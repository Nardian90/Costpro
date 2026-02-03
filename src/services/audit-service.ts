import { supabase } from '@/lib/supabaseClient';

export const auditService = {
  /**
   * Logs an event when a product is billed without a price (0 or NULL).
   */
  async logInvoiceWithoutPrice(userId: string, productId: string, storeId: string) {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'invoice_without_price',
      table_name: 'transactions',
      record_id: productId,
      store_id: storeId,
      metadata: {
        product_id: productId,
        timestamp: new Date().toISOString(),
        warning: 'Invoice created for product with 0 or NULL price'
      }
    });

    if (error) {
      console.error('[AuditService] Error logging invoice_without_price:', error);
      // We don't throw here to avoid blocking the main flow if auditing fails
    }
  },

  /**
   * Logs an event when a product is sold below its cost.
   */
  async logSaleBelowCost(userId: string, productId: string, storeId: string, price: number, cost: number) {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action: 'sale_below_cost',
      table_name: 'transactions',
      record_id: productId,
      store_id: storeId,
      metadata: {
        product_id: productId,
        price,
        cost,
        margin: price - cost,
        timestamp: new Date().toISOString(),
        warning: 'Product sold with negative margin'
      }
    });

    if (error) {
      console.error('[AuditService] Error logging invoice_without_price:', error);
      // We don't throw here to avoid blocking the main flow if auditing fails
    }
  }
};
