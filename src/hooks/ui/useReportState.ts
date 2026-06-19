/**
 * useReportState — Centralized state management for the Generador de Reportes module.
 *
 * Replaces multiple useState calls in ReportsView.tsx with a single useReducer,
 * eliminating unnecessary re-renders when unrelated state changes occur.
 * All handlers are memoized with useCallback for stable references passed to children.
 *
 * Phase 3 items: 3.1 (useReducer), 3.2 (unified data access via reportService),
 * 3.6 (useCallback/useMemo for handlers and derived state).
 */

import { useReducer, useCallback, useMemo, useRef } from 'react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import type { ReportDefinition, ReportType } from '@/types';
import { COLUMN_LABELS } from '@/contracts/reports';
import { useReportValidation } from './useReportValidation';

// ── Types ──

export interface ReportProgress {
  percentage: number;
  stage: string;
}

export interface ExportProgress {
  fetched: number;
  total: number;
}

interface ReportState {
  config: Partial<ReportDefinition>;
  isSaving: boolean;
  isGenerating: boolean;
  generateProgress: ReportProgress;
  isExportingExcel: boolean;
  exportProgress: ExportProgress | null;
  isAuditModalOpen: boolean;
  isTemplatesModalOpen: boolean;
  isScheduleModalOpen: boolean;
  isHistoryModalOpen: boolean;
  isShareModalOpen: boolean;
}

type ReportAction =
  | { type: 'SET_CONFIG'; payload: Partial<ReportDefinition> }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_GENERATE_PROGRESS'; payload: ReportProgress }
  | { type: 'SET_EXPORTING'; payload: boolean }
  | { type: 'SET_EXPORT_PROGRESS'; payload: ExportProgress | null }
  | { type: 'SET_AUDIT_MODAL'; payload: boolean }
  | { type: 'SET_TEMPLATES_MODAL'; payload: boolean }
  | { type: 'SET_SCHEDULE_MODAL'; payload: boolean }
  | { type: 'SET_HISTORY_MODAL'; payload: boolean }
  | { type: 'SET_SHARE_MODAL'; payload: boolean }
  | { type: 'RESET_GENERATE' }
  | { type: 'RESET_EXPORT' };

// ── Initial State ──

// Audit-Fix #1: default date_range al mes actual (primer día → hoy).
// Antes era { from: '', to: '' } lo que obligaba al usuario a seleccionar
// fechas manualmente cada vez que abría el generador. Ahora se pre-llena
// con el mes actual en formato YYYY-MM-DD (compatible con <input type="date">).
function getCurrentMonthRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const firstDay = new Date(year, month, 1);
  const today = now;
  const formatDate = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  return { from: formatDate(firstDay), to: formatDate(today) };
}

const INITIAL_CONFIG: Partial<ReportDefinition> = {
  name: 'Nuevo Reporte',
  type: 'sales',
  filters: {},
  date_range: getCurrentMonthRange(),
  columns: ['id', 'created_at', 'total_amount', 'status', 'payment_method'],
  layout: { orientation: 'portrait', format: 'a4' },
};

const INITIAL_STATE: ReportState = {
  config: INITIAL_CONFIG,
  isSaving: false,
  isGenerating: false,
  generateProgress: { percentage: 0, stage: '' },
  isExportingExcel: false,
  exportProgress: null,
  isAuditModalOpen: false,
  isTemplatesModalOpen: false,
  isScheduleModalOpen: false,
  isHistoryModalOpen: false,
  isShareModalOpen: false,
};

// ── Reducer ──

function reportReducer(state: ReportState, action: ReportAction): ReportState {
  switch (action.type) {
    case 'SET_CONFIG':
      return { ...state, config: { ...state.config, ...action.payload } };
    case 'SET_SAVING':
      return { ...state, isSaving: action.payload };
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.payload };
    case 'SET_GENERATE_PROGRESS':
      return { ...state, generateProgress: action.payload };
    case 'SET_EXPORTING':
      return { ...state, isExportingExcel: action.payload };
    case 'SET_EXPORT_PROGRESS':
      return { ...state, exportProgress: action.payload };
    case 'SET_AUDIT_MODAL':
      return { ...state, isAuditModalOpen: action.payload };
    case 'SET_TEMPLATES_MODAL':
      return { ...state, isTemplatesModalOpen: action.payload };
    case 'SET_SCHEDULE_MODAL':
      return { ...state, isScheduleModalOpen: action.payload };
    case 'SET_HISTORY_MODAL':
      return { ...state, isHistoryModalOpen: action.payload };
    case 'SET_SHARE_MODAL':
      return { ...state, isShareModalOpen: action.payload };
    case 'RESET_GENERATE':
      return {
        ...state,
        isGenerating: false,
        generateProgress: { percentage: 0, stage: '' },
      };
    case 'RESET_EXPORT':
      return {
        ...state,
        isExportingExcel: false,
        exportProgress: null,
      };
    default:
      return state;
  }
}

// ── Hook ──

export interface UseReportStateReturn {
  // State
  config: Partial<ReportDefinition>;
  isSaving: boolean;
  isGenerating: boolean;
  generateProgress: ReportProgress;
  isExportingExcel: boolean;
  exportProgress: ExportProgress | null;
  isAuditModalOpen: boolean;
  isTemplatesModalOpen: boolean;
  isScheduleModalOpen: boolean;
  isHistoryModalOpen: boolean;
  isShareModalOpen: boolean;

  // Derived state (memoized)
  isPlaceholderType: boolean;
  placeholderMessage: string | null;

  // Validation
  validateConfig: (action: 'generate' | 'export') => string | null;
  isInvalidDateRange: boolean;

  // Actions (memoized)
  setConfig: (config: Partial<ReportDefinition>) => void;
  loadTemplate: (template: ReportDefinition) => void;
  handleSave: () => Promise<void>;
  handleGenerate: () => Promise<void>;
  handleExportExcel: () => Promise<void>;
  openAuditModal: () => void;
  closeAuditModal: () => void;
  openTemplatesModal: () => void;
  closeTemplatesModal: () => void;
  openScheduleModal: () => void;
  closeScheduleModal: () => void;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  openShareModal: () => void;
  closeShareModal: () => void;
}

/** Placeholder types that return empty data in the API */
const API_PLACEHOLDER_TYPES: Record<string, string> = {
  kardex: 'Kardex — El generador PDF devuelve datos vacios. La vista previa y exportacion Excel funcionan correctamente.',
  audit: 'Auditoria — El generador PDF devuelve datos vacios. La vista previa y exportacion Excel funcionan correctamente.',
};

export function useReportState(): UseReportStateReturn {
  const { user } = useAuthStore();
  const [state, dispatch] = useReducer(reportReducer, INITIAL_STATE);

  // ── Shared validation ──
  const { validate: validateConfig, isInvalidDateRange } = useReportValidation(state.config);

  // ── Derived state (memoized) ──
  const isPlaceholderType = state.config.type
    ? state.config.type in API_PLACEHOLDER_TYPES
    : false;

  const placeholderMessage = state.config.type
    ? (API_PLACEHOLDER_TYPES as Record<string, string>)[state.config.type] ?? null
    : null;

  // ── Actions (memoized with useCallback) ──

  const setConfig = useCallback((updates: Partial<ReportDefinition>) => {
    dispatch({ type: 'SET_CONFIG', payload: updates });
  }, []);

  const handleSave = useCallback(async () => {
    const err = validateConfig('generate');
    if (err) { toast.error(err); return; }

    dispatch({ type: 'SET_SAVING', payload: true });
    try {
      const { reportService } = await import('@/services/report-service');
      await reportService.saveDefinition({
        ...INITIAL_CONFIG,
        ...state.config,
        store_id: user?.activeStoreId,
        created_by: user?.id,
      });
      toast.success('Plantilla guardada exitosamente');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al guardar plantilla: ${msg}`);
    } finally {
      dispatch({ type: 'SET_SAVING', payload: false });
    }
  }, [validateConfig, state.config, user?.activeStoreId, user?.id]);

  const handleGenerate = useCallback(async () => {
    const err = validateConfig('generate');
    if (err) { toast.error(err); return; }

    if (isPlaceholderType && placeholderMessage) {
      toast.warning(placeholderMessage, { duration: 6000 });
    }

    dispatch({ type: 'SET_GENERATING', payload: true });
    dispatch({ type: 'SET_GENERATE_PROGRESS', payload: { percentage: 0, stage: 'Verificando registros...' } });

    // Use ref for progress timer to avoid stale closure with dispatch
    let progressRef = { value: 0 };

    try {
      // Pre-check: count records before generating
      dispatch({ type: 'SET_GENERATE_PROGRESS', payload: { percentage: 5, stage: 'Contando registros...' } });
      const { reportService } = await import('@/services/report-service');
      const previewCount = await reportService.fetchReportData(
        state.config.type as ReportType,
        state.config.filters,
        state.config.date_range,
        user?.activeStoreId ?? '',
        1
      );

      // Simulated progress stages for UX feedback
      const progressTimer = setInterval(() => {
        if (progressRef.value >= 85) return;
        progressRef.value += Math.random() * 12;
        dispatch({ type: 'SET_GENERATE_PROGRESS', payload: { percentage: progressRef.value, stage: '' } });
      }, 400);

      dispatch({
        type: 'SET_GENERATE_PROGRESS',
        payload: { percentage: 20, stage: `Procesando ${previewCount.length > 0 ? 'datos...' : 'sin datos'}` },
      });
      setTimeout(() => {
        dispatch({
          type: 'SET_GENERATE_PROGRESS',
          payload: { percentage: 40, stage: 'Generando documento PDF...' },
        });
      }, 1200);

      // 3.2: Use reportService.generateReport instead of raw fetch
      const result = await reportService.generateReport(
        {
          ...state.config,
          store_id: user?.activeStoreId,
          name: state.config.name || `Reporte ${state.config.type}`,
        },
        useAuthStore.getState().token || ''
      );

      clearInterval(progressTimer);
      dispatch({ type: 'SET_GENERATE_PROGRESS', payload: { percentage: 95, stage: 'Finalizando...' } });

      dispatch({ type: 'SET_GENERATE_PROGRESS', payload: { percentage: 100, stage: 'Completado' } });

      toast.success('Reporte generado exitosamente');
      window.open(result.url, '_blank');

      // 4.3: Log execution run to report_runs table (fire-and-forget)
      reportService.logRun({
        store_id: user?.activeStoreId || '',
        executed_by: user?.id || '',
        parameters_snapshot: {
          ...state.config,
          store_id: user?.activeStoreId,
          name: state.config.name || `Reporte ${state.config.type}`,
        },
        status: 'completed',
        file_url: result.url || null,
      }).catch(() => { /* silent: logging failure should not affect UX */ });
    } catch (error: unknown) {
      dispatch({ type: 'SET_GENERATE_PROGRESS', payload: { percentage: 0, stage: '' } });
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al generar reporte: ${msg}`);

      // 4.3: Log failed execution (fire-and-forget)
      const { reportService: reportSvc } = await import('@/services/report-service');
      reportSvc.logRun({
        store_id: user?.activeStoreId || '',
        executed_by: user?.id || '',
        parameters_snapshot: {
          ...state.config,
          store_id: user?.activeStoreId,
          name: state.config.name || `Reporte ${state.config.type}`,
        },
        status: 'failed',
        error_message: msg,
      }).catch(() => { /* silent */ });
    } finally {
      setTimeout(() => dispatch({ type: 'RESET_GENERATE' }), 1200);
    }
  }, [validateConfig, isPlaceholderType, placeholderMessage, state.config, user?.activeStoreId]);

  const handleExportExcel = useCallback(async () => {
    const err = validateConfig('export');
    if (err) { toast.error(err); return; }

    dispatch({ type: 'SET_EXPORTING', payload: true });
    dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
    try {
      const { reportService } = await import('@/services/report-service');
      const { exportToExcel } = await import('@/services/export-service');

      const data = await reportService.fetchReportDataPaginated(
        state.config.type as ReportType,
        state.config.filters,
        state.config.date_range,
        user?.activeStoreId ?? '',
        {
          chunkSize: 1000,
          onProgress: (fetched, total) => {
            dispatch({ type: 'SET_EXPORT_PROGRESS', payload: { fetched, total } });
          },
        }
      );

      if (!data || data.length === 0) {
        toast.error('No hay datos disponibles para exportar con los filtros seleccionados');
        return;
      }

      await exportToExcel(
        data,
        state.config.columns ?? [],
        COLUMN_LABELS,
        state.config.name || `Reporte_${state.config.type}_${new Date().toISOString().split('T')[0]}`
      );

      toast.success(`${data.length.toLocaleString('es-CU')} registros exportados exitosamente`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al exportar Excel: ${msg}`);
    } finally {
      dispatch({ type: 'RESET_EXPORT' });
    }
  }, [validateConfig, state.config, user?.activeStoreId]);

  const loadTemplate = useCallback((template: ReportDefinition) => {
    dispatch({
      type: 'SET_CONFIG',
      payload: {
        name: template.name,
        type: template.type,
        filters: template.filters || {},
        date_range: template.date_range || { from: '', to: '' },
        columns: template.columns || [],
        format: template.format,
        layout: template.layout,
      },
    });
    toast.success(`Plantilla "${template.name}" cargada`);
  }, []);

  const openAuditModal = useCallback(() => {
    dispatch({ type: 'SET_AUDIT_MODAL', payload: true });
  }, []);

  const closeAuditModal = useCallback(() => {
    dispatch({ type: 'SET_AUDIT_MODAL', payload: false });
  }, []);

  const openTemplatesModal = useCallback(() => {
    dispatch({ type: 'SET_TEMPLATES_MODAL', payload: true });
  }, []);

  const closeTemplatesModal = useCallback(() => {
    dispatch({ type: 'SET_TEMPLATES_MODAL', payload: false });
  }, []);

  const openScheduleModal = useCallback(() => {
    dispatch({ type: 'SET_SCHEDULE_MODAL', payload: true });
  }, []);

  const closeScheduleModal = useCallback(() => {
    dispatch({ type: 'SET_SCHEDULE_MODAL', payload: false });
  }, []);

  const openHistoryModal = useCallback(() => {
    dispatch({ type: 'SET_HISTORY_MODAL', payload: true });
  }, []);

  const closeHistoryModal = useCallback(() => {
    dispatch({ type: 'SET_HISTORY_MODAL', payload: false });
  }, []);

  const openShareModal = useCallback(() => {
    dispatch({ type: 'SET_SHARE_MODAL', payload: true });
  }, []);

  const closeShareModal = useCallback(() => {
    dispatch({ type: 'SET_SHARE_MODAL', payload: false });
  }, []);

  return {
    // State
    config: state.config,
    isSaving: state.isSaving,
    isGenerating: state.isGenerating,
    generateProgress: state.generateProgress,
    isExportingExcel: state.isExportingExcel,
    exportProgress: state.exportProgress,
    isAuditModalOpen: state.isAuditModalOpen,
    isTemplatesModalOpen: state.isTemplatesModalOpen,
    isScheduleModalOpen: state.isScheduleModalOpen,
    isHistoryModalOpen: state.isHistoryModalOpen,
    isShareModalOpen: state.isShareModalOpen,
    // Derived
    isPlaceholderType,
    placeholderMessage,
    // Validation
    validateConfig,
    isInvalidDateRange,
    // Actions
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
  };
}
