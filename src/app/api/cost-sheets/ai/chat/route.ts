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

    // Load Normative Base
    const jsonPath = path.join(process.cwd(), 'public', 'manuals', '1482023.json');
    let normativeBase = '';
    if (fs.existsSync(jsonPath)) {
      normativeBase = fs.readFileSync(jsonPath, 'utf8');
    } else {
      normativeBase = "Referencia: Resolución 148/2023 del MFP (Metodología para la elaboración de la ficha de costos).";
    }

    // System Prompt construction
    const systemPrompt = {
      role: 'system',
      content: `Eres un asistente de IA experto llamado Darian, especializado en el Módulo de Costos de la plataforma Costpro.
      Tu propósito es ayudar al usuario a entender, completar y auditar sus fichas de costo basándote en datos reales y normativas legales (Resolución 148/2023).

      CAPACIDADES ESPECIALES:
      1. AGENTE DE GENERACIÓN INTEGRAL:
         Actúa como un agente autónomo. Cuando el usuario solicite generar una ficha (ej. "Generar ficha de producción de pan"), debes realizar un proceso completo:
         - REINICIO: Incluye siempre "resetBeforeApply": true en tu JSON para limpiar datos previos.
         - MATERIA PRIMA (Anexo I): Desglosa todos los ingredientes, cantidades y precios reales.
         - MANO DE OBRA (Anexo II): Incluye los puestos necesarios, horas y tarifas.
         - OTROS COSTOS (Anexo III/IV): Si aplica, incluye depreciación de equipos clave y otros gastos directos.
         - FORMATO OBLIGATORIO: Usa exclusivamente el bloque 'json_annex_update' envuelto en triple backticks.
           Ejemplo: \`\`\`json_annex_update { "resetBeforeApply": true, "header": { "name": "Producto" }, "annexes": [ { "id": "I", "data": [...] } ] } \`\`\`

      REGLAS DE ORO:
      - NO escribas el JSON fuera de los bloques de código.
      - NO menciones que has guardado la ficha. Di: "He preparado una propuesta técnica detallada. Puedes revisarla en el chat y aplicarla usando el botón de abajo."
      - Sé extremadamente conciso. Muestra el bloque JSON y un mensaje de confirmación breve. El usuario verá el desglose visualmente en el chat gracias al sistema de previsualización.

      FUENTES DE VERDAD:
      1. BASE NORMATIVA (Resolución 148/2023):
      ${normativeBase.substring(0, 12000)}

      2. DATOS DE LA FICHA ACTUAL:
      ${JSON.stringify(sheetData, null, 2)}

      COMPORTAMIENTO:
      - Responde de forma profesional y técnica.
      - Si generas una propuesta, una vez que el usuario la aplique, se guardará en el sistema y podrá ver los resultados detallados en el modo "Todo".
      `
    };

    const provider = getLLMProvider(aiProvider, aiApiKey);
    const response = await provider.getResponse([systemPrompt, ...messages], { temperature: 0.2 });

    return NextResponse.json({ text: response.text });

  } catch (error: any) {
    console.error('[CostAI] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
