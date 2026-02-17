import { LLMProvider, Message, LLMResponse } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiAdapter implements LLMProvider {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, model: string = 'gemini-2.0-flash') {
    this.apiKey = apiKey;
    this.modelName = model;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("No se ha configurado la API Key de Gemini. Por favor, ve a configuración.");
    }

    try {
      const genAI = new GoogleGenerativeAI(this.apiKey);

      // Separate system message and chat history
      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');

      // Initialize model with system instruction if present
      const modelConfig: any = { model: this.modelName };
      if (systemMessage) {
        modelConfig.systemInstruction = systemMessage.content;
      }

      // v1beta is required for system instructions in some model versions
      const model = genAI.getGenerativeModel(modelConfig, { apiVersion: 'v1beta' });

      // Format messages for the SDK
      // The SDK expects contents to alternate between user and model roles.
      // Our logic already handles normalization in the previous implementation,
      // but let's re-implement it cleanly for the SDK.

      const contents: any[] = [];

      chatMessages.forEach((msg) => {
        const role = msg.role === 'assistant' ? 'model' : 'user';

        if (contents.length === 0) {
          if (role !== 'user') {
            contents.push({ role: 'user', parts: [{ text: '[Contexto]' }] });
            contents.push({ role: 'model', parts: [{ text: msg.content }] });
          } else {
            contents.push({ role: 'user', parts: [{ text: msg.content }] });
          }
          return;
        }

        const last = contents[contents.length - 1];
        if (last.role === role) {
          last.parts.push({ text: msg.content });
        } else {
          contents.push({ role, parts: [{ text: msg.content }] });
        }
      });

      if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Hola' }] });
      }

      const result = await model.generateContent({
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.7,
          topK: options?.topK ?? 40,
          topP: options?.topP ?? 0.95,
          maxOutputTokens: options?.maxTokens ?? 1024,
        }
      });

      const response = await result.response;
      const text = response.text();

      return {
        text,
        metadata: {
          model: this.modelName,
        }
      };
    } catch (error: any) {
      console.error('GeminiAdapter Error:', error.message);

      // Fallback for the 404 error if gemini-2.0-flash is still not found in this environment
      if (error.message.includes('404') || error.message.includes('not found')) {
        throw new Error(`Error de modelo: ${this.modelName} no encontrado o no disponible con esta API Key. Detalles: ${error.message}`);
      }

      throw error;
    }
  }
}
