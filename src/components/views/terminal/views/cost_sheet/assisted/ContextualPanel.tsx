'use client';

import React, { useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  X,
  GripVertical,
  Lightbulb,
  Sparkles,
  Building2, Warehouse, Users, Wrench, Truck,
  Factory, AlertTriangle, DollarSign, FileCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import CostSheetHeaderEditor from '../CostSheetHeaderEditor';
import CostSheetAnnexEditor from '../CostSheetAnnexEditor';
import CostSheetInteractiveTable from '../CostSheetInteractiveTable';
import CostSheetSignatureEditor from '../CostSheetSignatureEditor';
import { getNodeValidation } from './constants';
import type { CostMapNode } from './types';
import type { CostSheetData, CalculatedRowValue, CostSheetHeader, CostSheetAnnex } from '@/types/cost-sheet';
import { cn, formatCurrency } from '@/lib/utils';

import { useTranslations } from 'next-intl';
// ── Icon component (declared outside render to satisfy static-components rule) ──
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, Warehouse, Users, Wrench, Truck,
  Factory, AlertTriangle, DollarSign, FileCheck,
};

function NodeIcon({ name, className }: { name: string; className?: string }) {
  const t = useTranslations('costSheet');
  const Comp = ICON_MAP[name] || Building2;
  return <Comp className={className} />;
}

interface ContextualPanelProps {
  node: CostMapNode | null;
  isOpen: boolean;
  onClose: () => void;
  data: CostSheetData;
  calculatedValues: Record<string, CalculatedRowValue>;
  calculatedHeader?: Partial<CostSheetHeader>;
  calculatedAnnexes?: CostSheetAnnex[];
}

const ContextualPanel: React.FC<ContextualPanelProps> = ({
  node,
  isOpen,
  onClose,
  data,
  calculatedValues,
  calculatedHeader,
  calculatedAnnexes,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [panelWidth, setPanelWidth] = useState(420);
  const [isDragging, setIsDragging] = useState(false);
  const isResizing = useRef(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  // Resize handler — professional UX: prevents text selection, shows cursor feedback
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault(); // Prevent native text selection from starting
    e.stopPropagation(); // Don't bubble click to parent elements
    isResizing.current = true;
    startXRef.current = e.clientX;
    startWidthRef.current = panelWidth;
    setIsDragging(true);

    // Lock body: prevent text selection + show resize cursor globally
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ew-resize';
    document.body.style.webkitUserSelect = 'none';

    const handleResizeMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      ev.preventDefault();
      const dx = ev.clientX - startXRef.current;
      // Min 260px (still usable), no max cap — user can expand as far left as they want
      const newWidth = startWidthRef.current - dx;
      const containerEl = document.querySelector('[data-cost-sheet-main]')?.clientWidth;
      const maxW = containerEl ? containerEl - 180 : window.innerWidth * 0.75; // leave room for SVG
      setPanelWidth(Math.min(maxW, Math.max(260, newWidth)));
    };

    const handleResizeEnd = () => {
      isResizing.current = false;
      setIsDragging(false);

      // Restore body styles
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.body.style.webkitUserSelect = '';

      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };

    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
  }, [panelWidth]);

  // Cleanup on unmount: restore body styles if drag was interrupted
  useEffect(() => {
    return () => {
      isResizing.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.body.style.webkitUserSelect = '';
    };
  }, []);

  // Compute KPIs for the node
  const nodeKPIs = useMemo(() => {
    if (!node) return [];
    const kpis: { label: string; value: string; color: string }[] = [];

    if (node.isSection || node.id.includes('precio') || node.id.includes('tarifa')) {
      const row12 = calculatedValues['12.1'];
      const row13 = calculatedValues['13.1'];
      const row14 = calculatedValues['14.1'];
      if (row12?.total !== undefined) kpis.push({ label: 'Costo Total (F12)', value: formatCurrency(row12.total), color: 'text-primary' });
      if (row13?.total !== undefined) kpis.push({ label: 'Utilidad (F13)', value: formatCurrency(row13.total), color: 'text-warning dark:text-amber-400' });
      if (row14?.total !== undefined) kpis.push({ label: 'Precio (F14)', value: formatCurrency(row14.total), color: 'text-foreground' });
    }

    return kpis;
  }, [node, calculatedValues]);

  // Render the appropriate editor content
  const renderEditor = useCallback(() => {
    if (!node) return null;

    if (node.isHeader) {
      return (
        <CostSheetHeaderEditor
          header={data?.header || {}}
          calculatedHeader={calculatedHeader}
        />
      );
    }

    if (node.annexId) {
      return (
        <div className="space-y-4">
          <CostSheetAnnexEditor activeAnnexId={node.annexId} calculatedAnnexes={calculatedAnnexes} />
          {node.annexId === 'IV' && (data?.annexes || []).some((a: any) => a.id === 'V') && (
            <div className="pt-4 border-t border-border/40">
              <CostSheetAnnexEditor activeAnnexId="V" calculatedAnnexes={calculatedAnnexes} />
            </div>
          )}
        </div>
      );
    }

    if (node.isSignature) {
      return <CostSheetSignatureEditor />;
    }

    if (node.isSection) {
      // Map rowId to actual groupedSections IDs used by CostSheetInteractiveTable
      // group-1-5: Direct costs + consolidation (F1-F5)
      // group-6-10: Indirect expenses (F6-F10)
      // group-11-16: Financial consolidation + utility + price + unit (F11-F16)
      const sectionIdMap: Record<string, string> = {
        'main': 'group-1-5',
        'overhead': 'group-6-10',
        'finance': 'group-11-16',
        'direct-4': 'group-4-5',
        'gi-6-7': 'group-6-7',
        'financiero': 'group-8-10',
      };
      const sectionId = sectionIdMap[node.rowId || ''] || node.rowId || 'all';
      return (
        <CostSheetInteractiveTable
          sections={data?.sections || []}
          calculatedValues={calculatedValues}
          annexes={data?.annexes || []}
          activeSubSectionId={sectionId}
          setActiveSubSectionId={() => {}}
          onOpenSections={() => {}}
          hideHeader={false}
        />
      );
    }

    return null;
  }, [node, data, calculatedValues, calculatedHeader, calculatedAnnexes]);

  // Get phase label for badge
  const phaseLabels: Record<string, string> = {
    input: 'Entradas',
    process: 'Proceso',
    overhead: 'Gastos',
    finance: 'Finanzas',
    output: 'Salida',
  };

  if (!node) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={prefersReducedMotion ? { opacity: 1 } : { width: panelWidth, opacity: 1 }}
          exit={prefersReducedMotion ? {} : { width: 0, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="h-full border-l border-border/60 bg-card flex flex-col overflow-hidden shrink-0 relative"
        >
          {/* Resize handle — positioned on the LEFT edge of THIS panel */}
          <div
            className={cn(
              'absolute left-0 top-0 h-full z-20 group',
              // Thin rail: 3px always visible, expands to 6px on hover/drag for easy grabbing
              'w-[3px] group-hover:w-[6px] group-active:w-[6px]',
              'cursor-ew-resize transition-[width] duration-150',
              // Border highlight: subtle when idle, vivid when hovering, bright when dragging
              isDragging
                ? 'bg-primary/40 shadow-md shadow-primary/20'
                : 'bg-transparent group-hover:bg-primary/20'
            )}
            onMouseDown={handleResizeStart}
          >
            {/* Visible grip indicator — centered on the rail */}
            <div className={cn(
              'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
              'w-6 h-14 rounded-full flex items-center justify-center',
              'transition-all duration-200',
              isDragging
                ? 'bg-primary/15 border-2 border-primary/40 shadow-lg opacity-100 scale-110'
                : 'bg-card border border-border/50 shadow-sm opacity-0 group-hover:opacity-100'
            )}>
              <GripVertical className={cn(
                'w-3.5 h-3.5 transition-colors duration-150',
                isDragging ? 'text-primary' : 'text-muted-foreground/70'
              )} />
            </div>
            {/* Expanded hover zone for easier grab (invisible hit area) */}
            <div className="absolute left-1/2 top-0 -translate-x-1/2 w-4 h-full" />
          </div>

          {/* Panel header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border/40 shrink-0">
            <div className={cn(
              'w-9 h-9 rounded-xl flex items-center justify-center shrink-0',
              node.bgColor, node.tailwindColor
            )}>
              <NodeIcon name={node.icon} className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    'text-xs font-bold uppercase tracking-widest px-1.5 py-0 border',
                    node.borderColor, node.tailwindColor
                  )}
                >
                  {phaseLabels[node.phase] || node.phase}
                </Badge>
                {node.articleRef && (
                  <span className="text-xs font-mono text-muted-foreground/70">
                    {node.articleRef}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-black text-foreground mt-0.5 truncate">
                {node.label}
              </h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-7 w-7 p-0 rounded-lg hover:bg-destructive/10 hover:text-destructive shrink-0"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Panel body — native scroll in both axes, no ScrollArea (its viewport clips horizontal scroll) */}
          <div className="flex-1 overflow-auto">
            <div className="p-4 space-y-4">
              {/* Validation message */}
              {(() => {
                const validation = getNodeValidation(node.id, data);
                if (validation && !validation.canProceed && validation.reason) {
                  return (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/20 border border-rose-200/50 dark:border-rose-800/30">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs text-rose-900 dark:text-rose-200/80 leading-relaxed font-medium">
                          {validation.reason}
                        </p>
                      </div>
                    </div>
                  );
                }
                return null;
              })()}

              {/* Regulatory tip */}
              {node.regulatoryTip && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30"
                >
                  <Sparkles className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-amber-900 dark:text-amber-200/80 leading-relaxed font-medium">
                      {node.regulatoryTip}
                    </p>
                    {node.articleRef && (
                      <p className="text-xs text-amber-700/60 dark:text-amber-400/50 font-mono mt-1.5">
                        {node.articleRef}
                      </p>
                    )}
                  </div>
                </motion.div>
              )}

              {/* KPI strip */}
              {nodeKPIs.length > 0 && (
                <div className="grid grid-cols-1 gap-2">
                  {nodeKPIs.map((kpi, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/40 border border-border/30"
                    >
                      <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {kpi.label}
                      </span>
                      <span className={cn('text-xs font-black font-mono', kpi.color)}>
                        {kpi.value}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <Separator className="my-2" />

              {/* Editor content */}
              <motion.div
                key={node.id}
                initial={{ opacity: 0, y: 10 }}
                animate={prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
              >
                {renderEditor()}
              </motion.div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ContextualPanel;
