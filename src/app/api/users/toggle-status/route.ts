import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { toggleUserStatusSchema, zodError } from '@/validation/api-schemas';
import { validateOrigin } from '@/lib/csrf'; // FIX-SEC-023
import { withTracing } from '@/lib/observability';

// Helper to get Supabase Admin client lazily to avoid build-time errors with missing env vars
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Configuración de Supabase incompleta (URL o Service Role Key faltante)');
  }

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

const handler = withRole('admin', async (req, session) => {
  // FIX-SEC-023: CSRF origin validation
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verify Admin/Encargado role
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
    }

    // Robust role check (supports object, array, and direct role column)
    const rawRoles = requesterProfile.roles;
    const roleNames: string[] = [];

    // Add roles from joined table
    if (Array.isArray(rawRoles)) {
      rawRoles.forEach(r => { if (r.name) roleNames.push(r.name.toLowerCase()); });
    } else if (rawRoles && typeof rawRoles === 'object' && (rawRoles as any).name) {
      roleNames.push((rawRoles as any).name.toLowerCase());
    }

    // Add role from text column as fallback
    if (requesterProfile.role) {
      roleNames.push(requesterProfile.role.toLowerCase());
    }

    const hasPermission = roleNames.some(name =>
      name === 'admin' ||
      name === 'encargado' ||
      name === 'superadmin' ||
      name === 'manager'
    );

    if (!hasPermission) {
      // FIX-SEC-020: Removed debug_roles from response to prevent info leak
      return NextResponse.json({
        error: 'No tienes permisos suficientes'
      }, { status: 403 });
    }

    const rawBody = await req.json();
    const parsed = toggleUserStatusSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { user_id, is_active } = parsed.data;

    // Update profile
    const { error: updateError } = await supabaseAdmin
      .from('profiles')
      .update({ is_active })
      .eq('id', user_id);

    if (updateError) throw updateError;

    // Log action
    await supabaseAdmin.from('user_audit_log').insert({
      performed_by: session.user.id,
      target_user_id: user_id,
      action: is_active ? 'USER_ACTIVATED' : 'USER_DEACTIVATED',
      new_values: { is_active }
    });

    return NextResponse.json({ success: true });

  } catch (error: any) {
    return NextResponse.json({ error: process.env.NODE_ENV !== 'production' ? error.message : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/toggle-status');
