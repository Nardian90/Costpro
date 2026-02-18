import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "@/lib/auth";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuración de Supabase incompleta');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function POST(req: NextRequest) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const session = await getServerSession(req);
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    const requesterRole = ((requesterProfile?.roles as any)?.name || '').toLowerCase();
    if (requesterRole !== 'admin') {
      return NextResponse.json({ error: 'Solo los administradores pueden reiniciar contraseñas' }, { status: 403 });
    }

    const { user_id } = await req.json();
    if (!user_id) return NextResponse.json({ error: 'ID de usuario requerido' }, { status: 400 });

    const { data: targetUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (getUserError || !targetUser.user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    // Generate recovery link (this sends an email if configured, or we just return it)
    // By default, generateLink with type 'recovery' will use the site's email template.
    const { data, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: targetUser.user.email!,
    });

    if (resetError) return NextResponse.json({ error: resetError.message }, { status: 400 });

    return NextResponse.json({
      success: true,
      message: 'Se ha enviado un correo de recuperación al usuario.'
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
