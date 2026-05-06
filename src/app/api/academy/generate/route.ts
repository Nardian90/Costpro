import { academyGenerateSchema, zodError } from '@/validation/api-schemas';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { getServerSession } from "@/lib/auth";
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';
import fs, { readdirSync } from 'fs';
import path from 'path';

// Supabase Admin client for server-side operations
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuración de Supabase incompleta');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

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

    // Initialize AI Provider
    const provider = getLLMProvider(aiProvider, aiApiKey);

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
        const aiResponse = await provider.getResponse(messages, { temperature: 0.3 });
        let text = aiResponse.text;

        // Clean up JSON
        text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();

        const jsonMatch = text.match(/\s*\[[\s\S]*\]\s*/);
        if (jsonMatch) text = jsonMatch[0];

        const parsedQuestions = JSON.parse(text);
        if (Array.isArray(parsedQuestions)) {
          results.push(...parsedQuestions);
        }
      } catch (e: any) {
        console.error('Error in AI call or parsing:', e.message);
        // If it's a model/key error, we should probably stop and report it
        if (e.message.includes('API Key') || e.message.includes('Modelo') || e.message.includes('Permisos')) {
           // FIX-SEC-019: Hide error details in production
           return NextResponse.json({ error: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? e.message : 'Error interno del servidor' }, { status: 500 });
        }
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No se pudieron generar preguntas. Verifica la configuración de AI o el contenido del PDF.' }, { status: 500 });
    }

    // Save to DB
    const supabaseAdmin = getSupabaseAdmin();
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

  } catch (error: any) {
    console.error('Generation error:', error);
    // FIX-SEC-019: Hide error details in production
    return NextResponse.json({ error: process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test' ? error.message : 'Error interno del servidor' }, { status: 500 });
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
