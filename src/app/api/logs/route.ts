import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { withTracing } from '@/lib/observability';

export const dynamic = 'force-dynamic';

/**
 * Endpoint for receiving client-side logs in production.
 * Accepts two payload formats:
 *   1. Structured: { context, error: { message, stack, code } }
 *   2. Flat:       { level, context, message, stack, data? }
 * Auth is optional — errors from unauthenticated contexts (e.g. ErrorBoundary)
 * are still logged to avoid silent failures.
 */

async function postHandler(req: NextRequest) {
  try {
    // Best-effort auth — don't block logging if no session
    let userId = 'anonymous';
    try {
      const session = await getServerSession(req);
      if (session) userId = session.user.id;
    } catch {
      // Auth failed, proceed with anonymous logging
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: true });
    }

    const level = (body.level as string) || 'info';
    const context = (body.context as string) || 'unknown';

    // Format 1: Nested error object (rpc-validator, QueryProvider)
    const nestedError = body.error as Record<string, unknown> | undefined;
    const message = (nestedError?.message as string) || (body.message as string) || 'No message';
    const stack = (nestedError?.stack as string) || (body.stack as string) || '';
    const data = body.data || body.variables;

    // Server-side logging — in production, integrate with external log service
    const dataStr = data ? JSON.stringify(data).slice(0, 200) : '';
    console.log(
      `[ClientLog] ${level.toUpperCase()} [${context}] user=${userId} ${message}${stack ? '\n  ' + String(stack).slice(0, 500) : ''}${dataStr ? '\n  data: ' + dataStr : ''}`
    );

    return NextResponse.json({ ok: true });
  } catch {
    // Silently succeed to avoid client error loops
    return NextResponse.json({ ok: true });
  }
}

export const POST = withTracing(postHandler, 'POST /api/logs');
