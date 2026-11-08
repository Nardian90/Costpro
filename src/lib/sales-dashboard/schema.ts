/**
 * COSTPRO-SALES-DASHBOARD-001 · Contrato del RPC get_sales_dashboard_analytics
 * Espejo tipado de la salida del RPC (migración 20261108141000).
 * Los importes *_cup son CUP contables; *_usd son importes REALES en USD.
 */
import { z } from 'zod';

export const dashboardKpiSchema = z.object({
  ops: z.number(),
  gross_cup: z.number(),
  discounts_cup: z.number(),
  taxes_cup: z.number(),
  net_cup: z.number(),
  devolutions_cup: z.number(),
  devolutions_usd: z.number(),
  collected_usd: z.number(),
  collected_cup_equiv: z.number(),
  avg_ticket_cup: z.number(),
  units_sold: z.number(),
  units_returned: z.number(),
  prev: z.object({
    ops: z.number(),
    gross_cup: z.number(),
    discounts_cup: z.number(),
    net_cup: z.number(),
    devolutions_cup: z.number(),
    devolutions_usd: z.number(),
    collected_usd: z.number(),
    avg_ticket_cup: z.number(),
  }),
});

export const dashboardSeriesPointSchema = z.object({
  bucket: z.string(),
  ops: z.number(),
  gross_cup: z.number(),
  net_cup: z.number(),
  discounts_cup: z.number(),
});

export const dashboardSellerSchema = z.object({
  seller_id: z.string().nullable(),
  name: z.string(),
  ops: z.number(),
  gross_cup: z.number(),
  discounts_cup: z.number(),
  devolutions_cup: z.number(),
  net_cup: z.number(),
  avg_ticket_cup: z.number(),
  participation_pct: z.number(),
});

/** REFINEMENT-002 §3.2: rendimiento por tienda (mismos indicadores que sellers + unidades + variación). */
export const dashboardStoreSchema = z.object({
  store_id: z.string(),
  name: z.string(),
  ops: z.number(),
  gross_cup: z.number(),
  discounts_cup: z.number(),
  devolutions_cup: z.number(),
  net_cup: z.number(),
  avg_ticket_cup: z.number(),
  units_sold: z.number(),
  participation_pct: z.number(),
  /** Variación % de netas vs período anterior; null = sin base previa. */
  net_change_pct: z.number().nullable(),
});

/** REFINEMENT-002 §4: evolución por tienda (bucket × tienda). */
export const dashboardStoreSeriesPointSchema = z.object({
  bucket: z.string(),
  store_id: z.string(),
  ops: z.number(),
  net_cup: z.number(),
});

/** REFINEMENT-002: tiendas accesibles al usuario (fuente: current_user_store_ids()). */
export const accessibleStoreSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const dashboardProductSchema = z.object({
  product_id: z.string().nullable(),
  name: z.string().nullable(),
  sku: z.string().nullable(),
  units_sold: z.number(),
  units_returned: z.number().optional(),
  net_cup: z.number().optional(),
  participation_pct: z.number().optional(),
});

export const dashboardResponseSchema = z.object({
  period: z.object({
    from: z.string(),
    to: z.string(),
    granularity: z.string(),
    prev_from: z.string().nullable(),
    prev_to: z.string().nullable(),
  }),
  kpi: dashboardKpiSchema,
  series: z.array(dashboardSeriesPointSchema),
  sellers: z.array(dashboardSellerSchema),
  stores: z.array(dashboardStoreSchema).optional().default([]),
  stores_series: z.array(dashboardStoreSeriesPointSchema).optional().default([]),
  accessible_stores: z.array(accessibleStoreSchema).optional().default([]),
  products: z.object({
    top_net: z.array(dashboardProductSchema),
    top_units: z.array(dashboardProductSchema),
    low_movement: z.array(dashboardProductSchema),
    total_net_cup: z.number(),
  }),
  payment_methods: z.object({
    by_document: z.array(z.object({
      method: z.string(), ops: z.number(), amount_cup: z.number(),
    })),
    by_collection: z.array(z.object({
      method: z.string(), currency: z.string(), ops: z.number(), amount: z.number(),
    })),
  }),
  heatmap: z.array(z.object({
    dow: z.number(), hour: z.number(), ops: z.number(), net_cup: z.number(),
  })),
  alerts: z.object({
    doc_status: z.array(z.object({
      status: z.string(), ops: z.number(), amount_cup: z.number(),
    })),
    devolutions_count: z.number(),
    devolutions_cup: z.number(),
    devolutions_usd: z.number(),
    incident_sales: z.number(),
    sync_log: z.array(z.object({ status: z.string(), ops: z.number() })),
    unreconciled_ops: z.number(),
    unreconciled_diff_cup: z.number(),
  }),
});

export type SalesDashboardResponse = z.infer<typeof dashboardResponseSchema>;
export type DashboardSeller = z.infer<typeof dashboardSellerSchema>;
export type DashboardProduct = z.infer<typeof dashboardProductSchema>;
export type DashboardSeriesPoint = z.infer<typeof dashboardSeriesPointSchema>;
export type DashboardStore = z.infer<typeof dashboardStoreSchema>;
export type DashboardStoreSeriesPoint = z.infer<typeof dashboardStoreSeriesPointSchema>;
export type AccessibleStore = z.infer<typeof accessibleStoreSchema>;

/** Detalle por producto (drill-down) */
export const productDetailRowSchema = z.object({
  transaction_id: z.string(),
  completed_at: z.string(),
  seller_name: z.string().nullable(),
  total_amount: z.number(),
  quantity: z.number(),
  line_net_cup: z.number(),
});
export type ProductDetailRow = z.infer<typeof productDetailRowSchema>;

/** Snapshot de la cola offline local (alertas de sincronización). */
export interface LocalSyncSnapshot {
  pending: number;
  conflict: number;
}

/** Metodos de pago → etiquetas (coincide con getPaymentMethodInfo del historial). */
export function paymentMethodLabel(m: string): string {
  switch ((m || '').toLowerCase()) {
    case 'cash': return 'Efectivo';
    case 'card': return 'Tarjeta';
    case 'transfer': return 'Transferencia';
    case 'mixed': return 'Mixto';
    case 'wallet': return 'Billetera';
    case 'zelle': return 'Zelle (USD)';
    case 'other': return 'Otro';
    default: return 'Sin especificar';
  }
}

/** Estados de documento → etiquetas de alerta. */
export function docStatusLabel(s: string): { label: string; severity: 'info' | 'warning' | 'conflict' | 'error' } {
  switch (s) {
    case 'pending': return { label: 'Pendientes de sincronización', severity: 'info' };
    case 'voided': return { label: 'Anuladas', severity: 'warning' };
    case 'reversed': return { label: 'Revertidas', severity: 'warning' };
    case 'failed': return { label: 'Fallidas', severity: 'error' };
    case 'cancelled': return { label: 'Canceladas', severity: 'warning' };
    case 'compensated': return { label: 'Compensadas', severity: 'warning' };
    case 'refunded': return { label: 'Reembolsadas', severity: 'warning' };
    default: return { label: s, severity: 'info' };
  }
}
