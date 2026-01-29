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

    // Separate system message and normalize chat history
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    // Gemini requires alternating roles and starts with 'user'
    const contents: any[] = [];
    chatMessages.forEach((msg) => {
      const role = msg.role === 'assistant' ? 'model' : 'user';

      // If same role as previous, merge them (Gemini requirement)
      if (contents.length > 0 && contents[contents.length - 1].role === role) {
        contents[contents.length - 1].parts[0].text += '\n\n' + msg.content;
      } else {
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
      }
    });

    const body: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        topK: options?.topK ?? 40,
        topP: options?.topP ?? 0.95,
        maxOutputTokens: options?.maxTokens ?? 1024,
      }
    };

    // Use system_instruction if provided (supported in v1beta/Gemini 1.5+)
    if (systemMessage) {
      body.system_instruction = {
        parts: [{ text: systemMessage.content }]
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let errorMsg = response.statusText;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error?.message || JSON.stringify(errorData);
        } catch (e) {}
        throw new Error(`Gemini API error: ${errorMsg}`);
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
