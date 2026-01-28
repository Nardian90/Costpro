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
      content: `Eres Jules, el Bot Encargado de CostPro.
      Tu misión es asistir al equipo de operaciones con datos precisos.
      Tienda actual ID: ${storeId}.
      Contexto extraído de DB: ${context || 'Consulta general.'}
      Reglas:
      - Sé conciso y profesional.
      - Responde siempre en español.
      - Si sugieres un pedido, básate en el stock crítico mencionado.
      - Mantén un tono de "compañero experto".`
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
