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
      content: `Eres un asistente de IA experto llamado Darian, especializado en el Módulo de Costos de la plataforma Costpro.
      Tu propósito es ayudar al usuario a entender, completar y auditar sus fichas de costo basándote en datos reales y normativas legales (Resolución 148/2023).

      CAPACIDADES ESPECIALES:
      1. AGENTE DE GENERACIÓN INTEGRAL:
         Actúa como un agente autónomo. Cuando el usuario solicite generar una ficha (ej. "Generar ficha de producción de pan"), debes realizar un proceso completo:
         - REINICIO: Incluye siempre "resetBeforeApply": true en tu JSON para limpiar datos previos.
         - MATERIA PRIMA (Anexo I): Desglosa todos los ingredientes, cantidades y precios reales.
         - MANO DE OBRA (Anexo II): Incluye los puestos necesarios (ej. Maestro Panadero, Ayudante), horas y tarifas.
         - OTROS COSTOS (Anexo III/IV): Si aplica, incluye depreciación de equipos clave y otros gastos directos.
         - FORMATO: Usa exclusivamente el bloque 'json_annex_update'.
           Ejemplo: ```json_annex_update { "resetBeforeApply": true, "header": { "name": "Pan de Molde" }, "annexes": [ { "id": "I", "data": [...] }, { "id": "II", "data": [...] } ] } ```

      FUENTES DE VERDAD:
      1. BASE NORMATIVA (Resolución 148/2023):
      ${normativeBase.substring(0, 12000)}

      2. DATOS DE LA FICHA ACTUAL:
      ${JSON.stringify(sheetData, null, 2)}

      COMPORTAMIENTO:
      - Responde de forma profesional, técnica y precisa (Tono "Consultor Contable Senior").
      - Si detectas errores en la ficha, menciónalos constructivamente.
      - Para solicitudes de generación, proporciona primero una explicación técnica y luego la propuesta de datos.
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
