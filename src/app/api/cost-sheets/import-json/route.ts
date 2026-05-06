import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-middleware';
import { FichaJSONSchema } from '@/lib/cost-engine/schemas';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';


const handler = withAuth(async (req, session) => {

  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Origen no permitido' }, { status: 403 });
  }

  try {
    // Rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed, remaining, resetAt } = await rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });

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

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Cuerpo de solicitud inválido (JSON malformado)' }, { status: 400 });
    }

    const validation = FichaJSONSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json({
        ok: false,
        errors: validation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`)
      }, { status: 400 });
    }

    return NextResponse.json({ ok: true, ficha: validation.data });
  } catch (error: any) {
    return NextResponse.json({ ok: false, errors: [process.env.NODE_ENV === 'development' ? error.message : 'Error interno del servidor'] }, { status: 500 });
  }

});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/cost-sheets/import-json');
