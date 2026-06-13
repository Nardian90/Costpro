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
  RotateCcw,
} from 'lucide-react';
import { reportService } from '@/services/report-service';
import { ReportRun, ReportType } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { cn } from '@/lib/utils';

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

export function ReportHistoryModal({ isOpen, onClose, storeId }: ReportHistoryModalProps) {
  const [runs, setRuns] = useState<ReportRun[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  const fetchHistory = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reportService.getStoreRuns(storeId, 100);
      setRuns(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Error al cargar historial'));
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (isOpen) fetchHistory();
  }, [isOpen, fetchHistory]);

  const filtered = runs.filter(run => {
    const matchesSearch = run.parameters_snapshot?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         run.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || run.status === statusFilter;
    return matchesSearch && matchesStatus;
  }).sort((a, b) => {
    if (sortBy === 'date') return new Date(b.executed_at).getTime() - new Date(a.executed_at).getTime();
    return (a.parameters_snapshot?.name || '').localeCompare(b.parameters_snapshot?.name || '');
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden flex flex-col gap-0 border-none bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                <History className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">Historial de Ejecuciones</DialogTitle>
                <p className="text-xs text-muted-foreground font-medium">Ultimos reportes generados en esta tienda</p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={fetchHistory} disabled={isLoading} className="rounded-xl">
              <RotateCcw className="w-4 h-4 mr-2" />
              Actualizar
            </Button>
          </div>
        </DialogHeader>

        <div className="bg-muted/30 p-4 border-b border-border/50 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o ID..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 rounded-xl"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
            <SelectTrigger className="w-[160px] bg-background/50 border-border/50 rounded-xl">
              <Filter className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="completed">Completados</SelectItem>
              <SelectItem value="failed">Fallidos</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-[160px] bg-background/50 border-border/50 rounded-xl">
              <ArrowUpDown className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Fecha (reciente)</SelectItem>
              <SelectItem value="name">Nombre A-Z</SelectItem>
            </SelectContent>
          </Select>
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
                <div>
                  <h3 className="text-lg font-bold">Sin resultados</h3>
                  <p className="text-sm text-muted-foreground">No se encontraron ejecuciones que coincidan con los filtros.</p>
                </div>
              </div>
            }
          >
            {(data: ReportRun[]) => (
              <div className="grid gap-3">
                {data.map(run => (
                  <Card key={run.id} className="p-4 hover:border-primary/30 transition-all group bg-background/50 border-border/50 rounded-2xl overflow-hidden relative">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "p-3 rounded-2xl",
                        run.status === 'completed' ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-600"
                      )}>
                        {run.status === 'completed' ? <CheckCircle2 className="w-5 h-5" /> : <XCircle className="w-5 h-5" />}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-sm truncate">{run.parameters_snapshot?.name || 'Reporte Sin Nombre'}</h4>
                          <Badge variant="outline" className="text-[10px] uppercase font-black px-1.5 py-0">
                            {TYPE_LABELS[run.parameters_snapshot?.type as string] || run.parameters_snapshot?.type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-[11px] text-muted-foreground font-medium">
                          <div className="flex items-center gap-1.5 text-primary/70">
                            <Clock className="w-3.5 h-3.5" />
                            {format(new Date(run.executed_at), "d 'de' MMMM, HH:mm", { locale: es })}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Timer className="w-3.5 h-3.5" />
                            ID: {run.id.split('-')[0]}...
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {run.file_url && (
                          <Button size="sm" variant="outline" className="rounded-xl border-emerald-500/20 text-emerald-600 hover:bg-emerald-500/10 h-8" asChild>
                            <a href={run.file_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="w-3.5 h-3.5 mr-1.5" />
                              Ver PDF
                            </a>
                          </Button>
                        )}
                        {!run.file_url && run.status === 'failed' && (
                          <div className="text-[10px] font-bold text-red-500 uppercase bg-red-500/5 px-2 py-1 rounded-lg border border-red-500/10">
                            Error de Generación
                          </div>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </StateRenderer>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistorySkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3, 4, 5].map(i => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}
