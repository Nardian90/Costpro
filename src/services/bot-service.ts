import { SupabaseClient } from '@supabase/supabase-js';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { Message } from '@/lib/ai/types';
import { dashboardKpiResponseSchema } from '@/validation/schemas';
import { SalesKPIs } from '@/types';

export const botService = {
  async handleChat(
    supabase: SupabaseClient,
    userId: string,
    storeId: string,
    messages: Message[],
    aiProvider?: string,
    aiApiKey?: string
  ) {
    if (!messages || messages.length === 0) {
        return { text: 'Hola! ¿En qué puedo ayudarte hoy?', metadata: { model: 'default' } };
    }

    // 1. Fetch context data based on the last message if needed
    const lastMessage = messages[messages.length - 1].content.toLowerCase();
    let context = '';

    try {
        if (lastMessage.includes('stock') || lastMessage.includes('inventario') || lastMessage.includes('agotado') || lastMessage.includes('crítico')) {
        const { data: stockData } = await supabase
            .from('products')
            .select('name, stock_current, min_stock')
            .eq('store_id', storeId)
            .is('is_active', true)
            .filter('stock_current', 'lt', 'min_stock');

        if (stockData && stockData.length > 0) {
            context = `Productos con stock crítico: ${stockData.map(p => `${p.name} (Stock: ${p.stock_current}, Mínimo: ${p.min_stock})`).join(', ')}`;
        } else {
            context = `No hay productos bajo el stock mínimo actualmente.`;
        }
        } else if (
          lastMessage.includes('ventas') ||
          lastMessage.includes('hoy') ||
          lastMessage.includes('resumen') ||
          lastMessage.includes('ganancia') ||
          lastMessage.includes('utilidad') ||
          lastMessage.includes('costo') ||
          lastMessage.includes('margen')
        ) {
            // Unify with Dashboard Source of Truth (get_dashboard_kpis RPC)
            const { data: rawKpis, error: rpcError } = await supabase.rpc('get_dashboard_kpis', {
              p_store_id: storeId
            });

            if (rpcError) throw rpcError;

            // Strict Validation & Typing (Data Contract)
            const validatedKpis = (rawKpis as any[] || []).map(k => dashboardKpiResponseSchema.parse(k)) as SalesKPIs[];

            if (validatedKpis.length > 0) {
                const d = validatedKpis[0];
                const profit = Number(d.total_profit);
                const sales = Number(d.total_sales);

                context = `DATOS REALES DEL DASHBOARD (Hoy):
                - Ventas Brutas: ${sales}
                - Costo de Mercadería (CMV): ${d.total_cost ?? 'Sin calcular'}
                - Ganancia (Utilidad Bruta): ${d.total_profit ?? 'Sin calcular'}
                - Margen Estimado: ${sales > 0 && d.total_profit ? ((profit / sales) * 100).toFixed(1) + '%' : 'N/A'}
                - Transacciones: ${d.transaction_count}
                - Ticket Promedio: ${d.avg_ticket}
                - Métodos: Efectivo (${d.total_cash}), Transferencia/Otros (${d.total_card})`;
            } else {
                context = `No hay datos de ventas registrados para hoy en el dashboard.`;
            }
        }
    } catch (err) {
        console.error('Error fetching context for bot:', err);
        context = 'Nota: Hubo un problema al consultar la base de datos en tiempo real.';
    }

    // 2. Prepare prompt for AI
    const systemPrompt: Message = {
      role: 'system',
      content: `Eres Jules, un asistente de ventas práctico y directo de CostPro. Tu objetivo es dar respuestas que se lean en 5 segundos.

      DATOS DE LA TIENDA (ID: ${storeId}):
      Contexto actual (Single Source of Truth): ${context || 'Sin datos específicos para esta consulta.'}

      CONTRATO DE DATOS:
      - Los datos de ventas, costos y utilidad provienen directamente de los mismos RPCs que alimentan el Dashboard.
      - Si los costos aparecen como "Sin calcular", es porque faltan datos de costo_price en los productos vendidos.

      REGLAS DE ORO:
      1. Sin rodeos: No repitas la fecha ni digas 'Entendido'. Ve directo al dato.
      2. Formato limpio: Usa listas con emojis.
      3. Lenguaje claro: Usa 'Costo' en vez de CMV. Usa 'Ganancia' o 'Utilidad' en vez de Utilidad Bruta.
      4. Análisis: Si se solicita, analiza la rentabilidad basada en el 'Margen Estimado' proporcionado.
      5. Resumen visual: El dato clave **siempre en negrita** al inicio.
      6. Idioma: Siempre en español.`
    };

    // 3. Call AI
    const provider = getLLMProvider(aiProvider, aiApiKey);
    const response = await provider.getResponse([systemPrompt, ...messages]);

    // 4. Audit interaction
    try {
        await supabase.from('audit_logs').insert({
            user_id: userId,
            action: 'BOT_QUERY',
            table_name: 'bot_interactions',
            store_id: storeId,
            metadata: {
                query_preview: messages[messages.length - 1].content.substring(0, 100),
                provider: response.metadata?.model
            }
        });
    } catch (e) {
        console.error('Audit failed for bot query', e);
    }

    return response;
  }
};
