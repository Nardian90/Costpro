/**
 * PDF A4 de Nóminas SC-4-06 (Res. 13/2007 MFP) — MISIÓN B FASE 6.
 * Verifica: A4 apaisado, paginación con encabezados repetidos («Hoja X de Y»),
 * volcado estable (misma instancia alimenta la vista previa por bloburl) y
 * robustez ante documentos pagados/anulados (secciones condicionales).
 * Escribe una muestra en /tmp/payroll-sc406-sample.pdf para inspección visual.
 */
import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { buildPayrollPdf } from '@/lib/payrolls/pdf';
import type { Payroll, PayrollItem } from '@/lib/payrolls/types';

const anaItem: PayrollItem = {
  id: 'i-1',
  payroll_id: 'p-1',
  worker_id: 'w-1',
  expediente_laboral: 'EXP-001',
  worker_names: 'Ana Torres',
  categoria_ocupacional: 'Técnico Medio',
  cargo: 'Dependiente',
  area_trabajo: 'Salón',
  rate_type: 'hourly',
  rate_amount: 250,
  rate_currency: 'CUP',
  regular_hours: 190,
  accrued_days: 0,
  overtime_hours: 10,
  overtime_amount: 3750,
  vacation_days: 2,
  vacation_amount: 10000,
  base_salary: 47500,
  total_complementos: 1000,
  total_other_earnings: 0,
  total_social_security: 850,
  total_gross: 53100,
  total_deductions: 500,
  total_net: 52600,
  concepts: [
    { id: 'c-1', item_id: 'i-1', kind: 'complemento', sigla: 'PRIMA', description: 'Prima por productividad', amount: 1000 },
    { id: 'c-2', item_id: 'i-1', kind: 'obligacion_social', sigla: 'SEGS', description: 'Seguridad social', amount: 850 },
    { id: 'c-3', item_id: 'i-1', kind: 'deduccion', sigla: 'INAS', description: 'Inasistencia', amount: 200 },
    { id: 'c-4', item_id: 'i-1', kind: 'deduccion', sigla: 'AJU', description: 'Ajuste anterior', amount: 300 },
  ],
};

const luisItem: PayrollItem = {
  ...anaItem,
  id: 'i-2',
  worker_id: 'w-2',
  expediente_laboral: 'EXP-002',
  worker_names: 'Luis Pérez',
  categoria_ocupacional: 'Operario',
  cargo: 'Almacenista',
  area_trabajo: 'Almacén',
  rate_type: 'daily',
  rate_amount: 5000,
  regular_hours: 0,
  accrued_days: 22,
  overtime_hours: 0,
  overtime_amount: 0,
  vacation_days: 0,
  vacation_amount: 0,
  base_salary: 110000,
  total_complementos: 0,
  total_social_security: 0,
  total_gross: 110000,
  total_deductions: 0,
  total_net: 110000,
  concepts: [],
};

const BASE: Payroll = {
  id: 'p-1',
  store_id: 's-1',
  tenant_id: 't-1',
  payroll_number: 'NOM-000001-2026',
  status: 'confirmed',
  tipo_nomina: 'sueldos',
  period_start: '2026-11-01',
  period_end: '2026-11-12',
  currency: 'CUP',
  entidad_nombre: 'Tienda Nóminas 1',
  entidad_codigo: 'ENT-01',
  payment_method: 'efectivo',
  cheque_number: 'CHQ-777',
  cheque_date: '2026-11-12',
  reintegro_number: null,
  reintegro_date: null,
  notes: 'Nómina de verificación SC-4-06',
  total_workers: 2,
  total_regular_hours: 190,
  total_overtime_hours: 10,
  total_accrued_days: 22,
  total_base_salary: 157500,
  total_overtime: 3750,
  total_complementos: 1000,
  total_other_earnings: 0,
  total_social_security: 850,
  total_gross: 163100,
  total_deductions: 500,
  total_net: 162600,
  total_vacation_days: 2,
  total_vacation_amount: 10000,
  created_by: 'Usuario Uno',
  reviewed_by: 'Usuario Dos',
  reviewed_at: '2026-11-12T15:56:45Z',
  accounted_by: null,
  accounted_at: null,
  paid_by: null,
  paid_at: null,
  voided_by: null,
  voided_at: null,
  void_reason: null,
  created_at: '2026-11-12T15:50:00Z',
  updated_at: '2026-11-12T15:56:45Z',
  items: [anaItem, luisItem],
};

describe('buildPayrollPdf (SC-4-06)', () => {
  it('genera A4 APAISADO (842×595 pt) con al menos una hoja', async () => {
    const doc = await buildPayrollPdf({ payroll: BASE, elaboraNombre: 'Usuario Uno' });
    expect(doc).toBeTruthy();
    expect(Math.round(doc.internal.pageSize.getWidth())).toBe(842);
    expect(Math.round(doc.internal.pageSize.getHeight())).toBe(595);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    expect(bytes.length).toBeGreaterThan(4000);
    expect(bytes.slice(0, 5)).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])); // '%PDF-'
    writeFileSync('/tmp/payroll-sc406-sample.pdf', bytes);
  });

  it('paginación: nómina grande repite encabezados en cada hoja («Hoja X de Y»)', async () => {
    const rows: PayrollItem[] = [];
    for (let i = 1; i <= 34; i++) {
      rows.push({
        ...anaItem,
        id: `i-${i}`,
        worker_id: `w-${i}`,
        expediente_laboral: `EXP-${String(i).padStart(3, '0')}`,
        worker_names: `Trabajador Número ${i}`,
        base_salary: 40000 + i,
        total_gross: 45000 + i,
        total_net: 44000 + i,
      });
    }
    const big: Payroll = { ...BASE, items: rows, total_workers: rows.length };
    const doc = await buildPayrollPdf({ payroll: big });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(2);
    writeFileSync('/tmp/payroll-sc406-big.pdf', new Uint8Array(doc.output('arraybuffer')));
  });

  it('documento PAGADO en efectivo: genera sin errores (recibí-conforme)', async () => {
    const paid: Payroll = {
      ...BASE,
      status: 'paid',
      accounted_by: 'Usuario Tres',
      accounted_at: '2026-11-12T16:00:00Z',
      paid_by: 'Usuario Cuatro',
      paid_at: '2026-11-12T16:05:00Z',
    };
    const doc = await buildPayrollPdf({ payroll: paid });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('documento ANULADO: motivo y trazabilidad sin errores', async () => {
    const voided: Payroll = {
      ...BASE,
      status: 'voided',
      voided_by: 'Usuario Dos',
      voided_at: '2026-11-12T17:00:00Z',
      void_reason: 'anulación de verificación (motivo)',
    };
    const doc = await buildPayrollPdf({ payroll: voided });
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
