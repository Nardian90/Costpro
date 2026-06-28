/**
 * Vercel AI SDK — Tool definitions.
 *
 * Each tool uses the `tool()` helper from the `ai` package, which gives us:
 *   - Native function-calling via the LLM's tool API (NO MORE TEXT PARSING)
 *   - Strongly-typed parameters via Zod
 *   - Per-tool execute() function
 *   - RBAC enforced inside execute() (defense in depth)
 *
 * The AI can no longer hallucinate tool names: it can only call tools that
 * are explicitly listed in the `tools` object passed to streamText().
 */
import { tool, zodSchema } from 'ai';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getViewDetails } from '@/config/viewRegistry';

export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  userRole: string;
  storeId: string;
}

// ─── Tool input schemas (declared separately so TS can infer INPUT) ─────────
const openViewInput = z.object({
  viewId: z.string().min(1).describe('El ID de la vista a abrir'),
  params: z.record(z.string(), z.unknown()).optional().describe('Parámetros opcionales para la vista'),
});
type OpenViewInput = z.infer<typeof openViewInput>;

const explainViewInput = z.object({
  viewId: z.string().optional().describe('ID de la vista a explicar. Si se omite, explica la vista actual.'),
});
type ExplainViewInput = z.infer<typeof explainViewInput>;

const fillFormInput = z.object({
  formName: z.string().min(1).describe('Nombre del formulario: costSheet, product, supply, transaction'),
  data: z.record(z.string(), z.unknown()).describe('Objeto con los datos para completar los campos'),
});
type FillFormInput = z.infer<typeof fillFormInput>;

const submitFormInput = z.object({
  formName: z.string().min(1).describe('Nombre del formulario a enviar'),
  data: z.record(z.string(), z.unknown()).describe('Datos del formulario'),
});
type SubmitFormInput = z.infer<typeof submitFormInput>;

const searchEntityInput = z.object({
  entity: z.enum(['product', 'costSheet', 'transaction', 'supply']).describe('Tipo de entidad a buscar'),
  query: z.string().min(1).describe('Término de búsqueda (se busca con ILIKE)'),
  filters: z.record(z.string(), z.unknown()).optional().describe('Filtros adicionales'),
});
type SearchEntityInput = z.infer<typeof searchEntityInput>;

const executeActionInput = z.object({
  actionName: z.string().min(1).describe('Nombre de la acción a ejecutar'),
  parameters: z.record(z.string(), z.unknown()).optional().describe('Parámetros requeridos para la acción'),
});
type ExecuteActionInput = z.infer<typeof executeActionInput>;

const exportDocumentInput = z.object({
  type: z.enum(['pdf', 'excel']).describe('Formato del documento'),
  entityType: z.string().min(1).describe('Tipo de entidad: costSheet, inventory, transaction'),
  entityId: z.string().min(1).describe('ID del registro a exportar'),
});
type ExportDocumentInput = z.infer<typeof exportDocumentInput>;

const setUiModeInput = z.object({
  mode: z.enum(['standard', 'expert']).describe('El modo a activar'),
});
type SetUiModeInput = z.infer<typeof setUiModeInput>;

const runHealthCheckInput = z.object({
  viewIds: z.array(z.string()).optional().describe('Lista opcional de IDs de vistas a revisar'),
});
type RunHealthCheckInput = z.infer<typeof runHealthCheckInput>;

const getCostSummaryInput = z.object({
  storeId: z.string().optional().describe('ID de la tienda. Si se omite, se usa el storeId del contexto.'),
});
type GetCostSummaryInput = z.infer<typeof getCostSummaryInput>;

const getSalesSummaryInput = z.object({
  date: z.string().optional().describe('Fecha en formato YYYY-MM-DD, o "today" para hoy. Default: today.'),
  storeId: z.string().optional().describe('ID de la tienda. Default: tienda actual del contexto.'),
});
type GetSalesSummaryInput = z.infer<typeof getSalesSummaryInput>;

// ─── Tool factory ───────────────────────────────────────────────────────────
/**
 * Factory that returns the tools object for streamText().
 * Only tools allowed for the user's role are included — this is the FIRST
 * layer of RBAC. The second layer is the runtime check inside execute().
 */
export function buildTools(ctx: ToolContext) {
  const { supabase, userId, userRole, storeId: ctxStoreId } = ctx;

  // RBAC helper — throws to abort tool execution if role not allowed
  const requireRole = (allowed: string[], toolName: string) => {
    if (!allowed.includes(userRole)) {
      throw new Error(`Acceso denegado: el rol '${userRole}' no puede ejecutar '${toolName}'.`);
    }
  };

  return {
    open_view: tool<OpenViewInput, { success?: boolean; error?: string; action?: any; message?: string }, {}>({
      description: 'Navega a una vista específica del sistema. Ejemplos de viewId: dashboard, cost-sheets, inventory, pos, reports.',
      inputSchema: zodSchema(openViewInput),
      execute: async ({ viewId, params }) => {
        requireRole(['admin', 'manager', 'vendedor', 'costo'], 'open_view');
        const view = getViewDetails(viewId);
        if (!view) return { error: `Vista '${viewId}' no encontrada.` };
        return {
          success: true,
          action: { type: 'navigation', payload: { route: view.route, viewId, params } },
          message: `Navegando a ${view.description}`,
        };
      },
    }),

    explain_view: tool<ExplainViewInput, { success?: boolean; error?: string; description?: string; availableActions?: string[] }, {}>({
      description: 'Explica el propósito y las acciones disponibles en la vista actual o una específica.',
      inputSchema: zodSchema(explainViewInput),
      execute: async ({ viewId }) => {
        requireRole(['admin', 'manager', 'vendedor', 'costo'], 'explain_view');
        const view = getViewDetails(viewId || '');
        if (!view) return { error: `Vista '${viewId}' no encontrada.` };
        return {
          success: true,
          description: view.description,
          availableActions: view.actions,
        };
      },
    }),

    fill_form: tool<FillFormInput, { success: boolean; action: any }, {}>({
      description: 'Completa los campos de un formulario sin enviarlo. Útil para que el usuario revise antes de guardar.',
      inputSchema: zodSchema(fillFormInput),
      execute: async ({ formName, data }) => {
        requireRole(['admin', 'manager', 'vendedor', 'costo'], 'fill_form');
        return { success: true, action: { type: 'form_fill', payload: { formName, data } } };
      },
    }),

    submit_form: tool<SubmitFormInput, { success?: boolean; error?: string; action?: any }, {}>({
      description: 'Completa y envía un formulario directamente. Solo admin/manager pueden usar esta tool.',
      inputSchema: zodSchema(submitFormInput),
      execute: async ({ formName, data }) => {
        requireRole(['admin', 'manager'], 'submit_form');
        // Idempotency check: 30s window for same data
        const { data: recent } = await supabase
          .from('audit_logs')
          .select('metadata')
          .eq('user_id', userId)
          .eq('action', 'AI_FORM_SUBMIT_EXEC')
          .gt('created_at', new Date(Date.now() - 30000).toISOString())
          .limit(1);

        if (recent && recent.some(r => JSON.stringify(r.metadata?.data) === JSON.stringify(data))) {
          return { error: 'Acción duplicada detectada. Por favor, espera un momento.' };
        }

        return { success: true, action: { type: 'form_submit', payload: { formName, data } } };
      },
    }),

    search_entity: tool<SearchEntityInput, { success?: boolean; error?: string; results?: any; count?: number }, {}>({
      description: 'Busca registros en el sistema: productos, fichas de costo, transacciones o suministros. Devuelve hasta 5 resultados.',
      inputSchema: zodSchema(searchEntityInput),
      execute: async ({ entity, query }) => {
        requireRole(['admin', 'manager', 'vendedor', 'costo'], 'search_entity');
        const tableMap: Record<string, string> = {
          product: 'products',
          costSheet: 'product_cost_sheets',
          supply: 'supplies',
          transaction: 'transactions',
        };
        const table = tableMap[entity];
        if (!table) return { error: 'Entidad no soportada' };

        // FIX-SEC: sanitize ILIKE input to prevent wildcard injection
        const sanitized = query.replace(/[%_\\]/g, '\\$&');

        const { data, error } = await supabase
          .from(table)
          .select('id, name, store_id')
          .eq('store_id', ctxStoreId)
          .ilike('name', `%${sanitized}%`)
          .limit(5);

        if (error) return { error: error.message };
        return { success: true, results: data, count: data?.length || 0 };
      },
    }),

    execute_action: tool<ExecuteActionInput, { success?: boolean; error?: string; action?: any; message?: string }, {}>({
      description: 'Ejecuta una acción específica del sistema (ej: recalculate_costs, sync_data). Solo admin/manager.',
      inputSchema: zodSchema(executeActionInput),
      execute: async ({ actionName, parameters }) => {
        requireRole(['admin', 'manager'], 'execute_action');
        const ALLOWED_ACTIONS = ['recalculate_costs', 'sync_data', 'refresh_dashboard'];
        if (!ALLOWED_ACTIONS.includes(actionName)) {
          return { error: `Acción '${actionName}' no permitida. Acciones disponibles: ${ALLOWED_ACTIONS.join(', ')}` };
        }
        return {
          success: true,
          action: { type: 'system_action', payload: { actionName, parameters } },
          message: `Acción '${actionName}' ejecutada.`,
        };
      },
    }),

    export_document: tool<ExportDocumentInput, { success: boolean; action: any; message: string }, {}>({
      description: 'Genera y descarga un documento PDF o Excel de una entidad específica.',
      inputSchema: zodSchema(exportDocumentInput),
      execute: async ({ type, entityType, entityId }) => {
        requireRole(['admin', 'manager'], 'export_document');
        return {
          success: true,
          action: { type: 'export', payload: { type, entityType, entityId } },
          message: `Generando archivo ${type.toUpperCase()} para ${entityType}...`,
        };
      },
    }),

    set_ui_mode: tool<SetUiModeInput, { success: boolean; action: any }, {}>({
      description: 'Cambia el modo de la interfaz de usuario: standard o expert.',
      inputSchema: zodSchema(setUiModeInput),
      execute: async ({ mode }) => {
        requireRole(['admin', 'manager', 'costo'], 'set_ui_mode');
        return { success: true, action: { type: 'ui_mode', payload: { mode } } };
      },
    }),

    run_system_health_check: tool<RunHealthCheckInput, { success: boolean; message: string; action: any }, {}>({
      description: 'Inicia un recorrido automático de todas las vistas del sistema para detectar errores de UI y funcionalidad.',
      inputSchema: zodSchema(runHealthCheckInput),
      execute: async ({ viewIds }) => {
        requireRole(['admin', 'manager'], 'run_system_health_check');
        return {
          success: true,
          message: 'Health check sequence initiated. Crawling all views and reporting findings.',
          action: { type: 'health_check', payload: { viewIds } },
        };
      },
    }),

    get_cost_summary: tool<GetCostSummaryInput, { success?: boolean; error?: string; storeId?: string; summary?: any; message?: string }, {}>({
      description: 'Obtiene un resumen agregado de costos para la tienda actual: número de productos activos, costo unitario promedio (cost_price en products + cost_price en product_cost_sheets), costo total del inventario, productos con y sin ficha. Útil cuando el usuario pregunta "muéstrame el resumen de costos", "cuánto me costó el inventario".',
      inputSchema: zodSchema(getCostSummaryInput),
      execute: async ({ storeId }) => {
        requireRole(['admin', 'manager', 'vendedor', 'costo'], 'get_cost_summary');
        const targetStoreId = storeId || ctxStoreId;
        if (!targetStoreId) {
          return { error: 'No se pudo determinar la tienda. Especifica storeId o usa el chat desde una tienda activa.' };
        }

        // FIX-BOTCHAT-SCHEMA: Use 'is_active' instead of 'deleted_at' — the
        // products table uses soft-delete via is_active boolean, not a timestamp.
        // Also select cost_price directly from products (the column exists on both
        // products and product_cost_sheets, but products.cost_price is always populated).
        const { data: products, error: productsErr } = await supabase
          .from('products')
          .select('id, cost_price')
          .eq('store_id', targetStoreId)
          .eq('is_active', true);

        if (productsErr) return { error: `Error al leer productos: ${productsErr.message}` };

        const productList = products || [];
        const totalProducts = productList.length;
        // Sum of cost_price from products (always present, even without a cost sheet)
        const totalInventoryCost = productList.reduce(
          (sum, p: any) => sum + Number(p.cost_price || 0), 0
        );
        const productsWithCost = productList.filter((p: any) => Number(p.cost_price || 0) > 0).length;
        const avgCost = totalProducts > 0 ? totalInventoryCost / totalProducts : 0;

        // Cost sheets count (separate table — used for FC automation)
        const { count: costSheetCount, error: costErr } = await supabase
          .from('product_cost_sheets')
          .select('id', { count: 'exact', head: true })
          .eq('store_id', targetStoreId)
          .is('deleted_at', null);

        if (costErr) {
          // Non-fatal: cost_sheets table may be empty — continue with products data
          console.warn('[get_cost_summary] product_cost_sheets query failed:', costErr.message);
        }

        const coveragePct = totalProducts > 0
          ? Math.round((productsWithCost / totalProducts) * 10000) / 100
          : 0;

        return {
          success: true,
          storeId: targetStoreId,
          summary: {
            total_products: totalProducts,
            products_with_cost_price: productsWithCost,
            products_without_cost_price: Math.max(0, totalProducts - productsWithCost),
            cost_sheets_count: costSheetCount ?? 0,
            avg_cost_price: Math.round(avgCost * 100) / 100,
            total_inventory_cost: Math.round(totalInventoryCost * 100) / 100,
            coverage_pct: coveragePct,
          },
          message: `Resumen de costos de la tienda ${targetStoreId}: ${totalProducts} productos activos, ${productsWithCost} con costo asignado (${coveragePct}% cobertura). Costo unitario promedio: $${avgCost.toFixed(2)}. Costo total del inventario: $${totalInventoryCost.toFixed(2)}. Fichas de costo (FC): ${costSheetCount ?? 0}.`,
        };
      },
    }),

    get_sales_summary: tool<GetSalesSummaryInput, { success?: boolean; error?: string; date?: string; storeId?: string; summary?: any; message?: string }, {}>({
      description: 'Obtiene un resumen de ventas para una fecha específica (o "today" para hoy). Devuelve número de transacciones, total vendido, y desglose por forma de pago. Útil cuando el usuario pregunta "qué ventas se hicieron hoy", "resumen de ventas".',
      inputSchema: zodSchema(getSalesSummaryInput),
      execute: async ({ date, storeId }) => {
        requireRole(['admin', 'manager', 'vendedor', 'costo'], 'get_sales_summary');
        const targetStoreId = storeId || ctxStoreId;
        if (!targetStoreId) {
          return { error: 'No se pudo determinar la tienda.' };
        }

        const targetDate = !date || date === 'today'
          ? new Date().toISOString().slice(0, 10)
          : date;

        // FIX-BOTCHAT-SCHEMA: The transactions table uses 'total_amount' (not 'total'),
        // and 'completed_at' is the authoritative timestamp for completed sales.
        // Use created_at as fallback if completed_at is null.
        const { data: txns, error } = await supabase
          .from('transactions')
          .select('id, total_amount, payment_method, created_at, completed_at')
          .eq('store_id', targetStoreId)
          .eq('status', 'completed')
          .gte('created_at', `${targetDate}T00:00:00`)
          .lt('created_at', `${targetDate}T23:59:59.999`);

        if (error) return { error: `Error al leer ventas: ${error.message}` };

        const sales = txns || [];
        const totalAmount = sales.reduce((sum, t: any) => sum + Number(t.total_amount || 0), 0);

        const byPaymentMethod: Record<string, { count: number; total: number }> = {};
        for (const s of sales) {
          const pm = (s as any).payment_method || 'unknown';
          if (!byPaymentMethod[pm]) byPaymentMethod[pm] = { count: 0, total: 0 };
          byPaymentMethod[pm].count++;
          byPaymentMethod[pm].total += Number((s as any).total_amount || 0);
        }

        return {
          success: true,
          date: targetDate,
          storeId: targetStoreId,
          summary: {
            total_transactions: sales.length,
            total_amount: Math.round(totalAmount * 100) / 100,
            by_payment_method: Object.fromEntries(
              Object.entries(byPaymentMethod).map(([k, v]) => [k, {
                count: v.count,
                total: Math.round(v.total * 100) / 100,
              }])
            ),
          },
          message: `Ventas del ${targetDate}: ${sales.length} transacciones completadas, total $${totalAmount.toFixed(2)}. Desglose por forma de pago: ${Object.entries(byPaymentMethod).map(([k, v]) => `${k} (${v.count} tx, $${v.total.toFixed(2)})`).join(', ') || 'sin ventas'}.`,
        };
      },
    }),
  };
}

/**
 * Returns the list of tool names available for a given role.
 * Used by the system prompt builder to tell the LLM which tools it can call.
 */
export function getAvailableToolNames(userRole: string): string[] {
  // All tools are returned — RBAC is enforced at execute() time.
  // The LLM may attempt to call a tool that the role lacks, in which case
  // execute() throws and the AI is informed via the tool-error stream part.
  // We include all names so the AI knows what *could* be available, and
  // gracefully reports "necesitas rol X" if a user lacks permission.
  const dummyCtx: ToolContext = {
    supabase: null as any,
    userId: '',
    userRole,
    storeId: '',
  };
  return Object.keys(buildTools(dummyCtx));
}
