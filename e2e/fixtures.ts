import { CostSheetDataContract } from '../src/types/cost-sheet';

export const mockCostSheet: CostSheetDataContract = {
  header: {
    id: 'test-ficha',
    name: 'Ficha de Prueba E2E',
    code: 'E2E-001',
    currency: 'CUP',
    quantity: 1,
    unit: 'U',
    sale_price: 0
  },
  sections: [
    {
      id: '1',
      label: 'MATERIA PRIMA',
      rows: [
        {
          id: '1.1',
          label: 'Insumo A',
          value: 100,
          calculationMethod: 'ValorFijo',
          unit: 'U',
          children: [
             {
               id: '1.1.1',
               label: 'Sub-Insumo A1',
               value: 50,
               calculationMethod: 'ValorFijo',
               unit: 'U'
             },
             {
               id: '1.1.2',
               label: 'Sub-Insumo A2',
               value: 50,
               calculationMethod: 'ValorFijo',
               unit: 'U'
             }
          ]
        }
      ]
    },
    {
      id: '2',
      label: 'MANO DE OBRA',
      rows: [
        {
          id: '2.1',
          label: 'Operario',
          value: 200,
          calculationMethod: 'ValorFijo',
          unit: 'H'
        }
      ]
    },
    {
      id: '3',
      label: 'COSTOS INDIRECTOS',
      rows: [
        {
          id: '3.1',
          label: 'Energía',
          value: 50,
          calculationMethod: 'ValorFijo',
          unit: 'KW'
        }
      ]
    },
    {
        id: '12',
        label: 'TOTAL COSTO',
        rows: []
    },
    {
        id: '13',
        label: 'UTILIDAD',
        rows: [
            {
                id: '13',
                label: 'Utilidad',
                formula: "ref('12') * 0.10",
                calculationMethod: 'FORMULA'
            }
        ]
    },
    {
        id: '14',
        label: 'PRECIO DE VENTA',
        rows: []
    }
  ],
  annexes: [],
  indirectConfig: {
    mode: 'coefficient',
    selectedSections: [],
    baseSection: '2',
    coefficient: 1,
    fixedAmount: 0
  }
};
