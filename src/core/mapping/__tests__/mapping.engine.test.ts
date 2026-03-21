import { MappingEngine } from '../mapping.engine';
import { MappingRule } from '../mapping.types';

describe('MappingEngine', () => {
  const rules: MappingRule[] = [
    {
      id: '1', reportType: 'TRANSFER', sourceColumn: 'monto', targetField: 'amount',
      transform: 'currencyNormalize', active: true, priority: 1, createdAt: 0, updatedAt: 0
    },
    {
      id: '2', reportType: 'TRANSFER', sourceColumn: 'fecha', targetField: 'date',
      transform: 'parseDate', active: true, priority: 1, createdAt: 0, updatedAt: 0
    }
  ];

  it('should correctly map columns with complex formatting', () => {
    const dataset = [
      { monto: ' $ 1,200.50 ', fecha: '21/03/2026', extra: 'ignore' }
    ];

    const { mappedData, stats } = MappingEngine.apply(dataset, rules, 'TRANSFER');

    expect(mappedData[0].amount).toBe(120050);
    expect(mappedData[0].date).toBe('2026-03-21');
    expect(stats.successRate).toBe(100);
  });
});
