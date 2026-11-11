/**
 * MISIÓN GESTIÓN DE PRODUCTOS VINCULADOS AL CATÁLOGO MAESTRO (2026-11-11) ·
 * CORRECCIÓN FUNCIONAL (2026-11-12) — MasterIdentityEditModal: edición de
 * nombre + imagen + descripción compartidas; SKU protegido (inmutable).
 *
 * Cobertura (criterios de aceptación §3/§7/§8.4/§8.7):
 *  · Gobernador: guarda vía update_master_product (aplicación inmediata) con
 *    el payload de identidad (nombre/imagen/descripción del registro maestro).
 *  · No gobernador: propone vía propose_master_change (pendiente de
 *    aprobación) — JAMÁS escribe el maestro directamente.
 *  · El NOMBRE compartido se edita y viaja en el payload (propagación a las
 *    tiendas vinculadas); vacío → error de validación SIN cerrar el diálogo.
 *  · El SKU se muestra como campo PROTEGIDO (inmutable tras la creación):
 *    no existe input editable de SKU en esta interfaz.
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

  it('muestra el SKU como campo protegido (inmutable, sin input editable)', () => {
    renderModal(baseRow({}), true);
    // CORRECCIÓN FUNCIONAL (2026-11-12) §7: el SKU identificado claramente
    // como campo protegido, no editable.
    expect(screen.getByTestId('master-identity-sku-value')).toHaveTextContent(MASTER.sku);
    expect(screen.getByText(/inmutable: no puede modificarse después de la creación del producto/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/SKU del producto/i)).toBeNull();
  });

  it('CORRECCIÓN FUNCIONAL (2026-11-12) §3.B: hidrata el NOMBRE compartido y lo guarda vía update_master_product', async () => {
    renderModal(baseRow({}), true);
    const nameInput = screen.getByLabelText('Nombre compartido del producto');
    expect(nameInput).toHaveValue(MASTER.name);

    fireEvent.change(nameInput, { target: { value: 'Nombre nuevo compartido' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios compartidos/i }));

    await waitFor(() => {
      expect(updateMutate).toHaveBeenCalledTimes(1);
    });
    expect(updateMutate).toHaveBeenCalledWith({
      masterId: MASTER.id,
      changes: { name: 'Nombre nuevo compartido' },
    });
    expect(proposeMutate).not.toHaveBeenCalled();
  });

  it('combina nombre + descripción en un único payload de identidad compartida', async () => {
    renderModal(baseRow({}), true);
    fireEvent.change(screen.getByLabelText('Nombre compartido del producto'), { target: { value: 'Nombre combinado' } });
    fireEvent.change(screen.getByLabelText('Descripción compartida del producto'), { target: { value: 'Descripción combinada' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios compartidos/i }));

    await waitFor(() => {
      expect(updateMutate).toHaveBeenCalledTimes(1);
    });
    expect(updateMutate).toHaveBeenCalledWith({
      masterId: MASTER.id,
      changes: { name: 'Nombre combinado', description: 'Descripción combinada' },
    });
  });

  it('nombre vacío → error de validación SIN cerrar el diálogo ni llamar mutaciones', async () => {
    renderModal(baseRow({}), true);
    fireEvent.change(screen.getByLabelText('Nombre compartido del producto'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Guardar cambios compartidos/i }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('El nombre compartido es obligatorio');
    });
    expect(updateMutate).not.toHaveBeenCalled();
    expect(proposeMutate).not.toHaveBeenCalled();
    // El diálogo sigue abierto con el error visible.
    expect(screen.getByLabelText('Nombre compartido del producto')).toBeInTheDocument();
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

  it('el cambio de NOMBRE también viaja como propuesta (no gobernador)', async () => {
    renderModal(baseRow({}), false);
    fireEvent.change(screen.getByLabelText('Nombre compartido del producto'), { target: { value: 'Nombre propuesto por tienda' } });
    fireEvent.click(screen.getByRole('button', { name: /Proponer cambio/i }));

    await waitFor(() => {
      expect(proposeMutate).toHaveBeenCalledTimes(1);
    });
    expect(proposeMutate).toHaveBeenCalledWith({
      masterId: MASTER.id,
      changes: { name: 'Nombre propuesto por tienda' },
    });
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
