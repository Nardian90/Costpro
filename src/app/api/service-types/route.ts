import { isAdminLevel } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { withAuth, AuthenticatedSession } from '@/lib/auth-middleware';
import { z } from 'zod';
import { uuidRegex } from '@/validation/schemas';
import { rateLimit } from '@/lib/rate-limit';
import { withSecurity } from '@/lib/with-security';

/**
 * /api/service-types — Catálogo de tipos de servicio (Servicios Recibidos)
 *
 * MISIÓN 2026-10-15: los tipos de servicio dejaron de ser una lista estática
 * en el frontend y pasan a gestionarse desde la fuente oficial existente:
 * la tabla `service_types` (9 tipos semilla GLOBALES con store_id IS NULL).
 *
 * ALCANCE DEL CATÁLOGO (decisión documentada en la auditoría):
 *   · El catálogo es GLOBAL por diseño: todas las filas semilla tienen
 *     store_id = NULL y el modelo multitienda comparte la misma lista a
 *     todas las tiendas (el selector muestra el mismo catálogo en cualquier
 *     tienda activa; la creación del servicio sigue scoped al store activo).
 *   · Un recurso global lo gestiona el rol GLOBAL 'admin' (doctrina de
 *     src/lib/roles.ts: admin global = cuentas internas de Costpro que ven
 *     y gestionan todas las tiendas). Un manager de tienda NO debe poder
 *     mutar un catálogo que afecta a tiendas de otros tenants.
 *   · Lectura: cualquier usuario autenticado (necesita el selector).
 *
 * REGLAS DE INTEGRIDAD:
 *   · name obligatorio, trim, sin duplicados (case/space-insensitive).
 *   · code derivado del nombre si no llega (columna NOT NULL en BD).
 *   · NO hay borrado físico: desactivación (is_active=false) preserva el
 *     historial (received_services guarda service_type_name como snapshot
 *     y service_type_id como identidad — renombrar/desactivar no rompe nada).
 *   · Doble defensa contra duplicados: validación aquí + índice único parcial
 *     service_types_global_name_uniq (migración 20261015000001).
 *
 * ENDPOINTS:
 *   GET   /api/service-types  → lista completa + usage_count (solo admin lo recibe)
 *   POST  /api/service-types  → crear tipo global (admin global)
 *   PATCH /api/service-types  → editar / desactivar / reactivar (admin global)
 */

// Validación de longitud y caracteres: se rechazan caracteres de control
// (imposibles de escribir intencionadamente) sin imponer restricciones
// arbitrarias sobre el resto (acentos, ñ, símbolos comerciales son válidos).
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;

const CreateSchema = z.object({
  name: z.string().min(1, 'El nombre del tipo es obligatorio').max(80, 'El nombre no puede superar 80 caracteres'),
  description: z.string().max(300, 'La descripción no puede superar 300 caracteres').nullable().optional(),
  code: z.string().max(20).nullable().optional(),
});

const PatchSchema = z.object({
  id: z.string().regex(uuidRegex, 'Identificador de tipo inválido'),
  name: z.string().min(1).max(80).optional(),
  description: z.string().max(300).nullable().optional(),
  is_active: z.boolean().optional(),
});

function isAdmin(session: AuthenticatedSession): boolean {
  // CP-ORG-001 ciclo 5: nivel administrativo transversal (admin|superadmin)
  return isAdminLevel(session?.user?.role);
}

async function getAdminClient() {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** Normaliza un nombre para comparación de duplicados: trim + colapsar espacios + lowercase. */
export function normalizeTypeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Deriva un code (columna NOT NULL) desde el nombre, único entre los existentes. */
export function deriveTypeCode(name: string, existingCodes: Set<string>): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quitar acentos
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5) || 'TIPO';
  let code = base;
  let i = 2;
  while (existingCodes.has(code) && i <= 99) {
    code = `${base}${i}`;
    i += 1;
  }
  if (existingCodes.has(code)) code = `${base}${Date.now().toString(36).slice(-4).toUpperCase()}`;
  return code;
}

function badRequest(message: string, details?: unknown) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status: 400 });
}

async function getHandler(_req: NextRequest, session: AuthenticatedSession) {
  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });

  const { data, error } = await admin
    .from('service_types')
    .select('id, store_id, name, code, description, is_active, created_at')
    .order('name', { ascending: true });

  if (error) return NextResponse.json({ error: 'No se pudo cargar el catálogo de tipos' }, { status: 500 });

  const types = data || [];

  // usage_count solo para admin (gestión de desactivación). Evita exponer
  // métricas agregadas de otras tiendas a usuarios operativos.
  let usageById: Record<string, number> = {};
  if (isAdmin(session) && types.length > 0) {
    const { data: usageRows, error: usageErr } = await admin
      .from('received_services')
      .select('service_type_id')
      .not('service_type_id', 'is', null);
    if (!usageErr && usageRows) {
      usageById = usageRows.reduce<Record<string, number>>((acc, r) => {
        const id = r.service_type_id as string;
        acc[id] = (acc[id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  return NextResponse.json({
    data: types.map(t => ({ ...t, usage_count: usageById[t.id] || 0 })),
  });
}

async function postHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Solo un administrador puede gestionar el catálogo de tipos de servicio' }, { status: 403 });
  }
  const rl = await rateLimit(`service-types:write:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiadas operaciones, intenta en un momento' }, { status: 429 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });

  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest('Datos del tipo inválidos', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
  }
  const name = parsed.data.name.trim().replace(/\s+/g, ' ');
  if (!name) return badRequest('El nombre del tipo es obligatorio');
  if (CONTROL_CHARS.test(name)) return badRequest('El nombre contiene caracteres no válidos');
  const description = parsed.data.description?.trim().replace(/\s+/g, ' ') || null;
  if (description && CONTROL_CHARS.test(description)) return badRequest('La descripción contiene caracteres no válidos');

  // Duplicados en el scope global: case + espacio-insensitive.
  const { data: existing, error: exErr } = await admin
    .from('service_types')
    .select('id, name, code')
    .is('store_id', null);
  if (exErr) return NextResponse.json({ error: 'No se pudo validar el catálogo' }, { status: 500 });

  const normalized = normalizeTypeName(name);
  if ((existing || []).some(t => normalizeTypeName(t.name) === normalized)) {
    return NextResponse.json({ error: `Ya existe un tipo de servicio «${name}» en el catálogo` }, { status: 409 });
  }

  const providedCode = parsed.data.code?.trim().toUpperCase();
  const code = providedCode || deriveTypeCode(name, new Set((existing || []).map(t => t.code)));

  const { data: created, error: insErr } = await admin
    .from('service_types')
    .insert({ store_id: null, name, code, description, is_active: true })
    .select('id, store_id, name, code, description, is_active, created_at')
    .single();

  if (insErr) {
    // Defensa en profundidad: violación del índice único parcial (23505).
    if ((insErr as { code?: string }).code === '23505') {
      return NextResponse.json({ error: `Ya existe un tipo de servicio «${name}» en el catálogo` }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo guardar el tipo de servicio' }, { status: 500 });
  }

  return NextResponse.json({ data: { ...created, usage_count: 0 } }, { status: 201 });
}

async function patchHandler(req: NextRequest, session: AuthenticatedSession) {
  if (!isAdmin(session)) {
    return NextResponse.json({ error: 'Solo un administrador puede gestionar el catálogo de tipos de servicio' }, { status: 403 });
  }
  const rl = await rateLimit(`service-types:write:${session.user.id}`, { windowMs: 60_000, maxRequests: 30 });
  if (!rl.allowed) return NextResponse.json({ error: 'Demasiadas operaciones, intenta en un momento' }, { status: 429 });

  const admin = await getAdminClient();
  if (!admin) return NextResponse.json({ error: 'CONFIG_ERROR' }, { status: 500 });

  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return badRequest('Datos de edición inválidos', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`));
  }
  const { id, is_active } = parsed.data;
  const updates: { name?: string; description?: string | null; is_active?: boolean } = {};

  if (parsed.data.name !== undefined) {
    const name = parsed.data.name.trim().replace(/\s+/g, ' ');
    if (!name) return badRequest('El nombre del tipo es obligatorio');
    if (CONTROL_CHARS.test(name)) return badRequest('El nombre contiene caracteres no válidos');
    updates.name = name;
  }
  if (parsed.data.description !== undefined) {
    const description = parsed.data.description?.trim().replace(/\s+/g, ' ') || null;
    if (description && CONTROL_CHARS.test(description)) return badRequest('La descripción contiene caracteres no válidos');
    updates.description = description;
  }
  if (is_active !== undefined) updates.is_active = is_active;

  if (Object.keys(updates).length === 0) return badRequest('Nada que actualizar');

  // Identidad: el id NUNCA cambia; solo se mutan atributos.
  const { data: current, error: curErr } = await admin
    .from('service_types')
    .select('id, name, is_active')
    .eq('id', id)
    .is('store_id', null)
    .single();
  if (curErr || !current) return NextResponse.json({ error: 'Tipo de servicio no encontrado' }, { status: 404 });

  if (updates.name) {
    const normalized = normalizeTypeName(updates.name);
    const { data: others, error: exErr } = await admin
      .from('service_types')
      .select('id, name')
      .is('store_id', null)
      .neq('id', id);
    if (exErr) return NextResponse.json({ error: 'No se pudo validar el catálogo' }, { status: 500 });
    if ((others || []).some(t => normalizeTypeName(t.name) === normalized)) {
      return NextResponse.json({ error: `Ya existe otro tipo de servicio «${updates.name}» en el catálogo` }, { status: 409 });
    }
  }

  const { data: updated, error: updErr } = await admin
    .from('service_types')
    .update(updates)
    .eq('id', id)
    .select('id, store_id, name, code, description, is_active, created_at')
    .single();

  if (updErr) {
    if ((updErr as { code?: string }).code === '23505') {
      return NextResponse.json({ error: 'Ya existe otro tipo de servicio con ese nombre' }, { status: 409 });
    }
    return NextResponse.json({ error: 'No se pudo actualizar el tipo de servicio' }, { status: 500 });
  }

  return NextResponse.json({ data: updated });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(withSecurity(postHandler, { rateLimitKey: 'service-types:post', maxRequests: 30 }));
export const PATCH = withAuth(withSecurity(patchHandler, { rateLimitKey: 'service-types:patch', maxRequests: 30 }));
