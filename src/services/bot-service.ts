import { SupabaseClient } from '@supabase/supabase-js';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { Message } from '@/lib/ai/types';

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
        } else if (lastMessage.includes('ventas') || lastMessage.includes('hoy') || lastMessage.includes('resumen')) {
            const today = new Date().toISOString().split('T')[0];
            const { data: salesData } = await supabase
                .from('transactions')
                .select('total_amount, status')
                .eq('store_id', storeId)
                .gte('created_at', today)
                .eq('status', 'completed');

            const total = salesData?.reduce((acc, sale) => acc + (Number(sale.total_amount) || 0), 0) || 0;
            context = `Ventas de hoy (${today}): Total acumulado de ${total} en ${salesData?.length || 0} transacciones completadas.`;
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
      Contexto actual de DB: ${context || 'Sin datos específicos para esta consulta.'}

      REGLAS DE ORO:
      1. Sin rodeos: No repitas la fecha ni digas 'Entendido' o 'Buena pregunta'. Ve directo al dato.
      2. Formato limpio: Usa listas con emojis en lugar de tablas complejas si el dato es simple.
      3. Lenguaje claro: Usa 'Costo' o 'Lo que nos costó' en vez de CMV. Usa 'Ganancia' en vez de Utilidad Bruta.
      4. Resumen visual: Siempre pon el dato más importante en negrita al principio.
      5. Respuesta siempre en español.`
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
