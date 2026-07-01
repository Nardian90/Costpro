/**
 * Ficha de costo mínima válida para tests del motor de cálculo.
 * Basada en el esquema real de CostSheetData de la app.
 */
export const MINIMAL_COST_SHEET = {
  header: {
    id: 'test-ficha-001',
    name: 'Producto de Test E2E',
    code: 'FC-TEST-001',
    date: '2025-01-01',
    unit: 'UD',
    quantity: 100,
    currency: 'CUP',
    category: 'Test',
    salePrice: 0,
    productionLevel: 'N/A',
    utilization: 'N/A',
  },
  sections: [
    {
      id: 'materias-primas',
      label: 'Materias Primas y Materiales',
      rows: [
        {
          id: '1.1',
          label: 'Material A',
          value: 500,
          isPercent: false,
          children: [],
        },
        {
          id: '1.2',
          label: 'Material B',
          value: 300,
          isPercent: false,
          children: [],
        },
      ],
    },
    {
      id: 'salarios',
      label: 'Gastos de Fuerza de Trabajo',
      rows: [
        {
          id: '2.1',
          label: 'Salarios Directos',
          value: 200,
          isPercent: false,
          children: [],
        },
      ],
    },
  ],
  annexes: [],
  summary: {},
};

/** Ficha con fórmulas para test de Goal Seek */
export const GOAL_SEEK_SHEET = {
  ...MINIMAL_COST_SHEET,
  header: { ...MINIMAL_COST_SHEET.header, id: 'test-goal-seek-001' },
  sections: [
    {
      id: 'materias-primas',
      label: 'Materias Primas',
      rows: [
        { id: '1.1', label: 'Costo Variable', value: 1000, isPercent: false, children: [] },
      ],
    },
  ],
};
