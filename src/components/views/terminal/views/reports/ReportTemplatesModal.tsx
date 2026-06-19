'use client';

import React, { useState, useEffect, useCallback } from 'react';
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
import { StateRenderer } from '@/components/ui/StateRenderer';
import {
  FileText,
  Search,
  Trash2,
  Clock,
  Download,
  CalendarDays,
  FolderOpen,
  X,
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
  onLoadTemplate: (template: ReportDefinition) => void;
}

const TemplateSkeleton = () => (
  <div className="space-y-4">
    {[...Array(4)].map((_, i) => (
      <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border">
        <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
        <Skeleton className="h-8 w-20 rounded-lg" />
      </div>
    ))}
  </div>
);

export const ReportTemplatesModal = ({
  isOpen,
  onClose,
  storeId,
  onLoadTemplate,
}: ReportTemplatesModalProps) => {
  const [templates, setTemplates] = useState<ReportDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!storeId) return;
    setIsLoading(true);
    setError(null);
    try {
      const data = await reportService.getDefinitions(storeId);
      setTemplates(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al cargar plantillas';
      setError(new Error(msg));
    } finally {
      setIsLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen, fetchTemplates]);

  const handleDelete = async (id: string, name: string) => {
    setDeleting(id);
    try {
      await reportService.deleteDefinition(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
      toast.success(`Plantilla "${name}" eliminada`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al eliminar';
      toast.error(msg);
    } finally {
      setDeleting(null);
    }
  };

  const filtered = search
    ? templates.filter(
        (t) =>
          t.name.toLowerCase().includes(search.toLowerCase()) ||
          t.type.toLowerCase().includes(search.toLowerCase())
      )
    : templates;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col p-0 border-primary/20 bg-background/95 backdrop-blur-xl rounded-3xl"
        aria-describedby="templates-description"
      >
        <DialogHeader className="p-6 border-b border-primary/10">
          <DialogTitle className="text-2xl font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <FolderOpen className="w-7 h-7" />
            Plantillas Guardadas
          </DialogTitle>
          <p id="templates-description" className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            Carga una plantilla previamente guardada para reutilizar su configuración.
          </p>
        </DialogHeader>

        {/* Search bar */}
        <div className="px-6 pt-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o tipo..."
              className="pl-10 rounded-xl border-primary/10 bg-background/50 text-xs font-bold"
              aria-label="Buscar plantillas"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4 scrollbar-thin scrollbar-thumb-primary/20">
          <StateRenderer
            isLoading={isLoading}
            error={error}
            data={filtered}
            loadingComponent={<TemplateSkeleton />}
            emptyComponent={
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <FileText className="w-12 h-12 text-muted-foreground opacity-20" />
                <p className="font-bold text-muted-foreground uppercase tracking-widest text-xs">
                  {search ? 'Sin resultados' : 'Sin plantillas guardadas'}
                </p>
                <p className="text-[11px] text-muted-foreground/60">
                  {search
                    ? 'Intenta con otro término de búsqueda.'
                    : 'Guarda tu configuración actual con el botón "Guardar Plantilla".'}
                </p>
              </div>
            }
          >
            {(items: ReportDefinition[]) => (
              <div className="space-y-3" role="list" aria-label="Lista de plantillas">
                {items.map((template) => (
                  <Card
                    key={template.id}
                    className="p-4 rounded-2xl border-primary/10 bg-card/50 hover:border-primary/30 hover:bg-primary/5 transition-all duration-300 group"
                    role="listitem"
                  >
                    <div className="flex items-center gap-4">
                      {/* Icon */}
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black uppercase tracking-tight text-foreground truncate">
                          {template.name}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          <Badge
                            variant="outline"
                            className="text-[10px] font-bold uppercase tracking-widest border-primary/20 text-primary"
                          >
                            {TYPE_LABELS[template.type] || template.type}
                          </Badge>
                          <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            {format(new Date(template.updated_at), "dd MMM yyyy, HH:mm", { locale: es })}
                          </span>
                          {template.date_range?.from && template.date_range?.to && (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                              <CalendarDays className="w-3 h-3" />
                              {template.date_range.from} — {template.date_range.to}
                            </span>
                          )}
                          <span className="text-[10px] font-medium text-muted-foreground">
                            {template.columns?.length || 0} columnas
                          </span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            onLoadTemplate(template);
                            onClose();
                          }}
                          className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-primary hover:bg-primary/10 rounded-xl"
                          aria-label={`Cargar plantilla ${template.name}`}
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          Cargar
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(template.id, template.name)}
                          disabled={deleting === template.id}
                          className="h-8 px-3 text-[10px] font-bold uppercase tracking-widest text-destructive hover:bg-destructive/10 rounded-xl"
                          aria-label={`Eliminar plantilla ${template.name}`}
                        >
                          {deleting === template.id ? (
                            <Skeleton className="w-3.5 h-3.5 rounded" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
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
