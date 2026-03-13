import { LLMProvider, Message, LLMResponse, ToolCall } from '../types';

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

    // Usamos el método fetchGeminiResponse directamente ya que es el que el usuario confirmó que funciona
    const userQuery = messages[messages.length - 1].content;
    const history = messages.slice(0, -1).map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      text: m.content
    }));

    return this.fetchGeminiResponse(userQuery, history);
  }

  private async fetchGeminiResponse(userQuery: string, chatHistory: any[]): Promise<LLMResponse> {
    const systemPrompt = "Eres un asistente de IA útil, creativo y conciso. Responde siempre en el idioma que el usuario utilice.";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    const contents = chatHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: userQuery }] });

    try {
      const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              contents: contents,
              systemInstruction: { parts: [{ text: systemPrompt }] }
          })
      });

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error?.message || response.statusText;

          if (response.status === 404) {
            throw new Error(`El modelo ${this.modelName} no está disponible. Es posible que Google lo haya retirado o el nombre sea incorrecto.`);
          }
          if (response.status === 401) {
            throw new Error("Clave de API de Gemini inválida.");
          }
          if (response.status === 429) {
            throw new Error("Límite de cuota excedido para Gemini.");
          }

          throw new Error(`Error de comunicación con Gemini: ${errorMessage}`);
      }

      const data = await response.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!text) {
        throw new Error("No se recibió texto en la respuesta de Gemini.");
      }

      return {
          text,
          metadata: { model: this.modelName }
      };
    } catch (error: any) {
      console.error('GeminiAdapter Error:', error.message);
      throw error;
    }
  }
}
