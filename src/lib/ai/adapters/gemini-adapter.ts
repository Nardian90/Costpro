import { LLMProvider, Message, LLMResponse } from '../types';

export class GeminiAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-1.5-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const contents = messages.map(msg => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }]
    }));

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents,
          generationConfig: {
            temperature: options?.temperature ?? 0.7,
            topK: options?.topK ?? 40,
            topP: options?.topP ?? 0.95,
            maxOutputTokens: options?.maxTokens ?? 1024,
          }
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      return {
        text,
        metadata: {
          model: this.model,
          finishReason: data.candidates?.[0]?.finishReason,
        }
      };
    } catch (error) {
      console.error('GeminiAdapter Error:', error);
      throw error;
    }
  }
}
