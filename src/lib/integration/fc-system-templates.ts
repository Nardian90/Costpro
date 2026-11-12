/**
 * @file Catálogo de plantillas de Ficha de Costo del SISTEMA (incorporadas por COSTPRO).
 * @description FC-SYS-TEMPLATES (misión 2026-11-13 — «Fichas de Costo: auditoría integral»).
 *
 * Las 13 plantillas de sistema viven en código (archivos JSON en `src/lib/data/*`,
 * resueltos server-side por TEMPLATE_REGISTRY en `fc-generator-service.ts` —
 * arquitectura sancionada por CP-PLANTILLAS-FASE2: «las plantillas de sistema viven
 * en el frontend; no hay datos que migrar», y la tabla `cost_sheet_templates` tenía
 * 0 filas en producción). Este módulo expone SU METADATA para el selector de
 * plantillas del Inventario (FCTemplatePicker) de forma segura en cliente y
 * servidor, sin duplicar los payloads JSON.
 *
 * IMPORTANTE — coherencia con el registro server-side:
 *   - `id` es la clave del TEMPLATE_REGISTRY ('costpro-reinicio', 'template-pizza'…),
 *     NO el alias 'sys-*' del explorador. Así el marcado «Actual» del picker matchea
 *     `product_cost_sheets.template_id` cuando la FC provino de la plantilla
 *     predeterminada de tienda, y `generate-from-template` resuelve la clave
 *     directamente (TEMPLATE_ALIAS/REGISTRY acepta ambas).
 *   - Antes existían DOS listas divergentes: TEMPLATE_ALIAS (13) y
 *     FC_TEMPLATE_OPTIONS en StoreTemplateSelector (12 — faltaba 'costpro-ejemplo').
 *     Este módulo es la fuente única de metadata; StoreTemplateSelector y el picker
 *     la reutilizan.
 */

export interface SystemFCTemplateMeta {
  /** Clave del TEMPLATE_REGISTRY server-side (y de cost_sheet_templates.system si algún día se versionan en BD) */
  id: string;
  /** Nombre legible mostrado al usuario */
  name: string;
  description: string;
  category: string;
}

/** Catálogo completo de plantillas de sistema (13). */
export const SYSTEM_FC_TEMPLATES: readonly SystemFCTemplateMeta[] = [
  { id: 'costpro-reinicio', name: 'CostPro — Reinicio (General)', category: 'General', description: 'Plantilla general para reinicio de costo. Incluye todos los campos de la Resolución 148.' },
  { id: 'template-pizza', name: 'Pizza — Gastronomía', category: 'Gastronomía', description: 'Gastronomía: Pizza. Cálculo de costo con ingredientes, mano de obra y overhead.' },
  { id: 'template-juice', name: 'Jugos — Bebidas', category: 'Bebidas', description: 'Bebidas: Jugos. Materias primas, procesamiento y envasado.' },
  { id: 'template-icecream', name: 'Helados — Gastronomía', category: 'Gastronomía', description: 'Gastronomía: Helados. Base láctea, insumos y conservación.' },
  { id: 'template-shoes', name: 'Calzado — Manufactura', category: 'Manufactura', description: 'Manufactura: Calzado. Materiales, corte, ensamblaje y acabado.' },
  { id: 'template-furniture', name: 'Muebles — Carpintería', category: 'Carpintería', description: 'Carpintería: Muebles. Madera, herrajes, acabado y mano de obra.' },
  { id: 'template-repair', name: 'Reparación — Servicios', category: 'Servicios', description: 'Servicios: Reparación. Repuestos, mano de obra y diagnóstico.' },
  { id: 'template-consultancy', name: 'Consultoría — Servicios', category: 'Servicios', description: 'Servicios: Consultoría. Horas profesionales y deliverables.' },
  { id: 'template-logistics', name: 'Logística — Servicios', category: 'Servicios', description: 'Servicios: Logística. Transporte, almacenamiento y distribución.' },
  { id: 'template-industrial', name: 'Industrial — Producción', category: 'Producción', description: 'Producción: Industrial. Materias primas, procesos y energía.' },
  { id: 'template-lavar', name: 'Lavandería — Servicios', category: 'Servicios', description: 'Servicios: Lavandería. Insumos, agua, energía y mano de obra.' },
  { id: 'template-pastry', name: 'Pastelería — Gastronomía', category: 'Gastronomía', description: 'Gastronomía: Pastelería. Ingredientes, decoración y horneado.' },
  { id: 'costpro-ejemplo', name: 'CostPro — Ejemplo Oficial', category: 'General', description: 'Ejemplo oficial de ficha de costo completa de COSTPRO (Resolución 148/2023).' },
] as const;

/** Conjunto de claves válidas de plantilla de sistema (validación O(1)). */
export const SYSTEM_TEMPLATE_IDS: ReadonlySet<string> = new Set(SYSTEM_FC_TEMPLATES.map(t => t.id));

/** ¿Es una clave de plantilla de sistema ('costpro-reinicio', 'template-pizza'…)? */
export function isSystemTemplateId(templateId: string | null | undefined): boolean {
  return !!templateId && SYSTEM_TEMPLATE_IDS.has(templateId);
}

/** Busca la metadata de una plantilla de sistema por su clave. */
export function getSystemTemplateMeta(templateId: string | null | undefined): SystemFCTemplateMeta | null {
  if (!templateId) return null;
  return SYSTEM_FC_TEMPLATES.find(t => t.id === templateId) ?? null;
}

// ============================================
// Fusión de procedencias (picker de plantillas)
// ============================================

/** Registro mínimo que necesita la fusión (covariante con
 *  CostSheetTemplateRecord del servicio de plantillas). */
export interface TemplateOptionLike {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  /** Las de sistema NO llevan payload (se resuelve server-side). */
  data?: unknown;
  type: 'system' | 'private' | 'public' | string;
  created_by: string | null;
  store_id: string | null;
  created_at: string | null;
  updated_at: string | null;
}

/**
 * mergeFCTemplateOptions — fusión pura (testeable) de las plantillas de BD
 * (privadas + públicas visibles) con el catálogo de SISTEMA. Orden estable:
 *   1. Privadas del usuario (las más relevantes para conectar).
 *   2. Públicas visibles.
 *   3. Sistema (catálogo incorporado — siempre disponible como respaldo).
 * Sin duplicados por id; una plantilla de BD nunca colisiona con una de
 * sistema (ids de BD son UUID, las de sistema claves textuales).
 *
 * El registro de sistema resultante NO lleva payload (`data` vacío): la
 * generación resuelve server-side la clave con TEMPLATE_REGISTRY — el
 * registro es de presentación/selección, no de cálculo.
 */
export function mergeFCTemplateOptions<T extends TemplateOptionLike>(
  dbTemplates: T[],
): Array<T | TemplateOptionLike> {
  // Estables y sin duplicados por id (públicas de tienda + globales)
  const seen = new Set<string>();
  const dedupedDb = dbTemplates.filter(r =>
    seen.has(r.id) ? false : (seen.add(r.id), true),
  );

  const byOrigin = (t: TemplateOptionLike) =>
    t.type === 'private' ? 0 : t.type === 'public' ? 1 : 2;
  const byUpdatedDesc = (a: TemplateOptionLike, b: TemplateOptionLike) =>
    (b.updated_at ?? '').localeCompare(a.updated_at ?? '');

  const dbSorted = [...dedupedDb].sort((a, b) => byOrigin(a) - byOrigin(b) || byUpdatedDesc(a, b));

  const system: TemplateOptionLike[] = SYSTEM_FC_TEMPLATES.map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    type: 'system',
    created_by: null,
    store_id: null,
    created_at: null,
    updated_at: null,
  }));

  return [...dbSorted, ...system];
}
