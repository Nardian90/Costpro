'use client';

import React, { useState, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetPreview from './CostSheetPreview';
import CostSheetNarrative from './CostSheetNarrative';
import CostSheetWizard from './CostSheetWizard';
import CostSheetSummary from './CostSheetSummary';
import { CostSheetBanner } from './CostSheetBanner';
import { CostSheetModeSwitcher } from './CostSheetModeSwitcher';
import { CostSheetAuditLog } from './CostSheetAuditLog';
import { CostSheetProvider } from './CostSheetContext';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download, FileSpreadsheet, Upload, Save, BarChart3, Activity } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { exportToPDF, exportToCSV } from '@/services/export-service';

const CostSheetView = () => {
  const { data, loadExample, reset, setSheet } = useCostSheetStore();
  const { calculatedValues, calculatedAnnexes, audits, calculationResult } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<'expert' | 'assisted' | 'reading'>('expert');
  const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');
  const [activeSection, setActiveSection] = useState('header');
  const [showKpiOnly, setShowKpiOnly] = useState(false);

  const previewRef = useRef(null);
  const exportRef = useRef(null);

  if (!data || !data.header || !data.annexes || !data.sections) {
    return (
      <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-32 pt-4">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 px-2">
          <div className="flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-2xl" />
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <Skeleton className="h-12 w-full mb-8" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  const isAnnexActive = data.annexes.some((a: any) => a.id === activeSection);

  const handleExportPDF = async () => {
    const toastId = toast.loading("Generando PDF profesional... por favor espere.");
    try {
      // Prioritize the declarative engine export
      if (calculationResult) {
        const response = await fetch('/api/cost-sheets/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(calculationResult)
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `ficha-${data.header.code || 'export'}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            toast.success("PDF generado con éxito", { id: toastId });
            return;
        }
      }

      // Fallback to legacy report service if engine fails or not available
      const { reportService } = await import('@/services/report-service');
      const response = await reportService.generateReport({
        type: 'cost_sheet',
        data: data,
        calculatedValues: calculatedValues,
        calculatedAnnexes: calculatedAnnexes,
        store_id: useAuthStore.getState().user?.activeStoreId,
        name: data.header.name || 'Ficha de Costo'
      }, useAuthStore.getState().token || '');

      if (response.url) {
        window.open(response.url, '_blank');
        toast.success("PDF generado con éxito", { id: toastId });
      } else {
        throw new Error("No se recibió la URL del PDF");
      }
    } catch (error: any) {
      console.error("PDF Export error:", error);
      toast.error(`Error al generar el PDF: ${error.message}`, { id: toastId });
    }
  };

  const handleExportExcel = () => {
    const fileName = data.header.name ? `Ficha de Costo - ${data.header.name}` : 'Ficha de Costo';
    exportToCSV(data, calculatedValues, fileName);
  };

  const handleImportJSON = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        try {
          const text = await file.text();
          const json = JSON.parse(text);
          setSheet(json);
          toast.success("Ficha cargada correctamente");
        } catch (err) {
          toast.error("Error al cargar el archivo JSON");
        }
      }
    };
    input.click();
  };

  const handleExportJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `ficha-${data.header.code || 'export'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("JSON exportado correctamente");
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-6 lg:px-8 pb-32 pt-4">
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1024px', opacity: 0, pointerEvents: 'none' }}>
          <CostSheetPreview
            ref={exportRef}
            data={data}
            calculatedValues={calculatedValues}
            calculatedAnnexes={calculatedAnnexes}
          />
      </div>

      <CostSheetBanner />

      <div className="flex flex-col gap-6 mb-8">
        <ActionMenu
            actions={[
            {
                id: 'toggle-mode',
                label: isEditing ? 'Ver Resultado' : 'Seguir Editando',
                icon: isEditing ? Eye : Edit,
                onClick: () => {
                    setIsEditing(!isEditing);
                    setShowKpiOnly(false);
                },
                variant: 'primary',
            },
            {
                id: 'toggle-kpi',
                label: showKpiOnly ? 'Vista Completa' : 'Ver KPIs',
                icon: BarChart3,
                onClick: () => setShowKpiOnly(!showKpiOnly),
                variant: showKpiOnly ? 'success' : 'outline',
                className: "shadow-md scale-105"
            },
            { id: 'load-example', label: 'Ejemplo', icon: FileText, onClick: loadExample, variant: 'outline' },
            { id: 'reset', label: 'Reiniciar', icon: Trash2, onClick: reset, variant: 'danger' },
            { id: 'import-json', label: 'Importar', icon: Upload, onClick: handleImportJSON, variant: 'outline' },
            { id: 'export-json', label: 'Guardar', icon: Save, onClick: handleExportJSON, variant: 'outline' },
            { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: 'primary' },
            { id: 'export-pdf', label: 'PDF', icon: Download, onClick: handleExportPDF, variant: 'success' },
            ]}
        />

        {isEditing && (
             <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
               <CostSheetModeSwitcher viewMode={viewMode} setViewMode={setViewMode} />
               {viewMode === 'expert' && (
                 <ViewSwitcher currentView={layoutMode} onViewChange={setLayoutMode} />
               )}
             </div>
        )}
      </div>

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode === 'expert' && (
            <>
                {showKpiOnly ? (
                    <div className="animate-in zoom-in-95 duration-500 py-8">
                         <CostSheetSummary
                            calculatedValues={calculatedValues}
                            data={data}
                        />
                        <div className="flex justify-center mt-12">
                            <Button
                                variant="outline"
                                className="rounded-full px-8 border-primary/20 hover:bg-primary/5"
                                onClick={() => setShowKpiOnly(false)}
                            >
                                <Eye className="w-4 h-4 mr-2" />
                                Volver a la Vista Detallada
                            </Button>
                        </div>
                    </div>
                ) : (
                    <>
                        {activeSection === 'header' && (
                            <CostSheetSummary
                                calculatedValues={calculatedValues}
                                data={data}
                            />
                        )}
                        <CostSheetNav
                            sections={[
                                { id: 'header', label: 'Encabezado' },
                                { id: 'main', label: 'Tabla Principal' },
                                { id: 'audit', label: 'Auditoría', icon: Activity }
                            ]}
                            annexes={data.annexes}
                            activeSection={activeSection}
                            setActiveSection={setActiveSection}
                        />
                        <div className="mt-4">
                            {activeSection === 'header' && <CostSheetHeaderEditor />}
                            {activeSection === 'main' && (
                            <CostSheetProvider calculatedValues={calculatedValues}>
                                <CostSheetInteractiveTable
                                    sections={data.sections}
                                    annexes={data.annexes}
                                />
                            </CostSheetProvider>
                            )}
                            {isAnnexActive && (
                              <CostSheetAnnexEditor
                                activeAnnexId={activeSection}
                                layoutMode={layoutMode}
                              />
                            )}
                            {activeSection === 'signature' && <CostSheetSignatureEditor />}
                            {activeSection === 'audit' && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                                    <CostSheetAuditLog audits={audits} />
                                </div>
                            )}
                        </div>
                    </>
                )}
            </>
          )}

          {viewMode === 'assisted' && (
              <CostSheetWizard data={data} calculatedValues={calculatedValues} />
          )}

          {viewMode === 'reading' && (
               <CostSheetNarrative data={data} calculatedValues={calculatedValues} />
          )}
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-500">
            <CostSheetPreview
                ref={previewRef}
                data={data}
                calculatedValues={calculatedValues}
                calculatedAnnexes={calculatedAnnexes}
            />
        </div>
      )}
    </div>
  );
};

export default CostSheetView;
