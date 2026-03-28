import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
import pdf from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { getServerSession } from "@/lib/auth";

// Use standard Node runtime because pdf-parse needs fs and Buffer
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Configuración de Supabase incompleta (URL o Service Role Key faltante)');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function GET() {
  const manualsDir = path.join(/*turbopackIgnore: true*/process.cwd(), 'public', 'manuals');
  try {
    if (!fs.existsSync(manualsDir)) {
      return NextResponse.json({ files: [] });
    }
    const files = fs.readdirSync(manualsDir).filter(f => f.endsWith('.pdf'));
    return NextResponse.json({ files });
  } catch (e) {
    return NextResponse.json({ files: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Verify session
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { filename, limit = 3, aiProvider, aiApiKey } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const filePath = path.join(/*turbopackIgnore: true*/process.cwd(), 'public', 'manuals', filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found: ' + filePath }, { status: 404 });
    }

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    let fullText = data.text;

    // Search for companion JSON file
    const baseName = filename.replace(/\.pdf$/i, '');
    const manualsDir = path.join(/*turbopackIgnore: true*/process.cwd(), "public", "manuals");
    const jsonPaths = [
        path.join(manualsDir, `${baseName}.json`),
        path.join(manualsDir, baseName.replace(/^Res/, '') + '.json'),
        path.join(manualsDir, baseName.replace(/^Res/, 'Res ') + '.json')
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
    const chunks = [];
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
           return NextResponse.json({ error: e.message }, { status: 500 });
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
        source: filename
      })))
      .select();

    if (error) throw error;

    return NextResponse.json({
      message: `Generadas ${insertedData?.length || 0} tarjetas desde ${filename}`,
      count: insertedData?.length || 0
    });

  } catch (error: any) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
