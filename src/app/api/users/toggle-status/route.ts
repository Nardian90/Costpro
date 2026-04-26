import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';

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

export const POST = withRole('admin', async (req, session) => {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // Verify Admin/Encargado role
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile) {
      return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 403 });
    }

    const { user_id, is_active } = await req.json();

    if (!user_id) {
      return NextResponse.json({ error: 'Falta user_id' }, { status: 400 });
    }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
});
