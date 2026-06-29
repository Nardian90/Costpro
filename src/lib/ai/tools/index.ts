/**
 * Vercel AI SDK — Tool definitions.
 */
import { tool } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getViewDetails } from '@/config/viewRegistry';

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  userRole: string;
  storeId: string;
}

const openViewInput = z.object({
  viewId: z.string().describe('ID vista'),
  params: z.record(z.string(), z.any()).optional(),
});

const getProductsInput = z.object({
  query: z.string().optional(),
  limit: z.number().optional().default(5),
});

const executeActionInput = z.object({
  actionName: z.string(),
  parameters: z.record(z.string(), z.any()).optional(),
});

const exportDocumentInput = z.object({
  type: z.enum(['pdf', 'excel']),
  entityType: z.string(),
  entityId: z.string().optional(),
});

const setUiModeInput = z.object({
  mode: z.enum(['standard', 'expert']),
});

const getCostSummaryInput = z.object({
  storeId: z.string().optional(),
});

const getSalesSummaryInput = z.object({
  date: z.string().optional(),
  storeId: z.string().optional(),
});

const submitFormInput = z.object({
  formName: z.string(),
  data: z.record(z.string(), z.any()),
});

const searchEntityInput = z.object({
  entity: z.string(),
  query: z.string(),
  filters: z.record(z.string(), z.any()).optional(),
});

const explainViewInput = z.object({
  viewId: z.string(),
});

const fillFormInput = z.object({
  formName: z.string(),
  data: z.record(z.string(), z.any()),
});

const runHealthCheckInput = z.object({
  viewIds: z.array(z.string()).optional(),
});

export function buildTools(ctx: ToolContext) {
  const { supabase, storeId: ctxStoreId, userRole } = ctx;

  const requireRole = (allowed: string[], toolName: string) => {
    if (!allowed.includes(userRole)) {
      throw new Error(`Acceso denegado: El rol '${userRole}' no tiene permiso para usar '${toolName}'.`);
    }
  };

  return {
    open_view: tool({
      description: 'Navegar a una vista',
      parameters: openViewInput,
      execute: async ({ viewId, params }) => {
        const view = getViewDetails(viewId);
        return { success: true, action: { type: 'navigation', payload: { viewId, params } }, message: `Abriendo ${view?.id || viewId}` };
      },
    }),

    explain_view: tool({
      description: 'Explicar vista',
      parameters: explainViewInput,
      execute: async () => ({ success: true }),
    }),

    fill_form: tool({
      description: 'Llenar formulario',
      parameters: fillFormInput,
      execute: async () => ({ success: true }),
    }),

    get_products: tool({
      description: 'Buscar productos',
      parameters: getProductsInput,
      execute: async ({ query, limit }) => {
        const { data } = await supabase.from('products').select('*').eq('store_id', ctxStoreId).ilike('name', `%${query || ''}%`).limit(limit || 5);
        return { success: true, results: data };
      },
    }),

    execute_action: tool({
      description: 'Ejecutar acción de sistema',
      parameters: executeActionInput,
      execute: async ({ actionName, parameters }) => {
        const ALLOWED_ACTIONS = ['recalculate_costs', 'sync_data', 'refresh_dashboard'];
        if (!ALLOWED_ACTIONS.includes(actionName)) {
          return { error: `Acción '${actionName}' no permitida. Acciones disponibles: ${ALLOWED_ACTIONS.join(', ')}` };
        }
        return { success: true, action: { type: 'system_action', payload: { actionName, parameters } } };
      },
    }),

    export_document: tool({
      description: 'Exportar documento',
      parameters: exportDocumentInput,
      execute: async ({ type, entityType, entityId }) => {
        return { success: true, action: { type: 'export', payload: { type, entityType, entityId } } };
      },
    }),

    set_ui_mode: tool({
      description: 'Cambiar modo UI',
      parameters: setUiModeInput,
      execute: async ({ mode }) => {
        return { success: true, action: { type: 'ui_mode', payload: { mode } } };
      },
    }),

    get_cost_summary: tool({
      description: 'Resumen de costos',
      parameters: getCostSummaryInput,
      execute: async ({ storeId }) => {
        const targetStoreId = storeId || ctxStoreId;
        if (!targetStoreId) return { error: 'No se pudo determinar la tienda' };

        const { data: products } = await supabase.from('products').select('id, cost_price').eq('store_id', targetStoreId).eq('is_active', true);
        const productList = products || [];
        const totalProducts = productList.length;
        const totalInventoryCost = productList.reduce((sum, p: any) => sum + Number(p.cost_price || 0), 0);
        const productsWithCost = productList.filter((p: any) => Number(p.cost_price || 0) > 0).length;
        const avgCost = totalProducts > 0 ? totalInventoryCost / totalProducts : 0;
        const coveragePct = totalProducts > 0 ? (productsWithCost / totalProducts) * 100 : 0;

        return {
          success: true,
          summary: {
            total_products: totalProducts,
            products_with_cost_price: productsWithCost,
            products_without_cost_price: Math.max(0, totalProducts - productsWithCost),
            total_inventory_cost: totalInventoryCost,
            avg_cost_price: avgCost,
            coverage_pct: coveragePct
          }
        };
      },
    }),

    get_sales_summary: tool({
      description: 'Resumen de ventas',
      parameters: getSalesSummaryInput,
      execute: async ({ date, storeId }) => {
        const targetStoreId = storeId || ctxStoreId;
        if (!targetStoreId) return { error: 'No se pudo determinar la tienda' };

        const targetDate = !date || date === 'today' ? new Date().toISOString().slice(0, 10) : date;
        const { data: txns } = await supabase.from('transactions').select('id, total_amount, payment_method, created_at').eq('store_id', targetStoreId).eq('status', 'completed').gte('created_at', `${targetDate}T00:00:00`).lt('created_at', `${targetDate}T23:59:59.999`);
        const sales = txns || [];
        const totalAmount = sales.reduce((sum, t: any) => sum + Number(t.total_amount || 0), 0);
        const byPaymentMethod: Record<string, { total: number }> = {};
        for (const s of sales) {
          const pm = (s as any).payment_method || 'unknown';
          if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { total: 0 };
          byPaymentMethod[pm].total += Number((s as any).total_amount || 0);
        }

        return {
          success: true,
          date: targetDate,
          summary: {
            total_transactions: sales.length,
            total_amount: totalAmount,
            by_payment_method: byPaymentMethod
          }
        };
      },
    }),

    submit_form: tool({
      description: 'Enviar formulario',
      parameters: submitFormInput,
      execute: async ({ formName, data }) => {
        requireRole(['admin', 'manager'], 'submit_form');
        return { success: true, message: `Formulario ${formName} enviado` };
      },
    }),

    search_entity: tool({
      description: 'Buscar entidad',
      parameters: searchEntityInput,
      execute: async ({ entity, query, filters }) => {
        const sanitized = query.replace(/[%_]/g, '\\$&');
        const { data } = await supabase.from(entity + 's' as any).select('name').ilike('name', `%${sanitized}%`).limit(5);
        return { success: true, results: data || [] };
      },
    }),

    run_system_health_check: tool({
      description: 'Check salud sistema',
      parameters: runHealthCheckInput,
      execute: async () => ({ success: true }),
    }),
  };
}

export function getAvailableToolNames(userRole: string): string[] {
  return ['open_view', 'explain_view', 'fill_form', 'get_products', 'execute_action', 'export_document', 'set_ui_mode', 'get_cost_summary', 'get_sales_summary', 'submit_form', 'search_entity', 'run_system_health_check'];
}
