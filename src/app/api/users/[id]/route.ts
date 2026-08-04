import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { z } from 'zod';

const updateUserSchema = z.object({
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['admin', 'superadmin', 'manager', 'clerk', 'warehouse', 'encargado', 'usuario', 'costo']).optional(),
  role_id: z.string().uuid().optional().nullable(),
  is_active: z.boolean().optional(),
  max_stores_limit: z.number().int().min(0).max(1000).optional(),
  max_users_limit: z.number().int().min(0).max(10000).optional(),
  plan: z.enum(['free', 'pro', 'enterprise']).optional(),
});

async function patchHandler(req: NextRequest, session: { user: { id: string } }) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await rateLimit(session.user.id);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Server config error' }, { status: 500 });

  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const userId = pathParts[pathParts.length - 1];

  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('managed_update_user', {
    p_user_id: userId,
    p_full_name: parsed.data.full_name ?? null,
    p_role: parsed.data.role ?? null,
    p_role_id: parsed.data.role_id ?? null,
    p_is_active: parsed.data.is_active ?? null,
    p_max_stores_limit: parsed.data.max_stores_limit ?? null,
    p_max_users_limit: parsed.data.max_users_limit ?? null,
    p_plan: parsed.data.plan ?? null,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    if (msg.includes('ERR_SELF_DEACTIVATE_BLOCKED')) return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 });
    if (msg.includes('ERR_UNAUTHORIZED')) return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    if (msg.includes('ERR_USER_NOT_FOUND')) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ success: true, ...(data as object || {}) });
}

export const PATCH = withTracing(
  withRole('admin', patchHandler) as Parameters<typeof withTracing>[0],
  'PATCH /api/users/[id]'
);
