import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { resetPasswordSchema, zodError } from '@/validation/api-schemas';
import { withTracing } from '@/lib/observability';


function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Configuración de Supabase incompleta');
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}


const handler = withRole('admin', async (req, session) => {
  const clientId = req.headers.get('x-forwarded-for') || session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const supabaseAdmin = getSupabaseAdmin();



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
      return NextResponse.json({ error: 'Solo los administradores pueden reiniciar contraseñas' }, { status: 403 });
    }

    const rawBody = await req.json();
    const parsed = resetPasswordSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(zodError(parsed.error), { status: 400 });
    }
    const { user_id } = parsed.data;


    const { data: targetUser, error: getUserError } = await supabaseAdmin.auth.admin.getUserById(user_id);
    if (getUserError || !targetUser.user) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const { error: resetError } = await supabaseAdmin.auth.admin.generateLink({
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
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/reset-password');
