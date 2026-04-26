import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuración de Supabase incompleta');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export const POST = withRole('admin', async (req, session) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'Falta user_id' }, { status: 400 });

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });

    // Call the safety check and profile deletion RPC
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('managed_delete_user', {
        p_user_id: user_id
    });

    if (rpcError) return NextResponse.json({ error: rpcError.message }, { status: 400 });

    // Delete from auth.users
    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user_id);
    if (authError) console.error('Auth deletion failed:', authError);

    return NextResponse.json({ success: true, message: 'Usuario eliminado correctamente' });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
