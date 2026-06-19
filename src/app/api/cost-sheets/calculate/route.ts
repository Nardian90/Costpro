import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { FichaJSONSchema } from '@/lib/cost-engine/schemas';
import { calculateFicha, validateFicha } from '@/lib/cost-engine';
import { rateLimit } from '@/lib/rate-limit';
import { withTracing } from '@/lib/observability';


const handler = withAuth(async (req, session) => {

  try {
    // FIX-SEC-015: Rate-limit by user ID after auth, not by IP before auth
    const clientId = session.user.id;
    const { allowed, remaining, resetAt } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 60 });

    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Too many requests. Please try again later.' }), {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetAt.toISOString(),
          'Retry-After': String(Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
        },
      });
    }

    const body = await req.json();

    // 1. Schema Validation
    const validation = FichaJSONSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json({
        ok: false,
        errors: validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`)
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
  } catch (error: unknown) {
    console.error('Calculation API Error:', error);
    return NextResponse.json({ ok: false, errors: ["Error interno en el motor de cálculo"] }, { status: 500 });
  }

});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/cost-sheets/calculate');
