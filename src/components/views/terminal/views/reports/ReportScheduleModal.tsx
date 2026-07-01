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
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StateRenderer } from '@/components/ui/StateRenderer';
import {
  Clock,
  CalendarClock,
  AlertCircle,
  Save,
  Play,
  Pause,
  Trash2,
  FileText,
} from 'lucide-react';
import { reportService, ReportScheduleConfig } from '@/services/report-service';
import { ReportDefinition } from '@/types';
import { toast } from 'sonner';

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

const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Cada día',
  weekly: 'Cada semana',
  monthly: 'Cada mes',
};

interface ScheduleEntry {
  definition: ReportDefinition;
  schedule: ReportScheduleConfig;
}

interface ReportScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string | null;
}

const ScheduleSkeleton = () => (
  <div className="space-y-4">
    {[...Array(2)].map((_, i) => (
      <div key={i} className="p-4 rounded-2xl border">
        <div className="flex items-center gap-4">
          <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
      </div>
    ))}
  </div>
);

export const ReportScheduleModal = ({
  isOpen,
  onClose,
  storeId,
}: ReportScheduleModalProps) => {
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const fetchSchedules = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const definitions = await reportService.getDefinitions(storeId);
      const withSchedule: ScheduleEntry[] = definitions
        .filter((d) => d.layout?.schedule?.enabled)
        .map((d) => ({
          definition: d,
          schedule: d.layout.schedule as ReportScheduleConfig,
        }));
      setSchedules(withSchedule);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar programaciones';
      setError(new Error(msg));
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (isOpen) fetchSchedules();
  }, [isOpen, fetchSchedules]);

  const toggleActive = async (entry: ScheduleEntry) => {
    const newSchedule = { ...entry.schedule, active: !entry.schedule.active };
    setSavingId(entry.definition.id);
    try {
      await reportService.saveScheduleConfig(entry.definition.id, newSchedule);
      setSchedules((prev) =>
        prev.map((s) =>
          s.definition.id === entry.definition.id
            ? { ...s, schedule: newSchedule }
            : s
        )
      );
      toast.success(
        newSchedule.active
          ? 'Programación activada'
          : 'Programación pausada'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al actualizar';
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  };

  const removeSchedule = async (entry: ScheduleEntry) => {
    const newSchedule = { ...entry.schedule, enabled: false, active: false };
    setSavingId(entry.definition.id);
    try {
      await reportService.saveScheduleConfig(entry.definition.id, newSchedule);
      setSchedules((prev) => prev.filter((s) => s.definition.id !== entry.definition.id));
      toast.success('Programación eliminada');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      toast.error(msg);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col p-0 border-primary/20 bg-background/95 backdrop-blur-xl rounded-3xl"
        aria-describedby="schedule-description"
      >
        <DialogHeader className="p-6 border-b border-primary/10">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <CalendarClock className="w-7 h-7" />
            Programación Recurrente
          </DialogTitle>
          <p id="schedule-description" className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Configura reportes que se generen automáticamente de forma recurrente.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-primary/20">
          {/* Info banner */}
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10 flex gap-3 items-start mb-6">
            <AlertCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
                Cómo funciona
              </p>
              <p className="text-[11px] font-medium text-muted-foreground leading-relaxed">
                Para activar la programación recurrente de un reporte, primero guárdalo como
                plantilla usando &quot;Guardar Plantilla&quot;. Luego, activa la programación desde esta
                vista. La ejecución automática requiere un servidor de tareas programadas
                (cron/edge function) configurado en la infraestructura de CostPro.
              </p>
            </div>
          </div>

          <StateRenderer
            isLoading={isLoading}
            error={error}
            data={schedules}
            loadingComponent={<ScheduleSkeleton />}
            emptyComponent={
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                <CalendarClock className="w-12 h-12 text-muted-foreground opacity-20" />
                <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">
                  Sin programaciones activas
                </p>
                <p className="text-[11px] text-muted-foreground/60">
                  Guarda una plantilla de reporte y activa su programación recurrente.
                </p>
              </div>
            }
          >
            {(items: ScheduleEntry[]) => (
              <div className="space-y-3" role="list" aria-label="Programaciones recurrentes">
                {items.map((entry) => (
                  <Card
                    key={entry.definition.id}
                    className={`p-4 rounded-2xl border transition-all duration-300 ${
                      entry.schedule.active
                        ? 'border-success/20 bg-success/5'
                        : 'border-primary/10 bg-card/50'
                    }`}
                    role="listitem"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                        entry.schedule.active ? 'bg-success/10' : 'bg-primary/10'
                      }`}>
                        <FileText className={`w-5 h-5 ${entry.schedule.active ? 'text-success' : 'text-primary'}`} />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black uppercase tracking-tight text-foreground truncate">
                          {entry.definition.name}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold uppercase tracking-widest border-primary/20 text-primary"
                          >
                            {TYPE_LABELS[entry.definition.type] || entry.definition.type}
                          </Badge>
                          <span className="text-[10px] font-bold text-muted-foreground">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {FREQUENCY_LABELS[entry.schedule.frequency]} a las {entry.schedule.time}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleActive(entry)}
                          disabled={savingId === entry.definition.id}
                          className={`h-8 px-3 text-[10px] font-bold uppercase tracking-widest rounded-xl ${
                            entry.schedule.active
                              ? 'text-warning hover:bg-warning/10'
                              : 'text-success hover:bg-success/10'
                          }`}
                          aria-label={entry.schedule.active ? 'Pausar programación' : 'Activar programación'}
                        >
                          {savingId === entry.definition.id ? (
                            <Skeleton className="w-3.5 h-3.5 rounded" />
                          ) : entry.schedule.active ? (
                            <><Pause className="w-3.5 h-3.5 mr-1.5" />Pausar</>
                          ) : (
                            <><Play className="w-3.5 h-3.5 mr-1.5" />Activar</>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSchedule(entry)}
                          disabled={savingId === entry.definition.id}
                          className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 rounded-xl"
                          aria-label="Eliminar programación"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
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
};
