import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from "@/lib/auth";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(req);
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
    }

    // Verify Admin/Encargado role
    const { data: requesterProfile } = await supabaseAdmin
      .from('profiles')
      .select('*, roles(name)')
      .eq('id', session.user.id)
      .single();

    if (!requesterProfile || !requesterProfile.roles) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
    }

    const requesterRole = (requesterProfile.roles as any).name;
    if (requesterRole !== 'Admin' && requesterRole !== 'Encargado') {
      return NextResponse.json({ error: 'No tienes permisos' }, { status: 403 });
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
}
