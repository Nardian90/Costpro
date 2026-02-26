'use client';

import React, { useState, useMemo } from 'react';
import AuditFilters from './AuditFilters';
import AuditTimeline from './AuditTimeline';
import AuditTableView from './AuditTableView';
import { AuditCategory, getAuditCategory } from './AuditEventIcon';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuditLogsView } from './useAuditLogsView';
import { useStores } from '@/hooks/api/useStores';
import { useAuthStore } from '@/store';
import { Shield, X, Table as TableIcon, List, Download, Loader2 } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from '@/components/ui/button';
import { exportAuditToPdf } from '@/lib/utils/pdf-export';
import { toast } from 'sonner';

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
  const [viewMode, setViewMode] = useState<'timeline' | 'table'>('timeline');
  const [isExporting, setIsExporting] = useState(false);

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
      // Category filter
      const category = getAuditCategory(log.table_name, log.action);
      const matchesCategory = selectedCategory === 'all' || category === selectedCategory;

      // User filter
      const matchesUser = selectedUser === 'all' || log.profile?.full_name === selectedUser;

      return matchesCategory && matchesUser;
    });
  }, [logs, selectedCategory, selectedUser]);

  const handleExportPdf = async () => {
    try {
      setIsExporting(true);
      await exportAuditToPdf(filteredLogs);
      toast.success('Reporte PDF generado con éxito');
    } catch (err) {
      console.error('Export error:', err);
      toast.error('Error al generar el PDF');
    } finally {
      setIsExporting(false);
    }
  };

  const customErrorComponent = error ? (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-destructive/5 border border-destructive/20 rounded-2xl p-8">
      <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
        <Shield className="w-8 h-8 text-destructive" />
      </div>
      <p className="font-bold text-destructive text-xl uppercase tracking-tight">
        Error de Carga
      </p>
      <p className="text-sm text-muted-foreground max-w-xs mx-auto font-medium">
        {error.message}
      </p>
    </div>
  ) : null;

  const customEmptyComponent = (
    <div className="flex flex-col items-center justify-center py-20 gap-4 text-center w-full bg-muted/20 border border-dashed border-border rounded-2xl p-8">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-2">
        <X className="w-8 h-8 text-muted-foreground" />
      </div>
      <p className="font-bold text-foreground text-xl uppercase tracking-tight">Sin Resultados</p>
    </div>
  );

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-[clamp(2rem,8vw,3rem)] font-black text-foreground tracking-tight uppercase italic">Auditoría</h2>
          <p className="text-sm text-muted-foreground font-medium">Historial operativo y de control del sistema</p>
        </div>

        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={isExporting || filteredLogs.length === 0}
          className="h-11 px-6 rounded-xl font-black uppercase tracking-widest flex items-center gap-2"
        >
          {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Exportar PDF
        </Button>
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
        availableStores={availableStores.map(s => s.name)}
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

      <Tabs
        value={viewMode}
        onValueChange={(v) => setViewMode(v as any)}
        className="w-full"
      >
        <div className="flex justify-between items-center mb-4">
          <TabsList className="bg-background border border-border p-1 h-12 rounded-xl shadow-sm">
            <TabsTrigger
              value="timeline"
              className="px-6 rounded-lg text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <List className="w-4 h-4 mr-2" />
              Línea de Tiempo
            </TabsTrigger>
            <TabsTrigger
              value="table"
              className="px-6 rounded-lg text-xs font-black uppercase tracking-widest data-[state=active]:bg-primary data-[state=active]:text-white"
            >
              <TableIcon className="w-4 h-4 mr-2" />
              Tabla
            </TabsTrigger>
          </TabsList>

          <div className="text-[10px] font-black uppercase text-muted-foreground tracking-widest bg-muted/30 px-3 py-1.5 rounded-full">
            {filteredLogs.length} Registros encontrados
          </div>
        </div>

        <StateRenderer
          isLoading={isLoading}
          error={error}
          data={filteredLogs}
          loadingComponent={<AuditLoadingSkeleton />}
          errorComponent={customErrorComponent}
          emptyComponent={customEmptyComponent}
        >
          {(data) => (
            <>
              <TabsContent value="timeline" className="mt-0 focus-visible:outline-none">
                <AuditTimeline logs={data} />
              </TabsContent>
              <TabsContent value="table" className="mt-0 focus-visible:outline-none">
                <AuditTableView logs={data} />
              </TabsContent>
            </>
          )}
        </StateRenderer>
      </Tabs>
    </div>
  );
}
