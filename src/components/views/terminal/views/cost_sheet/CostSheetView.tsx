'use client';
import { DarianEditor } from './DarianEditor';
import { LazyRender } from '@/components/ui/LazyRender';

import React, { useState, useRef } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useCostSheetCalculator } from '@/hooks/logic/useCostSheetCalculator';
import CostSheetNav from './CostSheetNav';
import CostSheetCardView from './CostSheetCardView';
import CostSheetInteractiveTable from './CostSheetInteractiveTable';
import CostSheetAnnexEditor from './CostSheetAnnexEditor';
import CostSheetHeaderEditor from './CostSheetHeaderEditor';
import CostSheetSignatureEditor from './CostSheetSignatureEditor';
import CostSheetPreview from './CostSheetPreview';
import CostSheetNarrative from './CostSheetNarrative';
import CostSheetWizard from './CostSheetWizard';
import CostSheetSummary from './CostSheetSummary';
import { CostSheetFormulaGuide } from './CostSheetFormulaGuide';

import { CostSheetAuditView } from './CostSheetAuditView';
import { BaseModal } from "@/components/ui/BaseModal";
import { SteelStructureCalculator } from './SteelStructureCalculator';
import { CostSheetActionsPanel } from './CostSheetActionsPanel';
import { CostSheetHelpPanel } from './CostSheetHelpPanel';
import { CostSheetTemplateExplorer } from "./CostSheetTemplateExplorer";
import { FolderOpen } from "lucide-react";
import { CostSheetSidebarNav } from './CostSheetSidebarNav';
import { useUIStore } from '@/store';
import { CostSheetMassiveGenerator } from './CostSheetMassiveGenerator';
import { CostSheetExportModal, ExportOptions } from './CostSheetExportModal';
import { CostSheetQuickMode } from './CostSheetQuickMode';
import { CostSheetViewMode } from './CostSheetModeDropdown';
import ViewSwitcher, { ViewMode } from '@/components/ui/ViewSwitcher';
import ActionMenu from '@/components/ui/ActionMenu';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import { Layout, Eye, Edit, FileText, Trash2, Download, FileSpreadsheet, Upload, Save, BarChart3, ClipboardList, Activity, MoreVertical, AlertTriangle, ArrowLeft, Table2, Wand2, BookOpen, Zap as ZapIcon, Sparkles, Calculator, Tag } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { usageService } from '@/services/usage-service';
import { UpgradeModal } from '@/components/modals/UpgradeModal';
import { useAuthStore } from '@/store';
import { exportToPDF, exportToCSV } from '@/services/export-service';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Bot } from "lucide-react";

const CostSheetView = () => {
  const isMobile = useIsMobile();
  const { activeCostSection: activeSection, setActiveCostSection: setActiveSection } = useUIStore();
  const { user } = useAuthStore();

  const [confirmation, setConfirmation] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; variant?: 'default' | 'destructive' }>({ isOpen: false, title: '', message: '', onConfirm: () => {} });
  const askConfirmation = (title: string, message: string, onConfirm: () => void, variant: 'default' | 'destructive' = 'default') => {
    setConfirmation({ isOpen: true, title, message, onConfirm, variant });
  };
  const [activeSubSectionId, setActiveSubSectionId] = useState('group-1-3');
  const [quickModeMapping, setQuickModeMapping] = useState({
    targetColumn: 'sale_price' as 'sale_price' | 'total_cost',
    modificationRow: '13.1'
  });
  const [quickModeProducts, setQuickModeProducts] = React.useState<any[] | null>(null);
  const [isQuickModeGenerating, setIsQuickModeGenerating] = React.useState(false);

  const handleSetActiveSection = (id: string) => {
    setActiveSection(id);
    if (id === 'main' && !activeSubSectionId) {
        // Find the group 1-3 if it exists
        const group13 = groupedSections.find(g => g.id === 'group-1-3');
        if (group13) {
            setActiveSubSectionId('group-1-3');
        }
    }
  };

  const { data, loadExample, reset, setSheet } = useCostSheetStore();
  const {
    calculatedValues,
    calculatedHeader,
    calculatedAnnexes,
    audits,
    validations,
    healthPercent,
    calculationResult,
    isBlocked,
    deepValidationErrors
  } = useCostSheetCalculator(data);

  const [isEditing, setIsEditing] = useState(true);
  const [viewMode, setViewMode] = useState<CostSheetViewMode>('expert');
  const [layoutMode, setLayoutMode] = useState<ViewMode>('grid');

  const handleSetViewMode = (mode: CostSheetViewMode) => {
    if (mode === 'preview') {
      setIsEditing(false);
    } else {
      setIsEditing(true);
    }
    if (mode === 'audit') { setActiveSection('audit'); setViewMode('expert'); } else if (mode === 'kpis') { setActiveSection('kpis'); setViewMode('expert'); } else if (mode === 'expert') { setActiveSection('expert-content'); setViewMode('expert'); } else { setViewMode(mode); }
  };

  React.useEffect(() => {
    setLayoutMode(isMobile ? 'grid' : 'table');
  }, [isMobile]);
  React.useEffect(() => {
    if (activeSection === 'view-kpis') { handleSetViewMode('kpis'); }
    else if (activeSection === 'view-expert') { handleSetViewMode('expert'); }
    else if (activeSection === 'view-assisted') { handleSetViewMode('assisted'); }
    else if (activeSection === 'view-reading') { handleSetViewMode('reading'); }
    else if (activeSection === 'gen-quick') { handleSetViewMode('quick'); }
    else if (activeSection === 'gen-expert') { setIsQuickModeGenerating(true); setViewMode('expert'); }
    else if (activeSection === 'tool-import') { handleImportJSON(); setActiveSection('cost-sheets'); }
    else if (activeSection === 'tool-save') { handleExportJSON(); setActiveSection('cost-sheets'); }
    else if (activeSection === 'tool-export-excel') { handleExportExcel(); setActiveSection('cost-sheets'); }
    else if (activeSection === 'tool-export-pdf') { setIsExportModalOpen(true); setActiveSection('cost-sheets'); }
    else if (activeSection === 'res-help') { setIsHelpPanelOpen(true); setActiveSection('cost-sheets'); }
    else if (activeSection === 'res-system-help') { setCurrentView('help'); setActiveSection('cost-sheets'); }
    else if (activeSection === 'res-academy') { setCurrentView('academy'); setActiveSection('cost-sheets'); }
    else if (activeSection === 'open-sections') { setIsSectionsSidebarOpen(true); setActiveSection('cost-sheets'); }
    else if (activeSection === 'open-annexes') { setIsAnnexesSidebarOpen(true); setActiveSection('cost-sheets'); }
  }, [activeSection]);

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
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isAnnexesSidebarOpen, setIsAnnexesSidebarOpen] = useState(false);
  const [isMassiveGeneratorOpen, setIsMassiveGeneratorOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const isAnnexActive = React.useMemo(() => (data?.annexes || []).some((a: any) => a.id === activeSection) || activeSection === 'all-annexes' || activeSection === 'all-content' || activeSection === 'expert-content', [data?.annexes, activeSection]);

  const handleExportPDF = React.useCallback(async (options: ExportOptions) => {
    // Usage Quota Check
    if (user) {
        const { allowed } = await usageService.checkQuota(user.id, 'fc_export', user.plan, user.role);
        if (!allowed) {
            setIsUpgradeModalOpen(true);
            return;
        }
    }

    setIsExportModalOpen(false);
    if (isBlocked) {
        toast.warning("Exportando con advertencias: La ficha contiene errores críticos de validación.");
    }
    const toastId = toast.loading("Generando PDF profesional... por favor espere.");

    const downloadPDF = async (opts: ExportOptions, filename: string) => {
        if (!calculationResult) return false;
        const response = await fetch('/api/cost-sheets/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                ...calculationResult,
                sections: data.sections, signature: data.signature, notes: data.footer || data.metadata?.notes, exportOptions: opts
            })
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
      // Prioritize the declarative engine export
      if (calculationResult) {
        const h = calculationResult.metadata?.header || data?.header || {};
        const evalCode = h.code || 'export';
        const evalName = h.name || 'ficha';
        const safeBaseName = `${evalCode}-${evalName}`.replace(/[\\/\?%*:|"<>]/g, '-');

        if (options.consolidated) {
            const success = await downloadPDF(options, `ficha-consolidada-${safeBaseName}.pdf`);
            if (success) {
                toast.success("PDF consolidado generado con éxito", { id: toastId });
                if (user) await usageService.trackUsage(user.id, "fc_export", user.plan, user.role);
                return;
            }
        } else {
            // Separate export
            let count = 0;
            if (options.includeFC) {
                await downloadPDF({ ...options, includeAudit: false, includeAnnexes: [] }, `ficha-${safeBaseName}.pdf`);
                count++;
            }

            for (const annexId of options.includeAnnexes) {
                await downloadPDF({ ...options, includeFC: false, includeAudit: false, includeAnnexes: [annexId] }, `anexo-${annexId}-${safeBaseName}.pdf`);
                count++;
            }

            if (options.includeAudit) {
                await downloadPDF({ ...options, includeFC: false, includeAnnexes: [] }, `auditoria-${safeBaseName}.pdf`);
                count++;
            }

            toast.success(`${count} PDFs generados con éxito`, { id: toastId });
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
        name: data?.header?.name || 'Ficha de Costo',
        exportOptions: options
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
  }, [calculationResult, data, calculatedValues, calculatedAnnexes, isBlocked]);

  const handleExportExcel = React.useCallback(() => {
    if (isBlocked) {
        toast.warning("Exportando con advertencias: La ficha contiene errores críticos de validación.");
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
        toast.warning("Exportando con advertencias: La ficha contiene errores críticos de validación.");
    }

    // Export data maintaining formula integrity in the header
    // We include a calculation snapshot for offline reference without destroying the dynamic nature of the sheet
    const exportData = {
        ...data,
        metadata: {
            ...data?.metadata,
            exportedAt: new Date().toISOString(),
            integrity: "full",
            calculationSnapshot: {
                header: calculatedHeader,
                values: calculatedValues
            }
        }
    };

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);

    // Use calculated code for filename if available
    const filename = `ficha-${calculatedHeader?.code || data?.header?.code || 'export'}.json`;
    downloadAnchorNode.setAttribute("download", filename);

    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success("JSON exportado correctamente");
  }, [data, calculatedHeader, isBlocked]);

    const handleQuickGenerate = React.useCallback(async (rows: any[]) => {
    if (user) {
        const { allowed } = await usageService.checkQuota(user.id, 'fc_create', user.plan, user.role);
        if (!allowed) {
            setIsUpgradeModalOpen(true);
            return;
        }
    }

        if (user) await usageService.trackUsage(user.id, "fc_create", user.plan, user.role);
        setQuickModeProducts(rows.map(r => ({
            name: r.product,
            sku: `QM-${r.id}`,
            unit_of_measure: r.um,
            price: r.cost,
            quantity: r.quantity,
            sale_price: r.sale_price
        })));
        setIsQuickModeGenerating(true);
        toast.info(`Iniciando generación para ${rows.length} productos`);
    }, []);

  const { setCurrentView, setIsChatBotOpen, setIsCalculatorOpen } = useUIStore();

  const allActions = React.useMemo(() => [
    {
        id: "go-back",
        label: "Volver al Inicio",
        icon: ArrowLeft,
        onClick: () => setCurrentView("dashboard"),
        variant: "outline" as const,
    },
    {
        id: 'toggle-mode',
        label: isEditing ? 'Previsualizar' : 'Seguir Editando',
        icon: isEditing ? Eye : Edit,
        onClick: () => {
            if (isEditing && isBlocked) {
                toast.warning("La ficha tiene errores críticos, la visualización puede ser inconsistente.");
            }
            setIsEditing(!isEditing);
        },
        variant: 'primary' as const,
    },
     { id: 'audit', label: 'Auditoría', icon: Activity, onClick: () => { setActiveSection('audit'); setIsActionsPanelOpen(false); }, variant: 'outline' as const },
    { id: 'load-example', label: 'Ejemplo', icon: FileText, onClick: loadExample, variant: 'outline' as const },

    { id: 'import-json', label: 'Importar', icon: Upload, onClick: handleImportJSON, variant: 'outline' as const },
    { id: 'export-json', label: 'Guardar', icon: Save, onClick: handleExportJSON, variant: 'outline' as const, disabled: false },
    { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: (isBlocked ? 'outline' : 'primary') as any, disabled: false },
    { id: 'export-pdf', label: 'PDF', icon: Download, onClick: () => setIsExportModalOpen(true), variant: (isBlocked ? 'outline' : 'success') as any, disabled: false },
    { id: 'massive-gen', label: 'Gen. Masiva', icon: FileText, onClick: () => { setIsQuickModeGenerating(true); setIsActionsPanelOpen(false); }, variant: 'outline' as const },
    {
        id: 'calculator',
        label: 'Calculadora',
        icon: Calculator,
        onClick: () => setIsCalculatorOpen(true),
        variant: 'outline' as const
    }

  ], [isEditing, loadExample, reset, handleImportJSON, handleExportJSON, handleExportExcel, handleExportPDF, isBlocked, setIsCalculatorOpen, data]);

  const mainActions = React.useMemo(() => [

    ...allActions.filter(a => ['toggle-mode', 'kpis-header'].includes(a.id)),
    {
        id: 'more-actions',
        label: 'Más Acciones',
        icon: MoreVertical,
        onClick: () => setIsActionsPanelOpen(true),
        variant: 'outline' as const
    }
  ], [allActions]);

  const secondaryActions = React.useMemo(() => allActions, [allActions]);

  const navItems = React.useMemo(() => [
    { id: "kpis", label: "Tablero", icon: BarChart3 },
    { id: "templates", label: "Plantillas", icon: FolderOpen },
    { id: "ai-chat", label: "Darian", icon: Sparkles },

    { id: "massive-gen", label: "Gen. Masiva", icon: FileText }
  ], []);

  const subSectionActions = React.useMemo(() => {
    return groupedSections.map(group => ({
        id: group.id,
        label: group.label.split(':')[0], // Short label like "SECCIONES 1-3"
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

  const onOpenAnnexes = React.useCallback(() => setIsAnnexesSidebarOpen(true), []);
  const onOpenSections = React.useCallback(() => setIsSectionsSidebarOpen(true), []);




  if (!data || !data.header || !data.annexes || !data.sections) {
    return (
      <div className="w-full max-w-none px-2 pb-32 pt-0">
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
    <div className="w-full max-w-none px-0 pb-32 pt-0">
      <CostSheetHelpPanel isOpen={isHelpPanelOpen} onClose={() => setIsHelpPanelOpen(false)} />
      <CostSheetActionsPanel
        isOpen={isActionsPanelOpen}
        onClose={() => setIsActionsPanelOpen(false)}
        actions={secondaryActions}
        layoutMode={layoutMode}
        setLayoutMode={setLayoutMode}
        activeSection={activeSection}
        setActiveSection={handleSetActiveSection}
        viewMode={viewMode}
        setViewMode={handleSetViewMode}
        onOpenSections={onOpenSections}
        onOpenAnnexes={onOpenAnnexes}
        onOpenHelp={() => setIsHelpPanelOpen(true)}
                        onOpenSystemHelp={() => setCurrentView("help")}
                        onOpenAcademy={() => setCurrentView("academy")}
        onQuickGenerate={() => setViewMode('quick')}
        onExpertGenerate={() => { setIsQuickModeGenerating(true); setViewMode('expert'); }}
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
        onSelect={handleSetActiveSection}
      />

      {isBlocked && (
          <div className="mb-6 animate-in slide-in-from-top duration-500">
              <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-4 shadow-sm">
                  <div className="bg-destructive text-foreground p-2 rounded-xl">
                      <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                      <h4 className="text-destructive font-black uppercase tracking-tight text-sm">Ficha con Errores</h4>
                      <p className="text-destructive/80 text-xs font-medium">Se han detectado {deepValidationErrors.filter(e => e.type === 'CRITICAL').length} errores críticos. La exportación está disponible pero puede contener datos inconsistentes. Por favor, revise las filas marcadas con ❌.</p>
                  </div>
              </div>
          </div>
      )}

      <CostSheetExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportPDF}
        annexes={data?.annexes || []}
      />

      {isEditing ? (
        <div className="animate-in fade-in duration-700 space-y-6">
          {viewMode !== 'expert' && (
              <div className="flex flex-col sm:flex-row justify-between items-center bg-background dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-[1.5rem] mb-6 shadow-sm gap-4">
                  <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-primary/10 rounded-xl">
                          {viewMode === 'assisted' && <Wand2 className="w-5 h-5 text-primary" />}
                          {viewMode === 'reading' && <BookOpen className="w-5 h-5 text-primary" />}
                          {viewMode === 'quick' && <ZapIcon className="w-5 h-5 text-primary" />}
                      </div>
                      <div>
                          <h3 className="text-sm font-bold uppercase tracking-tight">
                              {viewMode === 'assisted' ? 'Modo Asistido' : viewMode === 'reading' ? 'Modo Lectura' : 'Modo Rápido'}
                          </h3>
                          <p className="text-xs text-muted-foreground uppercase font-black tracking-[0.2em]">Vista Simplificada Activa</p>
                      </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewMode('expert')}
                    className="w-full sm:w-auto rounded-xl border-primary/20 hover:bg-primary/10 text-primary font-bold uppercase tracking-widest text-xs h-10 px-6 active:scale-95 transition-all"
                  >
                      <Table2 className="w-3.5 h-3.5 mr-2" />
                      Volver a Modo Todo
                  </Button>
              </div>
          )}

          {viewMode === 'expert' && (
            <>
                <div className="mb-6 -mx-4 px-4 z-30">
                    <CostSheetNav
                        navItems={navItems}
                        annexes={data?.annexes || []}
                        activeSection={activeSection}
                        setActiveSection={handleSetActiveSection}
                        viewMode={viewMode}
                        setViewMode={handleSetViewMode}
                        onOpenActions={() => setIsActionsPanelOpen(true)}
                        onImport={handleImportJSON}
                        onSave={handleExportJSON}
                        onExportExcel={handleExportExcel}
                        onExportPdf={() => setIsExportModalOpen(true)}
                    />
                </div>

                <div className="mt-4 w-full flex justify-center">
                    <div className="w-full max-w-6xl">
                    {activeSection === 'kpis' && (
                         <div className="animate-in zoom-in-95 duration-500 py-8">
                            <CostSheetSummary
                                totalPrice={calculatedValues['14']?.total || 0}
                                utility={calculatedValues['13']?.total || 0}
                                totalCost={calculatedValues['12']?.total || 0}
                                telemetry={calculatedValues}
                                header={calculatedHeader}
                                healthPercent={healthPercent}
                            />
                            {/* CostSheetFormulaGuide movido al HelpPanel */}
                        </div>
                    )}
                    {activeSection === 'header' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                        </div>
                    )}
                    {(activeSection === 'main' || activeSection === 'all-content' || activeSection === 'expert-content') && (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
                            {(activeSection === 'all-content' || activeSection === 'expert-content') && (
                                <>
                                    <div className="px-8 py-10 mb-12 bg-card rounded-[2.5rem] border border-border shadow-sm">
                                        <h2 className="text-3xl font-black uppercase tracking-tighter italic text-primary flex items-center gap-3">
                                            <ZapIcon className="w-8 h-8" />
                                            Ficha: Vista Consolidada
                                        </h2>
                                        <p className="text-sm font-black uppercase tracking-[0.2em] text-muted-foreground mt-2 pl-1">Todas las Secciones y Anexos</p>
                                    </div>
                                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mb-12">
                                        <CostSheetHeaderEditor header={data?.header || {}} calculatedHeader={calculatedHeader} />
                                    </div>
                                </>
                            )}

                            <LazyRender>
                                {(layoutMode === "grid") ? (
                                    <CostSheetCardView
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={(activeSection === 'all-content' || activeSection === 'expert-content') ? 'all' : activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                ) : (
                                    <CostSheetInteractiveTable
                                        sections={data?.sections || []}
                                        groupedSections={groupedSections}
                                        calculatedValues={calculatedValues}
                                        annexes={data?.annexes || []}
                                        activeSubSectionId={(activeSection === 'all-content' || activeSection === 'expert-content') ? 'all' : activeSubSectionId}
                                        setActiveSubSectionId={setActiveSubSectionId}
                                        onOpenSections={() => setIsSectionsSidebarOpen(true)}
                                    />
                                )}
                            </LazyRender>
                        </div>
                    )}
                    {isAnnexActive && (
                        <div className="space-y-12">
                            {(activeSection === 'all-annexes' || activeSection === 'all-content' || activeSection === 'expert-content') ? (
                                (data?.annexes || []).map((annex: any) => (
                                    <LazyRender key={annex.id}>
                                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                                            <div className="flex items-center gap-4 px-6 py-4 bg-card rounded-2xl border border-border shadow-sm border-l-4 border-l-primary">
                                                <h3 className="text-xl font-black uppercase tracking-tighter italic text-foreground">Anexo {annex.id}: {annex.title}</h3>
                                            </div>
                                            <CostSheetAnnexEditor
                                                activeAnnexId={annex.id}
                                                layoutMode={layoutMode}
                                                calculatedAnnexes={calculatedAnnexes}
                                            />
                                        </div>
                                    </LazyRender>
                                ))
                            ) : (
                                <CostSheetAnnexEditor
                                    activeAnnexId={activeSection}
                                    layoutMode={layoutMode}
                                    calculatedAnnexes={calculatedAnnexes}
                                />
                            )}
                            {(activeSection === 'all-content' || activeSection === 'expert-content') && (
                                <div className="mt-12 pt-12 border-t border-border/50 animate-in fade-in duration-700">
                                    <CostSheetSignatureEditor />
                                </div>
                            )}
                        </div>
                    )}
                    {activeSection === 'signature' && <CostSheetSignatureEditor />}
                    {activeSection === 'audit' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetAuditView
                                data={data}
                                calculatedValues={calculatedValues}
                                calculatedHeader={calculatedHeader}
                                audits={audits}
                                validations={validations}
                            />
                        </div>
                    )}
                    {activeSection === "ai-chat" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 min-h-[600px] flex flex-col">
                             <div className="flex-1">
                                <DarianEditor sheetData={data} isFullView={true} onSectionChange={setActiveSection} />
                             </div>
                        </div>
                    )}
                    {activeSection === "templates" && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <CostSheetTemplateExplorer />
                        </div>
                    )}
                    {activeSection === 'massive-gen' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                             <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} initialMapping={quickModeMapping} />
                        </div>
                    )}
                    {activeSection === 'steel-calculator' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <SteelStructureCalculator />
                        </div>
                    )}
                    </div>
                </div>
            </>
          )}

          {viewMode === 'assisted' && (
              <CostSheetWizard
                data={data}
                calculatedValues={calculatedValues}
                calculatedHeader={calculatedHeader}
              />
          )}

          {viewMode === 'reading' && (
               <CostSheetNarrative
                 data={data}
                 calculatedValues={calculatedValues}
                 calculatedHeader={calculatedHeader}
               />
          )}

          {viewMode === 'quick' && ( isQuickModeGenerating ? ( <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto"> <div className="mb-4 flex justify-start"> <Button variant="ghost" size="sm" onClick={() => setIsQuickModeGenerating(false)} className="rounded-xl font-bold uppercase tracking-widest text-[10px] text-muted-foreground hover:text-primary"> <ArrowLeft className="w-3.5 h-3.5 mr-2" /> Volver a Lista </Button> </div> <CostSheetMassiveGenerator isSection={true} initialProducts={quickModeProducts || undefined} initialMapping={quickModeMapping} onClose={() => setIsQuickModeGenerating(false)} autoStart={true} isQuickAction={true} /> </div> ) : (
              <CostSheetQuickMode onGenerate={handleQuickGenerate} mapping={quickModeMapping} onMappingChange={setQuickModeMapping} /> )
          )}
        </div>
      ) : (
        <div className="animate-in zoom-in-95 duration-500">
            <div className="max-w-5xl mx-auto mb-6 flex flex-col sm:flex-row justify-between items-center bg-muted/30 p-3 rounded-2xl gap-3">
                <div className="flex items-center gap-3 px-2">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground">Vista de Previsualización</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setIsEditing(true); setViewMode('expert'); handleSetViewMode('expert'); }}
                    className="w-full sm:w-auto text-primary hover:bg-primary/10 font-bold uppercase tracking-widest text-xs h-9 px-4 rounded-xl"
                >
                    <Edit className="w-3.5 h-3.5 mr-2" />
                    Ir al Editor (Modo Todo)
                </Button>
            </div>
            <div className="w-full flex justify-center">
                <div className="w-full max-w-6xl">
                    <CostSheetPreview
                        data={data}
                        calculatedValues={calculatedValues}
                        calculatedAnnexes={calculatedAnnexes}
                        calculatedHeader={calculatedHeader}
                    />
                </div>
            </div>
        </div>
      )}

      <UpgradeModal isOpen={isUpgradeModalOpen} onClose={() => setIsUpgradeModalOpen(false)} action="exportar" />
      <BaseModal
        open={confirmation.isOpen}
        onOpenChange={(open) => setConfirmation({ ...confirmation, isOpen: open })}
        title={confirmation.title}
        footer={
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              onClick={() => setConfirmation({ ...confirmation, isOpen: false })}
              className="flex-1 sm:flex-none"
            >
              Cancelar
            </Button>
            <Button
              variant={confirmation.variant === 'destructive' ? 'destructive' : 'default'}
              onClick={() => {
                confirmation.onConfirm();
                setConfirmation({ ...confirmation, isOpen: false });
              }}
              className="flex-1 sm:flex-none"
            >
              Confirmar
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{confirmation.message}</p>
      </BaseModal>
    </div>
  );
};

export default CostSheetView;
