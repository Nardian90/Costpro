import { db } from '../dexie';
import { v4 as uuidv4 } from 'uuid';
import { MappingRule as MappingRuleType } from '../../core/mapping/mapping.types';

export async function seedMappingRules() {
  const count = await (db as any).mapping_rules.count();
  if (count > 0) return;

  const defaultRules: MappingRuleType[] = [
    {
      id: uuidv4(), reportType: 'TRANSFER', sourceColumn: 'monto', targetField: 'amount',
      transform: 'currencyNormalize', active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    {
      id: uuidv4(), reportType: 'TRANSFER', sourceColumn: 'importe', targetField: 'amount',
      transform: 'currencyNormalize', active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    {
      id: uuidv4(), reportType: 'TRANSFER', sourceColumn: 'fecha', targetField: 'date',
      transform: 'parseDate', active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    {
      id: uuidv4(), reportType: 'TRANSFER', sourceColumn: 'referencia', targetField: 'reference',
      active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    {
      id: uuidv4(), reportType: 'TRANSFER', sourceColumn: 'nombre', targetField: 'customer_name',
      transform: 'toUpperCase', active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    {
      id: uuidv4(), reportType: 'TRANSFER', sourceColumn: 'carnet', targetField: 'customer_id',
      transform: 'extractDigits', active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    // QR Rules
    {
      id: uuidv4(), reportType: 'QR', sourceColumn: 'monto', targetField: 'amount',
      transform: 'currencyNormalize', active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    },
    {
      id: uuidv4(), reportType: 'QR', sourceColumn: 'referencia', targetField: 'reference',
      active: true, priority: 1, createdAt: Date.now(), updatedAt: Date.now()
    }
  ];

  await (db as any).mapping_rules.bulkAdd(defaultRules);
}
