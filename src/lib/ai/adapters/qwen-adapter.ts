import { LLMProvider, Message, LLMResponse } from '../types';

export class QwenAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'qwen-turbo') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    // Qwen implementation (Aliyun DashScope example)
    try {
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          input: {
            messages: messages.map(msg => ({
              role: msg.role,
              content: msg.content,
            })),
          },
          parameters: {
            result_format: 'message',
            temperature: options?.temperature ?? 0.7,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Qwen API error: ${errorData.message || response.statusText}`);
      }

      const data = await response.json();
      const text = data.output?.choices?.[0]?.message?.content || '';

      return {
        text,
        metadata: {
          model: this.model,
          requestId: data.request_id,
        }
      };
    } catch (error) {
      console.error('QwenAdapter Error:', error);
      throw error;
    }
  }
}
