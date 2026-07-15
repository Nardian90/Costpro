import { getSupabaseAdminSafe as getSupabaseAdmin } from '@/lib/supabase-admin';
import { NextRequest, NextResponse } from 'next/server';
import { withRole } from '@/lib/auth-middleware';
import { rateLimit } from '@/lib/rate-limit';
import { managedCreateUserSchema, zodError } from '@/validation/api-schemas';
import { validateOrigin } from '@/lib/csrf'; // FIX-SEC-023
import { withTracing } from '@/lib/observability';
import crypto from 'crypto';

const handler = withRole('admin', async (req, session) => {
  // FIX-SEC-023: CSRF origin validation
  if (!validateOrigin(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const clientId = session.user.id;
  const { allowed } = await rateLimit(clientId);
  if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 });

  try {
    const supabaseAdmin = getSupabaseAdmin();
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Error de configuración del servidor' }, { status: 500 });
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
      // FIX (2026-07-15): si el RPC falla por el trigger validate_active_store
      // (catch-22: profile creado por trigger de auth.users con active_store_id=NULL,
      // pero el RPC intenta UPDATE con active_store_id=storeId antes de insertar membership),
      // hacemos fallback: insertar memberships primero, luego UPDATE del profile.
      const isTriggerError = rpcError.message && (
        rpcError.message.includes('ERR_INVALID_ACTIVE_STORE') ||
        rpcError.message.includes('ERR_STORE_REQUIRED') ||
        rpcError.message.includes('ROL ENCARGADO REQUIERE')
      );

      if (isTriggerError) {
        console.warn('[managed-create] RPC failed with trigger error, using fallback:', rpcError.message);

        // Fallback: insertar memberships primero, luego UPDATE profile
        // 1. Buscar role_id
        const roleNameMap: Record<string, string> = {
          'clerk': 'Cajero', 'warehouse': 'Almacenero',
          'encargado': 'Encargado', 'manager': 'Encargado',
          'admin': 'Admin', 'costo': 'Costo',
        };
        const targetRoleName = roleNameMap[p_role] || 'Costo';
        const { data: roleRow } = await supabaseAdmin
          .from('roles').select('id').ilike('name', targetRoleName).limit(1).single();
        const roleId = roleRow?.id || null;

        // 2. UPDATE profile (datos básicos, sin tocar active_store_id para no disparar trigger)
        const { error: profUpdErr } = await supabaseAdmin
          .from('profiles')
          .update({
            full_name: p_full_name,
            role: p_role,
            role_id: roleId,
            is_active: true,
            created_by: session.user.id,
            max_stores_limit: p_max_stores ?? 0,
            max_users_limit: p_max_users ?? 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId);

        if (profUpdErr) {
          await supabaseAdmin.auth.admin.deleteUser(userId);
          return NextResponse.json({ error: `Error actualizando profile: ${profUpdErr.message}` }, { status: 400 });
        }

        // 3. INSERT memberships
        const membershipsToInsert: Array<{ user_id: string; store_id: string; role: string; status: string }> = [];
        if (p_memberships && Array.isArray(p_memberships) && p_memberships.length > 0) {
          for (const m of p_memberships) {
            if (m?.store_id && m?.role) {
              membershipsToInsert.push({
                user_id: userId,
                store_id: m.store_id,
                role: m.role,
                status: 'active',
              });
            }
          }
        } else if (p_store_id) {
          membershipsToInsert.push({
            user_id: userId,
            store_id: p_store_id,
            role: p_role,
            status: 'active',
          });
        }

        if (membershipsToInsert.length > 0) {
          const { error: memInsErr } = await supabaseAdmin
            .from('user_store_memberships')
            .upsert(membershipsToInsert, { onConflict: 'user_id,store_id' });
          if (memInsErr) {
            await supabaseAdmin.auth.admin.deleteUser(userId);
            return NextResponse.json({ error: `Error insertando memberships: ${memInsErr.message}` }, { status: 400 });
          }
        }

        // 4. UPDATE profile.active_store_id (ahora la membership existe)
        const activeStore = membershipsToInsert[0]?.store_id || p_store_id;
        if (activeStore) {
          const { error: actStoreErr } = await supabaseAdmin
            .from('profiles')
            .update({ active_store_id: activeStore, updated_at: new Date().toISOString() })
            .eq('id', userId);
          if (actStoreErr) {
            console.warn('[managed-create] Could not set active_store_id:', actStoreErr.message);
            // No abortar — el usuario está creado, solo sin active_store_id
          }
        }
        // Fallback exitoso — continuar al paso 6
      } else {
        // Otro tipo de error → eliminar auth user y reportar
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return NextResponse.json({ error: rpcError.message }, { status: 400 });
      }
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

  } catch (error: unknown) {
    return NextResponse.json({ error: (process.env.NODE_ENV !== 'production' || !!process.env.VITEST) ? (error instanceof Error ? error.message : String(error)) : 'Error interno del servidor' }, { status: 500 });
  }
});

async function postHandler(req: NextRequest) {
  return handler(req);
}

export const POST = withTracing(postHandler, 'POST /api/users/managed-create');
