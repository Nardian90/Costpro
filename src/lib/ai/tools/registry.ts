import { SupabaseClient } from '@supabase/supabase-js';
import { getViewDetails } from '@/config/viewRegistry';
import { TOOLS } from "./definitions";
import { z } from 'zod';
import { logSystemHealth } from '../../observability/system-health';

export interface ToolHandlerContext {
  supabase: SupabaseClient;
  userId: string;
  userRole: string;
  storeId: string;
}

// Validation Schemas
const schemas = {
  run_system_health_check: z.object({
    viewIds: z.array(z.string()).optional()
  }),
  get_cost_summary: z.object({
    storeId: z.string().min(1).optional()
  }),
  open_view: z.object({
    viewId: z.string().min(1),
    params: z.record(z.string(), z.any()).optional()
  }),
  explain_view: z.object({
    viewId: z.string().optional()
  }),
  search_entity: z.object({
    entity: z.enum(["product", "costSheet", "transaction", "supply"]),
    query: z.string().min(1),
    filters: z.record(z.string(), z.any()).optional()
  }),
  fill_form: z.object({
    formName: z.string().min(1),
    data: z.record(z.string(), z.any())
  }),
  submit_form: z.object({
    formName: z.string().min(1),
    data: z.record(z.string(), z.any())
  }),
  set_ui_mode: z.object({
    mode: z.enum(["standard", "expert"])
  }),
  export_document: z.object({
    type: z.enum(["pdf", "excel"]),
    entityType: z.string().min(1),
    entityId: z.string().min(1)
  })
};

export const toolHandlers: Record<string, (args: any, context: ToolHandlerContext) => Promise<any>> = {
  get_cost_summary: async ({ storeId }, { supabase, storeId: ctxStoreId }) => {
    // FIX-BOTCHAT-COST: Real implementation of get_cost_summary tool.
    // Previously the AI hallucinated this tool name; now it actually exists.
    // Uses storeId from args or falls back to context storeId.
    const targetStoreId = storeId || ctxStoreId;
    if (!targetStoreId) {
      return { error: 'No se pudo determinar la tienda. Especifica storeId o usa el chat desde una tienda activa.' };
    }

    // 1. Count products and those with a cost sheet
    const { count: totalProducts, error: productsErr } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('store_id', targetStoreId)
      .is('deleted_at', null);

    if (productsErr) {
      return { error: `Error al contar productos: ${productsErr.message}` };
    }

    // 2. Aggregate cost sheets: count, average cost_price, sum of cost_price
    const { data: costAgg, error: costErr } = await supabase
      .from('product_cost_sheets')
      .select('cost_price')
      .eq('store_id', targetStoreId)
      .is('deleted_at', null);

    if (costErr) {
      return { error: `Error al leer fichas de costo: ${costErr.message}` };
    }

    const costSheets = costAgg || [];
    const costSheetCount = costSheets.length;
    const totalCost = costSheets.reduce((sum, cs: any) => sum + Number(cs.cost_price || 0), 0);
    const avgCost = costSheetCount > 0 ? totalCost / costSheetCount : 0;

    return {
      success: true,
      storeId: targetStoreId,
      summary: {
        total_products: totalProducts ?? 0,
        products_with_cost_sheet: costSheetCount,
        products_without_cost_sheet: Math.max(0, (totalProducts ?? 0) - costSheetCount),
        avg_cost_price: Math.round(avgCost * 100) / 100,
        total_inventory_cost: Math.round(totalCost * 100) / 100,
        coverage_pct: totalProducts && totalProducts > 0
          ? Math.round((costSheetCount / totalProducts) * 10000) / 100
          : 0,
      },
      message: `Resumen de costos: ${costSheetCount} fichas activas de ${totalProducts ?? 0} productos (${totalProducts && totalProducts > 0 ? Math.round((costSheetCount / totalProducts) * 100) : 0}% cobertura). Costo unitario promedio: $${avgCost.toFixed(2)}. Costo total del inventario: $${totalCost.toFixed(2)}.`,
    };
  },

  run_system_health_check: async ({ viewIds }, context) => {
    // Note: In a real environment, we would trigger a background job or use an edge function.
    // For this demonstration, we'll simulate the health check logic or provide instructions.
    // However, the AI can call this to start the "System Health Agent" flow.

    return {
      success: true,
      message: "Health check sequence initiated. I am crawling all views and reporting findings to the system_health_logs table.",
      action: {
        type: 'health_check',
        payload: { viewIds }
      }
    };
  },
  open_view: async ({ viewId, params }) => {
    const view = getViewDetails(viewId);
    if (!view) return { error: `Vista '${viewId}' no encontrada.` };
    return {
      success: true,
      action: { type: 'navigation', payload: { route: view.route, viewId, params } },
      message: `Navegando a ${view.description}`
    };
  },

  explain_view: async ({ viewId }) => {
    const view = getViewDetails(viewId);
    if (!view) return { error: `Vista '${viewId}' no encontrada.` };
    return {
      success: true,
      description: view.description,
      availableActions: view.actions
    };
  },

  search_entity: async ({ entity, query, filters }, { supabase, storeId }) => {
    let table = '';
    switch (entity) {
      case 'product': table = 'products'; break;
      case 'costSheet': table = 'cost_sheets'; break;
      case 'supply': table = 'supplies'; break;
      case 'transaction': table = 'transactions'; break;
      default: return { error: 'Entidad no soportada' };
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('store_id', storeId)
      .ilike('name', `%${query.replace(/[%_]/g, '\\$&')}%`) // Basic sanitization
      .limit(5);

    if (error) return { error: error.message };
    return { success: true, results: data };
  },

  fill_form: async ({ formName, data }) => {
    return { success: true, action: { type: 'form_fill', payload: { formName, data } } };
  },

  submit_form: async ({ formName, data }, { supabase, userId }) => {
    // Basic idempotency check: don't submit exact same data twice in short time
    const { data: recent } = await supabase
      .from('audit_logs')
      .select('metadata')
      .eq('user_id', userId)
      .eq('action', 'AI_FORM_SUBMIT_EXEC')
      .gt('created_at', new Date(Date.now() - 30000).toISOString())
      .limit(1);

    if (recent && recent.some(r => JSON.stringify(r.metadata.data) === JSON.stringify(data))) {
       return { error: "Acción duplicada detectada. Por favor, espera un momento." };
    }

    return {
      success: true,
      action: { type: 'form_submit', payload: { formName, data } }
    };
  },

  set_ui_mode: async ({ mode }) => {
    return { success: true, action: { type: 'ui_mode', payload: { mode } } };
  },

  export_document: async ({ type, entityType, entityId }) => {
    return {
      success: true,
      action: { type: 'export', payload: { type, entityType, entityId } },
      message: `Generando archivo ${type.toUpperCase()} para ${entityType}...`
    };
  }
};

export async function executeTool(name: string, args: any, context: ToolHandlerContext) {
  const toolDef = TOOLS.find(t => t.name === name);
  if (!toolDef) {
    return { error: `Herramienta '${name}' no definida en el sistema.` };
  }

  // RBAC Validation
  if (toolDef.allowedRoles && !toolDef.allowedRoles.includes(context.userRole)) {
    return {
      error: `Acceso denegado: El rol '${context.userRole}' no tiene permiso para ejecutar la acción '${name}'.`
    };
  }

  // Parameter Validation
  const schema = (schemas as any)[name];
  if (schema) {
    const result = schema.safeParse(args);
    if (!result.success) {
      return { error: `Argumentos inválidos para '${name}': ${result.error.message}` };
    }
    args = result.data;
  }

  const handler = toolHandlers[name];
  if (!handler) {
    return { error: `Herramienta '${name}' no implementada.` };
  }

  try {
    return await handler(args, context);
  } catch (err: any) {
    return { error: err.message };
  }
}
