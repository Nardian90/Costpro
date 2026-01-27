'use client';

import React, { useState, useMemo } from 'react';
import AuditFilters from './AuditFilters';
import AuditTimeline from './AuditTimeline';
import { AuditCategory, getAuditCategory } from './AuditEventIcon';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogsView } from './useAuditLogsView';
import { useStores } from '@/hooks/api/useStores';
import { useAuthStore } from '@/store';
import { Shield, X } from 'lucide-react';

const AuditLoadingSkeleton = () => (
  <div className="space-y-6">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex gap-4 items-start">
        <Skeleton className="w-8 h-8 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </div>
    ))}
  </div>
);

export default function AuditLogsView() {
  const { user } = useAuthStore();
  const {
    logs,
    searchTerm,
    setSearchTerm,
    dateRange,
    setDateRange,
    selectedStoreId,
    setSelectedStoreId,
    isLoading,
    error
  } = useAuditLogsView();

  const [selectedCategory, setSelectedCategory] = useState<AuditCategory | 'all'>('all');
  const [selectedUser, setSelectedUser] = useState<string>('all');

  // Fetch stores for the filter
  const { data: stores = [] } = useStores(
    user?.id || '',
    user?.role === 'admin',
    user?.role === 'encargado' || user?.memberships?.some(m => m.role === 'encargado') || false
  );

  const { availableUsers, availableStores } = useMemo(() => {
    const users = new Set<string>();
    logs.forEach(log => {
      if (log.profile?.full_name) users.add(log.profile.full_name);
    });

    return {
      availableUsers: Array.from(users).sort(),
      availableStores: stores.map(s => ({ id: s.id, name: s.name }))
    };
  }, [logs, stores]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      // Backend already filtered by searchTerm, dateRange, and storeId.
      // We only need to filter by category and user client-side.

      // Category filter
      const category = getAuditCategory(log.table_name, log.action);
      const matchesCategory = selectedCategory === 'all' || category === selectedCategory;

      // User filter
      const matchesUser = selectedUser === 'all' || log.profile?.full_name === selectedUser;

      return matchesCategory && matchesUser;
    });
  }, [logs, selectedCategory, selectedUser]);

  const customErrorComponent = error ? (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
        <Shield className="w-8 h-8 text-destructive" />
      </div>
      <p className="font-bold text-destructive text-xl uppercase tracking-tight">
        {error.message.includes('permission denied') || error.message.includes('42501') || error.message.includes('PGRST202')
          ? 'Acceso Denegado / Error de Sistema'
          : 'Error de Carga'}
      </p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto font-medium">
        {error.message.includes('permission denied') || error.message.includes('42501')
          ? 'Tus privilegios actuales no permiten consultar el historial de auditoría de este contexto.'
          : error.message.includes('PGRST202')
          ? 'El servicio de auditoría no está disponible o requiere actualización de base de datos.'
          : 'Hubo un problema al recuperar los registros. Por favor, verifica tu conexión.'}
      </p>
    </div>
  ) : null;

  const customEmptyComponent = (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-dashed border-border rounded-2xl p-8">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
        <X className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="font-bold text-foreground text-xl uppercase tracking-tight">Sin Resultados</p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto font-medium">
        No se encontraron registros de auditoría que coincidan con los filtros seleccionados.
      </p>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-1">
        <h2 className="text-4xl font-black text-foreground tracking-tight uppercase italic">Auditoría</h2>
        <p className="text-sm text-muted-foreground font-medium">Historial operativo y de control del sistema</p>
      </div>

      <AuditFilters
        searchTerm={searchTerm}
        onSearchChange={setSearchTerm}
        dateRange={dateRange}
        onDateRangeChange={setDateRange}
        selectedCategory={selectedCategory}
        onCategoryChange={setSelectedCategory}
        availableUsers={availableUsers}
        selectedUser={selectedUser}
        onUserChange={setSelectedUser}
        availableStores={availableStores.map(s => s.name)} // Keep string for now to match interface
        selectedStore={stores.find(s => s.id === selectedStoreId)?.name || 'all'}
        onStoreChange={(storeName) => {
          if (storeName === 'all') {
            setSelectedStoreId('all');
          } else {
            const store = stores.find(s => s.name === storeName);
            if (store) setSelectedStoreId(store.id);
          }
        }}
      />

      <div className="mt-8">
        <StateRenderer
          isLoading={isLoading}
          error={error}
          data={filteredLogs}
          loadingComponent={<AuditLoadingSkeleton />}
          errorComponent={customErrorComponent}
          emptyComponent={customEmptyComponent}
        >
          {(data) => <AuditTimeline logs={data} />}
        </StateRenderer>
      </div>
    </div>
  );
}
