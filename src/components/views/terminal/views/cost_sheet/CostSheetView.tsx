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
import { CostSheetFormulaGuide } from './CostSheetFormulaGuide';
import { CostSheetBanner } from './CostSheetBanner';
import { CostSheetModeSwitcher } from './CostSheetModeSwitcher';
import { CostSheetAuditLog } from './CostSheetAuditLog';
import { CostSheetActionsPanel } from './CostSheetActionsPanel';
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import { CostSheetExportModal, ExportOptions } from './CostSheetExportModal';
import { CostSheetQuickMode } from './CostSheetQuickMode';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { Layout, Eye, Edit, FileText, Trash2, Download, FileSpreadsheet, Upload, Save, BarChart3, Activity, MoreVertical, AlertTriangle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuthStore } from '@/store';
import { exportToPDF, exportToCSV } from '@/services/export-service';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { cn } from '@/lib/utils';

const CostSheetView = () => {
  const isMobile = useIsMobile();
  const [activeSection, setActiveSection] = useState('kpis');
  const [activeSubSectionId, setActiveSubSectionId] = useState('');

  const { data, loadExample, reset, setSheet } = useCostSheetStore();
  const {
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    audits,
    calculationResult,
    isBlocked,
    deepValidationErrors
  } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<'expert' | 'assisted' | 'reading' | 'quick'>('expert');
  const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');

  const handleSetActiveSection = (id: string) => {
    setActiveSection(id);
    if (id === 'main' && !activeSubSectionId) {
        const group13 = groupedSections.find(g => g.id === 'group-1-3');
        if (group13) {
            setActiveSubSectionId('group-1-3');
        }
    }
  };

  // Grouping logic for "Smart Grouping" of small sections
  const groupedSections = React.useMemo(() => {
    if (!data?.sections) return [];

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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const isAnnexActive = React.useMemo(() => (data?.annexes || []).some((a: any) => a.id === activeSection), [data?.annexes, activeSection]);

  const handleExportPDF = React.useCallback(async (options: ExportOptions) => {
    setIsExportModalOpen(false);
    const toastId = toast.loading("Generando PDF profesional...");

    const downloadPDF = async (opts: ExportOptions, filename: string) => {
        if (!calculationResult) return false;
        const response = await fetch('/api/cost-sheets/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...calculationResult, exportOptions: opts })
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            return true;
        }
        return false;
    };

    try {
      if (calculationResult) {
        if (options.consolidated) {
            await downloadPDF(options, `ficha-consolidada-${data?.header?.code || 'export'}.pdf`);
        } else {
            if (options.includeFC) await downloadPDF({ ...options, includeAudit: false, includeAnnexes: [] }, `ficha-${data?.header?.code || 'export'}.pdf`);
            for (const annexId of options.includeAnnexes) {
                await downloadPDF({ ...options, includeFC: false, includeAudit: false, includeAnnexes: [annexId] }, `anexo-${annexId}.pdf`);
            }
        }
        toast.success("PDF(s) generado(s) con éxito", { id: toastId });
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`, { id: toastId });
    }
  }, [calculationResult, data]);

  const handleExportExcel = React.useCallback(() => {
    exportToCSV(data, calculatedValues, data?.header?.name || 'Ficha de Costo');
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
          setSheet(JSON.parse(text));
          toast.success("Ficha cargada");
        } catch (err) {
          toast.error("Error al cargar JSON");
        }
      }
    };
    input.click();
  }, [setSheet]);

  const handleExportJSON = React.useCallback(() => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", `ficha-${data?.header?.code || 'export'}.json`);
    a.click();
    toast.success("JSON exportado");
  }, [data]);

  const handleQuickGenerate = React.useCallback((rows: any[]) => {
    const baseTemplate = JSON.parse(JSON.stringify(data));
    baseTemplate.header.name = rows[0].product;
    baseTemplate.header.code = `QS-${Date.now().toString().slice(-4)}`;
    const annexI = baseTemplate.annexes.find((a: any) => a.id === 'I');
    if (annexI) {
        annexI.data = rows.map((r, idx) => ({
            classification: "1.1",
            code: `ITM-${idx+1}`,
            description: r.product,
            um: r.um,
            consumption_norm: r.quantity,
            price: r.cost,
            total: r.quantity * r.cost
        }));
    }
    setSheet(baseTemplate);
    setViewMode('expert');
    setActiveSection('kpis');
    toast.success("Ficha generada exitosamente");
  }, [data, setSheet]);

  const allActions = React.useMemo(() => [
    {
        id: 'toggle-mode',
        label: isEditing ? 'Ver Resultado' : 'Seguir Editando',
        icon: isEditing ? Eye : Edit,
        onClick: () => setIsEditing(!isEditing),
        variant: 'primary' as const,
    },
    {
        id: 'kpis-header',
        label: 'Análisis KPIs',
        icon: BarChart3,
        onClick: () => {
            handleSetActiveSection('kpis');
            if (!isEditing) setIsEditing(true);
        },
        variant: 'success' as const,
    },
    { id: 'audit', label: 'Auditoría', icon: Activity, onClick: () => { setActiveSection('audit'); setIsActionsPanelOpen(false); }, variant: 'outline' as const },
    { id: 'load-example', label: 'Ejemplo', icon: FileText, onClick: loadExample, variant: 'outline' as const },
    { id: 'reset', label: 'Reiniciar', icon: Trash2, onClick: reset, variant: 'danger' as const },
    { id: 'import-json', label: 'Importar', icon: Upload, onClick: handleImportJSON, variant: 'outline' as const },
    { id: 'export-json', label: 'Guardar JSON', icon: Save, onClick: handleExportJSON, variant: 'outline' as const },
    { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: 'primary' as const },
    { id: 'export-pdf', label: 'PDF', icon: Download, onClick: () => setIsExportModalOpen(true), variant: 'success' as const },
  ], [isEditing, loadExample, reset, handleImportJSON, handleExportJSON, handleExportExcel, handleExportPDF]);

  const mainActions = React.useMemo(() => [
    ...allActions.filter(a => ['toggle-mode', 'kpis-header'].includes(a.id)),
    {
        id: 'more-actions',
        label: 'Opciones',
        icon: MoreVertical,
        onClick: () => setIsActionsPanelOpen(true),
        variant: 'outline' as const
    }
  ], [allActions]);

  const navItems = React.useMemo(() => [
    { id: 'header', label: 'Encabezado', icon: Layout },
    { id: 'main', label: 'Ficha Principal', icon: FileSpreadsheet },
  ], []);

  const subSectionActions = React.useMemo(() => {
    return groupedSections.map(group => ({
        id: group.id,
        label: group.label.split(':')[0],
        tooltip: group.label,
        icon: Layout,
        onClick: () => {
            setActiveSubSectionId(group.id);
            handleSetActiveSection('main');
        },
        active: activeSubSectionId === group.id,
        variant: 'outline' as const
    }));
  }, [groupedSections, activeSubSectionId]);

  if (!data || !data.header) {
    return <div className="p-8"><Skeleton className="h-96 w-full" /></div>;
  }

  return (
    <div className={cn("w-full max-w-none px-0 pt-4 transition-all duration-500", isMobile ? "pb-32" : "pb-12")}>
      <CostSheetActionsPanel
        isOpen={isActionsPanelOpen}
        onClose={() => setIsActionsPanelOpen(false)}
        actions={allActions}
        viewMode={viewMode}
        setViewMode={setViewMode}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
      />

      <CostSheetSidebarNav
        isOpen={isSectionsSidebarOpen}
        onClose={() => setIsSectionsSidebarOpen(false)}
        title="Secciones"
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
        title="Anexos"
        type="annexes"
        items={data?.annexes || []}
        activeId={activeSection}
        onSelect={handleSetActiveSection}
      />

      <CostSheetBanner />

      {isBlocked && (
          <div className="mb-6 mx-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-3xl p-4 flex items-center gap-4">
                  <AlertTriangle className="text-destructive w-5 h-5" />
                  <p className="text-destructive text-xs font-black uppercase tracking-tight">Ficha con errores críticos detectados</p>
              </div>
          </div>
      )}

      {!isMobile && (
          <div className="flex flex-col gap-6 mb-12 px-4">
            <ActionMenu actions={mainActions} position="bottom" />
          </div>
      )}

      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportPDF}
        annexes={data?.annexes || []}
      />

      {isEditing ? (
        <div className="space-y-6">
          {viewMode === 'expert' && (
            <>
                <div className="sticky top-[60px] z-30 py-4 bg-background/80 backdrop-blur-md px-4">
                    <CostSheetNav
                        navItems={navItems}
                        annexes={data?.annexes || []}
                        activeSection={activeSection}
                        setActiveSection={handleSetActiveSection}
                        onOpenActions={isMobile ? undefined : () => setIsActionsPanelOpen(true)}
                    />
                </div>

                <div className="mt-4 px-4">
                    {activeSection === 'kpis' && (
                         <div className="animate-in zoom-in-95 duration-500 py-8 space-y-8">
                            <CostSheetSummary calculatedValues={calculatedValues} data={data} />
                            <CostSheetFormulaGuide />
                        </div>
                    )}
                    {activeSection === 'header' && <CostSheetHeaderEditor calculatedHeader={calculatedHeader} />}
                    {activeSection === 'main' && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="py-2 overflow-x-auto hide-scrollbar -mx-4 px-4">
                                <div className="flex gap-2">
                                    {subSectionActions.map(action => (
                                        <Button
                                            key={action.id}
                                            variant={action.active ? 'primary' : 'outline'}
                                            size="sm"
                                            className={cn(
                                                "rounded-2xl font-black uppercase tracking-tighter text-[10px] h-10 px-4",
                                                action.active && "shadow-[0_0_15px_rgba(57,255,20,0.3)]"
                                            )}
                                            onClick={action.onClick}
                                        >
                                            {action.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>
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
                    {activeSection === 'audit' && <CostSheetAuditLog audits={audits} />}
                </div>
            </>
          )}

          {viewMode === 'assisted' && <CostSheetWizard data={data} calculatedValues={calculatedValues} />}
          {viewMode === 'reading' && <CostSheetNarrative data={data} calculatedValues={calculatedValues} calculatedHeader={calculatedHeader} />}
          {viewMode === 'quick' && <CostSheetQuickMode onGenerate={handleQuickGenerate} />}
        </div>
      ) : (
        <div className="px-4"><CostSheetPreview data={data} calculatedValues={calculatedValues} calculatedAnnexes={calculatedAnnexes} /></div>
      )}

      {/* Persistent Bottom Action Bar for Mobile */}
      {isMobile && (
          <div className="fixed bottom-0 left-0 right-0 z-50 p-6 pointer-events-none">
              <div className="flex items-center justify-around gap-2 p-3 bg-zinc-900/95 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] pointer-events-auto shadow-[0_-20px_40px_rgba(0,0,0,0.5)] max-w-sm mx-auto">
                  {mainActions.map(action => (
                      <button
                          key={action.id}
                          onClick={action.onClick}
                          className={cn(
                              "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl transition-all active:scale-90",
                              action.id === 'toggle-mode'
                                ? "bg-primary text-black px-6 shadow-[0_0_15px_rgba(57,255,20,0.4)]"
                                : "text-zinc-400 hover:text-primary"
                          )}
                      >
                          <action.icon className={cn("w-5 h-5", action.id === 'toggle-mode' ? "text-black" : "")} />
                          <span className={cn(
                              "text-[8px] font-black uppercase tracking-[0.2em]",
                              action.id === 'toggle-mode' ? "text-black" : ""
                          )}>{action.label.split(' ')[0]}</span>
                      </button>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

export default CostSheetView;
