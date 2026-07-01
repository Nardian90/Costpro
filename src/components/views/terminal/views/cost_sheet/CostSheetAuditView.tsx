'use client';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
// P3-6: Radix Tabs eliminado — reemplazado por <UnifiedTabs> unificado.
import { UnifiedTabs } from './UnifiedTabs';
import { AlertTriangle, CheckCircle2, Zap, Calculator, Activity, Target, ShieldAlert, ArrowRight, RefreshCw, Unplug, GitBranch, AlertOctagon, FileWarning, ChevronRight, ChevronDown, Filter, FilterX, Eye, EyeOff, FileSearch, Layers, Flag } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostSheetAuditLog } from './CostSheetAuditLog';
import { ErrorDetailModal } from './ErrorDetailModal';

import { useUIStore, type PendingAuditFilter } from '@/store';
import { ValidationResult } from '@/lib/cost-engine/validations';
import { ValidationError, AuditEntry } from '@/lib/cost-engine/types';
import { CostSheetRow, CostSheetData, CostSheetHeader, CostSheetSection, CalculatedRowValue } from '@/types/cost-sheet';
import reinicioTemplate from '@/lib/data/costpro-reinicio';

import { useTranslations } from 'next-intl';
interface CostSheetAuditViewProps {
    data: CostSheetData;
    calculatedValues: Record<string, CalculatedRowValue>;
    calculatedHeader: CostSheetHeader | null;
    audits: AuditEntry[];
    validations?: ValidationResult[];
    deepValidationErrors?: ValidationError[];
}

/* ── ISA 540 Severity Classification ── */
type SeverityFilter = 'all' | 'CRITICAL' | 'WARNING' | 'INFO_SUCCESS';

interface SeverityConfig {
    label: string;
    icon: React.ElementType;
    countColor: string;
    cardBg: string;
    cardBorder: string;
    ringClass: string;
    subtitle: string;
}

const SEVERITY_CONFIG: Record<Exclude<SeverityFilter, 'all'>, SeverityConfig> & { all: { label: string; icon: React.ElementType; subtitle: string } } = {
    CRITICAL: {
        label: 'Errores Críticos',
        icon: AlertTriangle,
        countColor: 'text-destructive',
        cardBg: 'bg-destructive/5',
        cardBorder: 'border-destructive/20',
        ringClass: 'ring-2 ring-destructive/40 shadow-lg shadow-destructive/10',
        subtitle: 'Bloquean exportación',
    },
    WARNING: {
        label: 'Advertencias',
        icon: AlertTriangle,
        countColor: 'text-warning',
        cardBg: 'bg-warning/5',
        cardBorder: 'border-warning/20',
        ringClass: 'ring-2 ring-warning/40 shadow-lg shadow-warning/10',
        subtitle: 'Revisión sugerida',
    },
    INFO_SUCCESS: {
        label: 'Validaciones OK',
        icon: CheckCircle2,
        countColor: 'text-primary',
        cardBg: 'bg-primary/5',
        cardBorder: 'border-primary/20',
        ringClass: 'ring-2 ring-primary/40 shadow-lg shadow-primary/10',
        subtitle: 'Integridad confirmada',
    },
    all: {
        label: 'Todos',
        icon: Layers,
        subtitle: 'Sin filtro',
    },
};

const ERROR_CODE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    CYCLE:                   { icon: RefreshCw, label: 'Ciclo', color: 'text-violet-500 bg-violet-500/10' },
    MISSING_REF:             { icon: Unplug, label: 'Ref. Faltante', color: 'text-destructive bg-destructive/10' },
    SEMANTIC_DISCREPANCY:   { icon: GitBranch, label: 'Discrepancia', color: 'text-warning bg-warning/10' },
    INVALID_FORMULA:         { icon: AlertOctagon, label: 'Fórmula Inválida', color: 'text-destructive bg-destructive/10' },
    HARD_RULE_VIOLATION:     { icon: ShieldAlert, label: 'Regla Violada', color: 'text-rose-600 bg-rose-600/10' },
    TRIVIAL_FORMULA:         { icon: FileWarning, label: 'Fórmula Trivial', color: 'text-warning bg-warning/10' },
    HIERARCHY:               { icon: GitBranch, label: 'Jerarquía', color: 'text-sky-500 bg-sky-500/10' },
    EXTERNAL_LINK:           { icon: ArrowRight, label: 'Enlace Externo', color: 'text-muted-foreground bg-muted/10' },
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
    'Integridad Estructural': Calculator,
    'Rentabilidad': Target,
    'Formato Estándar Recomendado': Activity,
};

/* ── Row search helpers ── */

interface RowSearchResult {
    row: CostSheetRow;
    sectionLabel: string;
    path: (string | number)[];
}

function findRowById(rowId: string, row: CostSheetRow, path: (string | number)[]): { row: CostSheetRow; path: (string | number)[] } | null {
    if (row.id === rowId) return { row, path };
    if (row.children) {
        for (let i = 0; i < row.children.length; i++) {
            const found = findRowById(rowId, row.children[i], [...path, 'children', i]);
            if (found) return found;
        }
    }
    return null;
}

function findRowInSections(rowId: string, sections: CostSheetSection[]): RowSearchResult | null {
    for (const section of sections) {
        for (let i = 0; i < section.rows.length; i++) {
            const found = findRowById(rowId, section.rows[i], ['sections', sections.indexOf(section), 'rows', i]);
            if (found) return { ...found, sectionLabel: section.label || section.id };
        }
    }
    return null;
}

function findSuggestedRow(rowId: string): CostSheetRow | null {
    if (!reinicioTemplate?.sections) return null;
    for (const section of reinicioTemplate.sections) {
        for (const row of section.rows) {
            const found = findRowById(rowId, row, []);
            if (found) return found.row as CostSheetRow;
        }
    }
    return null;
}

/* ── ISA 540 §35: Group findings by risk level (row) ── */
interface RowFlagGroup {
    rowId: string;
    rowLabel: string;
    sectionLabel: string;
    errors: ValidationError[];
    criticals: number;
    warnings: number;
    infos: number;
    highestSeverity: 'CRITICAL' | 'WARNING' | 'INFO';
}

export { ERROR_CODE_CONFIG };

export const CostSheetAuditView: React.FC<CostSheetAuditViewProps> = ({
    data,
    calculatedValues,
    calculatedHeader,
    audits,
    validations = [],
    deepValidationErrors = []
}) => {
    const [selectedError, setSelectedError] = useState<ValidationError | null>(null);
    const [activeFilter, setActiveFilter] = useState<SeverityFilter>('all');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [initialFilterApplied, setInitialFilterApplied] = useState(false);
    const [sourceRowId, setSourceRowId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState('flags');

    // ── Consume pending audit filter from FlatTable click ──
    const pendingAuditFilter = useUIStore(state => state.pendingAuditFilter);
    const setPendingAuditFilter = useUIStore(state => state.setPendingAuditFilter);
    const flagTableRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (pendingAuditFilter && !initialFilterApplied) {
            // Apply severity filter
            const targetSeverity = pendingAuditFilter.severity === "INFO" ? "INFO_SUCCESS" : pendingAuditFilter.severity as SeverityFilter;
            const targetRowId = pendingAuditFilter.rowId;
            setTimeout(() => {
                setActiveFilter(targetSeverity);
                setExpandedRows(prev => {
                    const next = new Set(prev);
                    next.add(targetRowId);
                    return next;
                });
                setSourceRowId(targetRowId);
                setInitialFilterApplied(true);
                setPendingAuditFilter(null);
            }, 0);

            // Scroll to flag table after render
            requestAnimationFrame(() => {
                setTimeout(() => {
                    flagTableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 150);
            });
        }
    }, [pendingAuditFilter, initialFilterApplied, setPendingAuditFilter]);

    // Derive current row and suggested row from selected error
    const currentRowResult = selectedError && data?.sections
        ? findRowInSections(selectedError.rowId, data.sections)
        : null;

    const currentRow = currentRowResult?.row ?? null;
    const currentSectionLabel = currentRowResult?.sectionLabel ?? '';
    const rowPath = currentRowResult?.path ?? [];

    const suggestedRow = selectedError ? findSuggestedRow(selectedError.rowId) : null;

    const handleCloseModal = useCallback(() => {
        setSelectedError(null);
    }, []);

    const toggleRowExpand = useCallback((rowId: string) => {
        setExpandedRows(prev => {
            const next = new Set(prev);
            if (next.has(rowId)) next.delete(rowId);
            else next.add(rowId);
            return next;
        });
    }, []);

    // ── Merge deep validation errors into the summary counts ──
    const engineCriticals = deepValidationErrors.filter(e => e.type === 'CRITICAL');
    const engineWarnings = deepValidationErrors.filter(e => e.type === 'WARNING');
    const engineInfos = deepValidationErrors.filter(e => e.type === 'INFO');

    const healthCriticals = validations.filter(v => v.type === 'CRITICAL');
    const healthWarnings = validations.filter(v => v.type === 'WARNING');
    const healthSuccesses = validations.filter(v => v.type === 'SUCCESS');

    const totalCriticals = engineCriticals.length + healthCriticals.length;
    const totalWarnings = engineWarnings.length + healthWarnings.length;
    const totalOk = engineInfos.length + healthSuccesses.length;
    const totalErrors = deepValidationErrors.length;

    // ── ISA 540 §35: Group engine errors by rowId for Flag Table ──
    const rowFlagGroups = useMemo((): RowFlagGroup[] => {
        const map = new Map<string, ValidationError[]>();
        deepValidationErrors.forEach(err => {
            const key = err.rowId || '_unknown';
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(err);
        });

        return Array.from(map.entries()).map(([rowId, errors]) => {
            const criticals = errors.filter(e => e.type === 'CRITICAL').length;
            const warnings = errors.filter(e => e.type === 'WARNING').length;
            const infos = errors.filter(e => e.type === 'INFO').length;
            const rowResult = findRowInSections(rowId, data.sections || []);
            return {
                rowId,
                rowLabel: rowResult?.row?.label || rowId,
                sectionLabel: rowResult?.sectionLabel || '',
                errors,
                criticals,
                warnings,
                infos,
                highestSeverity: (criticals > 0 ? 'CRITICAL' : warnings > 0 ? 'WARNING' : 'INFO') as RowFlagGroup['highestSeverity'],
            };
        }).sort((a, b) => {
            const severityOrder = { CRITICAL: 0, WARNING: 1, INFO: 2 };
            if (severityOrder[a.highestSeverity] !== severityOrder[b.highestSeverity]) {
                return severityOrder[a.highestSeverity] - severityOrder[b.highestSeverity];
            }
            return (b.criticals + b.warnings + b.infos) - (a.criticals + a.warnings + a.infos);
        });
    }, [deepValidationErrors, data.sections]);

    // ── Apply active filter ──
    const filteredEngineErrors = useMemo(() => {
        let result = deepValidationErrors;
        // Severity filter
        if (activeFilter === 'CRITICAL') result = result.filter(e => e.type === 'CRITICAL');
        else if (activeFilter === 'WARNING') result = result.filter(e => e.type === 'WARNING');
        else if (activeFilter === 'INFO_SUCCESS') result = result.filter(e => e.type === 'INFO');
        // Row-level filter (when navigated from FlatTable)
        if (sourceRowId) result = result.filter(e => (e.rowId || '_unknown') === sourceRowId);
        return result;
    }, [deepValidationErrors, activeFilter, sourceRowId]);

    const filteredRowGroups = useMemo(() => {
        let result = rowFlagGroups;
        // Severity filter
        if (activeFilter !== 'all') {
            result = result.filter(g => {
                if (activeFilter === 'CRITICAL') return g.criticals > 0;
                if (activeFilter === 'WARNING') return g.warnings > 0;
                return g.infos > 0;
            });
        }
        // Row-level filter (when navigated from FlatTable)
        if (sourceRowId) result = result.filter(g => g.rowId === sourceRowId);
        return result;
    }, [rowFlagGroups, activeFilter, sourceRowId]);

    const filteredValidations = useMemo(() => {
        if (activeFilter === 'all') return validations;
        if (activeFilter === 'CRITICAL') return validations.filter(v => v.type === 'CRITICAL');
        if (activeFilter === 'WARNING') return validations.filter(v => v.type === 'WARNING');
        return validations.filter(v => v.type === 'SUCCESS');
    }, [validations, activeFilter]);

    const isFilterActive = activeFilter !== 'all' || !!sourceRowId;

    // ── Back to FlatTable handler ──
    const handleBackToSheet = useCallback(() => {
        setSourceRowId(null);
        setActiveFilter('all');
        useUIStore.getState().setActiveCostSection('main');
    }, []);

    // ── Clear row filter (stay in audit, show all) ──
    const handleClearRowFilter = useCallback(() => {
        setSourceRowId(null);
    }, []);

    // ── Source row info for breadcrumb ──
    const sourceRowGroup = sourceRowId ? rowFlagGroups.find(g => g.rowId === sourceRowId) : null;

    // ── Severity badge count helper ──
    const SeverityBadge = ({ count, type }: { count: number; type: 'CRITICAL' | 'WARNING' | 'INFO' }) => {
        if (count === 0) return null;
        const colors = {
            CRITICAL: 'bg-destructive/15 text-destructive border-destructive/25',
            WARNING: 'bg-warning/15 text-warning border-warning/25',
            INFO: 'bg-muted/50 text-muted-foreground border-muted-foreground/25',
        };
        return (
            <Badge variant="outline" className={cn('text-xs font-bold px-1.5 py-0 rounded-full leading-none', colors[type])}>
                {count} {type === 'CRITICAL' ? 'Err' : type === 'WARNING' ? 'Adv' : 'Info'}
            </Badge>
        );
    };

    return (
        <div className="space-y-8 pb-20" role="status" aria-live="polite" aria-label="Resultados de auditoría de ficha de costo">
            {/* ── Navigation breadcrumb: back to FlatTable row ── */}
            {sourceRowId && sourceRowGroup && (
                <div className="flex items-center gap-2 px-1 animate-in fade-in slide-in-from-top-2 duration-300">
                    <button
                        type="button"
                        onClick={handleBackToSheet}
                        className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground uppercase tracking-widest transition-colors"
                        aria-label="Volver a ficha de costo"
                    >
                        <ArrowRight className="w-3 h-3 rotate-180" />
                        Volver a Ficha
                    </button>
                    <span className="text-muted-foreground/70">|</span>
                    <button
                        type="button"
                        onClick={handleClearRowFilter}
                        className="flex items-center gap-1 text-xs font-bold text-primary/70 hover:text-primary uppercase tracking-widest transition-colors"
                        aria-label="Ver todas las filas en auditoría"
                    >
                        <Layers className="w-3 h-3" />
                        Ver todas las filas
                    </button>
                    <span className="text-muted-foreground/70">|</span>
                    <Badge variant="outline" className="text-xs font-bold rounded-full border-primary/30 text-primary bg-primary/5 px-2.5 gap-1">
                        <Eye className="w-2.5 h-2.5" />
                        {sourceRowGroup.rowLabel}
                        <span className="text-muted-foreground/70 font-mono ml-0.5">{sourceRowId}</span>
                    </Badge>
                    <span className="ml-auto text-xs text-muted-foreground/70 font-mono">
                        {sourceRowGroup.criticals + sourceRowGroup.warnings + sourceRowGroup.infos} hallazgo{sourceRowGroup.criticals + sourceRowGroup.warnings + sourceRowGroup.infos !== 1 ? 's' : ''}
                    </span>
                </div>
            )}

            {/* ── ISA 540 §35: Summary Cards as Risk-Based Filters ── */}
            <div className="space-y-3">
                {/* Active filter indicator bar */}
                {isFilterActive && (
                    <div className="flex items-center gap-2 px-1">
                        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
                            Filtro activo:
                        </span>
                        <Badge variant="outline" className="text-xs font-bold uppercase rounded-full border-primary/30 text-primary bg-primary/5 px-2.5">
                            {SEVERITY_CONFIG[activeFilter as keyof typeof SEVERITY_CONFIG]?.label || activeFilter}
                        </Badge>
                        <button type="button"
                            onClick={() => { setActiveFilter('all'); if (sourceRowId) handleClearRowFilter(); }}
                            className="ml-auto flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-destructive uppercase tracking-widest transition-colors"
                            aria-label="Quitar filtro"
                        >
                            <FilterX className="w-3 h-3" />
                            Quitar filtro
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Critical Card */}
                    <button
                        type="button"
                        onClick={() => setActiveFilter(prev => prev === 'CRITICAL' ? 'all' : 'CRITICAL')}
                        className={cn(
                            "rounded-3xl overflow-hidden relative group transition-all text-left w-full",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50",
                            totalCriticals > 0 ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/50",
                            activeFilter === 'CRITICAL' && SEVERITY_CONFIG.CRITICAL.ringClass,
                        )}
                        aria-pressed={activeFilter === 'CRITICAL'}
                        aria-label={`Filtrar por errores críticos. ${totalCriticals} errores críticos encontrados.`}
                    >
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <AlertTriangle className="w-16 h-16 text-destructive" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-destructive/70 flex items-center gap-2">
                                {activeFilter === 'CRITICAL' && <Eye className="w-3 h-3" />}
                                Errores Críticos
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-black text-destructive">{totalCriticals}</div>
                            <p className="text-xs text-destructive/70 font-bold uppercase mt-1">
                                {engineCriticals.length > 0 && `${engineCriticals.length} motor`}
                                {engineCriticals.length > 0 && healthCriticals.length > 0 && ' + '}
                                {healthCriticals.length > 0 && `${healthCriticals.length} salud`}
                                {totalCriticals === 0 && 'Sin errores'}
                            </p>
                        </CardContent>
                    </button>

                    {/* Warnings Card */}
                    <button
                        type="button"
                        onClick={() => setActiveFilter(prev => prev === 'WARNING' ? 'all' : 'WARNING')}
                        className={cn(
                            "rounded-3xl overflow-hidden relative group transition-all text-left w-full",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning/50",
                            totalWarnings > 0 ? "bg-warning/5 border-warning/20" : "bg-muted/30 border-border/50",
                            activeFilter === 'WARNING' && SEVERITY_CONFIG.WARNING.ringClass,
                        )}
                        aria-pressed={activeFilter === 'WARNING'}
                        aria-label={`Filtrar por advertencias. ${totalWarnings} advertencias encontradas.`}
                    >
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <AlertTriangle className="w-16 h-16 text-warning" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-warning/70 flex items-center gap-2">
                                {activeFilter === 'WARNING' && <Eye className="w-3 h-3" />}
                                Advertencias
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-black text-warning">{totalWarnings}</div>
                            <p className="text-xs text-warning/70 font-bold uppercase mt-1">Revisión de Parámetros Sugerida</p>
                        </CardContent>
                    </button>

                    {/* OK Card */}
                    <button
                        type="button"
                        onClick={() => setActiveFilter(prev => prev === 'INFO_SUCCESS' ? 'all' : 'INFO_SUCCESS')}
                        className={cn(
                            "rounded-3xl overflow-hidden relative group transition-all text-left w-full",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
                            totalOk > 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border/50",
                            activeFilter === 'INFO_SUCCESS' && SEVERITY_CONFIG.INFO_SUCCESS.ringClass,
                        )}
                        aria-pressed={activeFilter === 'INFO_SUCCESS'}
                        aria-label={`Filtrar por validaciones OK. ${totalOk} validaciones correctas.`}
                    >
                        <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                            <CheckCircle2 className="w-16 h-16 text-primary" />
                        </div>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-xs font-black uppercase tracking-widest text-primary/70 flex items-center gap-2">
                                {activeFilter === 'INFO_SUCCESS' && <Eye className="w-3 h-3" />}
                                Validaciones OK
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-4xl font-black text-primary">{totalOk}</div>
                            <p className="text-xs text-primary/70 font-bold uppercase mt-1">Integridad de Datos Confirmada</p>
                        </CardContent>
                    </button>
                </div>
            </div>

            {/* P3-6: Tabbed Audit Sections — migrado de Radix Tabs a <UnifiedTabs variant="pills">.
                Mismo state `activeTab`, pero ahora con touch targets ≥44px y consistencia visual. */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <UnifiedTabs
                        tabs={[
                          { id: 'flags', label: 'Tabla de Flags', icon: Flag, badge: totalErrors > 0 ? totalErrors : undefined },
                          { id: 'compliance', label: 'Cumplimiento', icon: Activity, badge: isFilterActive ? filteredValidations.length : undefined },
                          { id: 'auditlog', label: 'Bitácora', icon: RefreshCw, badge: audits.length },
                        ]}
                        activeTab={activeTab}
                        onTabChange={setActiveTab}
                        variant="pills"
                        ariaLabel="Secciones de auditoría"
                    />
                    <Badge variant="outline" className="text-xs font-bold uppercase tracking-wider px-3 h-6 rounded-full border-border/40 text-muted-foreground/70 hidden sm:inline-flex">
                        Protocolo v5.7
                    </Badge>
                </div>

                {/* ── Tab 1: Flag Table ── */}
                {activeTab === 'flags' && (
                <div className="mt-0 space-y-4">
                    <div ref={flagTableRef}>
                    {filteredRowGroups.length > 0 && (
                    <Card className={cn(
                        "backdrop-blur-sm rounded-[2rem] overflow-hidden transition-colors",
                        filteredRowGroups.some(g => g.highestSeverity === 'CRITICAL')
                            ? "border-destructive/20 bg-destructive/5"
                            : "border-border/50 bg-background/50"
                    )}>
                        <CardHeader className="border-b border-border/50 dark:border-white/5 pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    <Flag className="w-4 h-4" />
                                    <span className={filteredRowGroups.some(g => g.highestSeverity === 'CRITICAL') ? 'text-destructive' : 'text-foreground'}>
                                        Tabla de Flags por Fila
                                    </span>
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    {isFilterActive && (
                                        <Badge variant="outline" className="text-xs font-bold uppercase text-muted-foreground">
                                            {filteredRowGroups.length} de {rowFlagGroups.length} filas
                                        </Badge>
                                    )}
                                    {isFilterActive && (
                                        <button type="button"
                                            onClick={() => { setActiveFilter('all'); if (sourceRowId) handleClearRowFilter(); }}
                                            className="flex items-center gap-1 text-xs font-bold text-muted-foreground hover:text-destructive uppercase tracking-widest transition-colors"
                                            aria-label="Quitar filtro"
                                        >
                                            <FilterX className="w-3.5 h-3.5" />
                                            Mostrar todos
                                        </button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                    <div className="w-full">
                        <div className="divide-y divide-border/30 dark:divide-white/5">
                            {filteredRowGroups.map((group) => {
                                const isExpanded = expandedRows.has(group.rowId);
                                const totalIssues = group.criticals + group.warnings + group.infos;
                                const highestBorder = group.highestSeverity === 'CRITICAL'
                                    ? 'border-l-destructive'
                                    : group.highestSeverity === 'WARNING'
                                    ? 'border-l-warning'
                                    : 'border-l-blue-400';

                                return (
                                    <div key={group.rowId} className={cn(
                                        "border-l-2",
                                        highestBorder,
                                        sourceRowId === group.rowId && "bg-primary/[0.06] ring-1 ring-inset ring-primary/20"
                                    )}>
                                        {/* ── Row Group Header (ISA 540: drill-down) ── */}
                                        <button
                                            type="button"
                                            onClick={() => toggleRowExpand(group.rowId)}
                                            className={cn(
                                                "w-full text-left px-5 py-4 transition-all group/row",
                                                "hover:bg-muted/40 cursor-pointer",
                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
                                            )}
                                            aria-expanded={isExpanded}
                                            aria-label={`Fila ${group.rowId}: ${group.rowLabel} — ${totalIssues} hallazgos. ${isExpanded ? 'Colapsar' : 'Expandir'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                {/* Expand/collapse chevron */}
                                                <div className={cn(
                                                    "w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-all",
                                                    isExpanded ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground group-hover/row:bg-muted group-hover/row:text-muted-foreground"
                                                )}>
                                                    {isExpanded
                                                        ? <ChevronDown className="w-3.5 h-3.5" />
                                                        : <ChevronRight className="w-3.5 h-3.5" />
                                                    }
                                                </div>

                                                {/* Row info */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                        <span className="text-sm font-bold text-foreground group-hover/row:text-primary transition-colors truncate max-w-[200px]">
                                                            {group.rowLabel}
                                                        </span>
                                                        {sourceRowId === group.rowId && (
                                                            <Badge className="text-xs font-bold px-1.5 py-0 rounded-full bg-primary/15 text-primary border border-primary/25 animate-in fade-in duration-500">
                                                                <Eye className="w-2.5 h-2.5 mr-0.5" />
                                                                Origen
                                                            </Badge>
                                                        )}
                                                        <span className="text-xs font-mono text-muted-foreground">
                                                            {group.rowId}
                                                        </span>
                                                        {group.sectionLabel && (
                                                            <span className="text-xs text-muted-foreground/70 uppercase tracking-wider truncate max-w-[150px]">
                                                                {group.sectionLabel}
                                                            </span>
                                                        )}
                                                    </div>
                                                    {/* Severity count badges */}
                                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                                        <SeverityBadge count={group.criticals} type="CRITICAL" />
                                                        <SeverityBadge count={group.warnings} type="WARNING" />
                                                        <SeverityBadge count={group.infos} type="INFO" />
                                                        {!isExpanded && (
                                                            <span className="text-xs text-muted-foreground/70 ml-1">
                                                                {totalIssues} hallazgo{totalIssues !== 1 ? 's' : ''}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Quick action: open first critical */}
                                                {group.criticals > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const critical = group.errors.find(er => er.type === 'CRITICAL');
                                                            if (critical) setSelectedError(critical);
                                                        }}
                                                        className={cn(
                                                            "shrink-0 p-2 rounded-xl bg-destructive/10 text-destructive",
                                                            "hover:bg-destructive/20 transition-all",
                                                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/50"
                                                        )}
                                                        aria-label={`Ver detalle del error crítico en fila ${group.rowId}`}
                                                    >
                                                        <ShieldAlert className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>
                                        </button>

                                        {/* ── Expanded: Individual errors for this row ── */}
                                        {isExpanded && (
                                            <div className="border-t border-border/20 dark:border-white/5">
                                                {group.errors.map((err, i) => {
                                                    const config = ERROR_CODE_CONFIG[err.code] || { icon: Zap, label: err.code, color: 'text-muted-foreground bg-muted' };
                                                    const IconComp = config.icon;
                                                    const isCritical = err.type === 'CRITICAL';
                                                    const isWarning = err.type === 'WARNING';
                                                    const isSelected = selectedError?.rowId === err.rowId && selectedError?.code === err.code;

                                                    return (
                                                        <button
                                                            key={`${err.rowId}-${err.code}-${i}`}
                                                            type="button"
                                                            onClick={() => setSelectedError(err)}
                                                            className={cn(
                                                                "w-full text-left px-5 pl-[4.5rem] py-3.5 transition-all group/err",
                                                                "hover:bg-muted/30 cursor-pointer",
                                                                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50",
                                                                isSelected && "bg-primary/5",
                                                            )}
                                                            aria-label={`Ver detalle: ${err.message}`}
                                                        >
                                                            <div className="flex gap-3 items-start">
                                                                <div className={cn("mt-0.5 p-1.5 rounded-lg shrink-0", config.color)}>
                                                                    <IconComp className="w-3.5 h-3.5" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex flex-wrap items-center gap-2 mb-0.5">
                                                                        <Badge variant="outline" className={cn(
                                                                            "text-xs font-black uppercase tracking-wider px-2 py-0 rounded-full border",
                                                                            isCritical ? "border-destructive/30 text-destructive bg-destructive/5" :
                                                                            isWarning ? "border-warning/30 text-warning bg-warning/5" :
                                                                            "border-border text-muted-foreground bg-muted/50"
                                                                        )}>
                                                                            {config.label}
                                                                        </Badge>
                                                                        <Badge variant="outline" className={cn(
                                                                            "text-xs font-bold uppercase px-1.5 py-0 rounded",
                                                                            isCritical ? "border-destructive/20 text-destructive/70" :
                                                                            isWarning ? "border-warning/20 text-warning/70" :
                                                                            "border-border text-muted-foreground"
                                                                        )}>
                                                                            {err.type}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className={cn(
                                                                        "text-xs font-medium leading-relaxed",
                                                                        isCritical ? "text-destructive/80" :
                                                                        isWarning ? "text-warning/80" :
                                                                        "text-muted-foreground"
                                                                    )}>
                                                                        {err.message}
                                                                    </p>
                                                                </div>
                                                                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/70 group-hover/err:text-muted-foreground shrink-0 mt-0.5 group-hover/err:translate-x-0.5 transition-transform" />
                                                            </div>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
            </Card>
            )}

            {/* Empty state when filter yields no results */}
            {isFilterActive && filteredRowGroups.length === 0 && totalErrors > 0 && (
                <Card className="border-border/50 bg-muted/20 rounded-[2rem]">
                    <CardContent className="p-12 text-center">
                        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                            <EyeOff className="w-8 h-8 text-muted-foreground" />
                        </div>
                        <h3 className="font-bold text-sm uppercase">Sin resultados para este filtro</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            No se encontraron hallazgos del tipo seleccionado.
                        </p>
                        <button type="button"
                            onClick={() => setActiveFilter('all')}
                            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-primary bg-primary/10 hover:bg-primary/20 transition-colors"
                        >
                            <FilterX className="w-3.5 h-3.5" />
                            Mostrar todos
                        </button>
                    </CardContent>
                </Card>
            )}
                    </div>
                </div>
                )}

                {/* ── Tab 2: Compliance Audit List ── */}
                {activeTab === 'compliance' && (
                <div className="mt-0">
                    <Card className="border-border/50 dark:border-white/5 bg-background/50 backdrop-blur-sm rounded-[2rem]">
                        <CardHeader className="border-b border-border/50 dark:border-white/5 pb-4">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-primary" />
                                    Auditoría de Cumplimiento y Normativas
                                </CardTitle>
                                <div className="flex items-center gap-2">
                                    {isFilterActive && (
                                <Badge variant="outline" className="text-xs font-bold uppercase text-muted-foreground">
                                    {filteredValidations.length} de {validations.length}
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="w-full">
                        <div className="divide-y divide-border/50 dark:divide-white/5">
                            {filteredValidations.length === 0 && (
                                <div className="p-12 text-center">
                                    {isFilterActive ? (
                                        <>
                                            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <EyeOff className="w-8 h-8 text-muted-foreground" />
                                            </div>
                                            <h3 className="font-bold text-sm uppercase">Sin hallazgos para este filtro</h3>
                                            <p className="text-xs text-muted-foreground mt-1">No hay validaciones del tipo seleccionado.</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <CheckCircle2 className="w-8 h-8 text-primary" />
                                            </div>
                                            <h3 className="font-bold text-sm uppercase">Ficha Impecable</h3>
                                            <p className="text-xs text-muted-foreground mt-1">No se detectaron inconsistencias estructurales ni normativas.</p>
                                        </>
                                    )}
                                </div>
                            )}
                            {filteredValidations.map((v, i) => {
                                const CategoryIcon = CATEGORY_ICONS[v.category] || Zap;
                                return (
                                    <div key={i} className={cn(
                                        "p-6 hover:bg-muted/30 transition-all group",
                                        v.type === 'CRITICAL' && "border-l-2 border-l-destructive",
                                        v.type === 'WARNING' && "border-l-2 border-l-warning",
                                    )}>
                                        <div className="flex gap-4 items-start">
                                            <div className={cn(
                                                "mt-1 p-2 rounded-xl shrink-0",
                                                v.type === 'CRITICAL' ? "bg-destructive/10 text-destructive" :
                                                v.type === 'WARNING' ? "bg-warning/10 text-warning" :
                                                "bg-primary/10 text-primary"
                                            )}>
                                                <CategoryIcon className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={cn(
                                                        "text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                        v.type === 'CRITICAL' ? "border-destructive/20 text-destructive" :
                                                        v.type === 'WARNING' ? "border-warning/20 text-warning" :
                                                        "border-primary/20 text-primary"
                                                    )}>
                                                        {v.category}
                                                    </span>
                                                    {v.rowId && (
                                                        <span className="text-xs font-mono text-muted-foreground">REF: {v.rowId}</span>
                                                    )}
                                                </div>
                                                <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{v.title}</h4>
                                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{v.message}</p>
                                            </div>
                                            {/* Status indicator */}
                                            <div className={cn(
                                                "shrink-0 w-2 h-2 rounded-full mt-2",
                                                v.type === 'CRITICAL' ? "bg-destructive" :
                                                v.type === 'WARNING' ? "bg-warning" :
                                                "bg-primary"
                                            )} title={v.type} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </CardContent>
                    </Card>
                </div>
                )}

                {/* ── Tab 3: Audit Log (Declarative Engine) ── */}
                {activeTab === 'auditlog' && (
                    <CostSheetAuditLog audits={audits} />
                )}
            </div>

            {/* Error Detail Modal — key forces remount so form state resets on error change */}
            <ErrorDetailModal
                key={selectedError ? `${selectedError.rowId}-${selectedError.code}` : 'none'}
                error={selectedError}
                currentRow={currentRow}
                suggestedRow={suggestedRow}
                currentSectionLabel={currentSectionLabel}
                rowPath={rowPath}
                isOpen={selectedError !== null}
                onClose={handleCloseModal}
            />
        </div>
    );
};
export default CostSheetAuditView;
