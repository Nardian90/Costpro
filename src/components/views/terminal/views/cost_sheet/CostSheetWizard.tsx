'use client';

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { CheckCircle2, Factory, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CostSheetData, CalculatedRowValue, CostSheetHeader, CostSheetAnnex } from '@/types/cost-sheet';
import { ValidationResult } from '@/lib/cost-engine/validations';
import { ValidationError } from '@/lib/cost-engine/types';

// ── New assisted mode modules ──
import InteractiveCostMap from './assisted/InteractiveCostMap';
import ContextualPanel from './assisted/ContextualPanel';
import SmartSidebar from './assisted/SmartSidebar';
import FinancialOverview from './assisted/FinancialOverview';
import ModeTabs from './assisted/ModeTabs';
import {
  getNodesForMode,
  getPhasesForMode,
  getNodeCompletion,
  getNodeValidation,
} from './assisted/constants';
import type { ActiveMode, SidebarMetrics, NodeValidationResult } from './assisted/types';

import { useTranslations } from 'next-intl';
// ── Public interface (kept identical for backward compatibility) ──
interface CostSheetWizardProps {
  data: CostSheetData;
  calculatedValues: Record<string, CalculatedRowValue>;
  calculatedHeader?: Partial<CostSheetHeader>;
  calculatedAnnexes?: CostSheetAnnex[];
  validations?: ValidationResult[];
  deepValidationErrors?: ValidationError[];
  healthPercent?: number;
  onFinish?: () => void;
}

const CostSheetWizard: React.FC<CostSheetWizardProps> = ({
  data,
  calculatedValues,
  calculatedHeader,
  calculatedAnnexes,
  validations,
  deepValidationErrors,
  healthPercent,
  onFinish,
}) => {
  const t = useTranslations('costSheet');
  // ── Mode state ──
  const [activeMode, setActiveMode] = useState<ActiveMode>('prod');

  // ── Selection state ──
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // ── Sidebar state ──
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth >= 768;
  });

  // ── Zoom state (0.6 default — compact overview of the workflow) ──
  const [zoom, setZoom] = useState(0.6);

  // ── Map orientation state (vertical = default) ──
  const [mapOrientation, setMapOrientation] = useState<'horizontal' | 'vertical'>('vertical');

  // ── Finish state ──
  const [finishState, setFinishState] = useState<'idle' | 'saving' | 'success'>('idle');

  // ── Audit results ──
  const [auditResults, setAuditResults] = useState<Record<string, NodeValidationResult> | null>(null);

  // ── Derived: nodes & phases for current mode ──
  const nodes = useMemo(() => getNodesForMode(activeMode), [activeMode]);
  const phases = useMemo(() => getPhasesForMode(activeMode), [activeMode]);

  // ── Derived: completed nodes ──
  const completedNodes = useMemo(() => {
    const set = new Set<string>();
    // Merge calculatedValues into data context for completion checking
    const enrichedData = { ...data, calculatedValues };
    for (const node of nodes) {
      if (getNodeCompletion(node.id, enrichedData)) {
        set.add(node.id);
      }
    }
    return set;
  }, [nodes, data, calculatedValues]);

  // ── Derived: selected node object ──
  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find(n => n.id === selectedNodeId) || null;
  }, [selectedNodeId, nodes]);

  // ── Derived: metrics for sidebar & overview ──
  const metrics: SidebarMetrics = useMemo(() => {
    const row12 = calculatedValues['12.1'];
    const row13 = calculatedValues['13.1'];
    const row14 = calculatedValues['14.1'];

    const totalCost = row12?.total;
    const utility = row13?.total;
    const salePrice = row14?.total;

    const utilityPercent =
      totalCost && totalCost > 0 && utility != null
        ? Number(((utility / totalCost) * 100).toFixed(1))
        : null;

    return {
      productName: data?.header?.name || '',
      totalCost,
      salePrice,
      utilityPercent,
      filledAnnexes: (data?.annexes || []).filter(
        (a: any) => a.data && a.data.length > 0
      ).length,
    };
  }, [data, calculatedValues]);

  // ── Handlers ──
  const handleNodeSelect = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
    setIsPanelOpen(true);

    // Auto-open sidebar on mobile when a node is selected
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handlePanelClose = useCallback(() => {
    setIsPanelOpen(false);
    setSelectedNodeId(null);
  }, []);

  // Pan reset ref — set by InteractiveCostMap via callback
  const panResetRef = useRef<(() => void) | null>(null);

  const handlePanReset = useCallback((resetFn: () => void) => {
    panResetRef.current = resetFn;
  }, []);

  const handleModeChange = useCallback((mode: ActiveMode) => {
    setActiveMode(mode);
    setSelectedNodeId(null);
    setIsPanelOpen(false);
    // Reset pan offset via ref so it syncs with InteractiveCostMap's internal state
    panResetRef.current?.();
    setZoom(0.6);
    setMapOrientation('vertical'); // Reset to vertical on mode change
  }, []);

  const handleSimulationResult = useCallback((results: Record<string, NodeValidationResult>, _errorNodeId: string | null) => {
    setAuditResults(results);
  }, []);

  // ── Finish handler (for signature node) ──
  const handleFinish = useCallback(async () => {
    setFinishState('saving');
    try {
      await onFinish?.();
      setFinishState('success');
    } catch {
      setFinishState('idle');
    }
  }, [onFinish]);

  // Derive finish state reset: use ref to avoid setState-in-effect
  const prevSelectedRef = useRef(selectedNodeId);
  useEffect(() => {
    prevSelectedRef.current = selectedNodeId;
  }, [selectedNodeId]);
  // If we navigated away from the firma node, finishState should be idle
  const effectiveFinishState =
    selectedNodeId && !selectedNodeId.endsWith('-firma')
      ? 'idle'
      : finishState;

  // ── Dynamic finance section lookup ──
  const financeSectionId = useMemo(() => {
    const sec = data?.sections?.find(
      (s: any) => s.id === 's13' || /utilidad|precio/i.test(s.label || '')
    );
    return sec?.id || 'all';
  }, [data?.sections]);
  // NOTE: financeSectionId is reserved for future section-filtering in ContextualPanel

  // ── Render ──
  return (
    <div className="animate-in fade-in duration-500 flex flex-col h-full">
      {/* ── Top bar: ModeTabs + FinancialOverview + controls ── */}
      <div className="border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card mb-4">
        {/* Title + controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between px-4 sm:px-5 py-3 gap-3 bg-gradient-to-r from-primary/5 to-transparent border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Factory className="w-4.5 h-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-tight text-foreground">
                Modo Asistido
              </h2>
              <p className="text-xs text-muted-foreground uppercase font-bold tracking-[0.2em]">
                Sistema de Orquestación Contextual
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <ModeTabs activeMode={activeMode} onModeChange={handleModeChange} />
          </div>
        </div>

        {/* KPI strip */}
        <FinancialOverview metrics={metrics} />

        {/* Success banner */}
        {effectiveFinishState === 'success' && (
          <div className="px-4 py-2 bg-primary/5 border-t border-primary/10">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              <span className="text-xs font-bold text-primary">Ficha completada y guardada exitosamente.</span>
            </div>
          </div>
        )}
      </div>

      {/* ── Main layout: Sidebar | CostMap | ContextualPanel ── */}
      <div data-cost-sheet-main className="flex-1 flex border border-border/60 rounded-2xl overflow-hidden shadow-sm bg-card min-h-0">
        {/* Left sidebar */}
        <SmartSidebar
          nodes={nodes}
          phases={phases}
          selectedNodeId={selectedNodeId}
          completedNodes={completedNodes}
          onSelectNode={handleNodeSelect}
          metrics={metrics}
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          auditResults={auditResults ?? undefined}
          validations={validations}
          deepValidationErrors={deepValidationErrors}
          healthPercent={healthPercent}
        />

        {/* Center: Interactive Cost Map */}
        <div className="flex-1 min-w-0">
          <InteractiveCostMap
            nodes={nodes}
            phases={phases}
            selectedNodeId={selectedNodeId}
            completedNodes={completedNodes}
            onNodeSelect={handleNodeSelect}
            zoom={zoom}
            onZoomChange={setZoom}
            onPanReset={handlePanReset}
            orientation={mapOrientation}
            onOrientationChange={setMapOrientation}
            data={data}
            calculatedValues={calculatedValues}
            calculatedHeader={calculatedHeader}
            calculatedAnnexes={calculatedAnnexes}
            onSimulationResult={handleSimulationResult}
          />
        </div>

        {/* Right: Contextual Panel */}
        <ContextualPanel
          node={selectedNode}
          isOpen={isPanelOpen}
          onClose={handlePanelClose}
          data={data}
          calculatedValues={calculatedValues}
          calculatedHeader={calculatedHeader}
          calculatedAnnexes={calculatedAnnexes}
        />
      </div>

      {/* ── Bottom action bar (signature finalization) ── */}
      {selectedNodeId?.endsWith('-firma') && effectiveFinishState !== 'success' && (
        <div className="mt-4 flex justify-end">
          {effectiveFinishState === 'saving' ? (
            <Button disabled className="text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground px-6 h-11 gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Guardando...
            </Button>
          ) : (
            <Button
              onClick={handleFinish}
              className="text-xs font-bold uppercase tracking-widest bg-primary text-primary-foreground hover:bg-primary/90 px-6 h-11 gap-2"
            >
              Guardar y Finalizar
              <CheckCircle2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default CostSheetWizard;
