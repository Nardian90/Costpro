import { supabase } from '@/lib/supabaseClient';
import { getSupabaseAdminSafe as getAdminClientSync } from '@/lib/supabase-admin';

// FIX-AUDIT-RLS: Server-side audit methods must use admin client to bypass RLS,
// since the anon key client has no authenticated user context in API routes.

export const auditService = {
  /**
   * Logs an event when a product is billed without a price (0 or NULL).
   */
  async logInvoiceWithoutPrice(userId: string, productId: string, storeId: string) {
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
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

  // ============================================
  // FC Automatizada — Audit Methods (Res. 148/2023)
  // ============================================

  /**
   * Logs when a store FC template is created or updated.
   * Regulatory: FC templates determine how Fichas de Costo are generated.
   */
  async logFCTemplateUpdated(params: {
    userId: string;
    storeId: string;
    templateId: string;
    modalidad: string;
    isActive: boolean;
  }): Promise<void> {
    // FIX-AUDIT-RLS: Use admin client for server-side calls
    const client = await (getAdminClientSync() ?? supabase);
    const { error } = await client.from('audit_logs').insert({
      user_id: params.userId,
      action: 'fc_template_updated',
      table_name: 'store_cost_templates',
      record_id: params.storeId,
      store_id: params.storeId,
      metadata: {
        template_id: params.templateId,
        modalidad: params.modalidad,
        is_active: params.isActive,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logFCTemplateUpdated failed:', error);
  },

  /**
   * Logs when a product FC is generated or auto-generated.
   * Regulatory: Required by Res. 148/2023 for financial traceability.
   */
  async logFCGenerated(params: {
    userId: string;
    productId: string;
    storeId: string;
    templateId: string;
    costPrice: number;
    salePrice: number;
    isAutoGenerated: boolean;
  }): Promise<void> {
    // FIX-AUDIT-RLS: Use admin client for server-side calls
    const client = await (getAdminClientSync() ?? supabase);
    const { error } = await client.from('audit_logs').insert({
      user_id: params.userId,
      action: params.isAutoGenerated ? 'fc_auto_generated' : 'fc_generated',
      table_name: 'product_cost_sheets',
      record_id: params.productId,
      store_id: params.storeId,
      metadata: {
        product_id: params.productId,
        template_id: params.templateId,
        cost_price: params.costPrice,
        sale_price: params.salePrice,
        margin: params.salePrice - params.costPrice,
        auto_generated: params.isAutoGenerated,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logFCGenerated failed:', error);
  },

  /**
   * Logs when a FC PDF is exported.
   * Regulatory: Tracks access to financial documents.
   */
  async logFCPdfExported(params: {
    userId: string;
    productId: string;
    storeId: string;
    pdfFormat: string;
  }): Promise<void> {
    // FIX-AUDIT-RLS: Use admin client for server-side calls
    const client = await (getAdminClientSync() ?? supabase);
    const { error } = await client.from('audit_logs').insert({
      user_id: params.userId,
      action: 'fc_pdf_exported',
      table_name: 'product_cost_sheets',
      record_id: params.productId,
      store_id: params.storeId,
      metadata: {
        product_id: params.productId,
        pdf_format: params.pdfFormat,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logFCPdfExported failed:', error);
  },

  /**
   * Q2 (Audit-Fix): Logs when a cash closure is finalized.
   * Regulatory: Tracks reconciliation between declared and system totals.
   */
  async logCashClosureFinalized(params: {
    userId: string;
    closureId: string;
    storeId: string;
    declaredCash: number;
    declaredVouchers: number;
    systemExpectedTotal: number;
    difference: number;
    status: string;
  }) {
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
      action: 'cash_closure_finalized',
      table_name: 'cash_closures',
      record_id: params.closureId,
      store_id: params.storeId,
      user_id: params.userId,
      metadata: {
        declared_cash: params.declaredCash,
        declared_vouchers: params.declaredVouchers,
        system_expected_total: params.systemExpectedTotal,
        difference: params.difference,
        status: params.status,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logCashClosureFinalized failed:', error);
  },

  /**
   * M7 (Audit-Fix): Logs when a sale is voided.
   */
  async logSaleVoided(params: {
    userId: string;
    transactionId: string;
    storeId: string;
    reason: string;
    oldStatus?: string;
  }) {
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
      action: 'sale_voided',
      table_name: 'transactions',
      record_id: params.transactionId,
      store_id: params.storeId,
      user_id: params.userId,
      metadata: {
        reason: params.reason,
        old_status: params.oldStatus,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logSaleVoided failed:', error);
  },

  /**
   * M7 (Audit-Fix): Logs when stock is adjusted.
   */
  async logStockAdjustment(params: {
    userId: string;
    productId: string;
    storeId: string;
    oldStock: number;
    newStock: number;
    reason: string;
  }) {
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
      action: 'stock_adjustment',
      table_name: 'products',
      record_id: params.productId,
      store_id: params.storeId,
      user_id: params.userId,
      metadata: {
        old_stock: params.oldStock,
        new_stock: params.newStock,
        difference: params.newStock - params.oldStock,
        reason: params.reason,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logStockAdjustment failed:', error);
  },

  /**
   * M7 (Audit-Fix): Logs when a product price is changed.
   */
  async logPriceChange(params: {
    userId: string;
    productId: string;
    storeId: string;
    oldPrice: number;
    newPrice: number;
    oldCost?: number;
    newCost?: number;
  }) {
    const { error } = await (getAdminClientSync() ?? supabase).from('audit_logs').insert({
      action: 'price_change',
      table_name: 'products',
      record_id: params.productId,
      store_id: params.storeId,
      user_id: params.userId,
      metadata: {
        old_price: params.oldPrice,
        new_price: params.newPrice,
        old_cost: params.oldCost,
        new_cost: params.newCost,
        price_diff: params.newPrice - params.oldPrice,
        timestamp: new Date().toISOString(),
      },
    });
    if (error) console.error('[AuditService] logPriceChange failed:', error);
  },
};
