import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { withTracing } from '@/lib/observability';
import { rateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

function sanitizeLogField(val: unknown, maxLen = 200): string {
    return String(val ?? '')
        .replace(/[\r\n\t]/g, ' ')  // eliminates newline injection
        .replace(/[^\x20-\x7E]/g, '') // only printable ASCII
        .slice(0, maxLen);
}

async function postHandler(req: NextRequest) {
  try {
    // 1. Rate limit by IP (anonymous) with low limit - BUG-027
    const clientId = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'anon-log';
    const { allowed } = await rateLimit(`log:${clientId}`, { windowMs: 60_000, maxRequests: 20 });
    if (!allowed) return NextResponse.json({ ok: true }); // silent to not break ErrorBoundary

    // Best-effort auth
    let userId = 'anonymous';
    try {
      const session = await getServerSession(req);
      if (session) userId = session.user.id;
    } catch {
      // Auth failed, proceed with anonymous
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: true });
    }

    const level = sanitizeLogField(body.level, 10) || 'info';
    const context = sanitizeLogField(body.context, 50) || 'unknown';

    const nestedError = body.error as Record<string, unknown> | undefined;
    const message = sanitizeLogField((nestedError?.message as string) || (body.message as string) || 'No message', 200);
    const stack = sanitizeLogField((nestedError?.stack as string) || (body.stack as string) || '', 300);
    const data = body.data || body.variables;

    const dataStr = data ? JSON.stringify(data).replace(/[\r\n\t]/g, ' ').slice(0, 200) : '';

    // BUG-027: Sanitized logging
    console.log(
      `[ClientLog] ${level.toUpperCase()} [${context}] user=${userId} ${message}` +
      `${stack ? ' stack: ' + stack : ''}` +
      `${dataStr ? ' data: ' + dataStr : ''}`
    );

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}

export const POST = withTracing(postHandler, 'POST /api/logs');
