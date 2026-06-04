import { GoogleGenerativeAI } from '@google/generative-ai';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AIProviderName = 'glm' | 'gemini';

export interface AIMessage {
  role: 'user' | 'assistant' | 'model' | 'system';
  content: string;
  /** Base64-encoded image data with its MIME type. */
  imageData?: { mimeType: string; data: string } | null;
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

export interface AIOptions {
  model?: string;
  temperature?: number;
  stream?: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DEFAULT_GLM_MODEL = 'glm-4-flash';
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const FALLBACK_GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

function resolveGLMModel(override?: string): string {
  // Only use the override if it's a GLM model; otherwise fall back to default
  if (override && isGLMModel(override)) return override;
  return process.env.GLM_MODEL ?? DEFAULT_GLM_MODEL;
}

function resolveGeminiModel(override?: string): string {
  // Only use the override if it's a Gemini model; otherwise fall back to default
  if (override && isGeminiModel(override)) return override;
  return process.env.GEMINI_MODEL ?? DEFAULT_GEMINI_MODEL;
}

/** Detect if a model name belongs to the Gemini family. */
export function isGeminiModel(model?: string): boolean {
  if (!model) return false;
  return /^gemini/i.test(model);
}

/** Detect if a model name belongs to the GLM family. */
export function isGLMModel(model?: string): boolean {
  if (!model) return false;
  return /^(glm|chatglm)/i.test(model);
}

function resolveGLMBaseUrl(): string {
  return process.env.ZAI_BASE_URL ?? FALLBACK_GLM_BASE_URL;
}

function resolveGLMApiKey(): string | undefined {
  return process.env.ZAI_API_KEY ?? process.env.GLM_API_KEY;
}

/** Create a ZAI client — try config-file first, fall back to env vars. */
async function createGLMClient(): Promise<any> {
  let ZAIModule: any;
  try {
    ZAIModule = await import('z-ai-web-dev-sdk');
  } catch {
    throw {
      provider: 'glm' as AIProviderName,
      code: 'SDK_IMPORT_ERROR',
      message: 'Failed to import z-ai-web-dev-sdk. Using Gemini as fallback.',
      isKeyMissing: false,
      isNetworkError: false,
      isRateLimit: false,
    } satisfies AIProviderError;
  }

  const ZAIConstructor = ZAIModule.default ?? ZAIModule.ZAI ?? ZAIModule;

  if (typeof ZAIConstructor !== 'function') {
    throw {
      provider: 'glm' as AIProviderName,
      code: 'SDK_INVALID_EXPORT',
      message: `z-ai-web-dev-sdk does not export a valid constructor. Exports: ${Object.keys(ZAIModule).join(', ')}. Using Gemini as fallback.`,
      isKeyMissing: false,
      isNetworkError: false,
      isRateLimit: false,
    } satisfies AIProviderError;
  }

  // 1) Try ZAI.create() — reads /etc/.z-ai-config (works in z.ai environment)
  if (typeof ZAIConstructor.create === 'function') {
    try {
      const client = await ZAIConstructor.create();
      return client;
    } catch {
      // Config file not available (e.g. Vercel) — fall through to env-var path
    }
  }

  // 2) Fall back to explicit env vars
  const apiKey = resolveGLMApiKey();
  const baseUrl = resolveGLMBaseUrl();

  if (!apiKey) {
    throw {
      provider: 'glm' as AIProviderName,
      code: 'KEY_MISSING',
      message: 'No ZAI config file found and neither ZAI_API_KEY nor GLM_API_KEY is set. Using Gemini as fallback.',
      isKeyMissing: true,
      isNetworkError: false,
      isRateLimit: false,
    } satisfies AIProviderError;
  }

  return new ZAIConstructor({ apiKey, baseUrl });
}

// ---------------------------------------------------------------------------
// GLM — non-streaming
// ---------------------------------------------------------------------------

async function callGLM(
  messages: AIMessage[],
  systemPrompt: string,
  options?: AIOptions,
): Promise<AIResponse> {
  const client = await createGLMClient();
  const model = resolveGLMModel(options?.model);
  const temperature = options?.temperature;

  const lastMessage = messages[messages.length - 1];
  const hasImage = lastMessage?.imageData;

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: (m.role === 'model' || m.role === 'assistant')
          ? 'assistant' as const
          : m.role === 'system'
            ? 'system' as const
            : 'user' as const,
        content: m.content,
      })),
    ],
    max_tokens: 2048,
  };

  if (temperature !== undefined) {
    body.temperature = temperature;
  }

  let response: any;

  if (hasImage) {
    // Vision mode — restructure the last user message
    const visionMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(0, -1).map(m => ({
        role: (m.role === 'model' || m.role === 'assistant')
          ? 'assistant' as const
          : m.role === 'system'
            ? 'system' as const
            : 'user' as const,
        content: m.content,
      })),
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: lastMessage.content },
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:${lastMessage.imageData!.mimeType};base64,${lastMessage.imageData!.data}`,
            },
          },
        ],
      },
    ];
    response = await client.chat.completions.createVision({
      model,
      messages: visionMessages,
      max_tokens: 2048,
      ...(temperature !== undefined ? { temperature } : {}),
    });
  } else {
    response = await client.chat.completions.create(body);
  }

  const text =
    response?.choices?.[0]?.message?.content ??
    response?.choices?.[0]?.text ??
    '';

  if (!text) {
    throw {
      provider: 'glm' as AIProviderName,
      code: 'EMPTY_RESPONSE',
      message: 'GLM SDK returned an empty response. Using Gemini as fallback.',
      isKeyMissing: false,
      isNetworkError: false,
      isRateLimit: false,
      raw: response,
    } satisfies AIProviderError;
  }

  return { text, provider: 'glm', model };
}

// ---------------------------------------------------------------------------
// GLM — streaming
// ---------------------------------------------------------------------------

async function callGLMStream(
  messages: AIMessage[],
  systemPrompt: string,
  options?: AIOptions,
): Promise<{ stream: ReadableStream; provider: AIProviderName; model: string }> {
  const client = await createGLMClient();
  const model = resolveGLMModel(options?.model);
  const temperature = options?.temperature;

  const lastMessage = messages[messages.length - 1];
  const hasImage = lastMessage?.imageData;

  if (hasImage) {
    const visionMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages.slice(0, -1).map(m => ({
        role: (m.role === 'model' || m.role === 'assistant')
          ? 'assistant' as const
          : m.role === 'system'
            ? 'system' as const
            : 'user' as const,
        content: m.content,
      })),
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: lastMessage.content },
          {
            type: 'image_url' as const,
            image_url: {
              url: `data:${lastMessage.imageData!.mimeType};base64,${lastMessage.imageData!.data}`,
            },
          },
        ],
      },
    ];
    const rawStream = await client.chat.completions.createVision({
      model,
      messages: visionMessages,
      max_tokens: 2048,
      stream: true,
      ...(temperature !== undefined ? { temperature } : {}),
    });
    return { stream: transformGLMStream(rawStream), provider: 'glm', model };
  }

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system' as const, content: systemPrompt },
      ...messages.map(m => ({
        role: (m.role === 'model' || m.role === 'assistant')
          ? 'assistant' as const
          : m.role === 'system'
            ? 'system' as const
            : 'user' as const,
        content: m.content,
      })),
    ],
    max_tokens: 2048,
    stream: true,
  };

  if (temperature !== undefined) {
    body.temperature = temperature;
  }

  const rawStream = await client.chat.completions.create(body);
  return { stream: transformGLMStream(rawStream), provider: 'glm', model };
}

/**
 * The GLM SDK returns a ReadableStream of SSE chunks.
 * Parse each chunk and emit normalised `{ text: "..." }` SSE lines.
 */
function transformGLMStream(raw: ReadableStream): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const reader = raw.getReader();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'));
              continue;
            }
            try {
              const parsed = JSON.parse(payload);
              const delta = parsed?.choices?.[0]?.delta?.content;
              if (delta) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`),
                );
              }
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }

        // Process any remaining buffer
        if (buffer.trim()) {
          const trimmed = buffer.trim();
          if (trimmed.startsWith('data:')) {
            const payload = trimmed.slice(5).trim();
            if (payload !== '[DONE]') {
              try {
                const parsed = JSON.parse(payload);
                const delta = parsed?.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ text: delta })}\n\n`),
                  );
                }
              } catch {
                // Skip
              }
            }
          }
        }

        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });
}

// ---------------------------------------------------------------------------
// Gemini — non-streaming
// ---------------------------------------------------------------------------

async function callGemini(
  messages: AIMessage[],
  systemPrompt: string,
  options?: AIOptions,
): Promise<AIResponse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw {
      provider: 'gemini' as AIProviderName,
      code: 'KEY_MISSING',
      message:
        'GOOGLE_API_KEY is not configured. Add it in Environment Variables. ' +
        'Get one at https://aistudio.google.com/app/apikey.',
      isKeyMissing: true,
      isNetworkError: false,
      isRateLimit: false,
    } satisfies AIProviderError;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = resolveGeminiModel(options?.model);

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    ...(options?.temperature !== undefined
      ? { generationConfig: { temperature: options.temperature } }
      : {}),
  });

  // Gemini only accepts 'user' | 'model' roles in chat history
  const history = messages
    .slice(0, -1)
    .filter(m => m.role !== 'system' && m.content.trim().length > 0)
    .map(m => ({
      role: (m.role === 'assistant' || m.role === 'model') ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

  // History must start with 'user'
  if (history.length > 0 && history[0].role === 'model') {
    history.shift();
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) throw new Error('No messages to send');

  const chat = model.startChat({ history });

  // Build the request parts — support image data on the last message
  let lastParts: string | Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;

  if (lastMessage.imageData) {
    lastParts = [
      { text: lastMessage.content },
      { inlineData: { mimeType: lastMessage.imageData.mimeType, data: lastMessage.imageData.data } },
    ];
  } else {
    lastParts = lastMessage.content;
  }

  const result = await chat.sendMessage(lastParts);
  const text = result.response.text();

  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  return { text, provider: 'gemini', model: modelName };
}

// ---------------------------------------------------------------------------
// Gemini — streaming
// ---------------------------------------------------------------------------

async function callGeminiStream(
  messages: AIMessage[],
  systemPrompt: string,
  options?: AIOptions,
): Promise<{ stream: ReadableStream; provider: AIProviderName; model: string }> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw {
      provider: 'gemini' as AIProviderName,
      code: 'KEY_MISSING',
      message: 'GOOGLE_API_KEY is not configured.',
      isKeyMissing: true,
      isNetworkError: false,
      isRateLimit: false,
    } satisfies AIProviderError;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = resolveGeminiModel(options?.model);

  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction: systemPrompt,
    ...(options?.temperature !== undefined
      ? { generationConfig: { temperature: options.temperature } }
      : {}),
  });

  const history = messages
    .slice(0, -1)
    .filter(m => m.role !== 'system' && m.content.trim().length > 0)
    .map(m => ({
      role: (m.role === 'assistant' || m.role === 'model') ? 'model' as const : 'user' as const,
      parts: [{ text: m.content }],
    }));

  if (history.length > 0 && history[0].role === 'model') {
    history.shift();
  }

  const lastMessage = messages[messages.length - 1];
  if (!lastMessage) throw new Error('No messages to send');

  const chat = model.startChat({ history });

  let lastParts: string | Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>;
  if (lastMessage.imageData) {
    lastParts = [
      { text: lastMessage.content },
      { inlineData: { mimeType: lastMessage.imageData.mimeType, data: lastMessage.imageData.data } },
    ];
  } else {
    lastParts = lastMessage.content;
  }

  const streamResult = await chat.sendMessageStream(lastParts);

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamResult.stream) {
          try {
            const text = chunk.text();
            if (text) {
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ text })}\n\n`),
              );
            }
          } catch {
            // Some chunks may throw on text() — skip them
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return { stream: readable, provider: 'gemini', model: modelName };
}

// ---------------------------------------------------------------------------
// Provider selection helper
// ---------------------------------------------------------------------------

/** Determine the preferred provider based on model name. */
function resolvePreferredProvider(model?: string): AIProviderName {
  if (model && isGeminiModel(model)) return 'gemini';
  if (model && isGLMModel(model)) return 'glm';
  // Default to GLM (z.ai environment) with Gemini fallback
  return 'glm';
}

// ---------------------------------------------------------------------------
// GLM error wrapper (shared by callGLM / callGLMStream)
// ---------------------------------------------------------------------------

function wrapGLMError(error: unknown): AIProviderError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'provider' in error &&
    'code' in error
  ) {
    return error as AIProviderError;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);

  const isRateLimit =
    rawMessage.includes('429') ||
    rawMessage.toLowerCase().includes('rate limit') ||
    rawMessage.toLowerCase().includes('quota');

  const isNetworkError =
    rawMessage.includes('ECONNREFUSED') ||
    rawMessage.includes('ENOTFOUND') ||
    rawMessage.includes('fetch failed') ||
    rawMessage.includes('network');

  return {
    provider: 'glm',
    code: isRateLimit ? 'RATE_LIMIT' : isNetworkError ? 'NETWORK_ERROR' : 'SDK_ERROR',
    message: isRateLimit
      ? `GLM rate limit reached (429). Using Gemini as fallback. Error: ${rawMessage}`
      : isNetworkError
        ? `Network error connecting to GLM. Using Gemini as fallback. Error: ${rawMessage}`
        : `GLM SDK error: ${rawMessage}. Using Gemini as fallback.`,
    isKeyMissing: false,
    isNetworkError,
    isRateLimit,
    raw: error,
  };
}

// ---------------------------------------------------------------------------
// Gemini error wrapper
// ---------------------------------------------------------------------------

function wrapGeminiError(error: unknown): AIProviderError {
  if (
    typeof error === 'object' &&
    error !== null &&
    'provider' in error &&
    'code' in error
  ) {
    return error as AIProviderError;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);

  const isRateLimit =
    rawMessage.includes('429') || rawMessage.toLowerCase().includes('quota');

  const isKeyInvalid =
    rawMessage.includes('API key') ||
    rawMessage.includes('INVALID_ARGUMENT') ||
    rawMessage.includes('403');

  return {
    provider: 'gemini',
    code: isRateLimit ? 'RATE_LIMIT' : isKeyInvalid ? 'INVALID_KEY' : 'API_ERROR',
    message: isRateLimit
      ? 'Gemini quota exceeded (429). Consider enabling billing in Google Cloud Console.'
      : isKeyInvalid
        ? `Invalid GOOGLE_API_KEY. Verify at https://aistudio.google.com/app/apikey. Error: ${rawMessage}`
        : `Gemini API error: ${rawMessage}`,
    isKeyMissing: false,
    isNetworkError: rawMessage.includes('ECONNREFUSED') || rawMessage.includes('fetch'),
    isRateLimit,
    raw: error,
  };
}

// ---------------------------------------------------------------------------
// Public API — non-streaming
// ---------------------------------------------------------------------------

export async function callAI(
  messages: AIMessage[],
  systemPrompt: string,
  options?: AIOptions,
): Promise<AIResponse> {
  const errors: AIProviderError[] = [];
  const preferred = resolvePreferredProvider(options?.model);

  // Try preferred provider first
  if (preferred === 'gemini') {
    try {
      const result = await callGemini(messages, systemPrompt, options);
      console.info(`[AI Provider] Response from ${result.provider} (${result.model})`);
      return result;
    } catch (geminiError) {
      const err = wrapGeminiError(geminiError);
      errors.push(err);
      console.error('[AI Provider] Gemini error:', err.message);
    }
    try {
      const result = await callGLM(messages, systemPrompt, options);
      console.info(`[AI Provider] Fallback to ${result.provider} (${result.model})`);
      return result;
    } catch (glmError) {
      const err = wrapGLMError(glmError);
      errors.push(err);
      console.error('[AI Provider] GLM fallback error:', err.message);
    }
  } else {
    try {
      const result = await callGLM(messages, systemPrompt, options);
      console.info(`[AI Provider] Response from ${result.provider} (${result.model})`);
      return result;
    } catch (glmError) {
      const err = wrapGLMError(glmError);
      errors.push(err);
      console.error('[AI Provider] GLM error:', err.message);
    }
    try {
      const result = await callGemini(messages, systemPrompt, options);
      console.info(`[AI Provider] Fallback to ${result.provider} (${result.model})`);
      return result;
    } catch (geminiError) {
      const err = wrapGeminiError(geminiError);
      errors.push(err);
      console.error('[AI Provider] Gemini fallback error:', err.message);
    }
  }

  // errors array order matches the try/catch order above
  const glmErr = errors.find(e => e.provider === 'glm');
  const geminiErr = errors.find(e => e.provider === 'gemini');

  const summary = [
    '=== AI SERVICE TOTAL FAILURE ===',
    `Preferred provider: ${preferred}`,
    '',
    `GLM (z-ai-web-dev-sdk):`,
    `  Code: ${glmErr?.code ?? 'UNKNOWN'}`,
    `  Detail: ${glmErr?.message ?? 'Unknown error'}`,
    '',
    `Gemini (@google/generative-ai):`,
    `  Code: ${geminiErr?.code ?? 'UNKNOWN'}`,
    `  Detail: ${geminiErr?.message ?? 'Unknown error'}`,
    '',
    'Recommended actions:',
    glmErr?.isKeyMissing ? '  1. Set ZAI_API_KEY or GLM_API_KEY env var, or ensure /etc/.z-ai-config exists' : '',
    geminiErr?.isKeyMissing ? '  2. Add GOOGLE_API_KEY env var as a fallback' : '',
  ]
    .filter(Boolean)
    .join('\n');

  console.error('[AI Provider]', summary);
  throw new Error(summary);
}

// ---------------------------------------------------------------------------
// Public API — streaming
// ---------------------------------------------------------------------------

export async function callAIStream(
  messages: AIMessage[],
  systemPrompt: string,
  options?: AIOptions,
): Promise<{ stream: ReadableStream; provider: AIProviderName; model: string }> {
  const errors: AIProviderError[] = [];
  const preferred = resolvePreferredProvider(options?.model);

  // Try preferred provider first
  if (preferred === 'gemini') {
    try {
      const result = await callGeminiStream(messages, systemPrompt, options);
      console.info(`[AI Provider] Streaming from ${result.provider} (${result.model})`);
      return result;
    } catch (geminiError) {
      const err = wrapGeminiError(geminiError);
      errors.push(err);
      console.error('[AI Provider] Gemini stream error:', err.message);
    }
    try {
      const result = await callGLMStream(messages, systemPrompt, options);
      console.info(`[AI Provider] Streaming fallback to ${result.provider} (${result.model})`);
      return result;
    } catch (glmError) {
      const err = wrapGLMError(glmError);
      errors.push(err);
      console.error('[AI Provider] GLM stream fallback error:', err.message);
    }
  } else {
    try {
      const result = await callGLMStream(messages, systemPrompt, options);
      console.info(`[AI Provider] Streaming from ${result.provider} (${result.model})`);
      return result;
    } catch (glmError) {
      const err = wrapGLMError(glmError);
      errors.push(err);
      console.error('[AI Provider] GLM stream error:', err.message);
    }
    try {
      const result = await callGeminiStream(messages, systemPrompt, options);
      console.info(`[AI Provider] Streaming fallback to ${result.provider} (${result.model})`);
      return result;
    } catch (geminiError) {
      const err = wrapGeminiError(geminiError);
      errors.push(err);
      console.error('[AI Provider] Gemini stream fallback error:', err.message);
    }
  }

  const glmErr = errors.find(e => e.provider === 'glm');
  const geminiErr = errors.find(e => e.provider === 'gemini');

  const summary = [
    '=== AI STREAMING SERVICE TOTAL FAILURE ===',
    `Preferred provider: ${preferred}`,
    '',
    `GLM (z-ai-web-dev-sdk):`,
    `  Code: ${glmErr?.code ?? 'UNKNOWN'}`,
    `  Detail: ${glmErr?.message ?? 'Unknown error'}`,
    '',
    `Gemini (@google/generative-ai):`,
    `  Code: ${geminiErr?.code ?? 'UNKNOWN'}`,
    `  Detail: ${geminiErr?.message ?? 'Unknown error'}`,
    '',
    'Recommended actions:',
    glmErr?.isKeyMissing ? '  1. Set ZAI_API_KEY or GLM_API_KEY env var, or ensure /etc/.z-ai-config exists' : '',
    geminiErr?.isKeyMissing ? '  2. Add GOOGLE_API_KEY env var as a fallback' : '',
  ]
    .filter(Boolean)
    .join('\n');

  console.error('[AI Provider]', summary);
  throw new Error(summary);
}
