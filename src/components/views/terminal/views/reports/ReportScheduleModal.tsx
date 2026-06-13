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
import { reportService, type ReportScheduleConfig } from '@/services/report-service';
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

interface ReportScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string | null;
}

interface ScheduleEntry {
  definition: ReportDefinition;
  schedule: ReportScheduleConfig;
}

export function ReportScheduleModal({ isOpen, onClose, storeId }: ReportScheduleModalProps) {
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
      setError(err instanceof Error ? err : new Error('Error al cargar programaciones'));
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
      toast.success(`Programación ${newSchedule.active ? 'activada' : 'pausada'}`);
    } catch (err) {
      toast.error('Error al actualizar estado');
    } finally {
      setSavingId(null);
    }
  };

  const updateSchedule = async (entry: ScheduleEntry, updates: Partial<ReportScheduleConfig>) => {
    const newSchedule = { ...entry.schedule, ...updates };
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
      toast.success('Configuración guardada');
    } catch (err) {
      toast.error('Error al guardar configuración');
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
    } catch (err) {
      toast.error('Error al eliminar programación');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden flex flex-col gap-0 border-none bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-500/10 text-violet-600">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-xl font-black uppercase tracking-tight">Reportes Programados</DialogTitle>
              <p className="text-xs text-muted-foreground font-medium">Automatiza la generación y envío de tus reportes</p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-thin scrollbar-thumb-primary/20">
          <div className="bg-amber-500/5 border border-amber-500/10 rounded-2xl p-4 mb-6 flex gap-3 items-start">
            <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-amber-900 dark:text-amber-400">Automatización Enterprise</h4>
              <p className="text-xs text-amber-800/70 dark:text-amber-400/60 leading-relaxed">
                Los reportes programados se ejecutan en la nube de CostPro y se envían automáticamente por correo electrónico a los destinatarios configurados.
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
                <Clock className="w-12 h-12 text-muted-foreground opacity-20" />
                <div>
                  <h3 className="text-lg font-bold text-muted-foreground/50">No hay programaciones</h3>
                  <p className="text-sm text-muted-foreground/40 max-w-[280px]">
                    Guarda una plantilla de reporte primero para poder programar su ejecución automática.
                  </p>
                </div>
              </div>
            }
          >
            {(data: ScheduleEntry[]) => (
              <div className="grid gap-4">
                {data.map((entry) => (
                  <Card key={entry.definition.id} className="p-5 bg-background/50 border-border/50 rounded-2xl overflow-hidden relative group">
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-2xl bg-muted/50 text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                          <FileText className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm">{entry.definition.name || 'Reporte Sin Nombre'}</h4>
                          <Badge variant="outline" className="text-[10px] uppercase font-black px-1.5 py-0 mt-1">
                            {TYPE_LABELS[entry.definition.type] || entry.definition.type}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex flex-col items-end gap-1.5 mr-2">
                          <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider">
                            {entry.schedule.active ? 'Activo' : 'Pausado'}
                          </span>
                          <Switch
                            checked={entry.schedule.active}
                            onCheckedChange={() => toggleActive(entry)}
                            disabled={savingId === entry.definition.id}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl text-destructive hover:bg-destructive/10"
                          onClick={() => removeSchedule(entry)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/20 rounded-xl border border-border/30">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Frecuencia</Label>
                        <Select
                          value={entry.schedule.frequency}
                          onValueChange={(v: any) => updateSchedule(entry, { frequency: v })}
                        >
                          <SelectTrigger className="bg-background/50 border-border/50 h-9 text-xs font-bold rounded-lg">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Diario</SelectItem>
                            <SelectItem value="weekly">Semanal</SelectItem>
                            <SelectItem value="monthly">Mensual</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Hora de Ejecución</Label>
                        <Input
                          type="time"
                          value={entry.schedule.time || '08:00'}
                          onChange={(e) => updateSchedule(entry, { time: e.target.value })}
                          className="bg-background/50 border-border/50 h-9 text-xs font-bold rounded-lg"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Destinatarios</Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="email@ejemplo.com"
                            className="bg-background/50 border-border/50 h-9 text-xs font-bold rounded-lg flex-1"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const email = (e.target as HTMLInputElement).value;
                                if (email && !entry.schedule.recipients.includes(email)) {
                                  updateSchedule(entry, { recipients: [...entry.schedule.recipients, email] });
                                  (e.target as HTMLInputElement).value = '';
                                }
                              }
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {entry.schedule.recipients.map((email) => (
                        <Badge
                          key={email}
                          variant="secondary"
                          className="text-[9px] font-bold py-0 h-5 pl-2 pr-1 rounded-md"
                        >
                          {email}
                          <button
                            className="ml-1 hover:text-destructive transition-colors"
                            onClick={() => updateSchedule(entry, { recipients: entry.schedule.recipients.filter(r => r !== email) })}
                          >
                            <Trash2 className="w-2.5 h-3.5 fill-current" />
                          </button>
                        </Badge>
                      ))}
                      {entry.schedule.recipients.length === 0 && (
                        <span className="text-[10px] italic text-muted-foreground ml-1">Sin destinatarios configurados</span>
                      )}
                    </div>

                    {entry.schedule.last_run && (
                      <div className="mt-4 pt-3 border-t border-border/20 flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-medium">
                          <Clock className="w-3 h-3" />
                          Ultima ejecución: {new Date(entry.schedule.last_run).toLocaleString()}
                        </div>
                        <div className="text-[10px] font-bold text-primary flex items-center gap-1">
                          <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          Próxima: {entry.schedule.next_run ? new Date(entry.schedule.next_run).toLocaleDateString() : 'Pendiente'}
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </StateRenderer>
        </div>

        <div className="p-6 border-t border-border/50 flex justify-end">
          <Button onClick={onClose} variant="secondary" className="rounded-xl font-bold px-8">
            Cerrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScheduleSkeleton() {
  return (
    <div className="space-y-4">
      {[1, 2].map((i) => (
        <Skeleton key={i} className="h-48 w-full rounded-2xl" />
      ))}
    </div>
  );
}
