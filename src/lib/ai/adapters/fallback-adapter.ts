import { logger } from '@/lib/logger';
import { LLMProvider, Message, LLMResponse } from '../types';

export class FallbackAdapter implements LLMProvider {
  private providers: LLMProvider[];

  constructor(providers: LLMProvider[]) {
    this.providers = providers;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    const errors: Error[] = [];

    for (const provider of this.providers) {
      try {
        return await provider.getResponse(messages, options);
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        logger.warn('DATABASE', 'AI_FALLBACK_TRIGGER:', { data: err.message });
        errors.push(err);
        continue;
      }
    }

    // Si llegamos aquí, todos fallaron. Buscamos si hay errores de cuota/balance
    const hasQuotaError = errors.some(e =>
      e.message.toLowerCase().includes('cuota') ||
      e.message.toLowerCase().includes('quota') ||
      e.message.toLowerCase().includes('balance') ||
      e.message.toLowerCase().includes('limit')
    );

    if (hasQuotaError) {
      throw new Error("Límite de IA alcanzado: Todos los proveedores gratuitos están agotados. Por favor, configura tu propia API Key en los ajustes del chat o espera un momento.");
    }

    const errorMsg = errors.map(e => e.message).join(' | ');
    throw new Error(`Error de comunicación con la IA: ${errorMsg}`);
  }
}
