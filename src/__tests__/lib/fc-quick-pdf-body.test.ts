import { describe, it, expect } from 'vitest';
import {
  calculatedRowsToValues,
  buildQuickPdfBody,
  type FCCalculatedData,
} from '@/lib/export/fc-quick-pdf-body';
import { PDF_FORMATS_META } from '@/lib/export/pdf-export-types';

// ============================================
// Fixtures — espejo de runGenerationPipeline (fc-generator-service)
// ============================================

const CALCULATED_DATA: FCCalculatedData = {
  header: { name: 'Abrazadera metálica 3/4', code: 'ABR-034', destination: 'produccion', sale_price: 250 },
  sections: [{ id: '1', label: 'Gastos Materiales', rows: [{ id: '1.1', label: 'Acero', um: 'kg', total: 40 }] }],
  annexes: [{ id: 'I', title: 'Materias Primas', columns: [{ key: 'description', label: 'Descripción' }], data: [{ description: 'Acero' }] }],
  calculatedRows: [
    { id: '1.1', label: 'Acero', total: 40, calculatedVH: 20 },
    { id: '14', label: 'TOTAL COSTOS Y GASTOS', total: 100, calculatedVH: 50 },
  ],
  summary: { totalCost: 100, grandTotal: 250, totalMargin: 150 },
  audits: [],
};

// ============================================
// Tests
// ============================================

describe('calculatedRowsToValues (fix array-vs-Record)', () => {
  it('convierte el array plano de calculatedRows al Record rowId→fila', () => {
    const values = calculatedRowsToValues(CALCULATED_DATA.calculatedRows);
    // Este era el BUG original: quick-pdf pasaba el ARRAY como calculatedValues
    // y el generador hacía calculatedValues[row.id] → undefined → ceros.
    expect(Array.isArray(values)).toBe(false);
    expect(values['1.1']).toEqual(expect.objectContaining({ total: 40, calculatedVH: 20 }));
    expect(values['14'].total).toBe(100);
  });

  it('tolera null/undefined y filas sin id', () => {
    expect(calculatedRowsToValues(null)).toEqual({});
    expect(calculatedRowsToValues(undefined)).toEqual({});
    expect(calculatedRowsToValues([null, { total: 5 }, { id: 'ok' }] as any)).toEqual({ ok: { id: 'ok' } });
  });
});

describe('buildQuickPdfBody (FC-PDF-UNIFY)', () => {
  it('produce el contrato del motor generateCostSheetPDF', () => {
    const body = buildQuickPdfBody(CALCULATED_DATA, 'standard') as any;
    expect(body.data).toEqual({
      header: CALCULATED_DATA.header,
      sections: CALCULATED_DATA.sections,
      annexes: CALCULATED_DATA.annexes,
    });
    // calculatedValues DEBE ser un Record indexable por row.id
    expect(body.calculatedValues['1.1'].total).toBe(40);
    expect(body.calculatedValues['14'].total).toBe(100);
  });

  it('propaga el pdf_format seleccionado a options (motor de 10 formatos)', () => {
    for (const meta of PDF_FORMATS_META) {
      const body = buildQuickPdfBody(CALCULATED_DATA, meta.id) as any;
      expect(body.options.pdfFormat).toBe(meta.id);
    }
  });

  it('las opciones por defecto espejan CostSheetExportModal', () => {
    const body = buildQuickPdfBody(CALCULATED_DATA, 'standard') as any;
    expect(body.options).toEqual(expect.objectContaining({
      includeFC: true,
      includeAudit: false,
      skipZeros: true,
      includeUtilityNote: true,
      showDateTime: true,
      annexLayout: 'together',
    }));
  });

  it('calculatedHeader expone totales con los nombres que leen los renderers', () => {
    const body = buildQuickPdfBody(CALCULATED_DATA, 'res148') as any;
    expect(body.calculatedHeader.totalCost).toBe(100);
    expect(body.calculatedHeader.costoTotal).toBe(100);
    expect(body.calculatedHeader.salePrice).toBe(250);
    expect(body.calculatedHeader.precioVenta).toBe(250);
    // además hereda el header enriquecido (name/code/destination)
    expect(body.calculatedHeader.name).toBe('Abrazadera metálica 3/4');
  });

  it('tolera calculated_data vacío (FC histórica) sin lanzar', () => {
    const body = buildQuickPdfBody({}, 'standard') as any;
    expect(body.data.sections).toEqual([]);
    expect(body.calculatedValues).toEqual({});
    const bodyNull = buildQuickPdfBody(null, 'standard') as any;
    expect(bodyNull.data.sections).toEqual([]);
  });
});
