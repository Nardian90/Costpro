import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { toggleUserStatusSchema, zodError } from '@/validation/api-schemas';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { logger } from '@/lib/logger';

const handler = withRole('admin', async (req, session) => {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
    }

    const rawBody = await req.json();
    const parsed = toggleUserStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { user_id, is_active } = parsed.data;

    // Iteración 12 (C-3): Usar RPC managed_toggle_user_status con audit atómico
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_toggle_user_status', {
      p_user_id: user_id,
      p_is_active: is_active,
      p_caller_id: session.user.id,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('ERR_SELF_DEACTIVATE_BLOCKED')) {
        return NextResponse.json({ error: 'No puedes desactivar tu propia cuenta' }, { status: 400 });
      }
      if (msg.includes('ERR_UNAUTHORIZED')) {
        return NextResponse.json({ error: 'No tienes permisos suficientes' }, { status: 403 });
      }
      if (msg.includes('ERR_USER_NOT_FOUND')) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Iteración 12 (C-3): Si se desactivó, revocar sesiones via auth.admin.signOut
    if (is_active === false) {
      try {
        await supabaseAdmin.auth.admin.signOut(user_id);
      } catch (signOutErr) {
        // No bloquear el toggle si signOut falla — el JWT expira naturalmente
        logger.warn('AUTH', 'SIGNOUT_FAILED_AFTER_DEACTIVATE', {
          userId: user_id,
          error: signOutErr instanceof Error ? signOutErr.message : String(signOutErr),
        });
      }
    }

    return NextResponse.json({ success: true, ...(rpcData as object || {}) });
  } catch (error: unknown) {
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/toggle-status');
