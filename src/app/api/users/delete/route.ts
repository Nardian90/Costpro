import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { logger } from '@/lib/logger';

// USER-MGMT-DELETE-001: reason OPCIONAL con default — el flujo clásico de la
// vista enviaba solo {user_id} y el schema estricto devolvía 400 SIEMPRE
// (causa raíz del bug: el botón Eliminar jamás llegó a ejecutarse).
// La eliminación DEFINITIVA (hard-delete) sigue exigiendo razón explícita.
const softDeleteUserSchema = z.object({
  user_id: uuidLoose,
  reason: z.string().min(3).max(500).optional(),
});

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
    const parsed = softDeleteUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: parsed.error.format() },
        { status: 400 }
      );
    }
    const { user_id, reason } = parsed.data;

    if (user_id === session.user.id) {
      return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 });
    }

    // Iteración 12 (Q6): Soft delete via RPC con audit atómico + PII anonymization
    // USER-MGMT-DELETE-001: reason con default explícito cuando la UI no lo envía.
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_soft_delete_user', {
      p_user_id: user_id,
      p_reason: reason ?? 'Eliminado desde la vista de administración de usuarios',
      p_caller_id: session.user.id,
    });

    if (rpcError) {
      const msg = rpcError.message || '';
      if (msg.includes('ERR_SELF_DELETE_BLOCKED')) {
        return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 });
      }
      if (msg.includes('ERR_USER_HAS_ACTIVE_MEMBERSHIPS')) {
        return NextResponse.json({
          error: 'El usuario tiene memberships activas. Revócalas antes de eliminar.'
        }, { status: 409 });
      }
      if (msg.includes('ERR_USER_NOT_FOUND_OR_ALREADY_DELETED')) {
        return NextResponse.json({ error: 'Usuario no encontrado o ya eliminado' }, { status: 404 });
      }
      if (msg.includes('ERR_UNAUTHORIZED')) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
      }
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    // Ban auth.users (10 años) + signOut — no falla el soft delete si esto falla
    try {
      await supabaseAdmin.auth.admin.updateUserById(user_id, { ban_duration: '87600h' });
    } catch (banErr) {
      logger.warn('AUTH', 'BAN_FAILED_AFTER_SOFT_DELETE', {
        userId: user_id,
        error: banErr instanceof Error ? banErr.message : String(banErr),
      });
    }

    try {
      await supabaseAdmin.auth.admin.signOut(user_id);
    } catch (signOutErr) {
      logger.warn('AUTH', 'SIGNOUT_FAILED_AFTER_SOFT_DELETE', {
        userId: user_id,
        error: signOutErr instanceof Error ? signOutErr.message : String(signOutErr),
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Usuario eliminado (soft delete). Datos preservados, credenciales revocadas.',
      ...(rpcData as object || {}),
    });
  } catch (error: unknown) {
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/delete');
