import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';

const closeSchema = z.object({
  closure_id: z.string().regex(uuidRegex),
  declared_cash: z.number().min(0),
  declared_vouchers: z.number().min(0),
  notes: z.string().max(1000).optional(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { allowed } = await rateLimit(`cash-close:${session.user.id}`, { windowMs: 60_000, maxRequests: 10 });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const body = await req.json();
  const parsed = closeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const { data, error } = await supabaseAdmin.rpc('close_cash_shift', {
    p_closure_id: parsed.data.closure_id,
    p_declared_cash: parsed.data.declared_cash,
    p_declared_vouchers: parsed.data.declared_vouchers,
    p_notes: parsed.data.notes || null,
    p_user_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_CLOSURE_NOT_PENDING')) return NextResponse.json({ error: 'El cierre ya fue finalizado' }, { status: 409 });
    if (msg.includes('ERR_CLOSURE_NOT_FOUND')) return NextResponse.json({ error: 'Cierre no encontrado' }, { status: 404 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/cash-closures/close'
);
