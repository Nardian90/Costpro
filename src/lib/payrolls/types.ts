/**
 * Tipos del dominio Nóminas de Salario (modelo SC-4-06 · Res. 13/2007 MFP).
 *
 * Contrato servidor (migración 20261112180000_cp_payrolls_sc406.sql):
 *   - payrolls (encabezado, totales calculados SIEMPRE servidor)
 *   - payroll_items (línea por trabajador con SNAPSHOT de identidad y tarifa)
 *   - payroll_item_concepts (4 clases: complemento / otro_haber /
 *     obligacion_social / deduccion — sigla + descripción + importe)
 *   - worker_salary_rates (tarifa horaria|diaria con historial de vigencia)
 *
 * El cliente NUNCA calcula importes: envía identificadores y cantidades
 * (worker_id, horas/días, importes de extras/vacaciones y conceptos); el
 * servidor resuelve identidad, tarifa vigente, entidad y totales
 * (única fuente de verdad — trust boundary del RPC).
 */

export type PayrollStatus = 'draft' | 'confirmed' | 'paid' | 'voided';

export const PAYROLL_STATUS_LABELS: Record<PayrollStatus, string> = {
  draft: 'Borrador',
  confirmed: 'Confirmada',
  paid: 'Pagada',
  voided: 'Anulada',
};

export type TipoNomina =
  | 'sueldos'
  | 'jornales'
  | 'vacaciones'
  | 'licencias'
  | 'subsidios'
  | 'movilizados'
  | 'otros';

export const TIPO_NOMINA_LABELS: Record<TipoNomina, string> = {
  sueldos: 'Sueldos (horas)',
  jornales: 'Jornales (días)',
  vacaciones: 'Vacaciones',
  licencias: 'Licencias',
  subsidios: 'Subsidios',
  movilizados: 'Movilizados',
  otros: 'Otros',
};

export type PayrollPaymentMethod = 'efectivo' | 'tarjeta';

export type SalaryRateType = 'hourly' | 'daily';

export const RATE_TYPE_LABELS: Record<SalaryRateType, string> = {
  hourly: 'Horaria (por hora)',
  daily: 'Diaria (por día)',
};

export type PayrollCurrency = 'CUP' | 'USD' | 'EUR' | 'MLC';

/** Concepto por línea — 4 clases del modelo SC-4-06. */
export type PayrollConceptKind =
  | 'complemento'
  | 'otro_haber'
  | 'obligacion_social'
  | 'deduccion';

export const CONCEPT_KIND_LABELS: Record<PayrollConceptKind, string> = {
  complemento: 'Complemento salarial',
  otro_haber: 'Otro haber (sigla)',
  obligacion_social: 'Obligación estatal social',
  deduccion: 'Deducción',
};

/** Concepto editable que envía el cliente (sin importes calculados). */
export interface PayrollConceptInput {
  kind: PayrollConceptKind;
  sigla: string;
  description?: string;
  amount: number;
}

/** Línea editable que envía el cliente (identificadores + cantidades). */
export interface PayrollItemInput {
  worker_id: string;
  /** Horas regulares (solo tarifa horaria). */
  regular_hours?: number;
  /** Días devengados (solo tarifa diaria). */
  accrued_days?: number;
  overtime_hours?: number;
  /** Importe de horas extras — conforme a factores/tarifas de la entidad. */
  overtime_amount?: number;
  /** Acumulación de vacaciones — informativa, FUERA del devengado. */
  vacation_days?: number;
  vacation_amount?: number;
  concepts?: PayrollConceptInput[];
}

/** Concepto persistido (con id — respuesta del servidor). */
export interface PayrollItemConcept {
  id: string;
  item_id: string;
  kind: PayrollConceptKind;
  sigla: string;
  description: string;
  amount: number;
}

/** Línea persistida con snapshot de identidad y tarifa. */
export interface PayrollItem {
  id: string;
  payroll_id: string;
  worker_id: string;
  expediente_laboral: string;
  worker_names: string;
  categoria_ocupacional: string;
  cargo: string;
  area_trabajo: string;
  rate_type: SalaryRateType | null;
  rate_amount: number | null;
  rate_currency: string | null;
  regular_hours: number;
  accrued_days: number;
  overtime_hours: number;
  overtime_amount: number;
  vacation_days: number;
  vacation_amount: number;
  base_salary: number;
  total_complementos: number;
  total_other_earnings: number;
  total_social_security: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  concepts?: PayrollItemConcept[];
}

/** Encabezado del documento SC-4-06. */
export interface Payroll {
  id: string;
  store_id: string;
  tenant_id: string | null;
  payroll_number: string;
  status: PayrollStatus;
  tipo_nomina: TipoNomina;
  period_start: string;
  period_end: string;
  currency: PayrollCurrency;
  entidad_nombre: string;
  entidad_codigo: string | null;
  payment_method: PayrollPaymentMethod;
  cheque_number: string | null;
  cheque_date: string | null;
  reintegro_number: string | null;
  reintegro_date: string | null;
  notes: string;
  total_workers: number;
  total_regular_hours: number;
  total_overtime_hours: number;
  total_accrued_days: number;
  total_base_salary: number;
  total_overtime: number;
  total_complementos: number;
  total_other_earnings: number;
  total_social_security: number;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  total_vacation_days: number;
  total_vacation_amount: number;
  created_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  accounted_by: string | null;
  accounted_at: string | null;
  paid_by: string | null;
  paid_at: string | null;
  voided_by: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
  updated_at: string;
  items?: PayrollItem[];
}

/** Tarifa salarial con historial de vigencia. */
export interface WorkerSalaryRate {
  id: string;
  worker_id: string;
  store_id: string;
  tenant_id: string | null;
  rate_type: SalaryRateType;
  rate_amount: number;
  currency: PayrollCurrency;
  valid_from: string;
  valid_to: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Trabajador con perfil laboral extendido (SC-4-06 dato 6). */
export interface WorkerLaboral {
  id: string;
  store_id: string;
  first_name: string;
  last_name: string;
  ci: string | null;
  status: 'active' | 'inactive' | string;
  expediente_laboral: string | null;
  categoria_ocupacional: string | null;
  cargo: string | null;
  area_trabajo: string | null;
}

/** Respuesta jsonb estándar de los RPC del documento. */
export interface PayrollRpcResult {
  status: 'success';
  payroll_id?: string;
  payroll_number?: string;
  totals?: Record<string, number>;
  [k: string]: unknown;
}
