import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { getServerSession } from "@/lib/auth";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      console.error('[CostAI] No session found');
      return NextResponse.json({ error: 'Sesión no válida o expirada. Por favor, re-inicia sesión.' }, { status: 401 });
    }

    const { messages, sheetData, aiProvider, aiApiKey } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required' }, { status: 400 });
    }

    // Load Normative Base (JSON is preferred for structure)
    const jsonPath = path.join(process.cwd(), 'public', 'manuals', '1482023.json');
    let normativeBase = '';
    if (fs.existsSync(jsonPath)) {
      normativeBase = fs.readFileSync(jsonPath, 'utf8');
    } else {
      // Fallback to PDF text if needed
      normativeBase = "Referencia: Resolución 148/2023 del MFP (Metodología para la elaboración de la ficha de costos).";
    }

    // System Prompt construction
    const systemPrompt = {
      role: 'system',
      content: `      content: `Eres un asistente de IA experto llamado Darian, especializado en el Módulo de Costos de la plataforma Costpro.
      Tu propósito es ayudar al usuario a entender, completar y auditar sus fichas de costo basándote en datos reales y normativas legales (Resolución 148/2023).

      CAPACIDADES ESPECIALES:
      1. GENERACIÓN INTELIGENTE DE ANEXOS:
         Cuando el usuario solicite generar una ficha (ej. "Generar ficha de producción de pan"), debes:
         - Identificar el tipo de producto.
         - Proponer una estructura detallada de Materia Prima y Mano de Obra.
         - Utilizar precios de referencia del mercado informal cubano actualizados y realistas.
         - IMPORTANTE: Si vas a proponer datos para anexos, usa bloques de código con el lenguaje 'json_annex_update' para que la interfaz pueda procesarlos.
           Ejemplo: \`\`\`json_annex_update { "annexes": [ { "id": "1", "data": [...] } ], "header": { "productName": "..." } } \`\`\`

      FUENTES DE VERDAD:
      1. BASE NORMATIVA (Resolución 148/2023):
      ${normativeBase.substring(0, 12000)}

      2. DATOS DE LA FICHA ACTUAL:
      ${JSON.stringify(sheetData, null, 2)}

      COMPORTAMIENTO:
      - Responde de forma profesional, técnica y precisa (Tono "Consultor Contable Senior").
      - Si detectas errores en la ficha, menciónalos constructivamente.
      - Para solicitudes de generación, proporciona primero una explicación técnica y luego la propuesta de datos.
      ``
    };

    const provider = getLLMProvider(aiProvider, aiApiKey);
    const response = await provider.getResponse([systemPrompt, ...messages], { temperature: 0.2 });

    return NextResponse.json({ text: response.text });

  } catch (error: any) {
    console.error('[CostAI] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
