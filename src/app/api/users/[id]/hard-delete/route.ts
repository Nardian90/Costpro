import { NextRequest, NextResponse } from 'next/server';
import { withRole, type AuthenticatedSession } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { validateOrigin } from '@/lib/csrf';
import { withTracing } from '@/lib/observability';
import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import { uuidLoose } from '@/validation/api-schemas';

/**
 * USER-MGMT-DELETE-001 — Eliminación definitiva administrativa de usuarios.
 *
 * POST /api/users/[id]/hard-delete           → ejecución
 * POST /api/users/[id]/hard-delete?preflight=1 → inspección SIN efectos
 *   (la usa el diálogo de confirmación para mostrar al SuperAdmin qué se
 *   preserva, qué se elimina y qué bloquea antes de confirmar).
 *
 * Autorización en el SERVIDOR (nunca un parámetro del navegador):
 *   1. withRole('admin') valida la sesión y el rol real del perfil.
 *   2. La RPC (managed_delete_user_preflight / managed_hard_delete_user)
 *      vuelve a verificar SUPERADMIN con el caller_id de la sesión — un
 *      admin ordinario NO puede eliminar cuentas aunque llegue aquí.
 *   3. Guardas dentro de la RPC: autoeliminación y último SuperAdmin activo.
 *
 * El UUID del objetivo se toma de la RUTA (identidad estable); nunca se usa
 * el correo como identificador de borrado. El flujo resuelve cuentas
 * parciales (solo Auth, solo profiles, sin correo visible).
 *
 * Idempotencia: repetir la llamada sobre un usuario ya eliminado devuelve
 * success/already_deleted (la RPC lo garantiza).
 */

const hardDeleteSchema = z.object({
  reason: z.string().min(3, 'Razón requerida (mín 3 chars)').max(500),
});

function errFromRpc(msg: string): { error: string; status: number } | null {
  if (msg.includes('ERR_SELF_DELETE_BLOCKED')) return { error: 'No puedes eliminar tu propia cuenta', status: 400 };
  if (msg.includes('ERR_LAST_SUPERADMIN')) return { error: 'No puedes eliminar al último SuperAdmin activo', status: 409 };
  if (msg.includes('ERR_USER_NOT_FOUND')) return { error: 'No existe ninguna cuenta con ese identificador (ni perfil ni identidad de acceso)', status: 404 };
  if (msg.includes('ERR_UNAUTHORIZED')) return { error: 'Solo un SuperAdmin puede eliminar cuentas de usuario', status: 403 };
  if (msg.includes('ERR_BLOCKING_DEPENDENCIES')) return { error: 'El usuario tiene registros contables u operativos con referencia obligatoria (ventas, transferencias, ajustes, vales de emisión o sesiones de caja). Reasigna o anula esos registros antes de eliminar la cuenta: la historia comercial no se borra ni se reescribe.', status: 409 };
  if (msg.includes('ERR_REASON_REQUIRED')) return { error: 'La eliminación administrativa exige una razón', status: 400 };
  return null;
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { allowed } = await rateLimit(`users:hard-delete:${session.user.id}`, {
    windowMs: 60_000,
    maxRequests: 20,
  });
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });

  // UUID del objetivo desde la ruta.
  const url = new URL(req.url);
  const pathParts = url.pathname.split('/');
  const targetId = pathParts[pathParts.length - 2]; // [...,'<id>','hard-delete']
  if (!targetId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId)) {
    return NextResponse.json({ error: 'Invalid user_id' }, { status: 400 });
  }

  const isPreflight = url.searchParams.get('preflight') === '1';

  // ── Preflight: inspección sin efectos (mismo contrato de autorización) ──
  if (isPreflight) {
    const { data, error } = await supabaseAdmin.rpc('managed_delete_user_preflight', {
      p_target_id: targetId,
      p_caller_id: session.user.id,
    });
    if (error) {
      const msg = error.message || '';
      const mapped = errFromRpc(msg);
      if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status });
      logger.error('DATABASE', 'PREFLIGHT_DELETE_USER_RPC_FAILED', { code: (error as { code?: string }).code, msg: msg.slice(0, 80) });
      return NextResponse.json({ error: 'No se pudo inspeccionar la cuenta' }, { status: 400 });
    }
    return NextResponse.json(data as object);
  }

  // ── Ejecución ─────────────────────────────────────────────────────────────
  let reason: string;
  try {
    const rawBody = await req.json();
    const parsed = hardDeleteSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos: la eliminación definitiva exige una razón (3-500 caracteres)', details: parsed.error.format() }, { status: 400 });
    }
    reason = parsed.data.reason;
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la petición inválido' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.rpc('managed_hard_delete_user', {
    p_target_id: targetId,
    p_reason: reason,
    p_caller_id: session.user.id,
  });

  if (error) {
    const msg = error.message || '';
    const mapped = errFromRpc(msg);
    if (mapped) return NextResponse.json({ error: mapped.error }, { status: mapped.status });
    logger.error('DATABASE', 'HARD_DELETE_USER_RPC_FAILED', { code: (error as { code?: string }).code, msg: msg.slice(0, 80) });
    return NextResponse.json({ error: 'No se pudo eliminar el usuario' }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    message: 'Usuario eliminado definitivamente. El historial comercial se conserva; la identidad de acceso fue retirada.',
    ...(data as object || {}),
  });
}

export const POST = withTracing(
  withRole('admin', postHandler) as Parameters<typeof withTracing>[0],
  'POST /api/users/[id]/hard-delete'
);
