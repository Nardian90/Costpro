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

    const { new_password, send_reset_email } = parsed.data;

    // ─── REMEDIACIÓN (fix/users-multistore-admin-password) ──────────────────
    // Flujo A — SETEO DIRECTO (Super Admin establece la nueva contraseña).
    // Caso de producto: usuarios finales con baja alfabetización digital no
    // pueden completar el flujo de correo; el administrador les entrega una
    // contraseña nueva directamente. La operación administrativa
    // (supabase.auth.admin.updateUserById) se ejecuta EXCLUSIVAMENTE en
    // servidor con service_role (getSupabaseAdminSafe); la contraseña jamás
    // se persiste, loguea, ni devuelve. Autorización: withRole('admin') de
    // este handler (mecanismo canónico profiles.role — sin emails
    // hardcodeados) + bloqueo de self-reset ya aplicado arriba.
    if (new_password) {
      // 1. Usuario objetivo válido (existente y no eliminado).
      const { data: targetProfile, error: targetError } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('id', user_id)
        .is('deleted_at', null)
        .single();

      if (targetError || !targetProfile) {
        return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
      }

      // 2. Operación administrativa de Supabase Auth (server-side only).
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user_id, {
        password: new_password,
      });

      if (updateError) {
        // Sanitizado: el mensaje de Supabase describe la política de auth,
        // nunca contiene la contraseña. No se registra el valor enviado.
        logger.error('AUTH', 'ADMIN_PASSWORD_SET_FAILED', { userId: user_id, error: updateError.message });
        return NextResponse.json({ error: updateError.message || 'No se pudo actualizar la contraseña' }, { status: 400 });
      }

      // 3. Auditoría administrativa (user_audit_log existente) — SOLO
      // actor/objetivo/operación/resultado. NUNCA la contraseña ni hashes.
      const { error: auditError } = await supabaseAdmin.from('user_audit_log').insert({
        performed_by: session.user.id,
        target_user_id: user_id,
        action: 'PASSWORD_SET_BY_ADMIN',
        metadata: { method: 'admin_direct_set' },
      });

      if (auditError) {
        // La contraseña YA fue cambiada: no se reporta error al cliente, pero
        // el fallo de trazabilidad se registra server-side para su revisión.
        logger.error('AUTH', 'ADMIN_PASSWORD_SET_AUDIT_FAILED', { userId: user_id, error: auditError.message });
      }

      return NextResponse.json({
        success: true,
        message: 'Contraseña actualizada correctamente.',
      });
    }

    if (send_reset_email === false) {
      return NextResponse.json(
        { error: 'Debe proporcionar una nueva contraseña o permitir el envío del correo de recuperación' },
        { status: 400 }
      );
    }

    // Flujo B — RECUPERACIÓN POR CORREO (comportamiento preexistente intacto).
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
