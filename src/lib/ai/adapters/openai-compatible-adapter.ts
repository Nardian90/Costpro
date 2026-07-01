import { LLMProvider, Message, LLMResponse } from '../types';

export class OpenAICompatibleAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(apiKey: string, model: string, baseUrl: string) {
    this.apiKey = apiKey;
    this.model = model;
    this.baseUrl = baseUrl;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    try {
      const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content,
          })),
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 2048,
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`AI Provider (${this.model}) error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      return {
        text,
        metadata: {
          model: this.model,
          usage: data.usage,
          provider: this.baseUrl,
        }
      };
    } catch (error: unknown) {
      console.error(`OpenAICompatibleAdapter (${this.model}) Error:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}
