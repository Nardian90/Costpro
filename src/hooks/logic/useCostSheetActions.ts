'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { useUIStore } from '@/store';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import { usageService } from '@/services/usage-service';
import { exportToCSV } from '@/services/export-service';
import { ExportOptions } from '@/components/views/terminal/views/cost_sheet/CostSheetExportModal';
import { CostSheetViewMode } from '@/components/views/terminal/views/cost_sheet/CostSheetModeDropdown';
import {
  ArrowLeft, Eye, Edit, FileText, Download, FileSpreadsheet,
  Upload, Save, BarChart3, Activity, MoreVertical, Calculator
} from 'lucide-react';
import type { CostSheetViewState } from './useCostSheetViewState';

// ── Types ────────────────────────────────────────────────────────────────

interface ConfirmationState {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive';
}

interface UseCostSheetActionsParams {
  data: any;
  calculatedValues: any;
  calculatedHeader: any;
  calculatedAnnexes: any;
  calculationResult: any;
  isBlocked: boolean;
  deepValidationErrors: any[];
  viewState: CostSheetViewState;
}

// ── Hook ─────────────────────────────────────────────────────────────────

export function useCostSheetActions({
  data,
  calculatedValues,
  calculatedHeader,
  calculatedAnnexes,
  calculationResult,
  isBlocked,
  deepValidationErrors,
  viewState
}: UseCostSheetActionsParams) {
  const { setSheet, loadExample } = useCostSheetStore();
  const { user, token } = useAuthStore();
  const {
    activeCostSection: activeSection,
    setActiveCostSection: setActiveSection,
    setCurrentView,
    setIsCalculatorOpen
  } = useUIStore();

  // Destructure view state
  const {
    groupedSections,
    activeSubSectionId,
    setActiveSubSectionId,
    isEditing,
    setIsEditing,
    viewMode,
    setViewMode
  } = viewState;

  // ── Confirmation State ──────────────────────────────────────────────

  const [confirmation, setConfirmation] = useState<ConfirmationState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    variant: 'default'
  });

  const askConfirmation = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      variant: 'default' | 'destructive' = 'default'
    ) => {
      setConfirmation({ isOpen: true, title, message, onConfirm, variant });
    },
    []
  );

  // ── Panel / Modal States ────────────────────────────────────────────

  const [isActionsPanelOpen, setIsActionsPanelOpen] = useState(false);
  const [isHelpPanelOpen, setIsHelpPanelOpen] = useState(false);
  const [isSectionsSidebarOpen, setIsSectionsSidebarOpen] = useState(false);
  const [isAnnexesSidebarOpen, setIsAnnexesSidebarOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  // ── Quick Mode State ────────────────────────────────────────────────

  const [quickModeMapping, setQuickModeMapping] = useState({
    targetColumn: 'sale_price' as 'sale_price' | 'total_cost',
    modificationRow: '13.1'
  });
  const [quickModeProducts, setQuickModeProducts] = React.useState<any[] | null>(null);
  const [isQuickModeGenerating, setIsQuickModeGenerating] = React.useState(false);

  // ── Navigation Handlers ─────────────────────────────────────────────

  const handleSetActiveSection = useCallback(
    (id: string) => {
      setActiveSection(id);
      if (id === 'main' && !activeSubSectionId) {
        const group13 = groupedSections.find((g) => g.id === 'group-1-3');
        if (group13) {
          setActiveSubSectionId('group-1-3');
        }
      }
    },
    [setActiveSection, activeSubSectionId, groupedSections, setActiveSubSectionId]
  );

  const handleSetViewMode = useCallback(
    (mode: CostSheetViewMode) => {
      if (mode === 'preview') {
        setIsEditing(false);
      } else {
        setIsEditing(true);
      }
      if (mode === 'audit') { setActiveSection('audit'); setViewMode('expert'); }
      else if (mode === 'kpis') { setActiveSection('kpis'); setViewMode('expert'); }
      else if (mode === 'expert') { setActiveSection('expert-content'); setViewMode('expert'); }
      else { setViewMode(mode); }
    },
    [setActiveSection, setIsEditing, setViewMode]
  );

  // ── Section Routing Effect ──────────────────────────────────────────

  useEffect(() => {
    if (activeSection === 'view-kpis') { handleSetViewMode('kpis'); }
    else if (activeSection === 'view-expert') { handleSetViewMode('expert'); }
    else if (activeSection === 'view-assisted') { handleSetViewMode('assisted'); }
    else if (activeSection === 'view-reading') { handleSetViewMode('reading'); }
    else if (activeSection === 'gen-quick') { handleSetViewMode('quick'); }
    else if (activeSection === 'gen-expert') { setIsQuickModeGenerating(true); setViewMode('expert'); }
    else if (activeSection === 'tool-import') { handleImportJSON(); setActiveSection('expert-content'); }
    else if (activeSection === 'tool-save') { handleExportJSON(); setActiveSection('expert-content'); }
    else if (activeSection === 'tool-export-excel') { handleExportExcel(); setActiveSection('expert-content'); }
    else if (activeSection === 'tool-export-pdf') { setIsExportModalOpen(true); setActiveSection('expert-content'); }
    else if (activeSection === 'res-help') { setIsHelpPanelOpen(true); setActiveSection('expert-content'); }
    else if (activeSection === 'res-system-help') { setCurrentView('help'); setActiveSection('expert-content'); }
    else if (activeSection === 'res-academy') { setCurrentView('academy'); setActiveSection('expert-content'); }
    else if (activeSection === 'open-sections') { setIsSectionsSidebarOpen(true); setActiveSection('expert-content'); }
    else if (activeSection === 'open-annexes') { setIsAnnexesSidebarOpen(true); setActiveSection('expert-content'); }
  }, [activeSection]);
  // NOTE: Intentionally minimal deps — handlers are recreated on each render
  // matching the original component's behavior (not wrapped in useCallback)

  // ── Export / Import Handlers ────────────────────────────────────────

  const handleExportPDF = useCallback(
    async (options: ExportOptions) => {
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
        toast.warning('Exportando con advertencias: La ficha contiene errores críticos de validación.');
      }
      const toastId = toast.loading('Generando PDF profesional... por favor espere.');

      const downloadPDF = async (opts: ExportOptions, filename: string) => {
        if (!calculationResult) return false;
        try {
          const response = await fetch('/api/cost-sheets/export-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({
              ...calculationResult,
              sections: data.sections,
              signature: data.signature,
              notes: data.footer || data.metadata?.notes,
              exportOptions: opts
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

          // Try to get error message from response
          let errorMsg = `HTTP ${response.status}`;
          try {
            const errBody = await response.json();
            errorMsg = errBody.error || errorMsg;
          } catch (_e) { /* ignore parse error */ }
          console.error('PDF export API error:', errorMsg);
          return false;
        } catch (fetchError: any) {
          console.error('PDF export fetch error:', fetchError);
          return false;
        }
      };

      try {
        // Use the declarative engine export
        if (!calculationResult) {
          toast.error('No hay datos de cálculo disponibles para exportar. Recargue la ficha e intente de nuevo.', { id: toastId });
          return;
        }

        const h = calculationResult.metadata?.header || data?.header || {};
        const evalCode = h.code || 'export';
        const evalName = h.name || 'ficha';
        const safeBaseName = `${evalCode}-${evalName}`.replace(/[\\/?%*:|"<>]/g, '-');

        if (options.consolidated) {
          const success = await downloadPDF(options, `ficha-consolidada-${safeBaseName}.pdf`);
          if (success) {
            toast.success('PDF consolidado generado con éxito', { id: toastId });
            if (user) await usageService.trackUsage(user.id, 'fc_export', user.plan, user.role);
          } else {
            throw new Error('El servidor no pudo generar el PDF. Verifique que los datos sean válidos.');
          }
          return;
        } else {
          // Separate export
          let count = 0;
          let hadError = false;

          if (options.includeFC) {
            const ok = await downloadPDF({ ...options, includeAudit: false, includeAnnexes: [] }, `ficha-${safeBaseName}.pdf`);
            if (!ok) { hadError = true; }
            count++;
          }

          for (const annexId of options.includeAnnexes || []) {
            const ok = await downloadPDF({ ...options, includeFC: false, includeAudit: false, includeAnnexes: [annexId] }, `anexo-${annexId}-${safeBaseName}.pdf`);
            if (!ok) { hadError = true; }
            count++;
          }

          if (options.includeAudit) {
            const ok = await downloadPDF({ ...options, includeFC: false, includeAnnexes: [] }, `auditoria-${safeBaseName}.pdf`);
            if (!ok) { hadError = true; }
            count++;
          }

          if (hadError) {
            toast.warning('Algunos PDFs no se pudieron generar. Revise los datos e intente de nuevo.', { id: toastId });
          } else {
            toast.success(`${count} PDFs generados con éxito`, { id: toastId });
            if (user) await usageService.trackUsage(user.id, 'fc_export', user.plan, user.role);
          }
          return;
        }
      } catch (error: any) {
        console.error('PDF Export error:', error);
        toast.error(`Error al generar el PDF: ${error.message}`, { id: toastId });
      }
    },
    [calculationResult, data, calculatedValues, calculatedAnnexes, isBlocked, user]
  );

  const handleExportExcel = useCallback(() => {
    if (isBlocked) {
      toast.warning('Exportando con advertencias: La ficha contiene errores críticos de validación.');
    }
    const fileName = data?.header?.name
      ? `Ficha de Costo - ${data.header.name}`
      : 'Ficha de Costo';
    exportToCSV(data, calculatedValues, fileName);
  }, [data, calculatedValues, isBlocked]);

  const handleImportJSON = useCallback(() => {
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
          toast.success('Ficha cargada correctamente');
        } catch (err) {
          toast.error('Error al cargar el archivo JSON');
        }
      }
    };
    input.click();
  }, [setSheet]);

  const handleExportJSON = useCallback(() => {
    if (isBlocked) {
      toast.warning('Exportando con advertencias: La ficha contiene errores críticos de validación.');
    }

    // Export data maintaining formula integrity in the header
    const exportData = {
      ...data,
      metadata: {
        ...data?.metadata,
        exportedAt: new Date().toISOString(),
        integrity: 'full',
        calculationSnapshot: {
          header: calculatedHeader,
          values: calculatedValues
        }
      }
    };

    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);

    // Use calculated code for filename if available
    const filename = `ficha-${calculatedHeader?.code || data?.header?.code || 'export'}.json`;
    downloadAnchorNode.setAttribute('download', filename);

    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success('JSON exportado correctamente');
  }, [data, calculatedHeader, isBlocked]);

  // ── Quick Generate Handler ──────────────────────────────────────────

  const handleQuickGenerate = useCallback(async (rows: any[]) => {
    if (user) {
      const { allowed } = await usageService.checkQuota(user.id, 'fc_create', user.plan, user.role);
      if (!allowed) {
        setIsUpgradeModalOpen(true);
        return;
      }
    }

    if (user) await usageService.trackUsage(user.id, 'fc_create', user.plan, user.role);
    setQuickModeProducts(
      rows.map((r) => ({
        name: r.product,
        sku: `QM-${r.id}`,
        unit_of_measure: r.um,
        price: r.cost,
        quantity: r.quantity,
        sale_price: r.sale_price
      }))
    );
    setIsQuickModeGenerating(true);
    toast.info(`Iniciando generación para ${rows.length} productos`);
  }, [user]);

  // ── Sidebar Open Helpers ────────────────────────────────────────────

  const onOpenAnnexes = useCallback(() => setIsAnnexesSidebarOpen(true), []);
  const onOpenSections = useCallback(() => setIsSectionsSidebarOpen(true), []);

  // ── Action List Definitions ─────────────────────────────────────────

  const allActions = useMemo(
    () => [
      {
        id: 'go-back',
        label: 'Volver al Inicio',
        icon: ArrowLeft,
        onClick: () => setCurrentView('dashboard'),
        variant: 'outline' as const
      },
      {
        id: 'toggle-mode',
        label: isEditing ? 'Previsualizar' : 'Seguir Editando',
        icon: isEditing ? Eye : Edit,
        onClick: () => {
          if (isEditing && isBlocked) {
            toast.warning('La ficha tiene errores críticos, la visualización puede ser inconsistente.');
          }
          setIsEditing(!isEditing);
        },
        variant: 'primary' as const
      },
      {
        id: 'audit',
        label: 'Auditoría',
        icon: Activity,
        onClick: () => {
          setActiveSection('audit');
          setIsActionsPanelOpen(false);
        },
        variant: 'outline' as const
      },
      {
        id: 'load-example',
        label: 'Ejemplo',
        icon: FileText,
        onClick: () =>
          askConfirmation(
            'Cargar Ejemplo',
            '¿Está seguro de que desea cargar el ejemplo? Esto reemplazará todos los datos actuales de la ficha y no se podrá deshacer.',
            loadExample,
            'destructive'
          ),
        variant: 'outline' as const
      },
      { id: 'import-json', label: 'Importar', icon: Upload, onClick: handleImportJSON, variant: 'outline' as const },
      { id: 'export-json', label: 'Guardar', icon: Save, onClick: handleExportJSON, variant: 'outline' as const, disabled: false },
      { id: 'export-excel', label: 'Excel', icon: FileSpreadsheet, onClick: handleExportExcel, variant: (isBlocked ? 'outline' : 'primary') as any, disabled: false },
      { id: 'export-pdf', label: 'PDF', icon: Download, onClick: () => setIsExportModalOpen(true), variant: (isBlocked ? 'outline' : 'success') as any, disabled: false },
      {
        id: 'massive-gen',
        label: 'Gen. Masiva',
        icon: FileText,
        onClick: () => {
          setIsQuickModeGenerating(true);
          setIsActionsPanelOpen(false);
        },
        variant: 'outline' as const
      },
      {
        id: 'calculator',
        label: 'Calculadora',
        icon: Calculator,
        onClick: () => setIsCalculatorOpen(true),
        variant: 'outline' as const
      }
    ],
    [
      isEditing, loadExample, handleImportJSON, handleExportJSON,
      handleExportExcel, handleExportPDF, isBlocked, setIsCalculatorOpen, data
    ]
  );

  const mainActions = useMemo(
    () => [
      ...allActions.filter((a) => ['toggle-mode', 'kpis-header'].includes(a.id)),
      {
        id: 'more-actions',
        label: 'Más Acciones',
        icon: MoreVertical,
        onClick: () => setIsActionsPanelOpen(true),
        variant: 'outline' as const
      }
    ],
    [allActions]
  );

  const secondaryActions = useMemo(() => allActions, [allActions]);

  // ── Return ──────────────────────────────────────────────────────────

  return {
    // Confirmation
    confirmation,
    setConfirmation,
    askConfirmation,

    // Navigation
    setActiveSection,
    setCurrentView,
    handleSetActiveSection,
    handleSetViewMode,

    // Export / Import
    handleExportPDF,
    handleExportExcel,
    handleImportJSON,
    handleExportJSON,

    // Quick mode
    handleQuickGenerate,
    quickModeMapping,
    setQuickModeMapping,
    quickModeProducts,
    setQuickModeProducts,
    isQuickModeGenerating,
    setIsQuickModeGenerating,

    // Panel states
    isActionsPanelOpen,
    setIsActionsPanelOpen,
    isHelpPanelOpen,
    setIsHelpPanelOpen,
    isSectionsSidebarOpen,
    setIsSectionsSidebarOpen,
    isAnnexesSidebarOpen,
    setIsAnnexesSidebarOpen,
    isExportModalOpen,
    setIsExportModalOpen,
    isUpgradeModalOpen,
    setIsUpgradeModalOpen,

    // Sidebar helpers
    onOpenAnnexes,
    onOpenSections,

    // Action lists
    allActions,
    mainActions,
    secondaryActions
  };
}
