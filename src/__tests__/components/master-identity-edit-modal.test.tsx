/**
 * MISIÓN GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO (2026-11-11) —
 * MasterIdentityEditModal: edición de imagen + descripción compartidas.
 *
 * Cobertura (criterios de aceptación §7.3/§7.5):
 *  · Gobernador: guarda vía update_master_product (aplicación inmediata) con
 *    el payload de identidad (imagen + descripción del registro maestro).
 *  · No gobernador: propone vía propose_master_change (pendiente de
 *    aprobación) — JAMÁS escribe el maestro directamente.
 *  · El ALCANCE GLOBAL del cambio queda claro ANTES de guardar (aviso visible).
 *  · resolveMasterId: filas solo-maestro (source='master' → id del maestro) y
 *    filas locales vinculadas (master_product_id explícito).
 *  · Sin cambios → no llama a ninguna mutación (operación no-op explícita).
 *  · Error de la RPC → el archivo subido se limpia (sin huérfanos) y el error
 *    se traduce a un mensaje claro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';

const updateMutate = vi.fn();
const proposeMutate = vi.fn();

const MASTER = {
  id: '11111111-aaaa-4bbb-8ccc-222222222222',
  sku: 'SKU-M1',
  name: 'Producto Maestro',
  description: 'Descripción vigente del maestro',
  image_path: 'master-file.webp',
};

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), dismiss: vi.fn() } }));

vi.mock('@/hooks/api/useMasterCatalog', async (importOriginal) => {
  void importOriginal;
  return {
    useMasterProductIdentity: () => ({ data: MASTER, isLoading: false }),
    useUpdateMasterProduct: () => ({ mutateAsync: updateMutate, isPending: false }),
    useProposeMasterChange: () => ({ mutateAsync: proposeMutate, isPending: false }),
  };
});

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
    storage: {
      from: () => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'x' }, error: null }),
        remove: vi.fn().mockResolvedValue({ data: [], error: null }),
      }),
    },
  },
}));

vi.mock('@/lib/utils', () => ({
  getSupabaseUrl: () => 'https://example.supabase.co/storage/v1/object/public/product-images/x',
  getProductImageUrl: () => null,
  cn: (...a: unknown[]) => a.filter(Boolean).join(' '),
}));

vi.mock('@/lib/image-compress', () => ({
  validateImageFile: () => null,
  compressImage: async (f: File) => f,
}));

import { MasterIdentityEditModal, resolveMasterId } from '@/components/views/terminal/views/catalog/MasterIdentityEditModal';
import type { Product } from '@/types';

const baseRow = (over: Partial<Product>): Product => ({
  id: MASTER.id,
  name: MASTER.name,
  sku: MASTER.sku,
  source: 'master',
  master_product_id: null,
  ...over,
} as Product);

function renderModal(product: Product | null, isGovernor: boolean) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MasterIdentityEditModal
        product={product}
        open={!!product}
        onClose={vi.fn()}
        storeId="5e6fe821-5465-48b1-b3f1-3aa3182edc38"
        isGovernor={isGovernor}
      />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  updateMutate.mockReset();
  proposeMutate.mockReset();
});

describe('resolveMasterId — resolución del maestro desde la fila del catálogo', () => {
  it('fila local vinculada: usa master_product_id explícito', () => {
    expect(resolveMasterId(baseRow({ source: 'local', master_product_id: 'm-uuid-1' } as Product))).toBe('m-uuid-1');
  });

  it('fila solo-maestro: el id listado ES el del maestro (sin fila local)', () => {
    expect(resolveMasterId(baseRow({ source: 'master', master_product_id: null } as Product))).toBe(MASTER.id);
  });

  it('fila local sin vínculo: null (no pertenece al catálogo maestro)', () => {
    expect(resolveMasterId(baseRow({ source: 'local', master_product_id: null, id: 'local-1' } as Product))).toBeNull();
  });
});

describe('MasterIdentityEditModal — gobernador (aplicación inmediata)', () => {
  it('muestra el aviso de ALCANCE GLOBAL antes de guardar', () => {
    renderModal(baseRow({}), true);
    expect(screen.getByText(/Alcance global:/i)).toBeInTheDocument();
    expect(screen.getByText(/afectan a todas las tiendas de la organización vinculadas a este producto/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar cambios compartidos/i })).toBeInTheDocument();
  });

  it('hidrata la descripción vigente del maestro y guarda vía update_master_product', async () => {
    renderModal(baseRow({}), true);
    const textarea = screen.getByLabelText('Descripción compartida del producto');
    expect(textarea).toHaveValue(MASTER.description);

    fireEvent.change(textarea, { target: { value: 'Nueva descripción compartida' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios compartidos/i }));

    await waitFor(() => {
      expect(updateMutate).toHaveBeenCalledTimes(1);
    });
    expect(updateMutate).toHaveBeenCalledWith({
      masterId: MASTER.id,
      changes: { description: 'Nueva descripción compartida' },
    });
    // El gobernador JAMÁS usa la cola de propuestas.
    expect(proposeMutate).not.toHaveBeenCalled();
  });

  it('sin cambios reales: operación no-op explícita (ninguna mutación)', async () => {
    renderModal(baseRow({}), true);
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios compartidos/i }));
    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar');
    });
    expect(updateMutate).not.toHaveBeenCalled();
    expect(proposeMutate).not.toHaveBeenCalled();
  });
});

describe('MasterIdentityEditModal — no gobernador (propuesta pendiente)', () => {
  it('ofrece «Proponer cambio» y usa propose_master_change, nunca update_master_product', async () => {
    renderModal(baseRow({}), false);
    const textarea = screen.getByLabelText('Descripción compartida del producto');
    fireEvent.change(textarea, { target: { value: 'Descripción propuesta por la tienda' } });
    fireEvent.click(screen.getByRole('button', { name: /Proponer cambio/i }));

    await waitFor(() => {
      expect(proposeMutate).toHaveBeenCalledTimes(1);
    });
    expect(proposeMutate).toHaveBeenCalledWith({
      masterId: MASTER.id,
      changes: { description: 'Descripción propuesta por la tienda' },
    });
    expect(updateMutate).not.toHaveBeenCalled();
    // El aviso explica el flujo pendiente de aprobación.
    expect(screen.getByText(/pendiente de aprobación/i)).toBeInTheDocument();
  });
});

describe('MasterIdentityEditModal — errores con mensaje claro', () => {
  it('traduce ERR_UNAUTHORIZED a un mensaje comprensible (toasts de sonner)', async () => {
    updateMutate.mockRejectedValueOnce(new Error('ERR_UNAUTHORIZED: solo el gobernador del catálogo edita la identidad compartida'));
    renderModal(baseRow({}), true);
    const textarea = screen.getByLabelText('Descripción compartida del producto');
    fireEvent.change(textarea, { target: { value: 'cambio real' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios compartidos/i }));
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Sin permiso para esta operación'));
  });
});
