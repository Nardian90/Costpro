import { academyGenerateSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { generateText } from 'ai';
import { getServerSession } from "@/lib/auth";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import fs, { readdirSync } from 'fs';
import path from 'path';
// FIX-DEBT: resolveModel extracted to testable helper
import { resolveModel } from '@/lib/ai/resolve-model';

/**
 * MIGRATED to Vercel AI SDK (FIX-DEBT: removed dependency on deprecated orchestrator.ts).
 * Replaces getLLMProvider + provider.getResponse with generateText + provider factories.
 */

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes for processing PDFs and AI

async function postHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // BUG-016 FIX: Use session.user.id for rate limiting (same as BUG-004 fix)
    const clientId = session.user.id;
    const { allowed } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 10 });
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

    const rawBody = await req.json();
    const parsed = academyGenerateSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { filename, limit, aiProvider, aiApiKey } = parsed.data;

    // Load PDF text content from pre-indexed docs/manuals (simulated logic for MVP)
    const manualsDir = path.join(process.cwd(), 'docs/manuals');
    const baseName = filename.replace('.pdf', '');
    const safeName = path.basename(baseName).replace(/[^a-zA-Z0-9_\-]/g, '_'); // FIX-SEC-009
    const txtPath = path.join(manualsDir, safeName + '.txt');

    if (!fs.existsSync(txtPath)) {
        return NextResponse.json({ error: `Manual text file not found: ${safeName}.txt` }, { status: 404 });
    }

    let fullText = fs.readFileSync(txtPath, 'utf8');

    // Companion JSON logic
    const jsonPaths = [
        path.join(manualsDir, safeName + '.json'),
        path.join(manualsDir, safeName.replace(/^Res/, '') + '.json'),
        path.join(manualsDir, safeName.replace(/^Res/, 'Res ') + '.json')
    ];

    let jsonFound = false;
    for (const jPath of jsonPaths) {
        if (fs.existsSync(jPath)) {
            try {
                const jsonRaw = fs.readFileSync(jPath, 'utf8');
                // We prioritize JSON if it exists as it is usually better structured
                fullText = `DATOS ESTRUCTURADOS DEL MANUAL (JSON):\n${jsonRaw}\n\nCONTENIDO ADICIONAL:\n${fullText}`;
                jsonFound = true;
                break;
            } catch (e) {
                console.error('Error reading JSON companion:', e);
            }
        }
    }

    if (!fullText || fullText.trim().length === 0) {
        return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 400 });
    }

    // FIX-DEBT: Resolve Vercel AI SDK model (replaces deprecated getLLMProvider)
    const { model: aiModel, name: providerName } = resolveModel(aiProvider, aiApiKey);

    // Chunking: approx 4000 chars
    const chunkSize = 4000;
    const chunks: string[] = [];
    for (let i = 0; i < fullText.length; i += chunkSize) {
      chunks.push(fullText.slice(i, i + chunkSize));
    }

    const results: any[] = [];
    // If we found JSON, we might want to process more than 3 chunks if they are small,
    // but let's stick to the limit or a slightly higher one if it's the JSON content.
    const processedChunks = chunks.slice(0, jsonFound ? Math.max(limit, 5) : limit);

    for (const chunk of processedChunks) {
      const messages: any[] = [
        {
          role: 'system',
          content: 'Eres experto en sistemas de gestión de costos empresariales y la plataforma Costpro. Tu objetivo es generar material educativo preciso y técnico.'
        },
        {
          role: 'user',
          content: `A partir del siguiente fragmento de manual técnico${jsonFound ? ' (que contiene datos estructurados JSON)' : ''}, genera un conjunto de flashcards educativas.

          INSTRUCCIONES:
          - Genera exactamente 5 preguntas tipo escenario práctico o concepto clave.
          - Respuestas técnicas precisas y concisas.
          - Nivel de dificultad: Básico, Operativo o Experto.
          - Categoría funcional: Ej. Inventario, Ventas, Costos, Configuración.

          Manual fragmento:
          ${chunk}

          Devuelve ÚNICAMENTE un formato JSON válido (un array de objetos), sin bloques de código markdown:
          [
            {
              "question": "...",
              "answer": "...",
              "difficulty": "Básico|Operativo|Experto",
              "category": "..."
            }
          ]`
        }
      ];

      try {
        // FIX-DEBT: Use generateText from Vercel AI SDK instead of provider.getResponse
        const aiResponse = await generateText({
          model: aiModel,
          system: 'Eres experto en sistemas de gestión de costos empresariales y la plataforma Costpro. Tu objetivo es generar material educativo preciso y técnico.',
          messages: [{ role: 'user' as const, content: messages[1].content }],
          temperature: 0.3,
        });
        let text = aiResponse.text;

        // Clean up JSON
        text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();

        const jsonMatch = text.match(/\s*\[[\s\S]*\]\s*/);
        if (jsonMatch) text = jsonMatch[0];

        const parsedQuestions = JSON.parse(text);
        if (Array.isArray(parsedQuestions)) {
          results.push(...parsedQuestions);
        }
      } catch (e: unknown) {
        const eMsg = e instanceof Error ? e.message : String(e);
        console.error('Error in AI call or parsing:', eMsg);
        // If it's a model/key error, we should probably stop and report it
        if (eMsg.includes('API Key') || eMsg.includes('Modelo') || eMsg.includes('Permisos')) {
           // FIX-SEC-019: Hide error details in production
           return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? eMsg : 'Error interno del servidor' }, { status: 500 });
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No se pudieron generar preguntas. Verifica la configuración de AI o el contenido del PDF.' }, { status: 500 });
    }

    // Save to DB
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
    }
    const { data: insertedData, error } = await supabaseAdmin
      .from('learning_cards')
      .insert(results.map(q => ({
        question: q.question,
        answer: q.answer,
        difficulty: q.difficulty,
        category: q.category,
        source: safeName
      })))
      .select();

    if (error) throw error;

    return NextResponse.json({
      message: `Generadas ${insertedData?.length || 0} tarjetas desde ${safeName}`,
      count: insertedData?.length || 0
    });

  } catch (error: unknown) {
    console.error('Generation error:', error);
    // FIX-SEC-019: Hide error details in production
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
}

export const POST = withTracing(postHandler, 'POST /api/academy/generate');

async function getHandler(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const manualsDir = path.join(process.cwd(), 'docs', 'manuals');
    let files: string[] = [];
    try {
      files = readdirSync(manualsDir)
        .filter(f => f.endsWith('.txt') || f.endsWith('.json'))
        .map(f => f.replace(/\.(txt|json)$/, ''));
    } catch {
      // Directory doesn't exist yet
    }
    return NextResponse.json({ files });
  } catch (error) {
    return NextResponse.json({ error: 'Error listing manuals' }, { status: 500 });
  }
}

export const GET = withTracing(getHandler, 'GET /api/academy/generate');
