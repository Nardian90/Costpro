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
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { Eye, Edit, FileText, Trash2, Download, FileSpreadsheet, Upload, Save, BarChart3, Activity, MoreVertical, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { exportToPDF, exportToCSV } from '@/services/export-service';

const CostSheetView = () => {
  const { data, loadExample, reset, setSheet } = useCostSheetStore();
  const { calculatedValues, calculatedAnnexes, audits, calculationResult, isBlocked, deepValidationErrors } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<'expert' | 'assisted' | 'reading'>('expert');
  const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');
  const [activeSection, setActiveSection] = useState('kpis');
  const [activeSubSectionId, setActiveSubSectionId] = useState('');

  // Grouping logic for "Smart Grouping" of small sections
  const groupedSections = React.useMemo(() => {
    if (!data?.sections) return [];

    // Specific logical blocks requested by the user: [1-3], [4-5], [6-7], [8-10], [11-16]
    const predefinedBlocks = [
        { start: 1, end: 3 },
        { start: 4, end: 5 },
        { start: 6, end: 7 },
        { start: 8, end: 10 },
        { start: 11, end: 16 }
    ];

    const getSectionNumber = (id: string) => {
        const num = id.replace('s', '');
        return parseInt(num, 10);
    };

    const getSectionName = (label: string) => {
        const match = label.match(/Sección\s+\d+:\s*(.*)/i);
        return match ? match[1].trim() : label.trim();
    };

    const groups: { id: string, label: string, sectionIds: string[] }[] = [];

    predefinedBlocks.forEach((block) => {
        const blockSections = data.sections.filter(s => {
            const n = getSectionNumber(s.id);
            return n >= block.start && n <= block.end;
        });

        if (blockSections.length > 0) {
            const first = blockSections[0];
            const last = blockSections[blockSections.length - 1];

            let label = "";
            if (blockSections.length === 1) {
                label = first.label;
            } else {
                const startNum = getSectionNumber(first.id);
                const endNum = getSectionNumber(last.id);
                const firstName = getSectionName(first.label);
                const lastName = getSectionName(last.label);
                label = `SECCIONES ${startNum} - ${endNum}: ${firstName} ... ${lastName}`;
            }

            groups.push({
                id: `group-${block.start}-${block.end}`,
                label,
                sectionIds: blockSections.map(s => s.id)
            });
        }
    });

    // Handle any sections not in predefined blocks
    data.sections.forEach(s => {
        const n = getSectionNumber(s.id);
        const isInBlock = predefinedBlocks.some(b => n >= b.start && n <= b.end);
        if (!isInBlock) {
            groups.push({
                id: s.id,
                label: s.label,
                sectionIds: [s.id]
            });
        }
    });

    return groups;
  }, [data?.sections]);

  const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isAnnexesSidebarOpen, setIsAnnexesSidebarOpen] = useState(false);
  const [isMassiveGeneratorOpen, setIsMassiveGeneratorOpen] = useState(false);

  const isAnnexActive = React.useMemo(() => (data?.annexes || []).some((a: any) => a.id === activeSection), [data?.annexes, activeSection]);

  const handleExportPDF = React.useCallback(async () => {
    if (isBlocked) {
        toast.error("No se puede exportar: La ficha contiene errores críticos de validación.");
        return;
    }
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
            a.download = `ficha-${data?.header?.code || 'export'}.pdf`;
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
        name: data?.header?.name || 'Ficha de Costo'
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
    if (isBlocked) {
        toast.error("No se puede exportar: La ficha contiene errores críticos de validación.");
        return;
    }
    const fileName = data?.header?.name ? `Ficha de Costo - ${data.header.name}` : 'Ficha de Costo';
    exportToCSV(data, calculatedValues, fileName);
  }, [data, calculatedValues, isBlocked]);

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
    if (isBlocked) {
        toast.error("No se puede guardar: La ficha contiene errores críticos de validación.");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `ficha-${data?.header?.code || 'export'}.json`);
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
            if (isEditing && isBlocked) {
                toast.warning("La ficha tiene errores críticos, la visualización puede ser inconsistente.");
            }
            setIsEditing(!isEditing);
        },
        variant: 'primary' as const,
    },
    { id: 'load-example', label: 'Ejemplo', icon: FileText, onClick: loadExample, variant: 'outline' as const },
    { id: 'reset', label: 'Reiniciar', icon: Trash2, onClick: reset, variant: 'danger' as const },
    { id: 'import-json', label: 'Importar', icon: Upload, onClick: handleImportJSON, variant: 'outline' as const },
    { id: 'export-json', label: 'Guardar', icon: Save, onClick: handleExportJSON, variant: 'outline' as const, disabled: isBlocked },
    { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: (isBlocked ? 'outline' : 'primary') as any, disabled: isBlocked },
    { id: 'export-pdf', label: 'PDF', icon: Download, onClick: handleExportPDF, variant: (isBlocked ? 'outline' : 'success') as any, disabled: isBlocked },
    { id: 'massive-gen', label: 'Gen. Masiva', icon: FileText, onClick: () => setIsMassiveGeneratorOpen(true), variant: 'outline' as const },
  ], [isEditing, loadExample, reset, handleImportJSON, handleExportJSON, handleExportExcel, handleExportPDF, isBlocked]);

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

  const navItems = React.useMemo(() => [
    { id: 'kpis', label: 'KPIs', icon: BarChart3 },
    { id: 'main', label: 'Ficha Principal', icon: FileSpreadsheet },
    { id: 'audit', label: 'Auditoría', icon: Activity }
  ], []);

  const onOpenAnnexes = React.useCallback(() => setIsAnnexesSidebarOpen(true), []);
  const onOpenSections = React.useCallback(() => setIsSectionsSidebarOpen(true), []);

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
        items={groupedSections}
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

      <CostSheetBanner />

      {isBlocked && (
          <div className="mb-6 animate-in slide-in-from-top duration-500">
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                  <div className="bg-destructive text-white p-2 rounded-xl">
                      <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                      <h4 className="text-destructive font-black uppercase tracking-tight text-sm">Ficha Bloqueada</h4>
                      <p className="text-destructive/80 text-xs font-medium">Se han detectado {deepValidationErrors.filter(e => e.type === 'CRITICAL').length} errores críticos que impiden el guardado y exportación. Por favor, revise las filas marcadas con ❌.</p>
                  </div>
              </div>
          </div>
      )}

      <div className="flex flex-col gap-6 mb-8 sm:mb-12">
        <ActionMenu actions={mainActions} position="bottom" />
      </div>

      <CostSheetMassiveGenerator
        isOpen={isMassiveGeneratorOpen}
        onClose={() => setIsMassiveGeneratorOpen(false)}
      />

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode === 'expert' && (
            <>
                <CostSheetNav
                    navItems={navItems}
                    subSections={groupedSections}
                    activeSubSectionId={activeSubSectionId}
                    setActiveSubSectionId={setActiveSubSectionId}
                    annexes={data?.annexes || []}
                    activeSection={activeSection}
                    setActiveSection={setActiveSection}
                    onOpenAnnexes={onOpenAnnexes}
                    onOpenSections={onOpenSections}
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
                    {activeSection === 'main' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                            {/* Sticky Compact Header for Contextualization */}
                            <div className="sticky top-[-1px] z-40 bg-background/95 backdrop-blur-md -mx-2 px-2 py-3 border-b border-border/50 shadow-sm mb-4 animate-in slide-in-from-top duration-300">
                                <CostSheetHeaderEditor compact />
                            </div>

                            {/* Full Header Editor */}
                            <CostSheetHeaderEditor />

                            <CostSheetInteractiveTable
                                sections={data?.sections || []}
                                groupedSections={groupedSections}
                                calculatedValues={calculatedValues}
                                annexes={data?.annexes || []}
                                activeSubSectionId={activeSubSectionId}
                                setActiveSubSectionId={setActiveSubSectionId}
                                onOpenSections={() => setIsSectionsSidebarOpen(true)}
                            />
                        </div>
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
