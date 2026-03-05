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
      // gemini-2.0-flash works well with v1beta
      const model = genAI.getGenerativeModel(modelConfig, { apiVersion: 'v1beta' });

      // Format messages for the SDK
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
          temperature: options?.temperature ?? 0.1, // Defaulting to low temperature for precision
          topK: options?.topK ?? 40,
          topP: options?.topP ?? 0.95,
          maxOutputTokens: options?.maxTokens ?? 2048,
        }
      });

      const response = await result.response;

      if (!response) {
        throw new Error("Respuesta vacía del servidor de Google.");
      }

      const text = response.text();

      return {
        text,
        metadata: {
          model: this.modelName,
        }
      };
    } catch (error: any) {
      console.error('GeminiAdapter Error:', error.message);

      const msg = error.message?.toLowerCase() || "";

      if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('invalid api key')) {
        throw new Error("Error de API Key: La clave proporcionada no es válida o ha expirado. Verifica tu configuración.");
      }

      if (msg.includes('429') || msg.includes('quota') || msg.includes('too many requests')) {
        throw new Error("Error de Cuota: Se ha alcanzado el límite de solicitudes gratuitas. Por favor, espera un minuto o usa una clave Pro.");
      }

      if (msg.includes('403') || msg.includes('permission_denied')) {
        throw new Error("Error de Permisos: Tu API Key no tiene acceso a este modelo o se ha alcanzado el límite de cuota.");
      }

      if (msg.includes('404') || msg.includes('not found') || msg.includes('no longer available')) {
        throw new Error(`Error de Modelo: El modelo ${this.modelName} no está disponible. Es posible que Google lo haya retirado o el nombre sea incorrecto.`);
      }

      if (msg.includes('safety') || msg.includes('blocked')) {
        throw new Error("Error de Seguridad: El modelo bloqueó la respuesta por políticas de seguridad de contenido.");
      }

      throw new Error(`Error de AI (${this.modelName}): ${error.message}`);
    }
  }
}
