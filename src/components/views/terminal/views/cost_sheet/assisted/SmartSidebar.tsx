'use client';

import React, { useCallback, useMemo, useState } from 'react';
import {
  PanelLeftClose,
  PanelLeftOpen,
  Building2, Warehouse, Users, Wrench, Truck,
  Factory, AlertTriangle, DollarSign, FileCheck,
  CheckCircle2,
  ShieldCheck,
  AlertOctagon,
  Info,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { CostMapNode, WorkflowPhase, SidebarMetrics, NodeValidationResult } from './types';
import { cn, formatCurrency } from '@/lib/utils';
import type { ValidationResult } from '@/lib/cost-engine/validations';
import type { ValidationError } from '@/lib/cost-engine/types';

// ── Icon component mapper ──
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Building2, Warehouse, Users, Wrench, Truck,
  Factory, AlertTriangle, DollarSign, FileCheck,
};

function getNodeIcon(iconName: string) {
  return ICON_MAP[iconName] || Building2;
}

// ── Phase labels ──
const PHASE_LABELS: Record<string, string> = {
  input: 'Entradas',
  process: 'Proceso',
  overhead: 'Gastos',
  finance: 'Finanzas',
  output: 'Salida',
};

const PHASE_COLORS: Record<string, string> = {
  input: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  process: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20',
  overhead: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  finance: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  output: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20',
};

// ── Error code display config (same as CostSheetAuditView) ──
const ERROR_CODE_CONFIG: Record<string, { label: string; color: string }> = {
  CYCLE:                   { label: 'Ciclo', color: 'text-violet-500 bg-violet-500/10' },
  MISSING_REF:             { label: 'Ref. Faltante', color: 'text-red-500 bg-red-500/10' },
  SEMANTIC_DISCREPANCY:   { label: 'Discrepancia', color: 'text-orange-500 bg-orange-500/10' },
  INVALID_FORMULA:         { label: 'Formula Invalida', color: 'text-red-600 bg-red-600/10' },
  HARD_RULE_VIOLATION:     { label: 'Regla Violada', color: 'text-rose-600 bg-rose-600/10' },
  TRIVIAL_FORMULA:         { label: 'Formula Trivial', color: 'text-amber-500 bg-amber-500/10' },
  HIERARCHY:               { label: 'Jerarquia', color: 'text-sky-500 bg-sky-500/10' },
  EXTERNAL_LINK:           { label: 'Enlace Externo', color: 'text-slate-400 bg-slate-400/10' },
};

interface SmartSidebarProps {
  nodes: CostMapNode[];
  phases: WorkflowPhase[];
  selectedNodeId: string | null;
  completedNodes: Set<string>;
  onSelectNode: (nodeId: string) => void;
  metrics: SidebarMetrics;
  isOpen: boolean;
  onToggle: () => void;
  auditResults?: Record<string, NodeValidationResult>;
  // Real dashboard audit data (same source as Tablero Principal)
  validations?: ValidationResult[];
  deepValidationErrors?: ValidationError[];
  healthPercent?: number;
}

const SmartSidebar = React.memo(function SmartSidebar({
  nodes,
  phases,
  selectedNodeId,
  completedNodes,
  onSelectNode,
  metrics,
  isOpen,
  onToggle,
  auditResults,
  validations = [],
  deepValidationErrors = [],
  healthPercent,
}: SmartSidebarProps) {
  const [manualSidebarMode, setManualSidebarMode] = useState<'flow' | 'audit' | null>(null);

  // Auto-switch to audit when simulation results exist OR real validation data is present
  const hasRealAudit = validations.length > 0 || deepValidationErrors.length > 0;
  const sidebarMode = manualSidebarMode ?? (auditResults || hasRealAudit ? 'audit' : 'flow');
  const setSidebarMode = setManualSidebarMode;

  // ── Filter out INFO-level validations (EXTERNAL_LINK noise) from sidebar ──
  // Only show CRITICAL and WARNING — informational items clutter the assisted view
  const meaningfulErrors = useMemo(
    () => deepValidationErrors.filter(e => e.type !== 'INFO'),
    [deepValidationErrors],
  );

  // ── Audit summary counts (excluding INFO noise) ──
  const auditCounts = useMemo(() => {
    const engineCriticals = meaningfulErrors.filter(e => e.type === 'CRITICAL').length;
    const engineWarnings = meaningfulErrors.filter(e => e.type === 'WARNING').length;

    const healthCriticals = validations.filter(v => v.type === 'CRITICAL').length;
    const healthWarnings = validations.filter(v => v.type === 'WARNING').length;
    const healthSuccesses = validations.filter(v => v.type === 'SUCCESS').length;

    return {
      totalCriticals: engineCriticals + healthCriticals,
      totalWarnings: engineWarnings + healthWarnings,
      totalOk: healthSuccesses,
      engineCriticals,
      engineWarnings,
      healthCriticals,
      healthWarnings,
      healthSuccesses,
    };
  }, [validations, meaningfulErrors]);

  // ── Grouped validation items (mirror "Flags por Fila" from dashboard, no INFO) ──
  const rowFlagGroups = useMemo(() => {
    const map = new Map<string, ValidationError[]>();
    meaningfulErrors.forEach(err => {
      const key = err.rowId || '_unknown';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(err);
    });

    return Array.from(map.entries()).map(([rowId, errors]) => {
      const criticals = errors.filter(e => e.type === 'CRITICAL').length;
      const warnings = errors.filter(e => e.type === 'WARNING').length;
      const infos = errors.filter(e => e.type === 'INFO').length;
      return {
        rowId,
        errors,
        criticals,
        warnings,
        infos,
        highestSeverity: (criticals > 0 ? 'CRITICAL' : warnings > 0 ? 'WARNING' : 'INFO') as 'CRITICAL' | 'WARNING' | 'INFO',
      };
    }).sort((a, b) => {
      const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
      if (severityOrder[a.highestSeverity] !== severityOrder[b.highestSeverity]) {
        return severityOrder[a.highestSeverity] - severityOrder[b.highestSeverity];
      }
      return (b.criticals + b.warnings + b.infos) - (a.criticals + a.warnings + a.infos);
    });
  }, [meaningfulErrors]);

  // Health validations sorted by type (CRITICAL first, then WARNING, then SUCCESS)
  const sortedHealthValidations = useMemo(() => {
    return [...validations].sort((a, b) => {
      const order = { CRITICAL: 0, WARNING: 1, SUCCESS: 2 };
      return (order[a.type] || 2) - (order[b.type] || 2);
    });
  }, [validations]);

  // ── Active audit filter ──
  const [activeAuditFilter, setActiveAuditFilter] = useState<'all' | 'CRITICAL' | 'WARNING' | 'INFO_SUCCESS'>('all');

  const filteredFlags = useMemo(() => {
    if (activeAuditFilter === 'all') return rowFlagGroups;
    if (activeAuditFilter === 'CRITICAL') return rowFlagGroups.filter(g => g.criticals > 0);
    if (activeAuditFilter === 'WARNING') return rowFlagGroups.filter(g => g.warnings > 0);
    return rowFlagGroups.filter(g => g.infos > 0);
  }, [rowFlagGroups, activeAuditFilter]);

  const filteredHealth = useMemo(() => {
    if (activeAuditFilter === 'all') return sortedHealthValidations;
    if (activeAuditFilter === 'CRITICAL') return sortedHealthValidations.filter(v => v.type === 'CRITICAL');
    if (activeAuditFilter === 'WARNING') return sortedHealthValidations.filter(v => v.type === 'WARNING');
    return sortedHealthValidations.filter(v => v.type === 'SUCCESS');
  }, [sortedHealthValidations, activeAuditFilter]);

  // Overall completion percentage
  const overallProgress = useMemo(() => {
    if (nodes.length === 0) return 0;
    return Math.round((completedNodes.size / nodes.length) * 100);
  }, [completedNodes, nodes.length]);

  // Group nodes by phase
  const phaseGroups = useMemo(() => {
    const groups: Record<string, { phase: WorkflowPhase; nodes: CostMapNode[] }> = {};
    for (const phase of phases) {
      if (phase.nodes.length === 0) continue;
      groups[phase.id] = {
        phase,
        nodes: phase.nodes.map(id => nodes.find(n => n.id === id)).filter(Boolean) as CostMapNode[],
      };
    }
    return groups;
  }, [nodes, phases]);

  // Phase completion counts
  const phaseCompletion = useMemo(() => {
    const counts: Record<string, { done: number; total: number }> = {};
    for (const phase of phases) {
      const total = phase.nodes.length;
      const done = phase.nodes.filter(id => completedNodes.has(id)).length;
      counts[phase.id] = { done, total };
    }
    return counts;
  }, [phases, completedNodes]);

  const handleSelect = useCallback(
    (nodeId: string) => {
      onSelectNode(nodeId);
    },
    [onSelectNode]
  );

  // ── Severity badge (same as CostSheetAuditView) ──
  const SeverityBadge = ({ count, type }: { count: number; type: 'CRITICAL' | 'WARNING' | 'INFO' }) => {
    if (count === 0) return null;
    const colors = {
      CRITICAL: 'bg-destructive/15 text-destructive border-destructive/25',
      WARNING: 'bg-amber-500/15 text-amber-600 border-amber-500/25',
      INFO: 'bg-muted/50 text-muted-foreground border-muted-foreground/25',
    };
    return (
      <Badge variant="outline" className={cn('text-[8px] font-bold px-1 py-0 rounded-full leading-none', colors[type])}>
        {count} {type === 'CRITICAL' ? 'Err' : type === 'WARNING' ? 'Adv' : 'Info'}
      </Badge>
    );
  };

  return (
    <div className="relative shrink-0 h-full">
      {/* Toggle button — always visible when collapsed */}
      {!isOpen && (
        <button
          onClick={onToggle}
          className="absolute top-3 left-3 z-30 w-8 h-8 rounded-lg bg-card border border-border/60 flex items-center justify-center hover:bg-primary/10 hover:border-primary/40 transition-all duration-200 shadow-sm hover:shadow-md"
          title="Abrir panel de navegacion"
        >
          <PanelLeftOpen className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Sidebar */}
      <div
        className={cn(
          'h-full border-r border-border/40 bg-card flex flex-col shrink-0 transition-all duration-300 overflow-hidden',
          isOpen ? 'w-72' : 'w-0'
        )}
      >
        {/* Sidebar header */}
        <div className="px-3 py-3 border-b border-border/30 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-foreground">
                {sidebarMode === 'audit' ? 'Auditoria' : 'Flujo de Costeo'}
              </h4>
              <p className="text-[9px] text-muted-foreground font-mono mt-0.5">
                {completedNodes.size}/{nodes.length} nodos
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="h-7 w-7 p-0 rounded-lg hover:bg-muted"
            >
              <PanelLeftClose className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </div>

          {/* Overall progress */}
          {sidebarMode === 'flow' && (
            <div className="space-y-1.5">
              <Progress value={overallProgress} className="h-1.5" />
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground font-mono">Progreso</span>
                <span className="text-[10px] font-black font-mono text-primary">
                  {overallProgress}%
                </span>
              </div>
            </div>
          )}

          {/* Mode toggle: Flujo / Auditoria */}
          <div className="flex items-center gap-1 mt-2">
            <button
              onClick={() => setSidebarMode('flow')}
              className={cn(
                'px-2 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-colors',
                sidebarMode === 'flow'
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              )}
            >
              Flujo
            </button>
            <button
              onClick={() => setSidebarMode('audit')}
              className={cn(
                'px-2 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition-colors relative',
                sidebarMode === 'audit'
                  ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground/50 hover:text-muted-foreground'
              )}
            >
              Auditoria
              {auditCounts.totalCriticals > 0 && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-destructive text-[7px] text-white font-black flex items-center justify-center">
                  {auditCounts.totalCriticals}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="px-3 py-3 border-b border-border/20 space-y-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Producto</span>
            <span className="text-[10px] font-bold text-foreground truncate ml-2 max-w-[140px]">
              {metrics.productName || (
                <Skeleton className="inline-block w-16 h-3 rounded" />
              )}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Costo</span>
            {metrics.totalCost === undefined ? (
              <Skeleton className="inline-block w-16 h-3 rounded" />
            ) : (
              <span className="text-[10px] font-black font-mono text-primary">
                {formatCurrency(metrics.totalCost)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Precio</span>
            {metrics.salePrice === undefined ? (
              <Skeleton className="inline-block w-16 h-3 rounded" />
            ) : (
              <span className="text-[10px] font-black font-mono text-foreground">
                {formatCurrency(metrics.salePrice)}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/50">Utilidad</span>
            {metrics.utilityPercent === null ? (
              <Skeleton className="inline-block w-10 h-3 rounded" />
            ) : (
              <span className="text-[10px] font-black font-mono text-amber-600 dark:text-amber-400">
                {metrics.utilityPercent}%
              </span>
            )}
          </div>
        </div>

        {/* Main content area */}
        <ScrollArea className="flex-1">
          {/* ══════════════════════════════════════════════════════ */}
          {/* AUDIT VIEW — mirrors Tablero Principal audit         */}
          {/* ══════════════════════════════════════════════════════ */}
          {sidebarMode === 'audit' && (
            <div className="p-2 space-y-3">
              {/* ── 3 Status Cards (same as dashboard) ── */}
              <div className="space-y-1.5">
                {/* Critical Errors */}
                <button
                  onClick={() => setActiveAuditFilter(prev => prev === 'CRITICAL' ? 'all' : 'CRITICAL')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all',
                    auditCounts.totalCriticals > 0
                      ? 'bg-destructive/5 border border-destructive/15'
                      : 'bg-muted/30 border border-transparent',
                    activeAuditFilter === 'CRITICAL' && 'ring-1 ring-destructive/30',
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    auditCounts.totalCriticals > 0 ? 'bg-destructive/15' : 'bg-muted/50'
                  )}>
                    <AlertOctagon className={cn('w-3.5 h-3.5', auditCounts.totalCriticals > 0 ? 'text-destructive' : 'text-muted-foreground/40')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-destructive/80">
                        Errores Criticos
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-lg font-black text-destructive leading-none">
                        {auditCounts.totalCriticals}
                      </span>
                      <span className="text-[8px] text-muted-foreground/60">
                        {auditCounts.engineCriticals > 0 && `${auditCounts.engineCriticals} motor`}
                        {auditCounts.engineCriticals > 0 && auditCounts.healthCriticals > 0 && ' + '}
                        {auditCounts.healthCriticals > 0 && `${auditCounts.healthCriticals} salud`}
                        {auditCounts.totalCriticals === 0 && 'Sin errores'}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Warnings */}
                <button
                  onClick={() => setActiveAuditFilter(prev => prev === 'WARNING' ? 'all' : 'WARNING')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all',
                    auditCounts.totalWarnings > 0
                      ? 'bg-amber-500/5 border border-amber-500/15'
                      : 'bg-muted/30 border border-transparent',
                    activeAuditFilter === 'WARNING' && 'ring-1 ring-amber-500/30',
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    auditCounts.totalWarnings > 0 ? 'bg-amber-500/15' : 'bg-muted/50'
                  )}>
                    <AlertTriangle className={cn('w-3.5 h-3.5', auditCounts.totalWarnings > 0 ? 'text-amber-500' : 'text-muted-foreground/40')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500/80">
                        Advertencias
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-lg font-black text-amber-500 leading-none">
                        {auditCounts.totalWarnings}
                      </span>
                      <span className="text-[8px] text-muted-foreground/60">
                        Revision de parametros sugerida
                      </span>
                    </div>
                  </div>
                </button>

                {/* Validations OK */}
                <button
                  onClick={() => setActiveAuditFilter(prev => prev === 'INFO_SUCCESS' ? 'all' : 'INFO_SUCCESS')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all',
                    auditCounts.totalOk > 0
                      ? 'bg-primary/5 border border-primary/15'
                      : 'bg-muted/30 border border-transparent',
                    activeAuditFilter === 'INFO_SUCCESS' && 'ring-1 ring-primary/30',
                  )}
                >
                  <div className={cn(
                    'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                    auditCounts.totalOk > 0 ? 'bg-primary/15' : 'bg-muted/50'
                  )}>
                    <CheckCircle2 className={cn('w-3.5 h-3.5', auditCounts.totalOk > 0 ? 'text-primary' : 'text-muted-foreground/40')} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-primary/80">
                        Validaciones OK
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-lg font-black text-primary leading-none">
                        {auditCounts.totalOk}
                      </span>
                      <span className="text-[8px] text-muted-foreground/60">
                        Integridad confirmada
                      </span>
                    </div>
                  </div>
                </button>
              </div>

              {/* Health % bar */}
              {healthPercent !== undefined && (
                <div className="px-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground/50">Salud</span>
                    <span className="text-[9px] font-black font-mono text-primary">{healthPercent}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all duration-500',
                        healthPercent >= 80 ? 'bg-gradient-to-r from-emerald-500 to-cyan-500' :
                        healthPercent >= 50 ? 'bg-gradient-to-r from-amber-500 to-orange-500' :
                        'bg-gradient-to-r from-rose-500 to-red-500'
                      )}
                      style={{ width: `${healthPercent}%` }}
                    />
                  </div>
                </div>
              )}

              <Separator />

              {/* ── Flags por Fila (engine validation errors) ── */}
              {filteredFlags.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-1 mb-1">
                    <AlertTriangle className="w-3 h-3 text-amber-500" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/70">
                      Flags por Fila
                    </span>
                    <Badge variant="outline" className="text-[7px] font-bold px-1 py-0 rounded-full bg-destructive/10 text-destructive border-destructive/20 ml-auto">
                      {filteredFlags.length}
                    </Badge>
                  </div>
                  {filteredFlags.map((group) => (
                    <div
                      key={group.rowId}
                      className={cn(
                        'rounded-lg border-l-2 px-2 py-1.5',
                        group.highestSeverity === 'CRITICAL' ? 'border-l-destructive bg-destructive/3' :
                        group.highestSeverity === 'WARNING' ? 'border-l-amber-500 bg-amber-500/3' :
                        'border-l-blue-400 bg-muted/20'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[10px] font-bold text-foreground/80 truncate">
                          {group.rowId}
                        </span>
                        <div className="flex items-center gap-1 shrink-0">
                          <SeverityBadge count={group.criticals} type="CRITICAL" />
                          <SeverityBadge count={group.warnings} type="WARNING" />
                          <SeverityBadge count={group.infos} type="INFO" />
                        </div>
                      </div>
                      {/* Show first error message */}
                      {group.errors[0] && (
                        <p className={cn(
                          'text-[8px] mt-0.5 leading-tight truncate',
                          group.highestSeverity === 'CRITICAL' ? 'text-destructive/60' : 'text-muted-foreground/50'
                        )}>
                          {group.errors[0].message}
                        </p>
                      )}
                      {/* Error code badges */}
                      {group.errors.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {Array.from(new Set(group.errors.map(e => e.code))).map(code => {
                            const config = ERROR_CODE_CONFIG[code];
                            if (!config) return null;
                            return (
                              <Badge key={code} className={cn('text-[7px] font-bold px-1 py-0 rounded border', config.color)}>
                                {config.label}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Cumplimiento y Normativas (health validations) ── */}
              {filteredHealth.length > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 px-1 mb-1">
                    <ShieldCheck className="w-3 h-3 text-primary" />
                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/70">
                      Cumplimiento
                    </span>
                    <Badge variant="outline" className="text-[7px] font-bold px-1 py-0 rounded-full bg-primary/10 text-primary border-primary/20 ml-auto">
                      {filteredHealth.length}
                    </Badge>
                  </div>
                  {filteredHealth.map((v, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        'rounded-lg px-2 py-1.5 border',
                        v.type === 'CRITICAL' ? 'border-destructive/20 bg-destructive/3' :
                        v.type === 'WARNING' ? 'border-amber-500/20 bg-amber-500/3' :
                        'border-primary/10 bg-primary/3'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9px] font-bold text-foreground/80 truncate">
                          {v.title}
                        </span>
                        <Badge variant="outline" className={cn(
                          'text-[7px] font-bold px-1 py-0 rounded-full shrink-0',
                          v.type === 'CRITICAL' ? 'bg-destructive/15 text-destructive border-destructive/25' :
                          v.type === 'WARNING' ? 'bg-amber-500/15 text-amber-600 border-amber-500/25' :
                          'bg-primary/15 text-primary border-primary/25'
                        )}>
                          {v.type === 'CRITICAL' ? 'Err' : v.type === 'WARNING' ? 'Adv' : 'OK'}
                        </Badge>
                      </div>
                      <p className="text-[8px] text-muted-foreground/50 mt-0.5 leading-tight line-clamp-2">
                        {v.message}
                      </p>
                      {v.category && (
                        <Badge variant="outline" className="text-[7px] font-bold px-1 py-0 rounded mt-1 bg-muted/30 text-muted-foreground/60 border-muted/30">
                          {v.category}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── Simulation results (when available, shown below real audit) ── */}
              {auditResults && Object.keys(auditResults).length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 px-1 mb-1">
                      <Factory className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground/70">
                        Simulacion SVG
                      </span>
                    </div>
                    {phases.filter(p => p.nodes.length > 0).map(phase => {
                      const phaseNodes = phase.nodes
                        .map(id => nodes.find(n => n.id === id))
                        .filter(Boolean) as CostMapNode[];
                      const phaseHasErrors = phaseNodes.some(n => auditResults[n.id] && !auditResults[n.id].valid);
                      return (
                        <div key={phase.id}>
                          <div className={cn(
                            'px-1.5 py-0.5 rounded text-[7px] font-bold uppercase tracking-widest',
                            phaseHasErrors ? 'text-rose-600 bg-rose-500/5' : 'text-muted-foreground/40'
                          )}>
                            {PHASE_LABELS[phase.id] || phase.id}
                          </div>
                          <div className="space-y-0.5 mt-0.5">
                            {phaseNodes.map(node => {
                              const result = auditResults[node.id];
                              if (!result) return null;
                              const isValid = result.valid;
                              return (
                                <div key={node.id} className={cn(
                                  'flex items-center gap-1.5 px-1.5 py-0.5 rounded',
                                  !isValid ? 'bg-rose-500/3' : ''
                                )}>
                                  {isValid ? (
                                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                                  ) : (
                                    <AlertTriangle className="w-3 h-3 text-rose-500 shrink-0" />
                                  )}
                                  <span className={cn(
                                    'text-[9px] font-semibold truncate',
                                    !isValid ? 'text-rose-700 dark:text-rose-300' : 'text-foreground/50'
                                  )}>
                                    {node.shortLabel}
                                  </span>
                                  {!isValid && result.reason && (
                                    <span className="text-[7px] text-rose-500/50 truncate ml-auto">
                                      {result.reason}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {/* Empty state when no data */}
              {!hasRealAudit && !auditResults && (
                <div className="px-2 py-6 text-center">
                  <ShieldCheck className="w-8 h-8 mx-auto text-muted-foreground/20 mb-2" />
                  <p className="text-[9px] text-muted-foreground/40 font-semibold">
                    Ejecute el motor de calculo o la simulacion para ver resultados de auditoria
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════ */}
          {/* FLOW VIEW (default)                                   */}
          {/* ══════════════════════════════════════════════════════ */}
          {sidebarMode === 'flow' && (
          <div className="p-2 space-y-3">
            {Object.entries(phaseGroups).map(([phaseId, { phase, nodes: phaseNodes }]) => {
              const completion = phaseCompletion[phaseId];
              return (
                <div key={phaseId}>
                  {/* Phase header */}
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[7px] font-black uppercase tracking-widest px-1.5 py-0 border',
                        PHASE_COLORS[phaseId] || PHASE_COLORS.input
                      )}
                    >
                      {PHASE_LABELS[phaseId] || phaseId}
                    </Badge>
                    {completion && (
                      <span className="text-[8px] font-mono text-muted-foreground/50">
                        {completion.done}/{completion.total}
                      </span>
                    )}
                  </div>

                  {/* Phase nodes */}
                  <div className="space-y-0.5">
                    {phaseNodes.map((node) => {
                      const IconComp = getNodeIcon(node.icon);
                      const isActive = selectedNodeId === node.id;
                      const isDone = completedNodes.has(node.id);

                      return (
                        <button
                          key={node.id}
                          onClick={() => handleSelect(node.id)}
                          className={cn(
                            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all duration-150',
                            isActive && cn(node.bgColor, 'border', node.borderColor, 'shadow-sm'),
                            !isActive && 'hover:bg-muted/50'
                          )}
                        >
                          <div className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                            isDone && 'bg-primary/10',
                            !isDone && !isActive && 'bg-muted/40',
                            isActive && node.bgColor
                          )}>
                            <IconComp className={cn(
                              'w-3.5 h-3.5',
                              isDone ? 'text-primary' : isActive ? node.tailwindColor : 'text-muted-foreground/50'
                            )} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className={cn(
                              'text-[11px] font-bold leading-tight block truncate',
                              isActive && 'text-foreground',
                              !isActive && isDone && 'text-foreground/70',
                              !isActive && !isDone && 'text-muted-foreground/60'
                            )}>
                              {node.shortLabel}
                            </span>
                          </div>
                          {/* Completion indicator */}
                          {isDone && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                          )}
                          {!isDone && !isActive && (
                            <span className="w-2 h-2 rounded-full bg-muted shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <Separator className="mt-2" />
                </div>
              );
            })}
          </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
});

export default SmartSidebar;
