import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import pdf from 'pdf-parse';
import fs from 'fs';
import path from 'path';
import { supabase } from '@/lib/supabaseClient';

// Use standard Node runtime because pdf-parse needs fs and Buffer
export const runtime = 'nodejs';

const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
    const { filename, limit = 3 } = await req.json();
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

    // Chunking: approx 4000 chars
    const chunkSize = 4000;
    const chunks = [];
    for (let i = 0; i < fullText.length; i += chunkSize) {
      chunks.push(fullText.slice(i, i + chunkSize));
    }

    const results: any[] = [];
    const processedChunks = chunks.slice(0, limit);

    for (const chunk of processedChunks) {
      const prompt = `
        Eres experto en sistemas de gestión de costos empresariales y la plataforma Costpro.
        A partir del siguiente fragmento de manual técnico, genera un conjunto de flashcards educativas.

        INSTRUCCIONES:
        - Genera 5 preguntas tipo escenario práctico o concepto clave.
        - Respuestas técnicas precisas y concisas.
        - Nivel de dificultad: Básico, Operativo o Experto.
        - Categoría funcional: Ej. Inventario, Ventas, Costos, Configuración.

        Manual fragmento:
        ${chunk}

        Devuelve ÚNICAMENTE un formato JSON válido (sin markdown, sin bloques de código):
        [
          {
            "question": "...",
            "answer": "...",
            "difficulty": "Básico|Operativo|Experto",
            "category": "..."
          }
        ]
      `;

      try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        let text = response.text();

        // Clean up JSON
        text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();

        // Basic JSON finding if Gemini adds text
        const jsonMatch = text.match(/\\s*\\[.*\\]\\s*/s);
        if (jsonMatch) text = jsonMatch[0];

        const parsedQuestions = JSON.parse(text);
        if (Array.isArray(parsedQuestions)) {
          results.push(...parsedQuestions);
        }
      } catch (e) {
        console.error('Error in Gemini call or parsing:', e);
      }
    }

    if (results.length === 0) {
      return NextResponse.json({ error: 'No questions generated. Check Gemini API or PDF content.' }, { status: 500 });
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
