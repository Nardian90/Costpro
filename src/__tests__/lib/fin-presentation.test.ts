/**
 * MISIÓN CP-FIN (2026-11-13) — Pruebas unitarias de la lógica de presentación
 * financiera compartida por las vistas CP-FIN.
 *
 * computeIncomePresentation: coherencia de signos del Estado de Rendimiento.
 * El RPC devuelve costos/gastos con signo NEGATIVO (crédito−débito); los
 * totales derivados SUMAN esos saldos con su signo (bug de signos corregido
 * en el propio RPC — el frontend solo presenta, no recalcula la doctrina).
 * summarizeCondition: resumen legible de condiciones de reglas.
 */
import { describe, it, expect } from 'vitest';
import {
  computeIncomePresentation,
  type IncomeStatementData,
} from '@/components/views/terminal/views/financial_statements/types';
import {
  summarizeCondition,
  SIMULATOR_SUPPORTED_DOCTYPES,
} from '@/components/views/terminal/views/financial_config/types';

function emptyIncome(partial: Partial<IncomeStatementData>): IncomeStatementData {
  return {
    desde: '2026-11-01',
    hasta: '2026-11-30',
    categorias: [],
    ingresos_operacionales: 0,
    ajustes_ingresos: 0,
    ingresos_netos: 0,
    costo_ventas: 0,
    utilidad_bruta: 0,
    gastos_operacionales: 0,
    resultado_operativo: 0,
    ingresos_no_operacionales: 0,
    gastos_no_operacionales: 0,
    resultado_neto: 0,
    ...partial,
  } as IncomeStatementData;
}

describe('computeIncomePresentation — signos del Estado de Rendimiento', () => {
  it('Caso A (venta 100, costo 60): utilidad bruta 40, resultado neto 40', () => {
    const p = computeIncomePresentation(emptyIncome({
      ingresos_operacionales: 100,
      ingresos_netos: 100,
      costo_ventas: -60,
      gastos_operacionales: 0,
    }));
    expect(p.ingresosNetos).toBe(100);
    expect(p.costoVentas).toBe(-60);
    expect(p.utilidadBruta).toBe(40);
    expect(p.resultadoNeto).toBe(40);
  });

  it('con devoluciones y gastos: netos 490, costo −280, gastos −85 → neto 125', () => {
    // Ejemplo ilustrativo de la misión §8
    const p = computeIncomePresentation(emptyIncome({
      ingresos_operacionales: 500,
      ajustes_ingresos: -10,
      ingresos_netos: 490,
      costo_ventas: -280,
      gastos_operacionales: -85, // servicios 25 + nóminas 35 + comisiones 10 + otros 15
    }));
    expect(p.utilidadBruta).toBe(210);
    expect(p.resultadoOperativo).toBe(125);
    expect(p.resultadoNeto).toBe(125);
  });

  it('pérdida: gasto sin ingresos → resultado neto negativo', () => {
    const p = computeIncomePresentation(emptyIncome({
      gastos_operacionales: -100,
    }));
    expect(p.resultadoNeto).toBe(-100);
  });

  it('coherencia con el RPC (mismos totales que devuelve el backend)', () => {
    const data = emptyIncome({
      ingresos_operacionales: 100,
      ingresos_netos: 100,
      costo_ventas: -60,
      utilidad_bruta: 40,
      resultado_neto: 40,
    });
    const p = computeIncomePresentation(data);
    expect(p.utilidadBruta).toBe(data.utilidad_bruta);
    expect(p.resultadoNeto).toBe(data.resultado_neto);
  });
});

describe('summarizeCondition — condiciones legibles en el constructor', () => {
  it('sin condición → «—» (siempre aplica)', () => {
    expect(summarizeCondition(null)).toBe('—');
    expect(summarizeCondition(undefined)).toBe('—');
  });

  it('condición simple → campo op valor', () => {
    const res = summarizeCondition({ campo: 'metodo_pago', op: '=', valor: 'cash' });
    expect(res).toContain('metodo_pago');
    expect(res).toContain('cash');
  });

  it('array de condiciones → resumen combinado', () => {
    const res = summarizeCondition([
      { campo: 'tipo_documento', op: '=', valor: 'egreso' },
      { campo: 'moneda_documento', op: '=', valor: 'USD' },
    ]);
    expect(res).toContain('tipo_documento');
    expect(res).toContain('moneda_documento');
  });
});

describe('SIMULATOR_SUPPORTED_DOCTYPES — documentos con selector real', () => {
  it('incluye los doctypes con datos económicos reales', () => {
    for (const dt of ['VENTA', 'RECEPCION', 'SERVICIO_RECIBIDO', 'NOMINA']) {
      expect(SIMULATOR_SUPPORTED_DOCTYPES).toContain(dt);
    }
  });
});
