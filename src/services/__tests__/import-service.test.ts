import { describe, it, expect, vi } from 'vitest';
import { importService } from '@/services/import-service';
import { z } from 'zod';

// Mock File since it's not available in some environments
if (typeof File === 'undefined') {
  global.File = class File extends Blob {
    name: string;
    constructor(chunks: any[], name: string, options?: any) {
      super(chunks, options);
      this.name = name;
    }
  } as any;
}

describe('ImportService', () => {
  const schema = z.object({
    sku: z.string().min(1),
    price: z.preprocess((val) => parseFloat(val as string), z.number().min(0)),
  });

  const aliases = {
    sku: ['SKU', 'sku', 'code'],
    price: ['Price', 'precio', 'price'],
  };

  it('should parse and validate CSV correctly', async () => {
    const csvContent = 'SKU,Price\nPROD-001,10.50\nPROD-002,20.00';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await importService.parseCSV(file, aliases, schema, ['sku', 'price']);

    expect(result.errors).toHaveLength(0);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].rowData).toEqual({ sku: 'PROD-001', price: 10.50 });
    expect(result.data[0].rowNumber).toBe(2);
  });

  it('should return error if required columns are missing', async () => {
    const csvContent = 'SKU,WrongHeader\nPROD-001,10.50';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await importService.parseCSV(file, aliases, schema, ['sku', 'price']);

    expect(result.data).toHaveLength(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Faltan las siguientes columnas requeridas: price');
  });

  it('should collect row-level validation errors', async () => {
    const csvContent = 'SKU,Price\nPROD-001,-5.00\n,20.00';
    const file = new File([csvContent], 'test.csv', { type: 'text/csv' });

    const result = await importService.parseCSV(file, aliases, schema, ['sku', 'price']);

    expect(result.data).toHaveLength(0);
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[1].row).toBe(3);
  });
});
