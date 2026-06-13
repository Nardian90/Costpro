import { useReducer, useCallback } from 'react';
import { useAuthStore } from '@/store';
import { toast } from 'sonner';
import {
  ReportDefinition,
  ReportType,
  ReportRun,
} from '@/types';
import { useReportValidation } from './useReportValidation';
import { COLUMN_LABELS } from '@/contracts/reports';

// ── Types ──

interface ReportState {
  config: Partial<ReportDefinition>;
  isSaving: boolean;
  isGenerating: boolean;
  isExporting: boolean;
  generateProgress: { percentage: number; stage: string } | null;
  exportProgress: { fetched: number; total: number } | null;
  historyModalOpen: boolean;
  scheduleModalOpen: boolean;
  templatesModalOpen: boolean;
  shareModalOpen: boolean;
}

type ReportAction =
  | { type: 'SET_CONFIG'; payload: Partial<ReportDefinition> }
  | { type: 'SET_SAVING'; payload: boolean }
  | { type: 'SET_GENERATING'; payload: boolean }
  | { type: 'SET_EXPORTING'; payload: boolean }
  | { type: 'SET_GENERATE_PROGRESS'; payload: { percentage: number; stage: string } | null }
  | { type: 'SET_EXPORT_PROGRESS'; payload: { fetched: number; total: number } | null }
  | { type: 'OPEN_HISTORY' }
  | { type: 'CLOSE_HISTORY' }
  | { type: 'OPEN_SCHEDULE' }
  | { type: 'CLOSE_SCHEDULE' }
  | { type: 'OPEN_TEMPLATES' }
  | { type: 'CLOSE_TEMPLATES' }
  | { type: 'OPEN_SHARE' }
  | { type: 'CLOSE_SHARE' }
  | { type: 'RESET_GENERATE' }
  | { type: 'RESET_EXPORT' };

// ── Initial State ──

const INITIAL_CONFIG: Partial<ReportDefinition> = {
  type: 'sales',
  name: '',
  filters: {},
  date_range: {
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0],
  },
  columns: ['id', 'created_at', 'total_amount', 'status', 'payment_method'],
  layout: { orientation: 'portrait', format: 'a4' },
};

const INITIAL_STATE: ReportState = {
  config: INITIAL_CONFIG,
  isSaving: false,
  isGenerating: false,
  isExporting: false,
  generateProgress: null,
  exportProgress: null,
  historyModalOpen: false,
  scheduleModalOpen: false,
  templatesModalOpen: false,
  shareModalOpen: false,
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
    case 'SET_EXPORTING':
      return { ...state, isExporting: action.payload };
    case 'SET_GENERATE_PROGRESS':
      return { ...state, generateProgress: action.payload };
    case 'SET_EXPORT_PROGRESS':
      return { ...state, exportProgress: action.payload };
    case 'OPEN_HISTORY':
      return { ...state, historyModalOpen: true };
    case 'CLOSE_HISTORY':
      return { ...state, historyModalOpen: false };
    case 'OPEN_SCHEDULE':
      return { ...state, scheduleModalOpen: true };
    case 'CLOSE_SCHEDULE':
      return { ...state, scheduleModalOpen: false };
    case 'OPEN_TEMPLATES':
      return { ...state, templatesModalOpen: true };
    case 'CLOSE_TEMPLATES':
      return { ...state, templatesModalOpen: false };
    case 'OPEN_SHARE':
      return { ...state, shareModalOpen: true };
    case 'CLOSE_SHARE':
      return { ...state, shareModalOpen: false };
    case 'RESET_GENERATE':
      return { ...state, isGenerating: false, generateProgress: null };
    case 'RESET_EXPORT':
      return { ...state, isExporting: false, exportProgress: null };
    default:
      return state;
  }
}

// ── Hook ──

export interface UseReportStateReturn {
  state: ReportState;
  isInvalidDateRange: boolean;
  isPlaceholderType: boolean;
  placeholderMessage: string | null;
  setConfig: (updates: Partial<ReportDefinition>) => void;
  handleSave: () => Promise<void>;
  handleGenerate: () => Promise<void>;
  handleExportExcel: () => Promise<void>;
  openHistoryModal: () => void;
  closeHistoryModal: () => void;
  openScheduleModal: () => void;
  closeScheduleModal: () => void;
  openTemplatesModal: () => void;
  closeTemplatesModal: () => void;
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
        store_id: user?.activeStoreId || '',
        created_by: user?.id || '',
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
        user?.activeStoreId || '',
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
      const { reportService: reportServiceGen } = await import('@/services/report-service');
      const result = await reportServiceGen.generateReport(
        {
          ...state.config,
          store_id: user?.activeStoreId || '',
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
      const { reportService: reportServiceLog } = await import('@/services/report-service');
      reportServiceLog.logRun({
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
      const { reportService: reportServiceErr } = await import('@/services/report-service');
      reportServiceErr.logRun({
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
  }, [validateConfig, isPlaceholderType, placeholderMessage, state.config, user?.activeStoreId, user?.id]);

  const handleExportExcel = useCallback(async () => {
    const err = validateConfig('export');
    if (err) { toast.error(err); return; }

    dispatch({ type: 'SET_EXPORTING', payload: true });
    dispatch({ type: 'SET_EXPORT_PROGRESS', payload: null });
    try {
      const { reportService } = await import('@/services/report-service');
      const { exportToExcel } = await import('@/services/export-service');

      // Use standard fetchReportData for now as the component expect a single promise return
      const data = await reportService.fetchReportDataPaginated(
        state.config.type as ReportType,
        state.config.filters,
        state.config.date_range,
        user?.activeStoreId || '',
        10000,
        0
      );

      if (!data || data.length === 0) {
        toast.error('No hay datos disponibles para exportar con los filtros seleccionados');
        return;
      }

      await exportToExcel(
        data,
        state.config.columns || [],
        COLUMN_LABELS,
        state.config.name || `Reporte_${state.config.type}_${new Date().toISOString().split('T')[0]}`
      );

      toast.success(`${data.length.toLocaleString('es-ES')} registros exportados exitosamente`);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Error desconocido';
      toast.error(`Error al exportar Excel: ${msg}`);
    } finally {
      dispatch({ type: 'RESET_EXPORT' });
    }
  }, [validateConfig, state.config, user?.activeStoreId]);

  const openHistoryModal = () => dispatch({ type: 'OPEN_HISTORY' });
  const closeHistoryModal = () => dispatch({ type: 'CLOSE_HISTORY' });
  const openScheduleModal = () => dispatch({ type: 'OPEN_SCHEDULE' });
  const closeScheduleModal = () => dispatch({ type: 'CLOSE_SCHEDULE' });
  const openTemplatesModal = () => dispatch({ type: 'OPEN_TEMPLATES' });
  const closeTemplatesModal = () => dispatch({ type: 'CLOSE_TEMPLATES' });
  const openShareModal = () => dispatch({ type: 'OPEN_SHARE' });
  const closeShareModal = () => dispatch({ type: 'CLOSE_SHARE' });

  return {
    state,
    isInvalidDateRange,
    isPlaceholderType,
    placeholderMessage,
    setConfig,
    handleSave,
    handleGenerate,
    handleExportExcel,
    openHistoryModal,
    closeHistoryModal,
    openScheduleModal,
    closeScheduleModal,
    openTemplatesModal,
    closeTemplatesModal,
    openShareModal,
    closeShareModal,
  };
}
