import { LLMProvider, Message, LLMResponse, ToolCall } from '../types';
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

      const contents: any[] = [];

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
    } catch (error: any) {
      console.error('GeminiAdapter Error:', error.message);
      // Re-throw standardized errors as before...
      throw error;
    }
  }
}
