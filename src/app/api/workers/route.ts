import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
// FIX C1: usar getSupabaseAuthClient para que RLS respete el usuario autenticado
import { getSupabaseForSession } from '@/lib/supabase-session';
import { parseCI, getBirthDateFromCI } from '@/lib/parse-ci';

/**
 * GET /api/workers?store_id=...&status=active
 *
 * Lista trabajadores de una tienda (filtrado por store_id obligatorio).
 */
async function getHandler(req: NextRequest, session: AuthenticatedSession) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('store_id');
  const status = searchParams.get('status');

  if (!storeId) {
    return NextResponse.json({ error: 'store_id es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseForSession(session);
  let query = supabase
    .from('workers')
    .select('*')
    .eq('store_id', storeId)
    .order('first_name', { ascending: true });

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ workers: data || [], count: data?.length || 0 });
}

/**
 * POST /api/workers
 * Body: { store_id, first_name, last_name, ci, gender?, address?, province?, ... }
 *
 * Valida CI cubano y deriva birth_date automáticamente.
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  const body = await req.json();
  const { store_id, first_name, last_name, ci, gender, address, province, municipality, shirt_size, shoe_size, waist_size } = body;

  // FIX-WORKER-NO-NAME (2026-07-13): trim() antes de validar para rechazar
  // nombres con solo espacios ("   "). Antes, `!first_name` solo verificaba
  // null/undefined/empty-string, pero NO rechazaba "   " → creaba trabajadores
  // sin nombre real (bug reportado por el usuario).
  const trimmedFirstName = typeof first_name === 'string' ? first_name.trim() : '';
  const trimmedLastName = typeof last_name === 'string' ? last_name.trim() : '';

  // Validaciones
  if (!store_id || !trimmedFirstName || !trimmedLastName || !ci) {
    return NextResponse.json(
      { error: 'Campos requeridos: store_id, first_name, last_name, ci (no pueden ser solo espacios)' },
      { status: 400 },
    );
  }

  if (session.user.role !== 'admin' && session.user.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden — requiere rol admin o manager' }, { status: 403 });
  }

  // Validar CI cubano
  const parsedCI = parseCI(ci);
  if (!parsedCI.isValid) {
    return NextResponse.json(
      { error: `CI inválido: ${parsedCI.error}` },
      { status: 400 },
    );
  }

  // Derivar birth_date del CI
  const birthDate = getBirthDateFromCI(ci);

  // Verificar que el usuario tiene acceso a la tienda
  const hasStoreAccess = session.user.memberships?.some(
    (m: any) => m.store_id === store_id && m.status === 'active'
  ) || session.user.role === 'admin';

  if (!hasStoreAccess) {
    return NextResponse.json({ error: 'Sin acceso a esta tienda' }, { status: 403 });
  }

  const supabase = getSupabaseForSession(session);
  const { data, error } = await supabase
    .from('workers')
    .insert({
      store_id,
      first_name: trimmedFirstName,
      last_name: trimmedLastName,
      ci: String(ci).trim(),
      gender: gender || null,
      birth_date: birthDate,
      address: address || null,
      province: province || null,
      municipality: municipality || null,
      shirt_size: shirt_size || null,
      shoe_size: shoe_size || null,
      waist_size: waist_size || null,
      // FIX: created_by null si no es UUID válido (dev-bypass usa 'dev-admin-001')
      created_by: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session.user.id || '') ? session.user.id : null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `Ya existe un trabajador con CI ${ci} en esta tienda` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ worker: data }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
