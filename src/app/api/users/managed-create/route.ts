import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { managedCreateUserSchema, zodError } from '@/validation/api-schemas';
import { withTracing } from '@/lib/observability';
import crypto from 'crypto';

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
  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const supabaseAdmin = getSupabaseAdmin();

    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Fetch requester role
    const { data: requesterProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (profileError || !requesterProfile) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
    }

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

    const requesterRole = roleNames.includes('admin') ? 'admin' : (roleNames.includes('encargado') || roleNames.includes('manager') ? 'encargado' : 'other');

    const rawBody = await req.json();
    const parsed = managedCreateUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const {
      p_email,
      p_full_name,
      p_role,
      p_store_id,
      p_memberships,
      p_max_stores,
      p_max_users,
      p_password
    } = parsed.data;

    const targetRole = (p_role || '').toLowerCase();

    // 3. Validate Hierarchy
    if (requesterRole !== 'admin') {
      if (requesterRole === 'encargado') {
        if (targetRole === 'admin') {
          return NextResponse.json({ error: 'No tienes permisos para crear administradores' }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'No tienes permisos para crear usuarios' }, { status: 403 });
      }
    }

    // 4. Create Auth User
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: p_email,
      password: p_password || crypto.randomBytes(12).toString('hex'),
      email_confirm: true,
      user_metadata: {
        full_name: p_full_name,
        role: p_role
      }
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    const userId = authUser.user.id;

    // 5. Call managed_create_user RPC to sync profile and roles
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_create_user', {
      p_email,
      p_full_name,
      p_role,
      p_store_id,
      p_memberships,
      p_max_stores,
      p_max_users,
      p_target_user_id: userId,
      p_creator_id: session.user.id
    });

    if (rpcError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // 6. If no password provided, generate recovery link
    if (!p_password) {
      await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: p_email,
      });
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      message: p_password ? 'Usuario creado correctamente.' : 'Usuario creado y correo de recuperación enviado.'
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/managed-create');
