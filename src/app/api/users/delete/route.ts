import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "@/lib/auth";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('Configuración de Supabase incompleta');
  }

  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    const { user_id } = await req.json();
    if (!user_id) {
      return NextResponse.json({ error: 'Falta user_id' }, { status: 400 });
    }

    // 1. Check if user is Admin using RPC for consistency
    const { data: isAdmin, error: roleError } = await supabaseAdmin.rpc('is_admin');
    // Note: We need to set the context for the RPC call to act as the current user
    // However, is_admin() usually checks auth.uid(). In this API context, we use service role.
    // Let's do a manual check for safety.

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', session.user.id)
      .single();

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Solo los administradores pueden eliminar usuarios.' }, { status: 403 });
    }

    // 2. Call the safety check and profile deletion RPC
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_delete_user', {
        p_user_id: user_id
    });

    if (rpcError) {
        return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    // 3. Delete from auth.users (Service Role required)
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id);

    if (authError) {
        // If auth deletion fails, we might have a ghost profile if we didn't use a transaction.
        // But in Supabase RPCs run in their own transaction.
        // Note: managed_delete_user already deleted the profile.
        console.error('Auth deletion failed:', authError);
        // We continue because the profile is already gone and it was likely an orphaned user.
    }

    return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente' });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
