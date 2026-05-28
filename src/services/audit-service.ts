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
      console.error('[AuditService] Error logging sale_below_cost:', error);
      // We don't throw here to avoid blocking the main flow if auditing fails
    }
  },

  async logTransferCreated(params: {
    userId: string;
    transferId: string;
    originStoreId: string;
    destinationStoreId: string;
    items: Array<{ productId: string; quantity: number; unitCost: number }>;
  }): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: 'transfer_created',
      table_name: 'transfers',
      record_id: params.transferId,
      store_id: params.originStoreId,
      metadata: {
        transfer_id: params.transferId,
        origin_store_id: params.originStoreId,
        destination_store_id: params.destinationStoreId,
        items_count: params.items.length,
        total_units: params.items.reduce((s, i) => s + i.quantity, 0),
        items: params.items,
        created_at: new Date().toISOString()
      }
    });
    if (error) console.error('[AuditService] logTransferCreated failed:', error);
  },

  async logTransferConfirmed(params: {
    userId: string;
    transferId: string;
    originStoreId: string;
    destinationStoreId: string;
    items: Array<{ productId: string; quantity: number; unitCost: number }>;
  }): Promise<void> {
    const totalUnits = params.items.reduce((s, i) => s + i.quantity, 0);
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: 'transfer_confirmed',
      table_name: 'transfers',
      record_id: params.transferId,
      store_id: params.destinationStoreId,
      metadata: {
        transfer_id: params.transferId,
        origin_store_id: params.originStoreId,
        destination_store_id: params.destinationStoreId,
        total_units_moved: totalUnits,
        items: params.items,
        confirmed_at: new Date().toISOString()
      }
    });
    if (error) console.error('[AuditService] logTransferConfirmed failed:', error);
  },

  async logTransferCancelled(params: {
    userId: string;
    transferId: string;
    storeId: string;
    reason?: string;
  }): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: 'transfer_cancelled',
      table_name: 'transfers',
      record_id: params.transferId,
      store_id: params.storeId,
      metadata: {
        transfer_id: params.transferId,
        reason: params.reason || 'Cancelled by user',
        cancelled_at: new Date().toISOString()
      }
    });
    if (error) console.error('[AuditService] logTransferCancelled failed:', error);
  },

  async logReceptionVoided(params: {
    userId: string;
    receiptId: string;
    storeId: string;
    reason?: string;
  }): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: 'reception_voided',
      table_name: 'receipts',
      record_id: params.receiptId,
      store_id: params.storeId,
      metadata: {
        receipt_id: params.receiptId,
        reason: params.reason || 'Anulada manualmente',
        voided_at: new Date().toISOString()
      }
    });
    if (error) console.error('[AuditService] logReceptionVoided failed:', error);
  },

  async logReceptionCreated(params: {
    userId: string;
    receiptId: string;
    storeId: string;
    supplier: string;
    invoiceNumber: string;
    itemCount: number;
    totalCost: number;
    autoCreatedSkus: string[];
    priceUpdatedSkus: string[];
  }): Promise<void> {
    const { error } = await supabase.from('audit_logs').insert({
      user_id: params.userId,
      action: 'reception_created',
      table_name: 'receipts',
      record_id: params.receiptId,
      store_id: params.storeId,
      metadata: {
        receipt_id: params.receiptId,
        supplier: params.supplier,
        invoice_number: params.invoiceNumber,
        items_count: params.itemCount,
        total_cost: params.totalCost,
        auto_created_products: params.autoCreatedSkus,
        price_updated_products: params.priceUpdatedSkus,
        created_at: new Date().toISOString()
      }
    });
    if (error) console.error('[AuditService] logReceptionCreated failed:', error);
  },
};
