import { NextRequest, NextResponse } from 'next/server';
import { FichaJSONSchema } from '@/lib/cost-engine/schemas';
import { calculateFicha, validateFicha } from '@/lib/cost-engine';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // 1. Schema Validation
    const validation = FichaJSONSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        ok: false,
        errors: validation.error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      }, { status: 400 });
    }

    const ficha = validation.data;

    // 2. Semantic Validation
    const semanticCheck = validateFicha(ficha);
    if (!semanticCheck.valid) {
      return NextResponse.json({ ok: false, errors: semanticCheck.errors }, { status: 400 });
    }

    // 3. Calculation
    const result = calculateFicha(ficha, { actor: 'api-user' });

    return NextResponse.json({ ok: true, ...result });
  } catch (error: any) {
    console.error('Calculation API Error:', error);
    return NextResponse.json({ ok: false, errors: [error.message] }, { status: 500 });
  }
}
