import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getLLMProvider } from '@/lib/ai/orchestrator';
import { getServerSession } from "@/lib/auth";

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { messages, sheetData, aiProvider, aiApiKey } = await req.json();

    const jsonPath = path.join(process.cwd(), 'public', 'manuals', '1482023.json');
    let normativeBase = fs.existsSync(jsonPath) ? fs.readFileSync(jsonPath, 'utf8') : "Res. 148/2023.";

    const systemPrompt = {
      role: 'system',
      content: `Eres Darian, experto en Costpro.
      Tu misión es generar propuestas de fichas de costo (Res. 148/2023).

      CRÍTICO (TIMEOUTS):
      1. SÉ MUY BREVE. No des explicaciones.
      2. MÁXIMO 5 ITEMS por anexo.
      3. COMIENZA EL JSON DE INMEDIATO.
      4. FORMATO: Usa exclusivamente el bloque ```json_annex_update.

      Regla: "He preparado una propuesta técnica detallada. Puedes revisarla y aplicarla abajo."

      DATOS: ${JSON.stringify(sheetData)}`
    };

    const provider = getLLMProvider(aiProvider, aiApiKey);
    const response = await provider.getResponse([systemPrompt, ...messages], { temperature: 0.1 });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
