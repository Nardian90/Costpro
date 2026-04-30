import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export const createQueryWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false }
    }
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { Wrapper, queryClient };
};

export const mockAuthUser = {
  id: 'user-test-001',
  role: 'admin' as const,
  activeStoreId: 'store-test-001',
  storeId: 'store-test-001',
};
