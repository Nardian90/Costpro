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
        vi.mocked(storeModule.useAuthStore).mockReturnValue({ user: mockUser } as any);
        vi.mocked(storeModule.useUIStore).mockReturnValue({
          viewQueries: { transferencias: '' },
          currentView: 'transferencias',
          showQueries: false
        } as any);

        vi.mocked(transfersApi.useIncomingTransfers).mockReturnValue({
            data: { pages: [{ transfers: [], total: 0 }], pageParams: [1] },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            fetchNextPage: vi.fn(),
            hasNextPage: false,
            isFetchingNextPage: false,
        } as any);
        vi.mocked(transfersApi.useOutgoingTransfers).mockReturnValue({
            data: { pages: [{ transfers: [mockTransfer], total: 1 }], pageParams: [1] },
            isLoading: false,
            error: null,
            refetch: vi.fn(),
            fetchNextPage: vi.fn(),
            hasNextPage: false,
            isFetchingNextPage: false,
        } as any);
        vi.mocked(transfersApi.useTransferableStores).mockReturnValue({
            data: [],
            isLoading: false,
        } as any);
        vi.mocked(transfersApi.useCreateTransfer).mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: false,
        } as any);
        vi.mocked(transfersApi.useTransferDetails).mockReturnValue({
            data: mockTransfer,
            isLoading: false,
            error: null,
        } as any);
        vi.mocked(transfersApi.useConfirmTransfer).mockReturnValue({
            mutateAsync: vi.fn(),
            isPending: false,
        } as any);

        vi.mocked(inventoryApi.useInventory).mockReturnValue({
            data: { pages: [] },
            isFetching: false,
        } as any);
    });

    it('renderiza transferencias enviadas por defecto', async () => {
        render(<TransferenciasView />, { wrapper });
        expect((await screen.findAllByText(/PENDIENTE/i)).length).toBeGreaterThan(0);
    });
});
