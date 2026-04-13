import { NextRequest, NextResponse } from 'next/server';
import { FichaJSONSchema } from '@/lib/cost-engine/schemas';
import { rateLimit } from '@/lib/rate-limit';

export async function POST(req: NextRequest) {
  try {
    // Rate limiting
    const clientId = req.headers.get('x-forwarded-for') || 'anonymous';
    const { allowed, remaining, resetAt } = rateLimit(clientId, { windowMs: 60_000, maxRequests: 30 });

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
