
'use client';

import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { FileText, Play, Save, AlertTriangle, FileSpreadsheet, History, Construction, FolderOpen, CalendarClock, Share2, ShieldCheck } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { useAuthStore } from '@/store';
import { ReportConfigPanel } from './ReportConfigPanel';
import { ReportPreview } from './ReportPreview';
import { AuditLogsModal } from './AuditLogsModal';
import { ReportTemplatesModal } from './ReportTemplatesModal';
import { ReportScheduleModal } from './ReportScheduleModal';
import { ReportHistoryModal } from './ReportHistoryModal';
import { ReportShareModal } from './ReportShareModal';
import { ReportsActionToolbar, ToolbarAction } from './ReportsActionToolbar';
import { useReportState } from '@/hooks/ui/useReportState';

/**
 * Report types that are fully implemented on the server-side API route.
 */
const API_IMPLEMENTED_TYPES: string[] = [
  'sales',
  'inventory',
  'profit',
  'purchases',
  'cost_sheet',
];

/** Performance warnings per report type (records threshold) */
const PERF_WARNINGS: Record<string, { threshold: number; seconds: number }> = {
  sales: { threshold: 10000, seconds: 30 },
  profit: { threshold: 10000, seconds: 30 },
  inventory: { threshold: 10000, seconds: 20 },
  daily_income: { threshold: 10000, seconds: 30 },
  daily_expenses: { threshold: 1000, seconds: 15 },
  audit: { threshold: 10000, seconds: 25 },
  kardex: { threshold: 1000, seconds: 10 },
  purchases: { threshold: 1000, seconds: 15 },
};

export default function ReportsView() {
  const { user } = useAuthStore();

  // ── Centralized state (useReducer) + memoized handlers ──
  const {
    config,
    isSaving,
    isGenerating,
    generateProgress,
    isExportingExcel,
    exportProgress,
    isAuditModalOpen,
    isTemplatesModalOpen,
    isScheduleModalOpen,
    isHistoryModalOpen,
    isShareModalOpen,
    isPlaceholderType,
    placeholderMessage,
    setConfig,
    loadTemplate,
    handleSave,
    handleGenerate,
    handleExportExcel,
    openAuditModal,
    closeAuditModal,
    openTemplatesModal,
    closeTemplatesModal,
    openScheduleModal,
    closeScheduleModal,
    openHistoryModal,
    closeHistoryModal,
    openShareModal,
    closeShareModal,
  } = useReportState();

  /** Get dynamic performance warning for current type */
  const perfWarning = useMemo(
    () => (config.type ? PERF_WARNINGS[config.type] : null),
    [config.type]
  );

  /** Acciones principales (siempre visibles, prioridad alta). */
  const primaryActions: ToolbarAction[] = useMemo(() => [
    {
      id: 'generate',
      label: isGenerating ? 'Procesando...' : 'Generar',
      icon: isGenerating ? () => <CostProLoader size={16} showText={false} showSubtext={false} /> : Play,
      onClick: handleGenerate,
      disabled: isGenerating,
      variant: 'primary' as const,
      ariaLabel: 'Generar reporte PDF',
    },
    {
      id: 'save',
      label: isSaving ? 'Guardando...' : 'Guardar',
      icon: isSaving ? () => <CostProLoader size={16} showText={false} showSubtext={false} /> : Save,
      onClick: handleSave,
      disabled: isSaving,
      variant: 'outline' as const,
      ariaLabel: 'Guardar plantilla de reporte',
    },
  ], [isGenerating, handleGenerate, isSaving, handleSave]);

  /** Acciones secundarias (pueden ir al overflow "..." si no caben). */
  const secondaryActions: ToolbarAction[] = useMemo(() => [
    {
      id: 'export-excel',
      label: isExportingExcel
        ? (exportProgress ? `${exportProgress.fetched.toLocaleString('es-CU')} regs` : 'Prep...')
        : 'Excel',
      icon: isExportingExcel ? () => <CostProLoader size={16} showText={false} showSubtext={false} /> : FileSpreadsheet,
      onClick: handleExportExcel,
      disabled: isExportingExcel,
      variant: 'outline' as const,
      ariaLabel: 'Exportar a Excel',
    },
    {
      id: 'templates',
      label: 'Plantillas',
      icon: FolderOpen,
      onClick: openTemplatesModal,
      variant: 'outline' as const,
      ariaLabel: 'Cargar plantilla guardada',
    },
    {
      id: 'schedule',
      label: 'Programar',
      icon: CalendarClock,
      onClick: openScheduleModal,
      variant: 'outline' as const,
      ariaLabel: 'Programar reporte automático',
    },
    {
      id: 'share',
      label: 'Compartir',
      icon: Share2,
      onClick: openShareModal,
      variant: 'outline' as const,
      ariaLabel: 'Compartir reporte',
    },
    {
      id: 'history',
      label: 'Historial',
      icon: History,
      onClick: openHistoryModal,
      variant: 'outline' as const,
      ariaLabel: 'Ver historial de reportes generados',
    },
    {
      id: 'audit',
      label: 'Auditoría',
      icon: ShieldCheck,
      onClick: openAuditModal,
      variant: 'outline' as const,
      ariaLabel: 'Ver logs de auditoría',
    },
  ], [isExportingExcel, exportProgress, handleExportExcel, openTemplatesModal, openScheduleModal, openHistoryModal, openShareModal, openAuditModal]);

  return (
    <div className="space-y-4" role="main" aria-label="Generador de Reportes">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="md:hidden">
          <h1 className="text-xl font-black uppercase tracking-tight text-primary flex items-center gap-2">
            <FileText className="w-5 h-5" aria-hidden="true" />
            Reportes
          </h1>
        </div>
        <div className="hidden md:block">
          <h1 className="text-[clamp(1.5rem,6vw,1.875rem)] font-black uppercase tracking-tight text-primary flex items-center gap-3">
            <FileText className="w-8 h-8" aria-hidden="true" />
            Configuración de Reportes
          </h1>
          <p className="text-muted-foreground font-medium">Diseña y genera documentos profesionales para auditoría y gestión.</p>
        </div>
        {/* Audit-Fix #3: toolbar único con overflow "..." en lugar de 2 ActionMenu.
            Elimina el dead space entre las 2 filas anteriores. */}
        <div className="w-full md:max-w-2xl">
          <ReportsActionToolbar
            primaryActions={primaryActions}
            secondaryActions={secondaryActions}
          />
        </div>
      </div>

      {/* ── Modals ── */}
      <AuditLogsModal
        isOpen={isAuditModalOpen}
        onClose={closeAuditModal}
        storeId={config.store_id ?? user?.activeStoreId ?? null}
      />
      <ReportTemplatesModal
        isOpen={isTemplatesModalOpen}
        onClose={closeTemplatesModal}
        storeId={config.store_id ?? user?.activeStoreId ?? null}
        onLoadTemplate={loadTemplate}
      />
      <ReportScheduleModal
        isOpen={isScheduleModalOpen}
        onClose={closeScheduleModal}
        storeId={config.store_id ?? user?.activeStoreId ?? null}
      />
      <ReportHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={closeHistoryModal}
        storeId={config.store_id ?? user?.activeStoreId ?? null}
      />
      <ReportShareModal
        isOpen={isShareModalOpen}
        onClose={closeShareModal}
        reportName={config.name || 'Reporte'}
      />

      {/* ── Placeholder implementation warning ── */}
      {isPlaceholderType && placeholderMessage && (
        <div
          className="p-4 rounded-2xl bg-warning/10 border border-warning/20 flex gap-3 items-start animate-in fade-in slide-in-from-top-2 duration-500"
          role="alert"
          aria-live="polite"
        >
          <Construction className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <p className="text-xs font-black uppercase text-warning tracking-widest">Implementación Parcial</p>
            <p className="text-xs font-medium text-warning/80 leading-relaxed">{placeholderMessage}</p>
          </div>
        </div>
      )}

      {/* ── Progress overlay for PDF generation ── */}
      {isGenerating && generateProgress.percentage > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Generando reporte"
        >
          <Card className="p-6 sm:p-8 rounded-3xl border-primary/20 bg-card shadow-2xl max-w-sm w-full mx-4 space-y-5">
            <div className="space-y-2 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center" aria-hidden="true">
                <FileText className="w-6 h-6 text-primary animate-pulse" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-primary">Generando Reporte</p>
            </div>
            <div className="space-y-2" role="progressbar">
              <div className="h-2.5 w-full rounded-full bg-primary/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500 ease-out"
                  style={{ width: `${Math.min(Math.round(generateProgress.percentage), 100)}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">{generateProgress.stage}</p>
                <p className="text-xs font-black text-primary tabular-nums">{Math.min(Math.round(generateProgress.percentage), 100)}%</p>
              </div>
            </div>
            <p className="text-center text-[10px] font-medium text-muted-foreground/60">
              El documento se abrira automaticamente al completar
            </p>
          </Card>
        </div>
      )}

      {/* ── Progress overlay for Excel export ── */}
      {isExportingExcel && exportProgress && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
          aria-label="Exportando Excel"
        >
          <Card className="p-6 sm:p-8 rounded-3xl border-success/20 bg-card shadow-2xl max-w-sm w-full mx-4 space-y-5">
            <div className="space-y-2 text-center">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center" aria-hidden="true">
                <FileSpreadsheet className="w-6 h-6 text-success animate-pulse" />
              </div>
              <p className="text-sm font-black uppercase tracking-widest text-success">Exportando Excel</p>
            </div>
            <div className="space-y-2" role="progressbar">
              <div className="h-2.5 w-full rounded-full bg-success/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-success transition-all duration-300 ease-out"
                  style={{ width: `${Math.min(Math.round((exportProgress.fetched / exportProgress.total) * 100), 100)}%` }}
                />
              </div>
              <div className="flex justify-between items-center">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">
                  {exportProgress.fetched.toLocaleString('es-CU')} registros
                </p>
                <p className="text-xs font-black text-success tabular-nums">
                  {Math.min(Math.round((exportProgress.fetched / exportProgress.total) * 100), 100)}%
                </p>
              </div>
            </div>
            <p className="text-center text-[10px] font-medium text-muted-foreground/60">
              Obteniendo datos de {exportProgress.total.toLocaleString('es-CU')} registros estimados
            </p>
          </Card>
        </div>
      )}

      {/* ── Main content ── */}
      {/* Audit-Fix #4: gap-8 → gap-6 para reducir espacio muerto entre
          config panel y preview en pantallas grandes. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-4">
          <ReportConfigPanel config={config} setConfig={setConfig} />

          {/* Dynamic performance warning */}
          {perfWarning && (
            <div
              className="p-4 rounded-2xl bg-warning/10 border border-warning/20 flex gap-3 items-start animate-in fade-in slide-in-from-left-4 duration-500"
              role="alert"
              aria-live="polite"
            >
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="text-xs font-black uppercase text-warning tracking-widest">Aviso de Rendimiento</p>
                <p className="text-xs font-medium text-warning/80 leading-relaxed">
                  Reportes de tipo <span className="font-bold uppercase">{config.type}</span> con mas de {perfWarning.threshold.toLocaleString()} registros
                  pueden tardar hasta {perfWarning.seconds} segundos en procesarse.
                  Se recomienda filtrar por periodos mas cortos para mayor agilidad.
                </p>
              </div>
            </div>
          )}

        </div>
        <div className="lg:col-span-2">
          <ReportPreview config={config} />
        </div>
      </div>
    </div>
  );
}
