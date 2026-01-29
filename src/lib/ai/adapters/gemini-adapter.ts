import { LLMProvider, Message, LLMResponse } from '../types';

export class GeminiAdapter implements LLMProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'gemini-2.0-flash') {
    this.apiKey = apiKey;
    this.model = model;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    if (!this.apiKey) {
      throw new Error("No se ha configurado la API Key de Gemini. Por favor, ve a configuración.");
    }

    // Separate system message and normalize chat history
    const systemMessage = messages.find(m => m.role === 'system');
    const chatMessages = messages.filter(m => m.role !== 'system');

    // Gemini requires alternating roles and starts with 'user'
    const contents: any[] = [];

    chatMessages.forEach((msg) => {
      // Normalize role: user -> user, assistant -> model
      const currentRole = msg.role === 'assistant' ? 'model' : 'user';

      if (contents.length === 0) {
        if (currentRole !== 'user') {
          // Rule: First message MUST be 'user'
          contents.push({
            role: 'user',
            parts: [{ text: "[Contexto]" }]
          });
          contents.push({
            role: 'model',
            parts: [{ text: msg.content }]
          });
        } else {
          contents.push({
            role: 'user',
            parts: [{ text: msg.content }]
          });
        }
        return;
      }

      const lastMessage = contents[contents.length - 1];
      if (lastMessage.role === currentRole) {
        // Rule: Consecutive roles must be merged
        lastMessage.parts.push({ text: msg.content });
      } else {
        contents.push({
          role: currentRole,
          parts: [{ text: msg.content }]
        });
      }
    });

    // Rule 3: Ensure non-empty contents. If empty, it's a 400.
    if (contents.length === 0) {
      contents.push({
        role: 'user',
        parts: [{ text: "Hola" }]
      });
    }

    const body: any = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        topK: options?.topK ?? 40,
        topP: options?.topP ?? 0.95,
        maxOutputTokens: options?.maxTokens ?? 1024,
      }
    };

    // Rule 4: Use system_instruction (REST API v1beta)
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
        let errorMsg = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          errorMsg = errorData.error?.message || JSON.stringify(errorData);
        } catch (e) {}
        throw new Error(`Gemini API: ${errorMsg}`);
      }

      const data = await response.json();

      // Rule 5: Handle safety filters or blocked responses
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Consulta bloqueada por seguridad: ${data.promptFeedback.blockReason}`);
      }

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

      if (!text && data.candidates?.[0]?.finishReason === 'SAFETY') {
        return {
          text: "Lo siento, no puedo responder a eso por políticas de seguridad.",
          metadata: { model: this.model, safetyBlocked: true }
        };
      }

      return {
        text,
        metadata: {
          model: this.model,
          finishReason: data.candidates?.[0]?.finishReason,
        }
      };
    } catch (error: any) {
      console.error('GeminiAdapter Error:', error.message);
      throw error;
    }
  }
}
