import { NextRequest, NextResponse } from 'next/server';
import { FichaJSONSchema } from '@/lib/cost-engine/schemas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validation = FichaJSONSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        ok: false,
        errors: validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ficha: validation.data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, errors: [error.message] }, { status: 500 });
  }
}
