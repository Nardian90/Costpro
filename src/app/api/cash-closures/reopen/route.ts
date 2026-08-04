import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';

const reopenSchema = z.object({
  closure_id: z.string().regex(uuidRegex),
  reason: z.string().min(3).max(500),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { allowed } = await rateLimit(`cash-reopen:${session.user.id}`, { windowMs: 60_000, maxRequests: 5 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const parsed = reopenSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data, error } = await supabaseAdmin.rpc('reopen_cash_shift', {
    p_closure_id: parsed.data.closure_id,
    p_reason: parsed.data.reason,
    p_user_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_CLOSURE_NOT_CLOSED')) return NextResponse.json({ error: 'El cierre no está cerrado' }, { status: 409 });
    if (msg.includes('ERR_REASON_REQUIRED')) return NextResponse.json({ error: 'Razón requerida (mín 3 chars)' }, { status: 400 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'Solo admin/manager puede reabrir cierres' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/cash-closures/reopen'
);
