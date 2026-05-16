import { solveForTarget } from './src/lib/cost-engine/solver';
import { CostSheetData } from './src/types/cost-sheet';

const BASE_HEADER = {
  code: 'T-001',
  name: 'Test',
  date: '2024-01-01',
  quantity: 1,
  currency: 'CUP',
  category: '',
  type: '',
  unit: 'u',
  product_code: 'P-001',
  company: '',
  organism: '',
  union: '',
  destination: '',
  production_level: 1,
  capacity_utilization: 100,
  sale_price: 0,
  client: ''
};

const mockData: CostSheetData = {
  header: { ...BASE_HEADER },
  sections: [
    {
      id: 'S1',
      rows: [
        {
          id: '13.1',
          classification: '13.1',
          label: 'Variable Input',
          valorHistorico: 100,
          calculationMethod: 'ValorFijo'
        },
        {
          id: '14.1',
          classification: '14.1',
          label: 'Target Output',
          formula: 'ref("13.1") * 1.25',
          calculationMethod: 'FORMULA'
        }
      ]
    }
  ],
  annexes: [],
  signature: { prepared_by: '', approved_by: '' }
};

console.log('Running solveForTarget...');
const result = solveForTarget(mockData, '14.1', 2500, '13.1');
console.log('Result:', result);
if (Math.abs(result - 2000) < 0.1) {
  console.log('SUCCESS');
} else {
  console.log('FAILURE');
  process.exit(1);
}
