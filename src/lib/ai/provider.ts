import { GoogleGenerativeAI } from '@google/generative-ai';

export type AIProviderName = 'glm' | 'gemini';

export interface AIMessage {
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
}

export interface AIResponse {
  text: string;
  provider: AIProviderName;
  model: string;
}

export interface AIProviderError {
  provider: AIProviderName;
  code: string;
  message: string;
  isKeyMissing: boolean;
  isNetworkError: boolean;
  isRateLimit: boolean;
  raw?: unknown;
}

/**
 * Llama al SDK de GLM (z-ai-web-dev-sdk) como proveedor primario.
 * Retorna null si la clave no está configurada (no lanza error).
 * Lanza AIProviderError con detalle si la clave existe pero falla.
 */
async function callGLM(
  messages: AIMessage[],
  systemPrompt: string
): Promise<AIResponse> {
  const apiKey = process.env.GLM_API_KEY ?? process.env.ZAI_API_KEY;

  if (!apiKey) {
    const err: AIProviderError = {
      provider: 'glm',
      code: 'KEY_MISSING',
      message:
        'GLM_API_KEY no está configurada en las variables de entorno. ' +
        'Añadirla en Vercel Dashboard → Settings → Environment Variables. ' +
        'Usando Gemini directo como fallback.',
      isKeyMissing: true,
      isNetworkError: false,
      isRateLimit: false,
    };
    console.warn('[AI Provider] GLM:', err.message);
    throw err;
  }

  try {
    // Leer la API real del SDK antes de instanciar
    // El SDK z-ai-web-dev-sdk v0.0.17 puede exportar de dos formas:
    // Forma A: export default class ZAI { constructor(config) }
    // Forma B: export { ZAI } — named export
    // El código actual intenta ZAI.create() que no existe en ninguna forma

    let ZAIModule: any;
    try {
      ZAIModule = await import('z-ai-web-dev-sdk');
    } catch {
      throw {
        provider: 'glm' as AIProviderName,
        code: 'SDK_IMPORT_ERROR',
        message: 'No se pudo importar z-ai-web-dev-sdk. Usando Gemini como fallback.',
        isKeyMissing: false,
        isNetworkError: false,
        isRateLimit: false,
      } as AIProviderError;
    }

    // Resolver el constructor — soportar export default y named export
    const ZAIConstructor = ZAIModule.default ?? ZAIModule.ZAI ?? ZAIModule;

    if (typeof ZAIConstructor !== 'function') {
      throw {
        provider: 'glm' as AIProviderName,
        code: 'SDK_INVALID_EXPORT',
        message: `z-ai-web-dev-sdk no exporta un constructor válido. ` +
          `Exports encontrados: ${Object.keys(ZAIModule).join(', ')}. ` +
          'Usando Gemini como fallback.',
        isKeyMissing: false,
        isNetworkError: false,
        isRateLimit: false,
      } as AIProviderError;
    }

    if (!process.env.ZAI_API_KEY && process.env.GLM_API_KEY) {
      process.env.ZAI_API_KEY = process.env.GLM_API_KEY;
    }

    const client = new ZAIConstructor({ apiKey });

    const response = await client.chat.completions.create({
      model: process.env.GLM_MODEL ?? 'glm-4-flash',
      messages: [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({
          role: (m.role === 'model' || m.role === 'assistant') ? 'assistant' as const : (m.role === 'system' ? 'system' as const : 'user' as const),
          content: m.content,
        })),
      ],
      max_tokens: 2048,
    });

    const text =
      response?.choices?.[0]?.message?.content ??
      response?.choices?.[0]?.text ??
      '';

    if (!text) {
      throw {
        provider: 'glm' as AIProviderName,
        code: 'EMPTY_RESPONSE',
        message:
          'El SDK de GLM devolvió una respuesta vacía. ' +
          'El modelo puede estar sobrecargado. Usando Gemini como fallback.',
        isKeyMissing: false,
        isNetworkError: false,
        isRateLimit: false,
        raw: response,
      } as AIProviderError;
    }

    return {
      text,
      provider: 'glm',
      model: process.env.GLM_MODEL ?? 'glm-4-flash',
    };
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'provider' in error &&
      'code' in error
    ) {
      throw error;
    }

    const rawMessage =
      error instanceof Error ? error.message : String(error);

    const isRateLimit =
      rawMessage.includes('429') ||
      rawMessage.toLowerCase().includes('rate limit') ||
      rawMessage.toLowerCase().includes('quota');

    const isNetworkError =
      rawMessage.includes('ECONNREFUSED') ||
      rawMessage.includes('ENOTFOUND') ||
      rawMessage.includes('fetch failed') ||
      rawMessage.includes('network');

    const err: AIProviderError = {
      provider: 'glm',
      code: isRateLimit
        ? 'RATE_LIMIT'
        : isNetworkError
        ? 'NETWORK_ERROR'
        : 'SDK_ERROR',
      message: isRateLimit
        ? `Límite de solicitudes de GLM alcanzado (429). ` +
          `Usando Gemini directo como fallback. Error original: ${rawMessage}`
        : isNetworkError
        ? `Error de red al conectar con Z.ai. ` +
          `Verificar conectividad. Usando Gemini como fallback. ` +
          `Error: ${rawMessage}`
        : `Error en z-ai-web-dev-sdk: ${rawMessage}. Usando Gemini como fallback.`,
      isKeyMissing: false,
      isNetworkError,
      isRateLimit,
      raw: error,
    };

    console.error('[AI Provider] GLM error:', err.message);
    throw err;
  }
}

async function callGemini(
  messages: AIMessage[],
  systemPrompt: string
): Promise<AIResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;

  if (!apiKey) {
    const err: AIProviderError = {
      provider: 'gemini',
      code: 'KEY_MISSING',
      message:
        'GOOGLE_API_KEY no está configurada en Vercel Dashboard. ' +
        'Ir a: Vercel Dashboard → Proyecto → Settings → Environment Variables → ' +
        'Añadir GOOGLE_API_KEY con tu clave de Google AI Studio ' +
        '(https://aistudio.google.com/app/apikey).',
      isKeyMissing: true,
      isNetworkError: false,
      isRateLimit: false,
    };
    console.error('[AI Provider] Gemini:', err.message);
    throw err;
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
      systemInstruction: systemPrompt,
    });

    // Gemini solo acepta role 'user' | 'model' en el history de startChat()
    // Filtrar mensajes system — ya están en systemInstruction del modelo
    // Filtrar mensajes vacíos — Gemini rechaza content vacío
    const history = messages.slice(0, -1)
      .filter(m => m.role !== 'system' && m.content.trim().length > 0)
      .map(m => ({
        role: (m.role === 'assistant' || m.role === 'model') ? 'model' as const : 'user' as const,
        parts: [{ text: m.content }],
      }));

    // Gemini requiere que el history empiece con 'user' si no está vacío
    // Si el primer mensaje es 'model', eliminarlo para evitar error
    if (history.length > 0 && history[0].role === 'model') {
      history.shift();
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) throw new Error('No hay mensajes para enviar');

    const chat = model.startChat({ history });
    const result = await chat.sendMessage(lastMessage.content);
    const text = result.response.text();

    if (!text) {
      throw new Error('Gemini devolvió respuesta vacía');
    }

    return {
      text,
      provider: 'gemini',
      model: process.env.GEMINI_MODEL ?? 'gemini-1.5-flash',
    };
  } catch (error: unknown) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'provider' in error &&
      'code' in error
    ) {
      throw error;
    }

    const rawMessage = error instanceof Error ? error.message : String(error);

    const isRateLimit =
      rawMessage.includes('429') ||
      rawMessage.toLowerCase().includes('quota');

    const isKeyInvalid =
      rawMessage.includes('API key') ||
      rawMessage.includes('INVALID_ARGUMENT') ||
      rawMessage.includes('403');

    const err: AIProviderError = {
      provider: 'gemini',
      code: isRateLimit ? 'RATE_LIMIT' : isKeyInvalid ? 'INVALID_KEY' : 'API_ERROR',
      message: isRateLimit
        ? `Cuota de Gemini agotada (429). Considera activar billing en Google Cloud Console.`
        : isKeyInvalid
        ? `GOOGLE_API_KEY inválida o sin permisos. Verificar en https://aistudio.google.com/app/apikey. ` +
          `Error: ${rawMessage}`
        : `Error en Gemini API: ${rawMessage}`,
      isKeyMissing: false,
      isNetworkError: rawMessage.includes('ECONNREFUSED') || rawMessage.includes('fetch'),
      isRateLimit,
      raw: error,
    };

    console.error('[AI Provider] Gemini error:', err.message);
    throw err;
  }
}

export async function callAI(
  messages: AIMessage[],
  systemPrompt: string
): Promise<AIResponse> {
  const errors: AIProviderError[] = [];

  try {
    const result = await callGLM(messages, systemPrompt);
    console.info(`[AI Provider] Respuesta de ${result.provider} (${result.model})`);
    return result;
  } catch (glmError) {
    errors.push(glmError as AIProviderError);
  }

  try {
    const result = await callGemini(messages, systemPrompt);
    console.info(`[AI Provider] Fallback a ${result.provider} (${result.model})`);
    return result;
  } catch (geminiError) {
    errors.push(geminiError as AIProviderError);
  }

  const glmErr = errors[0];
  const geminiErr = errors[1];

  const summary = [
    `=== FALLO TOTAL DEL SERVICIO AI ===`,
    ``,
    `GLM (z-ai-web-dev-sdk):`,
    `  Código: ${glmErr?.code ?? 'UNKNOWN'}`,
    `  Detalle: ${glmErr?.message ?? 'Error desconocido'}`,
    ``,
    `Gemini (@google/generative-ai):`,
    `  Código: ${geminiErr?.code ?? 'UNKNOWN'}`,
    `  Detalle: ${geminiErr?.message ?? 'Error desconocido'}`,
    ``,
    `Acciones recomendadas:`,
    glmErr?.isKeyMissing
      ? `  1. Añadir GLM_API_KEY en Vercel Dashboard → Settings → Environment Variables`
      : '',
    geminiErr?.isKeyMissing
      ? `  2. Añadir GOOGLE_API_KEY en Vercel Dashboard → Settings → Environment Variables`
      : '',
    `  3. Ver logs completos en: Vercel Dashboard → Deployments → [último] → Functions`,
  ]
    .filter(Boolean)
    .join('\n');

  console.error('[AI Provider]', summary);

  throw new Error(summary);
}
