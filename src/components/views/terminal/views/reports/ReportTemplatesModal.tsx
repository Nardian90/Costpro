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
  Layout,
  Search,
  Filter,
  ArrowUpDown,
  FileText,
  Play,
  Settings2,
  Trash2,
  Clock,
  CalendarClock,
  LayoutTemplate,
} from 'lucide-react';
import { reportService } from '@/services/report-service';
import { ReportDefinition, ReportType } from '@/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
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

interface ReportTemplatesModalProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string | null;
  onSelect: (template: ReportDefinition) => void;
}

export function ReportTemplatesModal({ isOpen, onClose, storeId, onSelect }: ReportTemplatesModalProps) {
  const [templates, setTemplates] = useState<ReportDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  const fetchTemplates = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reportService.getDefinitions(storeId);
      setTemplates(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err : new Error('Error al cargar plantillas'));
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (isOpen) fetchTemplates();
  }, [isOpen, fetchTemplates]);

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar esta plantilla?')) return;
    try {
      await reportService.deleteDefinition(id);
      setTemplates(prev => prev.filter(t => t.id !== id));
      toast.success('Plantilla eliminada');
    } catch (err) {
      toast.error('Error al eliminar plantilla');
    }
  };

  const filtered = templates.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = typeFilter === 'all' || t.type === typeFilter;
    return matchesSearch && matchesType;
  }).sort((a, b) => {
    if (sortBy === 'date') return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
    return a.name.localeCompare(b.name);
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] p-0 overflow-hidden flex flex-col gap-0 border-none bg-background/95 backdrop-blur-xl shadow-2xl">
        <DialogHeader className="p-6 pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600">
                <LayoutTemplate className="w-5 h-5" />
              </div>
              <div>
                <DialogTitle className="text-xl font-black uppercase tracking-tight">Plantillas de Reportes</DialogTitle>
                <p className="text-xs text-muted-foreground font-medium">Reutiliza tus configuraciones de reportes favoritas</p>
              </div>
            </div>
          </div>
        </DialogHeader>

        <div className="bg-muted/30 p-4 border-b border-border/50 flex flex-wrap items-center gap-4">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 bg-background/50 border-border/50 rounded-xl"
            />
          </div>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px] bg-background/50 border-border/50 rounded-xl">
              <Filter className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Tipo de Reporte" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los tipos</SelectItem>
              {Object.entries(TYPE_LABELS).map(([val, label]) => (
                <SelectItem key={val} value={val}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
            <SelectTrigger className="w-[160px] bg-background/50 border-border/50 rounded-xl">
              <ArrowUpDown className="w-4 h-4 mr-2 opacity-50" />
              <SelectValue placeholder="Ordenar por" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Última actualización</SelectItem>
              <SelectItem value="name">Nombre A-Z</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-thin scrollbar-thumb-primary/20">
          <StateRenderer
            isLoading={isLoading}
            error={error}
            data={filtered}
            loadingComponent={<TemplateSkeleton />}
            emptyComponent={
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <Layout className="w-12 h-12 text-muted-foreground opacity-20" />
                <div>
                  <h3 className="text-lg font-bold">Sin plantillas</h3>
                  <p className="text-sm text-muted-foreground">No se encontraron plantillas guardadas.</p>
                </div>
              </div>
            }
          >
            {(data: ReportDefinition[]) => (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.map(template => (
                  <Card key={template.id} className="p-4 hover:border-primary/30 transition-all group bg-background/50 border-border/50 rounded-2xl overflow-hidden relative">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-muted/50 text-muted-foreground group-hover:bg-primary/5 group-hover:text-primary transition-colors">
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm truncate">{template.name}</h4>
                          <Badge variant="outline" className="text-[10px] uppercase font-black px-1.5 py-0 mt-0.5">
                            {TYPE_LABELS[template.type] || template.type}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 -mt-1 -mr-1 h-8 w-8"
                        onClick={() => handleDelete(template.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <Layout className="w-3.5 h-3.5 opacity-50" />
                        <span>{template.columns.length} columnas configuradas</span>
                      </div>
                      {template.layout?.schedule?.enabled && (
                        <div className="flex items-center gap-2 text-[11px] text-violet-600 font-bold">
                          <CalendarClock className="w-3.5 h-3.5" />
                          <span>Ejecución automática activa</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
                        <Clock className="w-3 h-3" />
                        <span>Editado {format(new Date(template.updated_at || template.created_at), "d MMM, yyyy", { locale: es })}</span>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-auto">
                      <Button
                        className="flex-1 rounded-xl h-9 text-xs font-bold"
                        onClick={() => {
                          onSelect(template);
                          onClose();
                        }}
                      >
                        <Play className="w-3.5 h-3.5 mr-2" />
                        Cargar
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1 rounded-xl h-9 text-xs font-bold bg-transparent border-border/50"
                        onClick={() => {
                          onSelect(template);
                          onClose();
                          // Additional action could be to open config directly
                        }}
                      >
                        <Settings2 className="w-3.5 h-3.5 mr-2" />
                        Configurar
                      </Button>
                    </div>
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

function TemplateSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map(i => (
        <Skeleton key={i} className="h-44 w-full rounded-2xl" />
      ))}
    </div>
  );
}
