import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Standalone Gemini AI Chat — NO auth required, NO Supabase dependency.
 *
 * Calls Google Gemini REST API directly. Supports:
 *  - Multi-model selection (gemini-2.5-flash, gemini-2.5-pro, etc.)
 *  - Google Search grounding (google_search tool)
 *  - Image analysis (inline base64)
 *  - System instructions
 *  - Temperature / maxOutputTokens
 *  - Conversation history
 *
 * MVP reference: ai_chat_premium.txt (direct REST calls to Gemini API)
 */

const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-1.5-flash',
  'gemini-1.5-pro',
] as const;

const DEFAULT_MODEL = 'gemini-2.5-flash';
const DEFAULT_TEMP = 0.7;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_SYSTEM = 'Eres Darian, un asistente inteligente ultra-avanzado creado para CostPro. Responde con elegancia, precisión y de forma estructurada usando markdown cuando sea oportuno. Habla español de manera natural y cálida. Eres experto en costos, presupuestos, la Resolución 148/2023 de Cuba, y sistemas ERP.';

interface ChatRequestBody {
  messages: Array<{ role: string; text: string; image?: { data: string; mimeType: string } }>;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemInstruction?: string;
  grounding?: boolean;
  apiKey?: string;
}

function resolveApiKey(requestedKey?: string): string {
  // Priority: explicit key → env var → error
  if (requestedKey?.trim()) return requestedKey.trim();
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  if (process.env.EMERGENCY_GOOGLE_API_KEY) return process.env.EMERGENCY_GOOGLE_API_KEY;
  return '';
}

async function chatHandler(req: NextRequest) {
  try {
    let body: ChatRequestBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
    }

    if (!body.messages?.length) {
      return NextResponse.json({ error: 'No hay mensajes' }, { status: 400 });
    }

    const apiKey = resolveApiKey(body.apiKey);
    if (!apiKey) {
      return NextResponse.json({
        error: 'No hay API Key configurada. Ingresa tu clave de Gemini en los ajustes del chat.',
      }, { status: 400 });
    }

    const model = body.model || DEFAULT_MODEL;
    const temperature = body.temperature ?? DEFAULT_TEMP;
    const maxTokens = body.maxTokens ?? DEFAULT_MAX_TOKENS;
    const systemInstruction = body.systemInstruction || DEFAULT_SYSTEM;
    const grounding = body.grounding ?? false;

    // Build Gemini API contents from message history
    const contents = body.messages.map(msg => {
      const parts: any[] = [];

      if (msg.text) {
        parts.push({ text: msg.text });
      }

      if (msg.image?.data) {
        parts.push({
          inlineData: {
            mimeType: msg.image.mimeType || 'image/jpeg',
            data: msg.image.data,
          },
        });
      }

      return {
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts,
      };
    });

    // Gemini requires first message to be 'user' role
    if (contents.length > 0 && contents[0].role === 'model') {
      contents.unshift({ role: 'user', parts: [{ text: '[Contexto previo]' }] });
    }

    // Build payload
    const payload: any = {
      contents,
      generationConfig: {
        temperature,
        maxOutputTokens: maxTokens,
      },
      systemInstruction: {
        parts: [{ text: systemInstruction }],
      },
    };

    // Google Search grounding
    if (grounding) {
      payload.tools = [{ googleSearch: {} }];
    }

    // Rate limit: simple IP-based
    const clientId = req.headers.get('x-forwarded-for') || 'unknown';
    const { allowed } = await simpleRateLimit(clientId, 15, 60_000);
    if (!allowed) {
      return NextResponse.json({ error: 'Demasiadas solicitudes. Espera un momento.' }, { status: 429 });
    }

    // Call Gemini REST API directly (like the MVP does)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      const errMsg = result.error?.message || `HTTP ${response.status}`;
      console.error('[AI Chat] Gemini API error:', errMsg);

      // Map common errors to user-friendly messages
      if (response.status === 400) {
        return NextResponse.json({ error: `Error de solicitud: ${errMsg}` }, { status: 400 });
      }
      if (response.status === 403) {
        return NextResponse.json({ error: 'Tu API Key no tiene permiso para este modelo o la cuota está agotada.' }, { status: 403 });
      }
      if (response.status === 429) {
        return NextResponse.json({ error: 'Cuota agotada. Espera un momento o usa otra clave.' }, { status: 429 });
      }
      return NextResponse.json({ error: `Error de Gemini API: ${errMsg}` }, { status: 502 });
    }

    const candidate = result.candidates?.[0];
    if (!candidate?.content?.parts?.[0]) {
      return NextResponse.json({ error: 'La IA no generó respuesta válida.' }, { status: 502 });
    }

    // Extract text and sources
    let text = '';
    const parts = candidate.content.parts;
    for (const part of parts) {
      if (part.text) text += part.text;
    }

    // Extract grounding sources if available
    const sources: Array<{ uri: string; title: string }> = [];
    const groundingMeta = candidate.groundingMetadata;
    if (groundingMeta?.groundingAttributions) {
      for (const attr of groundingMeta.groundingAttributions) {
        if (attr.web?.uri && attr.web?.title) {
          sources.push({ uri: attr.web.uri, title: attr.web.title });
        }
      }
    }

    return NextResponse.json({
      text,
      sources: sources.length > 0 ? sources : undefined,
      model,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('[AI Chat] Unexpected error:', error);
    return NextResponse.json({
      error: `Error interno: ${(error instanceof Error ? error.message : String(error)) || 'Desconocido'}`,
    }, { status: 500 });
  }
}

// Simple in-memory rate limiter
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
function simpleRateLimit(clientId: string, maxRequests: number, windowMs: number): { allowed: boolean } {
  // FIX-AUDIT-11: Lazy cleanup of stale entries
  if (rateLimitMap.size > 500) {
    const now = Date.now();
    for (const [key, entry] of rateLimitMap) {
      if (now > entry.resetAt) rateLimitMap.delete(key);
    }
  }

  const now = Date.now();
  const entry = rateLimitMap.get(clientId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(clientId, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false };
  }

  entry.count++;
  return { allowed: true };
}

// FIX-AUDIT-11: Removed setInterval leak — cleanup is now lazy inside simpleRateLimit()
// This prevents timer leaks in serverless environments

export const POST = chatHandler;
