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
      } catch (error: any) {
        console.warn('AI Fallback trigger:', error.message);
        errors.push(error);
        continue;
      }
    }

    const errorMsg = errors.map(e => e.message).join(' | ');
    throw new Error(`Todos los proveedores de AI fallaron: ${errorMsg}`);
  }
}
