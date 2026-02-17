import { NextRequest, NextResponse } from 'next/server';
// @ts-ignore
import pdf from 'pdf-parse/lib/pdf-parse.js';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabaseClient';
import { getLLMProvider } from '@/lib/ai/orchestrator';

// Use standard Node runtime because pdf-parse needs fs and Buffer
export const runtime = 'nodejs';

export async function GET() {
  const manualsDir = path.join(process.cwd(), 'public', 'manuals');
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
    const { filename, limit = 3, aiProvider, aiApiKey } = await req.json();
    if (!filename) {
      return NextResponse.json({ error: 'Filename is required' }, { status: 400 });
    }

    const filePath = path.join(process.cwd(), 'public', 'manuals', filename);
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'Archivo no encontrado: ' + filename }, { status: 404 });
    }

    // Pre-check for API Key if using a provider that requires it
    const effectiveProvider = (aiProvider || process.env.LLM_PROVIDER || 'gemini').toLowerCase();
    const effectiveApiKey = aiApiKey || (
      effectiveProvider === 'gemini' ? process.env.GEMINI_API_KEY :
      effectiveProvider === 'gpt' ? process.env.OPENAI_API_KEY :
      effectiveProvider === 'qwen' ? process.env.QWEN_API_KEY : ''
    );

    if (!effectiveApiKey) {
        return NextResponse.json({
            error: `No se ha configurado la API Key para ${effectiveProvider}. Por favor, ve a tu perfil y configúrala.`
        }, { status: 401 });
    }

    let dataBuffer;
    try {
        dataBuffer = fs.readFileSync(filePath);
    } catch (e: any) {
        return NextResponse.json({ error: 'Error al leer el archivo PDF: ' + e.message }, { status: 500 });
    }

    let data;
    try {
        data = await pdf(dataBuffer);
    } catch (e: any) {
        return NextResponse.json({ error: 'Error al procesar el PDF (posible formato inválido o corrupto): ' + e.message }, { status: 400 });
    }

    const fullText = data.text;

    if (!fullText || fullText.trim().length === 0) {
        return NextResponse.json({ error: 'No se pudo extraer texto del PDF. Asegúrate de que no sea solo una imagen o tenga protección.' }, { status: 400 });
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
    const processedChunks = chunks.slice(0, limit);
    let lastAiError: string | null = null;

    for (const chunk of processedChunks) {
      const messages: any[] = [
        {
          role: 'system',
          content: 'Eres experto en sistemas de gestión de costos empresariales y la plataforma Costpro. Tu objetivo es generar material educativo preciso y técnico.'
        },
        {
          role: 'user',
          content: `A partir del siguiente fragmento de manual técnico, genera un conjunto de flashcards educativas.

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
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // Basic JSON finding if AI adds text
        const jsonMatch = text.match(/\s*\[[\s\S]*\]\s*/);
        if (jsonMatch) text = jsonMatch[0];

        const parsedQuestions = JSON.parse(text);
        if (Array.isArray(parsedQuestions)) {
          results.push(...parsedQuestions);
        }
      } catch (e: any) {
        console.error('Error in AI call or parsing:', e);
        lastAiError = e.message;
        // If it's a model not found or auth error, don't bother continuing with other chunks
        if (e.message.includes('404') || e.message.includes('not found') || e.message.includes('API Key')) {
            break;
        }
      }
    }

    if (results.length === 0) {
      const detail = lastAiError ? ` Detalles IA: ${lastAiError}` : '';
      return NextResponse.json({
        error: `No se pudieron generar preguntas.${detail} Revisa la configuración de tu IA o el contenido del PDF.`
      }, { status: 500 });
    }

    // Save to DB
    const { data: insertedData, error } = await supabase
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
