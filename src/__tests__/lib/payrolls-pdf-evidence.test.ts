/**
 * EVIDENCIA VISUAL — genera PDFs de muestra del builder SC-4-06 para la
 * auditoría (misión 2026-11-21). Re-ejecutable: vitest run
 * src/__tests__/lib/payrolls-pdf-evidence.test.ts
 *
 * Escribe en docs/audits/NOMINAS-PDF-CONF-20261121/evidencia/:
 *   ev-1-completo.pdf      — documento completo (todas las columnas, mixto)
 *   ev-2-parcial.pdf       — impresión parcial (1 de 2 trabajadores)
 *   ev-3-ocultas.pdf       — columnas sin datos ocultas (presentación)
 *   ev-4-paginado.pdf      — 34 trabajadores: encabezados repetidos + firmas
 *   ev-5-mixto-reducido.pdf— mixto con configuración mínima bloqueada
 */
import { describe, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildPayrollPdf } from '@/lib/payrolls/pdf';
import type { Payroll, PayrollItem } from '@/lib/payrolls/types';

const OUT = resolve(process.cwd(), 'docs/audits/NOMINAS-PDF-CONF-20261121/evidencia');

const ana: PayrollItem = {
  id: 'i-1', payroll_id: 'p-1', worker_id: 'w-1',
  expediente_laboral: 'EXP-001', worker_names: 'Torres Rodríguez, Ana María',
  categoria_ocupacional: 'Técnico Medio', cargo: 'Dependiente', area_trabajo: 'Salón',
  rate_type: 'hourly', rate_amount: 1000, rate_currency: 'CUP',
  regular_hours: 24, accrued_days: 0, overtime_hours: 0, overtime_amount: 0,
  vacation_days: 0, vacation_amount: 0,
  base_salary: 24000, total_complementos: 0, total_other_earnings: 0,
  total_social_security: 0, total_gross: 24000, total_deductions: 0, total_net: 24000,
  concepts: [],
};

const luis: PayrollItem = {
  ...ana,
  id: 'i-2', worker_id: 'w-2', expediente_laboral: 'EXP-002',
  worker_names: 'Pérez Gómez, Luis Antonio', categoria_ocupacional: 'Operario',
  cargo: 'Almacenista', area_trabajo: 'Almacén',
  rate_type: 'daily', rate_amount: 5000, regular_hours: 0, accrued_days: 22,
  overtime_hours: 8, overtime_amount: 2400,
  base_salary: 110000, total_complementos: 1500, total_other_earnings: 300,
  total_social_security: 1100, total_gross: 115300, total_deductions: 500, total_net: 114800,
  concepts: [
    { id: 'c-1', item_id: 'i-2', kind: 'complemento', sigla: 'PRIMA', description: 'Prima por productividad', amount: 1500 },
    { id: 'c-2', item_id: 'i-2', kind: 'otro_haber', sigla: 'CAL', description: 'Calzado', amount: 300 },
    { id: 'c-3', item_id: 'i-2', kind: 'obligacion_social', sigla: 'SEGS', description: 'Seguridad social', amount: 1100 },
    { id: 'c-4', item_id: 'i-2', kind: 'deduccion', sigla: 'INAS', description: 'Inasistencia', amount: 500 },
  ],
};

const BASE: Payroll = {
  id: 'p-1', store_id: 's-1', tenant_id: 't-1',
  payroll_number: 'NOM-000042-2026', status: 'confirmed', tipo_nomina: 'sueldos',
  period_start: '2026-11-01', period_end: '2026-11-15', currency: 'CUP',
  entidad_nombre: 'Comercial La Esperanza S.A.', entidad_codigo: 'NIT-24-123456-7',
  payment_method: 'efectivo', cheque_number: 'CHQ-004512', cheque_date: '2026-11-16',
  reintegro_number: null, reintegro_date: null,
  notes: 'Nómina del 1 al 15 de noviembre — pago por cheque nominativo.',
  total_workers: 2, total_regular_hours: 24, total_overtime_hours: 8, total_accrued_days: 22,
  total_base_salary: 134000, total_overtime: 2400, total_complementos: 1500,
  total_other_earnings: 300, total_social_security: 1100, total_gross: 139300,
  total_deductions: 500, total_net: 138800, total_vacation_days: 0, total_vacation_amount: 0,
  created_by: 'Usuario Uno', reviewed_by: 'Usuario Dos', reviewed_at: '2026-11-16T10:00:00Z',
  accounted_by: null, accounted_at: null, paid_by: null, paid_at: null,
  voided_by: null, voided_at: null, void_reason: null,
  created_at: '2026-11-16T09:00:00Z', updated_at: '2026-11-16T10:00:00Z',
  items: [ana, luis],
};

const save = (doc: { output: (t: string) => ArrayBuffer }, name: string) => {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${name}`, new Uint8Array(doc.output('arraybuffer')));
};

describe('evidencia visual del PDF de nóminas (solo generación)', () => {
  it('ev-1: documento completo (todas las columnas + firma por fila)', async () => {
    const doc = await buildPayrollPdf({ payroll: BASE, elaboraNombre: 'Usuario Uno' });
    save(doc, 'ev-1-completo.pdf');
  });

  it('ev-2: impresión PARCIAL — solo Ana (totales del pie = incluidos)', async () => {
    const doc = await buildPayrollPdf({
      payroll: BASE,
      options: { includedWorkerIds: ['w-1'] },
    });
    save(doc, 'ev-2-parcial.pdf');
  });

  it('ev-3: columnas SIN DATOS ocultas (extras/vacaciones de Ana) — importes intactos', async () => {
    const doc = await buildPayrollPdf({
      payroll: BASE,
      options: {
        visibleColumns: [
          'expediente', 'nombres', 'categoria', 'salario_basico', 'tiempo',
          'otros_haberes', 'oblig_social', 'total_devengado', 'deducciones', 'neto', 'recibi_conforme',
        ],
      },
    });
    save(doc, 'ev-3-ocultas.pdf');
  });

  it('ev-4: paginación con 34 trabajadores (encabezados repetidos, filas íntegras)', async () => {
    const rows: PayrollItem[] = [];
    for (let i = 1; i <= 34; i++) {
      rows.push({
        ...luis,
        id: `i-${i}`, worker_id: `w-${i}`,
        expediente_laboral: `EXP-${String(i).padStart(3, '0')}`,
        worker_names: `Trabajador de Prueba Número ${i}`,
        base_salary: 40000 + i, total_gross: 45000 + i, total_net: 44000 + i,
      });
    }
    const big: Payroll = { ...BASE, items: rows, total_workers: rows.length };
    const doc = await buildPayrollPdf({ payroll: big });
    save(doc, 'ev-4-paginado.pdf');
  });

  it('ev-5: configuración mínima (bloqueadas) — espacio amplio de firma', async () => {
    const doc = await buildPayrollPdf({
      payroll: BASE,
      options: { visibleColumns: [] },
    });
    save(doc, 'ev-5-mixto-reducido.pdf');
  });
});
