import { SupabaseClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { Message } from '@/lib/ai/types';
import { dashboardKpiResponseSchema } from '@/validation/schemas';
import { SalesKPIs } from '@/types';

async function getKnowledgeBaseContext(query: string): Promise<string> {
  const dirPath = path.join(process.cwd(), 'docs/knowledge/resolutions');
  if (!fs.existsSync(dirPath)) return '';

  try {
    const files = fs.readdirSync(dirPath);
    let knowledge = '';
    for (const file of files) {
      if (file.endsWith('.md') || file.endsWith('.json') || file.endsWith('.txt')) {
        const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
        // Simple heuristic: if query mentions words in the file or if it's a general query
        knowledge += `\n--- DOCUMENTO: ${file} ---\n${content}\n`;
      }
    }
    return knowledge;
  } catch (err) {
    console.error('Error reading knowledge base:', err);
    return '';
  }
}

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
    let knowledgeBase = '';

    try {
        // Fetch Knowledge Base (Resolutions/Library)
        knowledgeBase = await getKnowledgeBaseContext(lastMessage);

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

    // 2. Prepare prompt for AI (Identity: ELI)
    const systemPrompt: Message = {
      role: 'system',
      content: `Eres Eli, la IA oficial del sistema. Tu personalidad es femenina, profesional, técnica, asistencial y directa.

      REGLAS DE ORO:
      1. Tu conocimiento se limita ESTRICTAMENTE a la base de datos del sistema y a los documentos en la carpeta de /resoluciones (proporcionados en el contexto).
      2. SEGURIDAD: Nunca reveles información de una tienda (Shop_ID) a un usuario que no pertenezca a ella. Actualmente estás operando en la Tienda con ID: ${storeId}. Si detectas que se solicita información de otra tienda, indica que no tienes registros asociados.
      3. ESTILO: Respuestas claras, sin rodeos. Si no encuentras la información en el sistema o en la biblioteca, di: "No dispongo de registros o resoluciones en mi biblioteca para responder a esa consulta".
      4. Eres experta en las resoluciones almacenadas; cítalas cuando sea necesario.
      5. Tu objetivo es dar respuestas precisas y técnicas.

      BIBLIOTECA DE RESOLUCIONES Y MANUALES:
      ${knowledgeBase || 'No hay documentos cargados en la biblioteca actualmente.'}

      DATOS DE LA TIENDA EN TIEMPO REAL (ID: ${storeId}):
      Contexto actual: ${context || 'Sin datos de base de datos para esta consulta.'}

      GUÍA TÉCNICA (Fichas de Costo):
      - Soporte de fórmulas: SUMA, PROMEDIO, MAX, MIN, PCT(val, %), ROUND2.
      - Referencias: ref('ID'), AnexoI...AnexoV, VH (Valor Histórico), BASE_TOTAL.`
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
