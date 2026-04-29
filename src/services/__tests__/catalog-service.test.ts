import { describe, it, expect, vi, beforeEach } from 'vitest';
import { catalogService } from '../catalog-service';
import { importService } from '../import-service';

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

vi.mock('../import-service', () => ({
  importService: {
    parseAndValidate: vi.fn()
  }
}));

global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('catalogService', () => {
  let chain: any;

  beforeEach(() => {
    vi.clearAllMocks();
    chain = {
        update: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        then: vi.fn((resolve) => resolve({ data: [], error: null })),
    };
    mocks.from.mockReturnValue(chain);
  });

  describe('exportCatalog', () => {
    it('muestra error si no hay productos', async () => {
      const { toast } = await import('sonner');
      catalogService.exportCatalog([]);
      expect(toast.error).toHaveBeenCalledWith('No hay productos para exportar');
    });

    it('genera un CSV y simula la descarga', () => {
      const mockProducts = [
        { sku: 'P1', name: 'Prod 1', price: 100, cost_price: 50, public_image_url: 'img1' }
      ] as any;

      const mockLink = {
        setAttribute: vi.fn(),
        style: { visibility: '' },
        click: vi.fn(),
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as any);

      catalogService.exportCatalog(mockProducts);

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockLink.click).toHaveBeenCalled();
      expect(mockLink.setAttribute).toHaveBeenCalledWith('download', expect.stringContaining('catalogo_productos_'));
    });
  });

  describe('downloadTemplate', () => {
      it('simula la descarga de la plantilla', () => {
          const mockLink = {
            setAttribute: vi.fn(),
            style: { visibility: '' },
            click: vi.fn(),
          };
          vi.spyOn(document, 'createElement').mockReturnValue(mockLink as any);
          catalogService.downloadTemplate();
          expect(mockLink.click).toHaveBeenCalled();
          expect(mockLink.setAttribute).toHaveBeenCalledWith('download', 'plantilla_productos.csv');
      });
  });

  describe('processImportFile', () => {
    it('valida el archivo y detecta duplicados por SKU', async () => {
      const mockFile = new File([''], 'test.csv');
      const mockImportResult = {
        data: [
          { row: 1, item: { sku: 'SKU1', name: 'A', cost: 10, price: 20, imageUrl: '' } },
          { row: 2, item: { sku: 'SKU1', name: 'B', cost: 15, price: 25, imageUrl: '' } },
          { row: 3, item: { sku: 'SKU2', name: 'C', cost: 5, price: 10, imageUrl: '' } },
        ],
        errors: []
      };
      (importService.parseAndValidate as any).mockResolvedValue(mockImportResult);

      const result = await catalogService.processImportFile(mockFile, 'store-1');

      expect(result.productsToUpdate).toHaveLength(2);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('está duplicado');
    });
  });

  describe('uploadProductImage', () => {
    it('sube la imagen y actualiza el producto', async () => {
      const mockFile = new File([''], 'test.png', { type: 'image/png' });
      chain.then.mockImplementationOnce((resolve: any) => resolve({ error: null }));

      const result = await catalogService.uploadProductImage('p-1', mockFile);

      expect(mocks.storage.from).toHaveBeenCalledWith('product-images');
      expect(chain.update).toHaveBeenCalledWith({ image_url: expect.any(String) });
      expect(result).toBeDefined();
    });

    it('lanza error si la subida falla', async () => {
        const mockFile = new File([''], 'test.png');
        mocks.storage.from.mockReturnValueOnce({
            upload: vi.fn().mockResolvedValue({ error: new Error('Upload error') })
        });
        await expect(catalogService.uploadProductImage('p-1', mockFile)).rejects.toThrow('Upload error');
    });

    it('lanza error si la actualización falla', async () => {
        const mockFile = new File([''], 'test.png');
        chain.then.mockImplementationOnce((resolve: any) => resolve({ error: new Error('Update error') }));
        await expect(catalogService.uploadProductImage('p-1', mockFile)).rejects.toThrow('Update error');
    });
  });

  describe('getProductVariants', () => {
      it('obtiene las variantes de un producto', async () => {
          const variants = [{ id: 'v1', name: 'V1' }];
          chain.then.mockImplementationOnce((resolve: any) => resolve({ data: variants, error: null }));

          const result = await catalogService.getProductVariants('p-1');
          expect(result).toEqual(variants);
          expect(chain.eq).toHaveBeenCalledWith('product_id', 'p-1');
      });

      it('lanza error si falla la consulta', async () => {
          chain.then.mockImplementationOnce((resolve: any) => resolve({ error: new Error('Fetch error') }));
          await expect(catalogService.getProductVariants('p-1')).rejects.toThrow('Fetch error');
      });
  });
});
