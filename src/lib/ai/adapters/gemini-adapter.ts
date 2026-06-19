import { LLMProvider, Message, LLMResponse, ToolCall } from '../types';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class GeminiAdapter implements LLMProvider {
  private apiKey: string;
  private modelName: string;

  constructor(apiKey: string, model: string = 'gemini-2.5-flash') {
    this.apiKey = apiKey;
    this.modelName = model;
  }

  async getResponse(messages: Message[], options?: any): Promise<LLMResponse> {
    if (!this.apiKey) {
      throw new Error("No se ha configurado la API Key de Gemini. Por favor, ve a configuración.");
    }

    try {
      const genAI = new GoogleGenerativeAI(this.apiKey);

      const systemMessage = messages.find(m => m.role === 'system');
      const chatMessages = messages.filter(m => m.role !== 'system');

      const modelConfig: any = { model: this.modelName };
      if (systemMessage) {
        modelConfig.systemInstruction = systemMessage.content;
      }

      if (options?.tools && options.tools.length > 0) {
        modelConfig.tools = [{
          functionDeclarations: options.tools.map((t: any) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          }))
        }];
      }

      const model = genAI.getGenerativeModel(modelConfig, { apiVersion: 'v1beta' });

      let contents: any[] = [];

      chatMessages.forEach((msg) => {
        if (msg.role === 'tool') {
          contents.push({
            role: 'function',
            parts: [{
              functionResponse: {
                name: msg.name,
                response: { content: msg.content }
              }
            }]
          });
          return;
        }

        const role = msg.role === 'assistant' ? 'model' : 'user';
        const parts: any[] = [];

        if (msg.tool_calls) {
          msg.tool_calls.forEach(tc => {
            parts.push({
              functionCall: {
                name: tc.function.name,
                args: JSON.parse(tc.function.arguments)
              }
            });
          });
        }

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (contents.length > 0) {
          const last = contents[contents.length - 1];
          if (last.role === role) {
            last.parts.push(...parts);
            return;
          }
        }

        contents.push({ role, parts });
      });

      if (contents.length === 0) {
        contents.push({ role: 'user', parts: [{ text: 'Hola' }] });
      } else if (contents[0].role === 'model') {
        contents = [{ role: 'user', parts: [{ text: '[Contexto]' }] }, ...contents];
      }

      const result = await model.generateContent({
        contents,
        generationConfig: {
          temperature: options?.temperature ?? 0.1,
          topK: options?.topK ?? 40,
          topP: options?.topP ?? 0.95,
          maxOutputTokens: options?.maxTokens ?? 2048,
        }
      });

      const response = await result.response;
      if (!response) throw new Error("Respuesta vacía del servidor de Google.");

      const parts = response.candidates?.[0]?.content?.parts || [];
      let text = '';
      const tool_calls: ToolCall[] = [];

      parts.forEach((part: any) => {
        if (part.text) {
          text += part.text;
        }
        if (part.functionCall) {
          tool_calls.push({
            id: `call_${Math.random().toString(36).substring(7)}`,
            type: 'function',
            function: {
              name: part.functionCall.name,
              arguments: JSON.stringify(part.functionCall.args)
            }
          });
        }
      });

      return {
        text,
        tool_calls: tool_calls.length > 0 ? tool_calls : undefined,
        metadata: { model: this.modelName }
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('GeminiAdapter Error:', message);

      const msg = message?.toLowerCase() || "";

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

      throw new Error(`Error de AI (${this.modelName}): ${message}`);
    }
  }
}
