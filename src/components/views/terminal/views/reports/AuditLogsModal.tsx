'use client';

import React, { useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuditLogs } from '@/hooks/api/useAuditLogs';
import AuditTimeline from '../audit/AuditTimeline';
import { StateRenderer } from '@/components/ui/StateRenderer';
import { Skeleton } from '@/components/ui/skeleton';
import { Shield, X, History } from 'lucide-react';

interface AuditLogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId?: string | null;
}

const AuditLoadingSkeleton = () => (
  <div className="space-y-6">
    {[...Array(3)].map((_, i) => (
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

export const AuditLogsModal = ({ isOpen, onClose, storeId }: AuditLogsModalProps) => {
  const query = useAuditLogs({
    storeIds: storeId ? [storeId] : [],
    pageSize: 100
  }) || { data: null, isLoading: false, error: null };

  const { data, isLoading, error } = query;

  const logs = useMemo(() => data?.pages?.flatMap(p => p.logs || []) ?? [], [data]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 border-primary/20 bg-background/95 backdrop-blur-xl rounded-3xl">
        <DialogHeader className="p-6 border-b border-primary/10">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <History className="w-7 h-7" />
            Bitácora de Auditoría Integra
          </DialogTitle>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Últimos 100 eventos del sistema para este contexto.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-primary/20">
          <StateRenderer
            isLoading={isLoading}
            error={error}
            data={logs}
            loadingComponent={<AuditLoadingSkeleton />}
            emptyComponent={
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <X className="w-12 h-12 text-muted-foreground opacity-20" />
                <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">Sin actividad reciente</p>
              </div>
            }
          >
            {(data: any[]) => <AuditTimeline logs={data} />}
          </StateRenderer>
        </div>
      </DialogContent>
    </Dialog>
  );
};
