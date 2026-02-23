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

    const systemPrompt = {
      role: 'system',
      content: `Eres Darian, experto en Costpro.
      Tu misión es generar propuestas de fichas de costo (Res. 148/2023).

      CRÍTICO (TIMEOUTS/FORMATO):
      1. SÉ MUY BREVE. No des explicaciones.
      2. MÁXIMO 5 ITEMS por anexo.
      3. COMIENZA EL JSON DE INMEDIATO.
      4. FORMATO: Usa exclusivamente el bloque \`\`\`json_annex_update.
      5. IDs DE ANEXO: Usa estrictamente "I", "II", "III", "IV", "V".
      6. CLAVES DE ITEMS:
         - Anexo I: { "description", "um", "consumption_norm", "price", "total" }
         - Anexo II: { "description", "time_norm", "hourly_rate", "worker_count", "total" }
         - Anexo IV: { "description", "amount" }
      7. No incluyas comentarios dentro del JSON.

      Regla: "He preparado una propuesta técnica detallada. Puedes revisarla y aplicarla abajo."

      DATOS ACTUALES: ${JSON.stringify(sheetData)}`
    };

    const provider = getLLMProvider(aiProvider, aiApiKey);
    const response = await provider.getResponse([systemPrompt, ...messages], { temperature: 0.1 });

    return NextResponse.json({ text: response.text });
  } catch (error: any) {
    console.error('[AIChat] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
