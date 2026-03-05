import { SupabaseClient } from '@supabase/supabase-js';
import { getViewDetails } from '@/config/viewRegistry';

export interface ToolHandlerContext {
  supabase: SupabaseClient;
  userId: string;
  storeId: string;
}

export const toolHandlers: Record<string, (args: any, context: ToolHandlerContext) => Promise<any>> = {
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
      .ilike('name', `%${query}%`)
      .limit(5);

    if (error) return { error: error.message };
    return { success: true, results: data };
  },

  fill_form: async ({ formName, data }) => {
    return { success: true, action: { type: 'form_fill', payload: { formName, data } } };
  },

  submit_form: async ({ formName, data }) => {
    return { success: true, action: { type: 'form_submit', payload: { formName, data } } };
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
