import { describe, it, expect, vi } from 'vitest';
import { importService } from '../import-service';
import { z } from 'zod';
import Papa from 'papaparse';

vi.mock('papaparse', () => ({
  default: {
    parse: vi.fn((file, config) => {
      // Simular comportamiento de Papa.parse
      if (file.name === 'error.csv') {
          config.error({ message: 'Read error' });
      } else {
          config.complete({
            data: [
              { 'SKU': 'P1', 'Nombre': 'Prod 1' },
              { 'SKU': 'P2', 'Nombre': '' } // Invalid according to schema
            ],
            meta: { fields: ['SKU', 'Nombre'] }
          });
      }
    })
  }
}));

describe('importService', () => {
  const schema = z.object({
    sku: z.string().min(1),
    name: z.string().min(1, 'Nombre es obligatorio')
  });

  const headerAliases = {
    sku: ['sku', 'SKU'],
    name: ['name', 'Nombre']
  };

  it('normaliza cabeceras y valida datos correctamente', async () => {
    const mockFile = new File([''], 'test.csv');
    const result = await importService.parseAndValidate(mockFile, schema, headerAliases);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].item).toEqual({ sku: 'P1', name: 'Prod 1' });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('Nombre es obligatorio');
  });

  it('maneja errores de lectura del archivo', async () => {
    const mockFile = new File([''], 'error.csv');
    const result = await importService.parseAndValidate(mockFile, schema, headerAliases);

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Error de lectura');
  });
});
