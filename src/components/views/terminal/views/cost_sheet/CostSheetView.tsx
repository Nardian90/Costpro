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
import { CostSheetActionsPanel } from './CostSheetActionsPanel';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download, FileSpreadsheet, Upload, Save, BarChart3, Activity, MoreVertical } from 'lucide-react';
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
  const [activeSection, setActiveSection] = useState('kpis');
  const [activeSubSectionId, setActiveSubSectionId] = useState('');

  const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isAnnexesSidebarOpen, setIsAnnexesSidebarOpen] = useState(false);

  const previewRef = useRef(null);
  const exportRef = useRef(null);

  if (!data || !data.header || !data.annexes || !data.sections) {
    return (
      <div className="w-full max-w-7xl mx-auto px-1 sm:px-6 lg:px-8 pb-32 pt-4">
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

  const isAnnexActive = React.useMemo(() => (data?.annexes || []).some((a: any) => a.id === activeSection), [data?.annexes, activeSection]);

  const handleExportPDF = React.useCallback(async () => {
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
  }, [calculationResult, data, calculatedValues, calculatedAnnexes]);

  const handleExportExcel = React.useCallback(() => {
    const fileName = data.header.name ? `Ficha de Costo - ${data.header.name}` : 'Ficha de Costo';
    exportToCSV(data, calculatedValues, fileName);
  }, [data, calculatedValues]);

  const handleImportJSON = React.useCallback(() => {
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
  }, [setSheet]);

  const handleExportJSON = React.useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `ficha-${data.header.code || 'export'}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("JSON exportado correctamente");
  }, [data]);

  const allActions = React.useMemo(() => [
    {
        id: 'toggle-mode',
        label: isEditing ? 'Ver Resultado' : 'Seguir Editando',
        icon: isEditing ? Eye : Edit,
        onClick: () => {
            setIsEditing(!isEditing);
        },
        variant: 'primary' as const,
    },
    { id: 'load-example', label: 'Ejemplo', icon: FileText, onClick: loadExample, variant: 'outline' as const },
    { id: 'reset', label: 'Reiniciar', icon: Trash2, onClick: reset, variant: 'danger' as const },
    { id: 'import-json', label: 'Importar', icon: Upload, onClick: handleImportJSON, variant: 'outline' as const },
    { id: 'export-json', label: 'Guardar', icon: Save, onClick: handleExportJSON, variant: 'outline' as const },
    { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: 'primary' as const },
    { id: 'export-pdf', label: 'PDF', icon: Download, onClick: handleExportPDF, variant: 'success' as const },
  ], [isEditing, loadExample, reset, handleImportJSON, handleExportJSON, handleExportExcel, handleExportPDF]);

  const mainActions = React.useMemo(() => [
    ...allActions.filter(a => ['toggle-mode'].includes(a.id)),
    {
        id: 'more-actions',
        label: 'Más Acciones',
        icon: MoreVertical,
        onClick: () => setIsActionsPanelOpen(true),
        variant: 'outline' as const
    }
  ], [allActions]);

  const secondaryActions = React.useMemo(() => allActions.filter(a => !['toggle-mode'].includes(a.id)), [allActions]);

  return (
    <div className="w-full max-w-7xl mx-auto px-1 sm:px-6 lg:px-8 pb-32 pt-4">
      <CostSheetActionsPanel
        isOpen={isActionsPanelOpen}
        onClose={() => setIsActionsPanelOpen(false)}
        actions={secondaryActions}
        viewMode={viewMode}
        setViewMode={setViewMode}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
      />

      <CostSheetSidebarNav
        isOpen={isSectionsSidebarOpen}
        onClose={() => setIsSectionsSidebarOpen(false)}
        title="Secciones de la Ficha"
        type="sections"
        items={data?.sections || []}
        activeId={activeSubSectionId}
        onSelect={(id) => {
            setActiveSubSectionId(id);
            setActiveSection('main');
        }}
      />

      <CostSheetSidebarNav
        isOpen={isAnnexesSidebarOpen}
        onClose={() => setIsAnnexesSidebarOpen(false)}
        title="Anexos Disponibles"
        type="annexes"
        items={data?.annexes || []}
        activeId={activeSection}
        onSelect={setActiveSection}
      />

      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px', width: '1024px', opacity: 0, pointerEvents: 'none' }}>
          <CostSheetPreview
            ref={exportRef}
            data={data}
            calculatedValues={calculatedValues}
            calculatedAnnexes={calculatedAnnexes}
          />
      </div>

      <CostSheetBanner />

      <div className="flex flex-col gap-6 mb-8 sm:mb-12">
        <ActionMenu actions={mainActions} position="bottom" />
      </div>

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode === 'expert' && (
            <>
                <CostSheetNav
                    navItems={React.useMemo(() => [
                        { id: 'kpis', label: 'KPIs', icon: BarChart3 },
                        { id: 'header', label: 'Encabezado' },
                        { id: 'main', label: 'Tabla Principal' },
                        { id: 'audit', label: 'Auditoría', icon: Activity }
                    ], [])}
                    subSections={data?.sections || []}
                    activeSubSectionId={activeSubSectionId}
                    setActiveSubSectionId={setActiveSubSectionId}
                    annexes={data?.annexes || []}
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                    onOpenAnnexes={React.useCallback(() => setIsAnnexesSidebarOpen(true), [])}
                    onOpenSections={React.useCallback(() => setIsSectionsSidebarOpen(true), [])}
                />

                <div className="mt-4">
                    {activeSection === 'kpis' && (
                         <div className="animate-in zoom-in-95 duration-500 py-8">
                            <CostSheetSummary
                                calculatedValues={calculatedValues}
                                data={data}
                            />
                        </div>
                    )}
                    {activeSection === 'header' && (
                        <div className="space-y-6">
                            <CostSheetHeaderEditor />
                        </div>
                    )}
                    {activeSection === 'main' && (
                        <CostSheetInteractiveTable
                            sections={data.sections}
                            calculatedValues={calculatedValues}
                            annexes={data.annexes}
                            activeSubSectionId={activeSubSectionId}
                            setActiveSubSectionId={setActiveSubSectionId}
                            onOpenSections={() => setIsSectionsSidebarOpen(true)}
                        />
                    )}
                    {isAnnexActive && (
                        <CostSheetAnnexEditor
                            activeAnnexId={activeSection}
                            layoutMode={layoutMode}
                            calculatedAnnexes={calculatedAnnexes}
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
