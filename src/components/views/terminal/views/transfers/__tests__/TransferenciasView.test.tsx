import { render, screen, waitFor } from '@testing-library/react';
import TransferenciasView from '../TransferenciasView';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as storeModule from '@/store';
import * as transfersApi from '@/hooks/api/useTransfers';
import * as inventoryApi from '@/hooks/api/useInventory';

// Mock hooks
vi.mock('@/store');
vi.mock('@/hooks/api/useTransfers');
vi.mock('@/hooks/api/useInventory');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
);

describe('TransferenciasView', () => {
    const mockTransfer = {
      id: 't1',
      status: 'PENDIENTE',
      created_at: new Date().toISOString(),
      items: [],
      origin_store_id: 's1',
      destination_store_id: 's2',
      destination_store: { name: 'Destino' },
      origin_store: { name: 'Origen' },
      requesting_user: { full_name: 'Solicitante' }
    };
    const mockUser = { id: 'u1', activeStoreId: 's1' };

    beforeEach(() => {
        (storeModule.useAuthStore as any).mockReturnValue({ user: mockUser } as any);
        (storeModule.useUIStore as any).mockReturnValue({
          viewQueries: { transferencias: '' },
          currentView: 'transferencias',
          showQueries: false
        } as any);

        (transfersApi.useIncomingTransfers as any).mockReturnValue({
            data: [],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        } as any);
        (transfersApi.useOutgoingTransfers as any).mockReturnValue({
            data: [mockTransfer],
            isLoading: false,
            error: null,
            refetch: vi.fn(),
        } as any);
        (transfersApi.useTransferableStores as any).mockReturnValue({
            data: [],
            isLoading: false,
        } as any);
        (transfersApi.useCreateTransfer as any).mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: false,
        } as any);
        (transfersApi.useTransferDetails as any).mockReturnValue({
            data: mockTransfer,
            isLoading: false,
            error: null,
        } as any);
        (transfersApi.useConfirmTransfer as any).mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: false,
        } as any);

        (inventoryApi.useInventory as any).mockReturnValue({
            data: { pages: [] },
            isFetching: false,
        } as any);
    });

    it('renderiza transferencias enviadas por defecto', async () => {
        render(<TransferenciasView />, { wrapper });
        expect(await screen.findByText(/PENDIENTE/i)).toBeInTheDocument();
    });
});
