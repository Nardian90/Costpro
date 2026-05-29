import { describe, it, expect, vi, beforeEach } from 'vitest';
import { catalogService } from '../catalog-service';

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

describe('catalogService', () => {
  let chain: { update: ReturnType<typeof vi.fn>; select: ReturnType<typeof vi.fn>; eq: ReturnType<typeof vi.fn>; then: ReturnType<typeof vi.fn> };

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

    it('lanza error si la subida falla', async () => {
        const mockFile = new File([''], 'test.png');
        mocks.storage.from.mockReturnValueOnce({
            upload: vi.fn().mockResolvedValue({ error: new Error('Upload error') })
        });
        await expect(catalogService.uploadProductImage('p-1', mockFile)).rejects.toThrow('Upload error');
    });

    it('lanza error si la actualización falla', async () => {
        const mockFile = new File([''], 'test.png');
        chain.then.mockImplementationOnce((resolve: (v: unknown) => void) => resolve({ error: new Error('Update error') }));
        await expect(catalogService.uploadProductImage('p-1', mockFile)).rejects.toThrow('Update error');
    });
  });
});
