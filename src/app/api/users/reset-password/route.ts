import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { resetPasswordSchema, zodError } from '@/validation/api-schemas';
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
    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { user_id } = parsed.data;

    if (user_id === session.user.id) {
      return NextResponse.json({ error: 'No puedes restablecer tu propia contraseña desde aquí' }, { status: 400 });
    }

    // Iteración 12 (H-6): Audit log via RPC antes de generar link
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_reset_password', {
      p_user_id: user_id,
      p_caller_id: session.user.id,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('ERR_SELF_RESET_BLOCKED')) {
        return NextResponse.json({ error: 'No puedes restablecer tu propia contraseña desde aquí' }, { status: 400 });
      }
      if (msg.includes('ERR_UNAUTHORIZED')) {
        return NextResponse.json({ error: 'Solo los administradores pueden reiniciar contraseñas' }, { status: 403 });
      }
      if (msg.includes('ERR_USER_NOT_FOUND')) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Generar recovery link
    const targetEmail = (rpcData as { email?: string } | null)?.email;
    if (!targetEmail) {
      return NextResponse.json({ error: 'No se pudo obtener el email del usuario' }, { status: 500 });
    }

    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: targetEmail,
    });

    if (resetError) {
      logger.error('AUTH', 'RECOVERY_LINK_FAILED', { userId: user_id, error: resetError.message });
      return NextResponse.json({ error: resetError.message }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: 'Se ha enviado un correo de recuperación al usuario.'
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/reset-password');
