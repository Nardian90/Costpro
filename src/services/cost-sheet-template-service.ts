/**
 * CP-PLANTILLAS-FASE2 — Servicio de plantillas de fichas de costo.
 * ============================================================================
 * Abstracción de acceso a `cost_sheet_templates` (Supabase / PostgREST).
 *
 * Por qué existe (orden FASE 2 §9): evitar concentrar la lógica de acceso,
 * validación y persistencia dentro de un único componente React
 * (CostSheetTemplateExplorer). Todos los componentes del módulo (Explorador,
 * diálogo «Guardar como Plantilla», editor) consumen ESTE servicio.
 *
 * Modelo de seguridad — la fuente de verdad es la RLS de la tabla
 * (migración 20261110120000_cp_plantillas_privadas_propietario.sql):
 *
 *   SELECT  · propietario ve sus privadas; todos ven system y las públicas
 *            autorizadas (global o tienda con has_store_access); admin ve todo.
 *   INSERT  · admin sin límites; usuario autenticado SOLO privada propia
 *            (created_by=auth.uid(), type='private', store_id NULL).
 *   UPDATE  · admin (publicar/retirar/cambiar tienda/editar públicas);
 *            propietario solo sus privadas y sin poder cambiar
 *            created_by/type/store_id (WITH CHECK).
 *   DELETE  · admin; propietario sus privadas.
 *
 * Este servicio NUNCA relaja seguridad: solo construye las peticiones y
 * traduce los errores de PostgREST a mensajes accionables en español.
 * Los filtros de cliente (eq type/created_by) son EXPLICATIVOS — la RLS
 * igualmente los aplicaría.
 */

import { supabase } from '@/lib/supabaseClient';
import type { CostSheetData } from '@/types/cost-sheet';
import { logger } from '@/lib/logger';

// ── Tipos ────────────────────────────────────────────────────────────

export type CostSheetTemplateType = 'system' | 'private' | 'public';

export interface CostSheetTemplateRecord {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  data: CostSheetData;
  type: CostSheetTemplateType;
  created_by: string | null;
  store_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TemplatePatch {
  name?: string;
  description?: string;
  category?: string;
  data?: CostSheetData;
}

/** Errores del servicio con semántica para la UI. */
export class TemplateServiceError extends Error {
  constructor(
    message: string,
    public readonly kind: 'permission' | 'network' | 'not-found' | 'unknown',
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'TemplateServiceError';
  }
}

// ── Utilidades internas ──────────────────────────────────────────────

function mapError(error: unknown, contexto: string): TemplateServiceError {
  if (error && typeof error === 'object' && 'code' in error) {
    const pgCode = String((error as { code?: unknown }).code ?? '');
    const message = String((error as { message?: unknown }).message ?? '');
    if (pgCode === '42501') {
      return new TemplateServiceError(
        'No tienes permisos para realizar esta operación con esta plantilla.',
        'permission',
        error,
      );
    }
    if (pgCode.startsWith('08') || pgCode.startsWith('57')) {
      return new TemplateServiceError('Error de conexión con el servidor.', 'network', error);
    }
    return new TemplateServiceError(`${contexto}: ${message || pgCode}`, 'unknown', error);
  }
  if (error instanceof Error && error.message.toLowerCase().includes('fetch')) {
    return new TemplateServiceError('Error de conexión con el servidor.', 'network', error);
  }
  return new TemplateServiceError(contexto, 'unknown', error);
}

function mapRow(t: Record<string, unknown>): CostSheetTemplateRecord {
  return {
    id: String(t.id),
    name: String(t.name ?? ''),
    description: t.description != null ? String(t.description) : null,
    category: t.category != null ? String(t.category) : null,
    data: t.data as CostSheetData,
    type: (t.type as CostSheetTemplateType) ?? 'private',
    created_by: t.created_by != null ? String(t.created_by) : null,
    store_id: t.store_id != null ? String(t.store_id) : null,
    created_at: t.created_at != null ? String(t.created_at) : null,
    updated_at: t.updated_at != null ? String(t.updated_at) : null,
  };
}

/** Usuario autenticado actual (Supabase). Vacío si no hay sesión. */
async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? '';
}

// ── Lectura ──────────────────────────────────────────────────────────

/**
 * Plantillas privadas del usuario autenticado guardadas en COSTPRO.
 * La RLS garantiza que solo devuelve las propias (created_by=auth.uid());
 * el eq explícito es documental y mantiene la consulta índice-amigable.
 */
export async function listPrivateTemplates(): Promise<CostSheetTemplateRecord[]> {
  try {
    const uid = await currentUserId();
    if (!uid) return [];
    const { data, error } = await supabase
      .from('cost_sheet_templates')
      .select('*')
      .eq('type', 'private')
      .eq('created_by', uid)
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => mapRow(r));
  } catch (error) {
    throw mapError(error, 'No se pudieron cargar tus plantillas privadas');
  }
}

/**
 * Plantillas públicas visibles para el usuario actual.
 *
 * CP-PLANTILLAS-FASE2 §3D: SIN filtro cliente por tienda — la RLS ya decide
 * (usuario normal: globales + tiendas con has_store_access; admin/superadmin:
 * todas). El filtro anterior (`store_id IS NULL OR = activeStoreId`) ocultaba
 * a los administradores plantillas de otras tiendas que sí pueden gestionar.
 */
export async function listPublicTemplates(): Promise<CostSheetTemplateRecord[]> {
  try {
    const { data, error } = await supabase
      .from('cost_sheet_templates')
      .select('*')
      .eq('type', 'public')
      .order('updated_at', { ascending: false, nullsFirst: false });
    if (error) throw error;
    return (data ?? []).map((r: Record<string, unknown>) => mapRow(r));
  } catch (error) {
    throw mapError(error, 'No se pudieron cargar las plantillas públicas');
  }
}

/** Una plantilla concreta (la RLS filtra las que el usuario no puede ver). */
export async function getTemplate(id: string): Promise<CostSheetTemplateRecord | null> {
  try {
    const { data, error } = await supabase
      .from('cost_sheet_templates')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return data ? mapRow(data as Record<string, unknown>) : null;
  } catch (error) {
    throw mapError(error, 'No se pudo cargar la plantilla');
  }
}

// ── Escritura: privadas del propietario ──────────────────────────────

/**
 * Guarda una plantilla PRIVADA asociada al usuario autenticado.
 * INSERT con type='private', created_by=auth.uid(), store_id=NULL —
 * exactamente lo que exige la política "Templates insert". Un usuario
 * normal no puede colar aquí nada público (RLS lo deniega).
 */
export async function createPrivateTemplate(input: {
  name: string;
  description?: string;
  category?: string;
  data: CostSheetData;
}): Promise<CostSheetTemplateRecord> {
  try {
    const uid = await currentUserId();
    if (!uid) {
      throw new TemplateServiceError(
        'Debes iniciar sesión para guardar plantillas.',
        'permission',
      );
    }
    const { data, error } = await supabase
      .from('cost_sheet_templates')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category || 'General',
        data: input.data,
        type: 'private',
        created_by: uid,
        store_id: null,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapRow(data as Record<string, unknown>);
  } catch (error) {
    if (error instanceof TemplateServiceError) throw error;
    throw mapError(error, 'No se pudo guardar la plantilla privada');
  }
}

/**
 * Actualiza una plantilla privada propia (contenido, nombre, descripción,
 * categoría). NUNCA envía type/created_by/store_id — esas columnas están
 * protegidas por el WITH CHECK de la política de propietario.
 */
export async function updatePrivateTemplate(
  id: string,
  patch: TemplatePatch,
): Promise<void> {
  try {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.description !== undefined) update.description = patch.description.trim() || null;
    if (patch.category !== undefined) update.category = patch.category;
    if (patch.data !== undefined) update.data = patch.data;
    if (Object.keys(update).length === 0) return;
    const { error } = await supabase.from('cost_sheet_templates').update(update).eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo actualizar la plantilla');
  }
}

/** Elimina una plantilla privada propia (confirmación en la UI). */
export async function deletePrivateTemplate(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('cost_sheet_templates').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo eliminar la plantilla');
  }
}

// ── Publicación (admin/superadmin — RLS la restringe a is_admin) ─────

/**
 * Publica una plantilla existente cambiando su visibilidad con UPDATE
 * sobre el MISMO registro (nunca duplica). Requiere admin/superadmin:
 * la transición private→public solo pasa por la política admin.
 */
export async function publishTemplate(id: string, storeId: string | null): Promise<void> {
  try {
    const { error } = await supabase
      .from('cost_sheet_templates')
      .update({ type: 'public', store_id: storeId })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo publicar la plantilla');
  }
}

/**
 * Retira la publicación: la plantilla vuelve a ser privada de su creador.
 * Conserva id, created_by y data (mismo registro, UPDATE).
 */
export async function unpublishTemplate(id: string): Promise<void> {
  try {
    const { error } = await supabase
      .from('cost_sheet_templates')
      .update({ type: 'private', store_id: null })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo retirar la publicación');
  }
}

/** Crea directamente una plantilla pública (admin; "Nueva desde Editor"). */
export async function createPublicTemplate(input: {
  name: string;
  description?: string;
  category?: string;
  data: CostSheetData;
  storeId: string | null;
}): Promise<CostSheetTemplateRecord> {
  try {
    const uid = await currentUserId();
    if (!uid) {
      throw new TemplateServiceError(
        'Debes iniciar sesión para publicar plantillas.',
        'permission',
      );
    }
    const { data, error } = await supabase
      .from('cost_sheet_templates')
      .insert({
        name: input.name.trim(),
        description: input.description?.trim() || null,
        category: input.category || 'General',
        data: input.data,
        type: 'public',
        created_by: uid,
        store_id: input.storeId,
      })
      .select('*')
      .single();
    if (error) throw error;
    return mapRow(data as Record<string, unknown>);
  } catch (error) {
    if (error instanceof TemplateServiceError) throw error;
    throw mapError(error, 'No se pudo publicar la plantilla');
  }
}

/** Edición de plantillas públicas (admin). */
export async function updatePublicTemplate(id: string, patch: TemplatePatch): Promise<void> {
  try {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.description !== undefined) update.description = patch.description.trim() || null;
    if (patch.category !== undefined) update.category = patch.category;
    if (patch.data !== undefined) update.data = patch.data;
    if (Object.keys(update).length === 0) return;
    const { error } = await supabase.from('cost_sheet_templates').update(update).eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo actualizar la plantilla pública');
  }
}

/** Cambia el ámbito de tienda de una plantilla pública (admin). */
export async function changePublicTemplateStore(id: string, storeId: string | null): Promise<void> {
  try {
    const { error } = await supabase
      .from('cost_sheet_templates')
      .update({ store_id: storeId })
      .eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo cambiar la tienda de la plantilla');
  }
}

/** Elimina una plantilla pública (admin). */
export async function deletePublicTemplate(id: string): Promise<void> {
  try {
    const { error } = await supabase.from('cost_sheet_templates').delete().eq('id', id);
    if (error) throw error;
  } catch (error) {
    throw mapError(error, 'No se pudo eliminar la plantilla pública');
  }
}

/**
 * Duplica una plantilla. CP-PLANTILLAS-FASE2 §7A: el nombre de la copia es
 * `Nombre (Copia)` — se corrigió el bug que insertaba comillas escapadas
 * literales (`\"Nombre\" (Copia)`).
 */
export async function duplicateTemplate(template: CostSheetTemplateRecord): Promise<void> {
  try {
    const uid = await currentUserId();
    if (!uid) {
      throw new TemplateServiceError('Debes iniciar sesión.', 'permission');
    }
    const { error } = await supabase.from('cost_sheet_templates').insert({
      name: `${template.name} (Copia)`,
      description: template.description,
      category: template.category,
      data: template.data,
      type: template.type,
      created_by: uid,
      store_id: template.store_id,
    });
    if (error) throw error;
  } catch (error) {
    if (error instanceof TemplateServiceError) throw error;
    throw mapError(error, 'No se pudo duplicar la plantilla');
  }
}

// ── Helper de logging (diagnóstico, sin datos sensibles) ─────────────

export function logTemplateOp(op: string, detail: Record<string, unknown> = {}): void {
  logger.info('COST_SHEET', `TEMPLATE_${op.toUpperCase()}`, detail);
}
