'use client';

import React, { useState, useCallback, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StateRenderer } from '@/components/ui/StateRenderer';
import {
  History,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  Search,
  Filter,
  ArrowUpDown,
  Timer,
} from 'lucide-react';
import { reportService } from '@/services/report-service';
import { ReportRun, ReportType } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const TYPE_LABELS: Record<string, string> = {
  sales: 'Ventas',
  profit: 'Utilidad',
  inventory: 'Inventario',
  kardex: 'Kardex',
  purchases: 'Compras',
  audit: 'Auditoría',
  cost_sheet: 'Ficha de Costo',
  daily_income: 'Ingresos Diarios',
  daily_expenses: 'Gastos Diarios',
  transfer: 'Transferencias',
  cash: 'Arqueo de Caja',
};

interface ReportHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string | null;
}

const HistorySkeleton = () => (
  <div className="space-y-4">
    {[...Array(5)].map((_, i) => (
      <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-6 w-16 rounded-lg" />
        <Skeleton className="h-6 w-20 rounded-lg" />
      </div>
    ))}
  </div>
);

export const ReportHistoryModal = ({
  isOpen,
  onClose,
  storeId,
}: ReportHistoryModalProps) => {
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const fetchRuns = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reportService.getStoreRuns(storeId, 100);
      setRuns(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar historial';
      setError(new Error(msg));
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (isOpen) fetchRuns();
  }, [isOpen, fetchRuns]);

  const filtered = runs.filter((run) => {
    const snapshot = run.parameters_snapshot as Record<string, unknown> | null;
    const runType = String(snapshot?.type || 'unknown');
    if (statusFilter !== 'all' && run.status !== statusFilter) return false;
    if (typeFilter !== 'all' && runType !== typeFilter) return false;
    return true;
  });

  // Stats
  const totalRuns = runs.length;
  const completedRuns = runs.filter((r) => r.status === 'completed').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;

  // Unique types in history
  const typesInHistory = [...new Set(
    runs.map((r) => String((r.parameters_snapshot as Record<string, unknown> | null)?.type || 'unknown'))
  )];

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-4xl max-h-[85vh] overflow-hidden flex flex-col p-0 border-primary/20 bg-background/95 backdrop-blur-xl rounded-3xl"
        aria-describedby="history-description"
      >
        <DialogHeader className="p-6 border-b border-primary/10">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <History className="w-7 h-7" />
            Historial de Ejecuciones
          </DialogTitle>
          <p id="history-description" className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Registro de todas las generaciones de reportes con estado y tiempos de ejecución.
          </p>

          {/* Stats bar */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-muted-foreground">Total:</span>
              <Badge variant="outline" className="font-black text-[10px] uppercase">{totalRuns}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-muted-foreground">Completados:</span>
              <Badge className="bg-success/10 text-success border-success/20 font-black text-[10px] uppercase">
                {completedRuns}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-muted-foreground">Fallidos:</span>
              <Badge className="bg-destructive/10 text-destructive border-destructive/20 font-black text-[10px] uppercase">
                {failedRuns}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        {/* Filters */}
        <div className="px-6 pt-4 flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">Filtros:</span>
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-32 rounded-lg border-primary/10 text-[10px] font-bold uppercase" aria-label="Filtrar por estado">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/10">
              <SelectItem value="all" className="text-[10px] font-bold uppercase">Todos</SelectItem>
              <SelectItem value="completed" className="text-[10px] font-bold uppercase">Completados</SelectItem>
              <SelectItem value="failed" className="text-[10px] font-bold uppercase">Fallidos</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-8 w-40 rounded-lg border-primary/10 text-[10px] font-bold uppercase" aria-label="Filtrar por tipo">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="rounded-xl border-primary/10">
              <SelectItem value="all" className="text-[10px] font-bold uppercase">Todos los tipos</SelectItem>
              {typesInHistory.map((t) => (
                <SelectItem key={t} value={t} className="text-[10px] font-bold uppercase">
                  {TYPE_LABELS[t] || t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setStatusFilter('all'); setTypeFilter('all'); }}
            className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:bg-primary/5 rounded-lg"
          >
            Limpiar
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-thin scrollbar-thumb-primary/20">
          <StateRenderer
            isLoading={isLoading}
            error={error}
            data={filtered}
            loadingComponent={<HistorySkeleton />}
            emptyComponent={
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <History className="w-12 h-12 text-muted-foreground opacity-20" />
                <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">
                  {runs.length > 0 ? 'Sin coincidencias' : 'Sin ejecuciones registradas'}
                </p>
                <p className="text-[11px] text-muted-foreground/60">
                  {runs.length > 0
                    ? 'Ajusta los filtros para ver más resultados.'
                    : 'Los reportes generados aparecerán aquí automáticamente.'}
                </p>
              </div>
            }
          >
            {(items: ReportRun[]) => (
              <div className="space-y-3" role="list" aria-label="Historial de ejecuciones">
                {items.map((run, idx) => {
                  const snapshot = run.parameters_snapshot as Record<string, unknown> | null;
                  const runType = String(snapshot?.type || 'Desconocido');
                  const runName = String(snapshot?.name || `Reporte ${runType}`);
                  const runDate = run.executed_at ? new Date(run.executed_at) : null;
                  const isSuccess = run.status === 'completed';

                  return (
                    <Card
                      key={run.id}
                      className="p-4 rounded-2xl border-primary/10 bg-card/50 hover:border-primary/20 transition-all duration-200"
                      role="listitem"
                    >
                      <div className="flex items-center gap-4">
                        {/* Status icon */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                          isSuccess ? 'bg-success/10' : 'bg-destructive/10'
                        }`}>
                          {isSuccess ? (
                            <CheckCircle2 className="w-5 h-5 text-success" />
                          ) : (
                            <XCircle className="w-5 h-5 text-destructive" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black uppercase tracking-tight text-foreground truncate">
                            {runName}
                          </p>
                          <div className="flex items-center gap-3 mt-1 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[10px] font-bold uppercase tracking-widest border-primary/20 text-primary"
                            >
                              {TYPE_LABELS[runType] || runType}
                            </Badge>
                            {runDate && (
                              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                                <Clock className="w-3 h-3" />
                                {format(runDate, "dd MMM yyyy, HH:mm:ss", { locale: es })}
                              </span>
                            )}
                            <Badge
                              className={`text-[10px] font-black uppercase tracking-widest ${
                                isSuccess
                                  ? 'bg-success/10 text-success border-success/20'
                                  : 'bg-destructive/10 text-destructive border-destructive/20'
                              }`}
                            >
                              {isSuccess ? 'Completado' : 'Fallido'}
                            </Badge>
                          </div>
                          {run.error_message && (
                            <p className="text-[10px] font-medium text-destructive/70 mt-1 truncate">
                              Error: {run.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </StateRenderer>
        </div>
      </DialogContent>
    </Dialog>
  );
};
