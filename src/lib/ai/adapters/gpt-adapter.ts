import { LLMProvider, Message, LLMResponse } from '../types';

export class GPTAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    // Placeholder for OpenAI integration
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`GPT API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';

      return {
        text,
        metadata: {
          model: this.model,
          usage: data.usage,
        }
      };
    } catch (error) {
      console.error('GPTAdapter Error:', error);
      throw error;
    }
  }
}
