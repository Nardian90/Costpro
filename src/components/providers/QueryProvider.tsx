'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState } from 'react';
import { useAuthStore } from '@/store';

export default function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            onError: (error: unknown, variables, context) => {
               // Log audit for failed mutations in production
               const { token } = useAuthStore.getState();
               const errorDetails = error instanceof Error
                 ? { message: error.message, stack: error.stack, variables }
                 : { message: String(error), variables };
               fetch('/api/logs', {
                 method: 'POST',
                 headers: {
                   'Content-Type': 'application/json',
                   'Authorization': `Bearer ${token}`
                 },
                 body: JSON.stringify({
                    context: 'MUTATION_ERROR',
                    error: errorDetails
                 }),
               }).catch(() => { /* Silent ignore if logging fails */ });
            }
          }
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* <ReactQueryDevtools initialIsOpen={false} /> */}
    </QueryClientProvider>
  );
}
