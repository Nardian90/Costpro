import { useState, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/dexie';
import { MappingEngine } from '@/core/mapping/mapping.engine';
import { ReportType, MappingStats, MappingExecution } from '@/core/mapping/mapping.types';
import { v4 as uuidv4 } from 'uuid';
import { toast } from 'sonner';

export function useColumnMapping(reportType: ReportType) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastStats, setLastStats] = useState<MappingStats | null>(null);

  const rules = useLiveQuery(
    () => (db as any).mapping_rules.where('reportType').equals(reportType).toArray(),
    [reportType]
  );

  const applyMapping = useCallback(async (dataset: any[]) => {
    if (!rules) {
      return { mappedData: dataset, stats: null };
    }

    setIsProcessing(true);
    try {
      const { mappedData, stats } = MappingEngine.apply(dataset, rules, reportType);

      setLastStats(stats);

      const execution: MappingExecution = {
        id: uuidv4(),
        reportType,
        timestamp: Date.now(),
        totalRows: stats.totalRows,
        successRate: stats.successRate,
      };

      await (db as any).mapping_executions.add(execution);

      return { mappedData, stats };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error('Error durante el mapeo de columnas: ' + message);
      return { mappedData: dataset, stats: null };
    } finally {
      setIsProcessing(false);
    }
  }, [rules, reportType]);

  return {
    applyMapping,
    isProcessing,
    lastStats,
    rules: rules || [],
  };
}
