import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { deleteUserSchema, zodError } from '@/validation/api-schemas';
import { validateOrigin } from '@/lib/csrf'; // FIX-SEC-023
import { withTracing } from '@/lib/observability';


const handler = withRole('admin', async (req, session) => {
  // FIX-SEC-023: CSRF origin validation
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
    const parsed = deleteUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { user_id } = parsed.data;

    // FIX-SEC-025: Prevent admin from deleting their own account
    const targetUserId = user_id;
    if (targetUserId === session.user.id) {
      return NextResponse.json({ error: 'No puedes eliminar tu propia cuenta' }, { status: 400 });
    }

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });

    // Robust role check
    const rawRoles = requesterProfile.roles;
    const roleNames: string[] = [];
    if (Array.isArray(rawRoles)) {
      rawRoles.forEach(r => { if (r.name) roleNames.push(r.name.toLowerCase()); });
    } else if (rawRoles && typeof rawRoles === 'object' && (rawRoles as any).name) {
      roleNames.push((rawRoles as any).name.toLowerCase());
    }
    if (requesterProfile.role) {
      roleNames.push(requesterProfile.role.toLowerCase());
    }

    if (!roleNames.includes('admin')) {
      return NextResponse.json({ error: 'Solo los administradores pueden eliminar usuarios.' }, { status: 403 });
    }

    // Call the safety check and profile deletion RPC
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_delete_user', {
        p_user_id: user_id
    });

    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });

    // Delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (authError) {
      console.error('Auth deletion failed after profile delete:', authError);
      return NextResponse.json({
        error: 'El perfil fue eliminado pero hubo un error al revocar credenciales. Contacte soporte.',
        partial: true
      }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente' });

  } catch (error: unknown) {
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/delete');
