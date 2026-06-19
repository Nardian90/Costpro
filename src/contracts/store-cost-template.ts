/**
 * @file Contrato de datos estricto para Plantilla de FC por Tienda (StoreCostTemplate).
 * @description Define la estructura de datos que el frontend DEBE esperar
 * para la asignación de plantilla de Ficha de Costo predeterminada
 * por tienda. Elimina `null` y `undefined` para garantizar un estado
 * predecible.
 *
 * Este contrato sirve como puente entre los bounded contexts
 * TenantAdmin (tiendas) y CostManagement (plantillas de FC).
 */

// ============================================
// Modalidad Res. 148/2023
// ============================================

export type FCModalidad = 'produccion' | 'servicios' | 'comercializacion';

export const FC_MODALIDADES: FCModalidad[] = ['produccion', 'servicios', 'comercializacion'];

export const FC_MODALIDAD_LABELS: Record<FCModalidad, string> = {
  produccion: 'Producción (Modalidad A)',
  servicios: 'Servicios (Modalidad B)',
  comercializacion: 'Comercialización (Modalidad C)',
};

// ============================================
// Formatos PDF disponibles para FC
// ============================================

export type FCPdfFormat =
  | 'standard'
  | 'pro'
  | 'res148'
  | 'ejecutivo'
  | 'contabilidad'
  | 'auditoria'
  | 'simplificado'
  | 'bilingue'
  | 'comparativo'
  | 'exportacion';

export const FC_PDF_FORMATS: FCPdfFormat[] = [
  'standard', 'pro', 'res148', 'ejecutivo', 'contabilidad',
  'auditoria', 'simplificado', 'bilingue', 'comparativo', 'exportacion',
];

export const FC_PDF_FORMAT_LABELS: Record<FCPdfFormat, string> = {
  standard: 'Estándar',
  pro: 'Profesional',
  res148: 'Resolución 148/2023',
  ejecutivo: 'Ejecutivo',
  contabilidad: 'Contabilidad',
  auditoria: 'Auditoría',
  simplificado: 'Simplificado',
  bilingue: 'Bilingüe',
  comparativo: 'Comparativo',
  exportacion: 'Exportación',
};

// ============================================
// StoreCostTemplateContract — contrato estricto sin opcionales
// ============================================

export interface StoreCostTemplateContract {
  id: string;
  store_id: string;
  template_id: string;             // e.g. 'template-pizza', 'template-shoes'
  template_data: Record<string, unknown> | null;  // Custom override, null = use base template
  modalidad: FCModalidad;
  pdf_format: FCPdfFormat;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================
// StoreCostTemplateFactory — fábrica con valores por defecto
// ============================================

export const StoreCostTemplateFactory = {
  /**
   * Crea una plantilla de FC por tienda con valores por defecto seguros.
   */
  create: (initialValues?: Partial<StoreCostTemplateContract>): StoreCostTemplateContract => ({
    id: '',
    store_id: '',
    template_id: 'costpro-reinicio',
    template_data: null,
    modalidad: 'produccion',
    pdf_format: 'res148',
    is_active: true,
    created_by: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...initialValues,
  }),
};

// ============================================
// mapStoreCostTemplateToContract — convierte raw → Contract
// ============================================

export interface StoreCostTemplateRaw {
  id: string;
  store_id: string;
  template_id?: string | null;
  template_data?: Record<string, unknown> | null;
  modalidad?: string | null;
  pdf_format?: string | null;
  is_active?: boolean | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/**
 * Convierte el tipo raw de la BD (con campos opcionales) a
 * `StoreCostTemplateContract` (con valores garantizados).
 */
export function mapStoreCostTemplateToContract(raw: StoreCostTemplateRaw): StoreCostTemplateContract {
  return StoreCostTemplateFactory.create({
    id: raw.id,
    store_id: raw.store_id,
    template_id: raw.template_id ?? 'costpro-reinicio',
    template_data: raw.template_data ?? null,
    modalidad: (FC_MODALIDADES.includes(raw.modalidad as FCModalidad)
      ? raw.modalidad as FCModalidad
      : 'produccion'),
    pdf_format: (FC_PDF_FORMATS.includes(raw.pdf_format as FCPdfFormat)
      ? raw.pdf_format as FCPdfFormat
      : 'res148'),
    is_active: raw.is_active ?? true,
    created_by: raw.created_by ?? null,
    created_at: raw.created_at ?? new Date().toISOString(),
    updated_at: raw.updated_at ?? new Date().toISOString(),
  });
}
