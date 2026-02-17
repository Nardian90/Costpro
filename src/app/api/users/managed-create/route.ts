import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "@/lib/auth";

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

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Verify requester session
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // 2. Fetch requester role
    const { data: requesterProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (profileError || !requesterProfile || !requesterProfile.roles) {
      return NextResponse.json({ error: 'Perfil o rol no encontrado' }, { status: 403 });
    }

    const requesterRole = (requesterProfile.roles as any).name.toLowerCase();

    const body = await req.json();
    const {
      p_email,
      p_full_name,
      p_role,
      p_store_id,
      p_memberships,
      p_max_stores,
      p_max_users
    } = body;

    // 3. Validate Hierarchy
    // Admin can create anything.
    // Encargado/Manager can only create users within their hierarchy.
    if (requesterRole !== 'admin') {
      if (requesterRole === 'encargado' || requesterRole === 'manager') {
        const allowedRoles = ['clerk', 'warehouse', 'usuario', 'costo', 'encargado', 'manager'];
        const targetRole = (p_role || '').toLowerCase();

        if (!allowedRoles.includes(targetRole)) {
          return NextResponse.json({
            error: 'No tienes permisos para crear este tipo de usuario',
            details: `Rol ${p_role} no permitido para ${requesterRole}`
          }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: 'No tienes permisos para crear usuarios' }, { status: 403 });
      }
    }

    // 4. Create Auth User without email confirmation
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: p_email,
      password: Math.random().toString(36).slice(-12), // Temporary password
      email_confirm: true,
      user_metadata: { full_name: p_full_name }
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
      p_max_stores: p_max_stores || 0,
      p_max_users: p_max_users || 0,
      p_target_user_id: userId,
      p_creator_id: session.user.id
    });

    if (rpcError) {
      // Cleanup auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // 6. Send Reset Password Email (Generates recovery link)
    try {
      await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email: p_email,
      });
    } catch (linkError) {
      console.error('Error generating recovery link:', linkError);
      // Don't fail the whole request if only the email fail, but maybe log it
    }

    return NextResponse.json({
      success: true,
      user_id: userId,
      message: 'Usuario creado y correo de recuperación enviado.'
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
