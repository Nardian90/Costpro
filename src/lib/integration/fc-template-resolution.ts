/**
 * @file Resolución de plantilla efectiva para la FC de un producto.
 * @description FC-USR-TEMPLATE — server-side.
 *
 * Desde la misión «conexión Producto ↔ Ficha de Costo» (2026-11-10), un producto
 * puede estar asociado a una plantilla de usuario (`cost_sheet_templates`, UUID en
 * `product_cost_sheets.template_id`) en lugar de depender únicamente de la
 * plantilla predeterminada de la tienda (`store_cost_templates`, clave TEXT de
 * plantilla de sistema).
 *
 * Este módulo centraliza la cadena de resolución para TODOS los procesos de
 * (re)generación:
 *
 *   1. FC existente del producto con template_id = UUID presente en
 *      cost_sheet_templates → regenerar con ESA plantilla (preserva la
 *      asociación explícita del usuario).
 *   2. Si no → plantilla predeterminada activa de la tienda (comportamiento
 *      histórico, intacto para procesos automáticos).
 *
 * La autorización de plantillas (visibilidad) se valida aquí también, porque
 * las API routes usan el cliente service-role (bypass RLS) y deben replicar
 * manualmente las políticas de `cost_sheet_templates`:
 *
 *   SELECT · private → created_by = usuario; public → store_id IS NULL o
 *   acceso a la tienda; system → creadas por la app; admin ve todo.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CostSheetData } from '@/types/cost-sheet';
import type { FCModalidad } from '@/contracts/store-cost-template';
import type { AuthenticatedSession } from '@/lib/auth-middleware';
import { isAdminLevel } from '@/lib/roles';

// ── Tipos ────────────────────────────────────────────────────────────────

export interface EffectiveTemplate {
  /** ID que se persiste en product_cost_sheets.template_id */
  template_id: string;
  /** CostSheetData completa (de cost_sheet_templates.data o del override de tienda) */
  template_data: CostSheetData | Record<string, unknown> | null;
  modalidad: FCModalidad;
  /** De dónde salió la plantilla — para trazabilidad y auditoría */
  source: 'product' | 'store';
  /** Nombre legible cuando la fuente es cost_sheet_templates */
  template_name?: string | null;
}

export interface UserTemplateRow {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  data: CostSheetData;
  type: 'system' | 'private' | 'public';
  created_by: string | null;
  store_id: string | null;
}

export type TemplateVisibilityError =
  | 'not_found'
  | 'not_visible';

// ── Utilidades ───────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_MODALIDADES: readonly FCModalidad[] = ['produccion', 'servicios', 'comercializacion'] as const;

/** ¿El template_id es un UUID (referencia a cost_sheet_templates)? */
export function isUuidTemplateId(templateId: string | null | undefined): boolean {
  return !!templateId && UUID_RE.test(templateId);
}

/** Infiere la modalidad de una plantilla de usuario (header.destination), con default. */
export function inferModalidadFromTemplate(
  templateData: { header?: { destination?: unknown } } | null | undefined,
  fallback: FCModalidad = 'produccion',
): FCModalidad {
  const dest = templateData?.header?.destination;
  return VALID_MODALIDADES.includes(dest as FCModalidad) ? (dest as FCModalidad) : fallback;
}

/** ¿Tiene el caller membresía activa con uno de los roles indicados en la tienda? */
export function hasStoreMembership(
  session: Pick<AuthenticatedSession['user'], 'role' | 'memberships'>,
  storeId: string,
  roles: string[],
): boolean {
  if (isAdminLevel(session.role)) return true;
  const memberships = session.memberships || [];
  return memberships.some(
    m => m.store_id === storeId && m.status === 'active' && roles.includes(m.role),
  );
}

// ── Visibilidad de plantillas (espejo manual de la RLS de cost_sheet_templates) ──

/**
 * Valida que el usuario pueda USAR la plantilla (nivel lectura).
 *
 * service-role bypassa RLS → esta función replica las reglas SELECT de la
 * migración 20261110120000:
 *   - system → visible
 *   - private → created_by = usuario
 *   - public → store_id NULL (global) o usuario con acceso a esa tienda
 *   - admin/superadmin → todo
 */
export function isTemplateVisibleToUser(
  template: Pick<UserTemplateRow, 'type' | 'created_by' | 'store_id'>,
  session: Pick<AuthenticatedSession['user'], 'id' | 'role' | 'memberships'>,
): boolean {
  if (isAdminLevel(session.role)) return true;
  if (template.type === 'system') return true;
  if (template.type === 'private') {
    return !!template.created_by && template.created_by === session.id;
  }
  // public
  if (!template.store_id) return true; // plantilla pública global
  // pública de una tienda concreta: exigir membresía activa (cualquier rol operativo)
  const memberships = session.memberships || [];
  return memberships.some(m => m.store_id === template.store_id && m.status === 'active');
}

/**
 * Carga una plantilla de usuario y valida su visibilidad.
 * Retorna { template } | { error: 'not_found' | 'not_visible' }.
 */
export async function getVisibleUserTemplate(
  admin: SupabaseClient,
  templateId: string,
  session: Pick<AuthenticatedSession['user'], 'id' | 'role' | 'memberships'>,
): Promise<{ template: UserTemplateRow; error?: undefined } | { template?: undefined; error: TemplateVisibilityError }> {
  const { data, error } = await admin
    .from('cost_sheet_templates')
    .select('id, name, description, category, data, type, created_by, store_id')
    .eq('id', templateId)
    .maybeSingle();

  if (error || !data) {
    return { error: 'not_found' };
  }

  const template = data as UserTemplateRow;
  if (!isTemplateVisibleToUser(template, session)) {
    return { error: 'not_visible' };
  }

  return { template };
}

// ── Resolución de plantilla efectiva ─────────────────────────────────────

/**
 * Resuelve la plantilla con la que se debe (re)generar la FC de un producto.
 *
 * Cadena (misión §4/§5):
 *   1. existingTemplateId (UUID de cost_sheet_templates y fila existente) →
 *      plantilla del producto (asociación explícita, se preserva).
 *   2. Plantilla predeterminada activa de la tienda.
 *   3. null — no hay nada con qué generar.
 *
 * NOTA: la visibilidad NO se re-valida en la rama 1 para el mismo usuario que
 * regenera (la asociación la creó un usuario autorizado en su momento); si la
 * plantilla fue eliminada o ya no es accesible, cae al eslabón 2 sin romper
 * la generación por tienda. El endpoint generate-from-template SÍ valida
 * visibilidad estricta en el momento de crear/cambiar la asociación.
 */
export async function resolveEffectiveTemplate(
  admin: SupabaseClient,
  params: {
    storeId: string;
    existingTemplateId?: string | null;
  },
): Promise<EffectiveTemplate | null> {
  const { storeId, existingTemplateId } = params;

  // 1. Asociación explícita del producto con plantilla de usuario
  if (isUuidTemplateId(existingTemplateId)) {
    const { data, error } = await admin
      .from('cost_sheet_templates')
      .select('id, name, data, type, created_by, store_id')
      .eq('id', existingTemplateId as string)
      .maybeSingle();

    if (!error && data) {
      const row = data as UserTemplateRow;
      return {
        template_id: row.id,
        template_data: row.data,
        modalidad: inferModalidadFromTemplate(row.data as { header?: { destination?: unknown } }),
        source: 'product',
        template_name: row.name,
      };
    }
    // Plantilla eliminada → caer a la de tienda (no romper regeneración)
  }

  // 2. Plantilla predeterminada de la tienda
  const { data: storeTemplate, error: storeError } = await admin
    .from('store_cost_templates')
    .select('store_id, template_id, template_data, modalidad, pdf_format, is_active')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .maybeSingle();

  if (storeError || !storeTemplate) return null;

  return {
    template_id: storeTemplate.template_id as string,
    template_data: (storeTemplate.template_data as Record<string, unknown> | null) ?? null,
    modalidad: storeTemplate.modalidad as FCModalidad,
    source: 'store',
    template_name: null,
  };
}
