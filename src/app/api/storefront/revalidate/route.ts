import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { withAuth, withRole, AuthenticatedSession } from '@/lib/auth-middleware';
import { canManageStore } from '@/lib/roles';
import { getSupabaseAdminSafe } from '@/lib/supabase-admin';
import { createApiError } from '@/lib/api-errors';

/**
 * POST /api/storefront/revalidate
 *
 * Fuerza la regeneración server-side de la página /tienda/[slug].
 *
 * Útil cuando el admin cambia el banner, servicios, carrusel o cualquier
 * configuración del storefront y necesita que el cambio se refleje
 * inmediatamente en la página pública (sin esperar el revalidate=60s
 * de ISR ni la caché del navegador).
 *
 * Body: { slug: string }
 *
 * Permisos: admin, manager, encargado (los mismos que pueden editar el store).
 * Verifica que el usuario tenga acceso a la tienda via canManageStore().
 */
async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  try {
    const body = await req.json();
    const slug = typeof body?.slug === 'string' ? body.slug.trim() : '';

    if (!slug || slug.length < 1) {
      return NextResponse.json(
        { ...createApiError('INVALID_DATA'), message: 'slug es requerido' },
        { status: 400 }
      );
    }

    // Buscar el store por slug para verificar permisos
    const admin = getSupabaseAdminSafe();
    if (!admin) {
      return NextResponse.json(createApiError('CONFIG_ERROR'), { status: 500 });
    }

    const { data: store, error } = await admin
      .from('stores')
      .select('id, slug')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !store) {
      return NextResponse.json(createApiError('STORE_NOT_FOUND'), { status: 404 });
    }

    // Verificar que el usuario tenga permisos sobre esta tienda
    if (!canManageStore(session.user, store.id)) {
      return NextResponse.json(createApiError('STORE_ACCESS_DENIED'), { status: 403 });
    }

    // Forzar regeneración de la página pública
    // revalidatePath invalidate el cache ISR y fuerza el SSR en la próxima visita
    revalidatePath(`/tienda/${slug}`, 'page');
    // También revalidar la ruta dinámica completa (catch-all safety)
    revalidatePath(`/tienda/[slug]`, 'page');

    return NextResponse.json({
      success: true,
      message: `Vitrina /tienda/${slug} revalidada`,
      revalidatedAt: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return NextResponse.json(
      { ...createApiError('UNKNOWN_ERROR'), error: message },
      { status: 500 }
    );
  }
}

export const POST = withRole('encargado', postHandler as Parameters<typeof withRole>[1]);
