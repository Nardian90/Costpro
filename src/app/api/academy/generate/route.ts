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
      return NextResponse.json({ error: 'File not found: ' + filePath }, { status: 404 });
    }

    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    const fullText = data.text;

    if (!fullText || fullText.trim().length === 0) {
        return NextResponse.json({ error: 'Could not extract text from PDF' }, { status: 400 });
    }

    // Initialize AI Provider
    // Use user-provided key or fallback to system env vars
    const provider = getLLMProvider(aiProvider, aiApiKey);

    // Chunking: approx 4000 chars
    const chunkSize = 4000;
    const chunks = [];
    for (let i = 0; i < fullText.length; i += chunkSize) {
      chunks.push(fullText.slice(i, i + chunkSize));
    }

    const results: any[] = [];
    const processedChunks = chunks.slice(0, limit);

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
      } catch (e) {
        console.error('Error in AI call or parsing:', e);
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No questions generated. Check your AI configuration or PDF content.' }, { status: 500 });
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
      message: `Generated ${insertedData?.length || 0} cards from ${filename}`,
      count: insertedData?.length || 0
    });

  } catch (error: any) {
    console.error('Generation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
