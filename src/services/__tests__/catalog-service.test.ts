import { describe, it, expect, vi, beforeEach } from 'vitest';
import { catalogService, exportCatalogToExcel, importCatalogFromExcel } from '../catalog-service';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';

// Mock dependencias
const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn().mockResolvedValue({ error: null })
    }))
  }
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: mocks
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn()
  }
}));

// Mock XLSX
vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn(() => ({})),
    book_new: vi.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: vi.fn(),
    sheet_to_json: vi.fn(() => []),
  },
  read: vi.fn(() => ({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} }
  })),
  writeFile: vi.fn(),
}));

describe('catalogService', () => {
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = {
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve: (v: unknown) => void) => resolve({ data: [], error: null })),
    };
    mocks.from.mockReturnValue(chain);
  });

  describe('uploadProductImage', () => {
    it('sube la imagen y actualiza el producto', async () => {
      const mockFile = new File([''], 'test.png', { type: 'image/png' });
      chain.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve({ error: null }));

      const result = await catalogService.uploadProductImage('p-1', mockFile);

      expect(mocks.storage.from).toHaveBeenCalledWith('product-images');
      expect(chain.update).toHaveBeenCalledWith({ image_url: expect.any(String) });
      expect(result).toBeDefined();
    });
  });

  describe('exportCatalogToExcel', () => {
    it('exports a list of products', async () => {
      const mockProducts = [{
        sku: 'P1',
        name: 'Product 1',
        cost_price: 10,
        price: 20,
        stock_current: 5,
        min_stock: 2,
        category: 'Cat',
        unit_of_measure: 'un',
        barcode: '123',
        supplier: 'Sup',
        description: 'Desc'
      }];

      await exportCatalogToExcel(mockProducts as any, 'Test Store');
      expect(XLSX.writeFile).toHaveBeenCalled();
      expect(toast.success).toHaveBeenCalled();
    });
  });

  describe('importCatalogFromExcel', () => {
    it('procesa un archivo Excel válido', async () => {
      const mockData = [
        { SKU: 'P1', Nombre: 'Prod 1', Costo: '10', 'Precio Venta': '20' }
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce(mockData);

      // Mock FileReader as a constructor
      class MockFileReader {
        readAsArrayBuffer(file: File) {
          (this as any).onload({ target: { result: new ArrayBuffer(0) } });
        }
        onload: any;
        onerror: any;
      }
      vi.stubGlobal('FileReader', MockFileReader);

      const file = new File([''], 'test.xlsx');
      const result = await importCatalogFromExcel(file);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].sku).toBe('P1');
      expect(result.errors).toHaveLength(0);
    });

    it('detecta errores de validación', async () => {
      const mockData = [
        { SKU: '', Nombre: 'Prod 1' }, // Missing SKU
        { SKU: 'P2', Nombre: '' },     // Missing Name
        { SKU: 'P3', Nombre: 'P3', Costo: 'invalid' } // Invalid Cost
      ];

      vi.mocked(XLSX.utils.sheet_to_json).mockReturnValueOnce(mockData);

      class MockFileReader {
        readAsArrayBuffer(file: File) {
          (this as any).onload({ target: { result: new ArrayBuffer(0) } });
        }
        onload: any;
      }
      vi.stubGlobal('FileReader', MockFileReader);

      const file = new File([''], 'test.xlsx');
      const result = await importCatalogFromExcel(file);

      expect(result.rows).toHaveLength(0);
      expect(result.errors).toHaveLength(3);
    });
  });
});
