
'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Download, Play, Save, Loader2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { ReportConfigPanel } from './ReportConfigPanel';
import { ReportPreview } from './ReportPreview';
import { ReportType, ReportDefinition } from '@/types';
import { COLUMN_LABELS } from '@/contracts/reports';

export default function ReportsView() {
  const { user } = useAuthStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [config, setConfig] = useState<Partial<ReportDefinition>>({
    name: 'Nuevo Reporte',
    type: 'sales',
    filters: {},
    date_range: {
      from: new Date().toISOString().split('T')[0],
      to: new Date().toISOString().split('T')[0],
    },
    columns: ['id', 'created_at', 'total_amount', 'status', 'payment_method'],
    layout: { orientation: 'portrait', format: 'a4' }
  });

  const [isSaving, setIsSaving] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);

  const handleSave = async () => {
    if (!user?.activeStoreId) {
      toast.error('Seleccione una tienda activa');
      return;
    }

    setIsSaving(true);
    try {
      const { reportService } = await import('@/services/report-service');
      await reportService.saveDefinition({
        ...config,
        store_id: user.activeStoreId,
        created_by: user.id
      });
      toast.success('Plantilla guardada exitosamente');
    } catch (error: any) {
      toast.error(`Error al guardar plantilla: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerate = async () => {
    if (!user?.activeStoreId) {
      toast.error('Seleccione una tienda activa');
      return;
    }

    if (config.type === 'kardex' && !config.filters?.product_id) {
      toast.error('Debe seleccionar un producto para generar el reporte de Kardex');
      return;
    }

    setIsGenerating(true);
    try {
      const response = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${useAuthStore.getState().token}`
        },
        body: JSON.stringify({
          ...config,
          store_id: user.activeStoreId,
          name: config.name || `Reporte ${config.type}`
        })
      });

      const result = await response.json();

      if (!response.ok) throw new Error(result.error);

      toast.success('Reporte generado exitosamente');
      window.open(result.url, '_blank');
    } catch (error: any) {
      toast.error(`Error al generar reporte: ${error.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExportExcel = async () => {
    if (!user?.activeStoreId) {
      toast.error('Seleccione una tienda activa');
      return;
    }

    if (config.type === 'kardex' && !config.filters?.product_id) {
      toast.error('Debe seleccionar un producto para generar el reporte de Kardex');
      return;
    }

    setIsExportingExcel(true);
    try {
      const { reportService } = await import('@/services/report-service');
      const { exportToExcel } = await import('@/services/export-service');

      const data = await reportService.fetchReportData(
        config.type as ReportType,
        config.filters,
        config.date_range,
        user.activeStoreId
      );

      if (!data || data.length === 0) {
        toast.error('No hay datos disponibles para exportar con los filtros seleccionados');
        return;
      }

      exportToExcel(
        data,
        config.columns || [],
        COLUMN_LABELS,
        config.name || `Reporte_${config.type}_${new Date().toISOString().split('T')[0]}`
      );

    } catch (error: any) {
      toast.error(`Error al exportar Excel: ${error.message}`);
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <FileText className="w-8 h-8" />
            Configuración de Reportes
          </h1>
          <p className="text-muted-foreground font-medium">Diseña y genera documentos profesionales para auditoría y gestión.</p>
        </div>
        <div className="flex items-center gap-2">
           <Button
             onClick={handleSave}
             disabled={isSaving}
             variant="outline"
             className="rounded-xl border-primary/20 font-bold uppercase tracking-widest text-[10px]"
           >
             {isSaving ? (
                <> <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Guardando... </>
             ) : (
                <> <Save className="w-4 h-4 mr-2" /> Guardar Plantilla </>
             )}
           </Button>
           <Button
             onClick={handleExportExcel}
             disabled={isExportingExcel}
             variant="outline"
             className="rounded-xl border-success/20 text-success hover:bg-success/10 font-bold uppercase tracking-widest text-[10px]"
           >
             {isExportingExcel ? (
                <> <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Preparando... </>
             ) : (
                <> <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel </>
             )}
           </Button>
           <Button
             onClick={handleGenerate}
             disabled={isGenerating}
             className="rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px] shadow-lg shadow-primary/20"
           >
             {isGenerating ? (
               <> <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Procesando... </>
             ) : (
               <> <Play className="w-4 h-4 mr-2" /> Generar Reporte </>
             )}
           </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <ReportConfigPanel config={config} setConfig={setConfig} />

          <div className="p-4 rounded-2xl bg-warning/10 border border-warning/20 flex gap-3 items-start animate-in fade-in slide-in-from-left-4 duration-500">
             <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
             <div className="space-y-1">
                <p className="text-[10px] font-black uppercase text-warning tracking-widest">Aviso de Rendimiento</p>
                <p className="text-[9px] font-medium text-warning/80 leading-relaxed">
                   Reportes con más de 10,000 registros pueden tardar hasta 30 segundos en procesarse.
                   Se recomienda filtrar por periodos más cortos para mayor agilidad.
                </p>
             </div>
          </div>
        </div>
        <div className="lg:col-span-2">
          <ReportPreview config={config} />
        </div>
      </div>
    </div>
  );
}
