import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';

/**
 * Iteración 11.2 — POST /api/auth/supervisor-check
 *
 * Validates supervisor credentials server-side (not in the browser).
 * Returns supervisor_user_id if valid, which is passed to create_sale_v2.
 *
 * Rate limit: 5 req/min (stricter than checkout — credential brute-force protection).
 */

const supervisorCheckSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  store_id: z.string().uuid(),
});

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { allowed } = await rateLimit(`supervisor-check:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const body = await req.json();
  const parsed = supervisorCheckSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid data', details: parsed.error.format() }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Server config error' }, { status: 500 });
  }

  try {
    // Server-side sign-in (credentials never exposed to client)
    const { data: authData, error: authError } = await supabaseAdmin.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (authError || !authData.user) {
      logger.warn('AUTH', 'SUPERVISOR_CHECK_FAILED', {
        storeId: parsed.data.store_id,
        email: parsed.data.email,
        error: authError?.message || 'unknown',
      });
      return NextResponse.json({ valid: false, error: 'Credenciales inválidas' }, { status: 401 });
    }

    const supervisorUserId = authData.user.id;

    // Check if supervisor has admin/manager role in the store
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', supervisorUserId)
      .single();

    const isGlobalAdmin = profile?.role === 'admin' || profile?.role === 'superadmin';

    if (!isGlobalAdmin) {
      // Check store membership
      const { data: membership } = await supabaseAdmin
        .from('user_store_memberships')
        .select('role')
        .eq('user_id', supervisorUserId)
        .eq('store_id', parsed.data.store_id)
        .eq('status', 'active')
        .in('role', ['admin', 'manager'])
        .limit(1);

      if (!membership || membership.length === 0) {
        logger.warn('AUTH', 'SUPERVISOR_NOT_AUTHORIZED', {
          supervisorUserId,
          storeId: parsed.data.store_id,
        });
        return NextResponse.json({
          valid: false,
          error: 'El supervisor no tiene permisos en esta tienda',
        }, { status: 403 });
      }
    }

    logger.info('AUTH', 'SUPERVISOR_CHECK_SUCCESS', {
      supervisorUserId,
      storeId: parsed.data.store_id,
    });

    // Sign out the supervisor session immediately (we only needed to verify credentials)
    await supabaseAdmin.auth.admin.signOut(supervisorUserId);

    return NextResponse.json({
      valid: true,
      supervisor_user_id: supervisorUserId,
    });
  } catch (err) {
    logger.error('AUTH', 'SUPERVISOR_CHECK_ERROR', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export const POST = withTracing(
  withAuth(postHandler as Parameters<typeof withAuth>[0]) as Parameters<typeof withTracing>[0],
  'POST /api/auth/supervisor-check'
);
