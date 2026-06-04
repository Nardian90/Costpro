'use client';

import React, { useState, useCallback, useMemo } from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
    AlertTriangle,
    AlertCircle,
    Info,
    Copy,
    Save,
    Wand2,
    ArrowLeftRight,
    FileWarning,
    GitBranch,
    RefreshCw,
    ShieldAlert,
    Unplug,
    AlertOctagon,
    X,
    Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useCostSheetStore } from '@/store/cost-sheet-store';
import { ValidationError } from '@/lib/cost-engine/types';
import { CostSheetRow } from '@/types/cost-sheet';

/* ── Error code config (shared with audit view) ── */
const ERROR_CODE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    CYCLE:                   { icon: RefreshCw, label: 'Ciclo', color: 'text-violet-500 bg-violet-500/10' },
    MISSING_REF:             { icon: Unplug, label: 'Ref. Faltante', color: 'text-red-500 bg-red-500/10' },
    SEMANTIC_DISCREPANCY:   { icon: GitBranch, label: 'Discrepancia', color: 'text-orange-500 bg-orange-500/10' },
    INVALID_FORMULA:         { icon: AlertOctagon, label: 'Fórmula Inválida', color: 'text-red-600 bg-red-600/10' },
    HARD_RULE_VIOLATION:     { icon: ShieldAlert, label: 'Regla Violada', color: 'text-rose-600 bg-rose-600/10' },
    TRIVIAL_FORMULA:         { icon: FileWarning, label: 'Fórmula Trivial', color: 'text-amber-500 bg-amber-500/10' },
    HIERARCHY:               { icon: GitBranch, label: 'Jerarquía', color: 'text-sky-500 bg-sky-500/10' },
    EXTERNAL_LINK:           { icon: ArrowLeftRight, label: 'Enlace Externo', color: 'text-slate-400 bg-slate-400/10' },
};

/* ── Severity styling ── */
const SEVERITY_STYLES: Record<string, { badge: string; border: string; bg: string; icon: React.ElementType }> = {
    CRITICAL: {
        badge: 'bg-destructive/20 text-destructive border-destructive/30',
        border: 'border-l-destructive',
        bg: 'bg-destructive/5',
        icon: AlertTriangle,
    },
    WARNING: {
        badge: 'bg-amber-500/20 text-amber-600 border-amber-500/30',
        border: 'border-l-amber-500',
        bg: 'bg-amber-500/5',
        icon: AlertCircle,
    },
    INFO: {
        badge: 'bg-muted/50 text-muted-foreground border-muted-foreground/30',
        border: 'border-l-muted-foreground/50',
        bg: 'bg-muted/30',
        icon: Info,
    },
};

/* Inline component: badge shown when current formula matches the standard */
function FormulaMatchBadge({ matches }: { matches: boolean | null | undefined }) {
    if (!matches) return null;
    return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 text-[10px] font-bold shrink-0">
            <Check className="w-3 h-3" />
            Correcta según estándar
        </div>
    );
}

interface ErrorDetailModalProps {
    error: ValidationError | null;
    currentRow: CostSheetRow | null;
    suggestedRow: CostSheetRow | null;
    currentSectionLabel: string;
    rowPath: (string | number)[];
    isOpen: boolean;
    onClose: () => void;
}

export const ErrorDetailModal: React.FC<ErrorDetailModalProps> = ({
    error,
    currentRow,
    suggestedRow,
    currentSectionLabel,
    rowPath,
    isOpen,
    onClose,
}) => {
    const updateValue = useCostSheetStore((s) => s.updateValue);

    /* Initialize form state from current row (runs on mount; parent passes a key to force remount on error change) */
    const [editedTotalFormula, setEditedTotalFormula] = useState<string>(() => currentRow?.totalFormula ?? '');
    const [editedVhFormula, setEditedVhFormula] = useState<string>(() => currentRow?.vhFormula ?? '');
    const [activeTab, setActiveTab] = useState<string>('total');

    /* Derived values needed by hooks */
    const hasSuggestedTotal = suggestedRow && suggestedRow.totalFormula && suggestedRow.totalFormula.trim() !== '';
    const hasSuggestedVh = suggestedRow && suggestedRow.vhFormula && suggestedRow.vhFormula.trim() !== '';

    /* Derive hasChanges without state or effects */
    const hasChanges = useMemo(() => {
        return editedTotalFormula !== (currentRow?.totalFormula ?? '')
            || editedVhFormula !== (currentRow?.vhFormula ?? '');
    }, [editedTotalFormula, editedVhFormula, currentRow]);

    /* ── Handlers — all hooks before conditional return ── */
    const handleApplySuggestedTotal = useCallback(() => {
        if (!hasSuggestedTotal || !suggestedRow) return;
        setEditedTotalFormula(suggestedRow.totalFormula ?? '');
        toast.success('Fórmula total sugerida copiada al editor');
    }, [hasSuggestedTotal, suggestedRow]);

    const handleApplySuggestedVh = useCallback(() => {
        if (!hasSuggestedVh || !suggestedRow) return;
        setEditedVhFormula(suggestedRow.vhFormula ?? '');
        toast.success('Fórmula VH sugerida copiada al editor');
    }, [hasSuggestedVh, suggestedRow]);

    const handleApplyAllSuggested = useCallback(() => {
        let applied = false;
        if (hasSuggestedTotal && suggestedRow?.totalFormula) {
            setEditedTotalFormula(suggestedRow.totalFormula);
            applied = true;
        }
        if (hasSuggestedVh && suggestedRow?.vhFormula) {
            setEditedVhFormula(suggestedRow.vhFormula);
            applied = true;
        }
        if (applied) {
            toast.success('Fórmulas sugeridas copiadas al editor');
        } else {
            toast.info('No hay fórmulas sugeridas disponibles para esta fila');
        }
    }, [hasSuggestedTotal, hasSuggestedVh, suggestedRow]);

    const handleSave = useCallback(() => {
        if (!rowPath.length || !currentRow) return;

        const updates: { path: (string | number)[]; value: string }[] = [];
        const originalTotal = currentRow.totalFormula ?? '';
        const originalVh = currentRow.vhFormula ?? '';

        if (editedTotalFormula !== originalTotal) {
            updates.push({ path: [...rowPath, 'totalFormula'], value: editedTotalFormula });
        }
        if (editedVhFormula !== originalVh) {
            updates.push({ path: [...rowPath, 'vhFormula'], value: editedVhFormula });
        }

        if (updates.length > 0) {
            updates.forEach(({ path, value }) => updateValue(path, value));
            toast.success('Fórmula(s) actualizada(s) correctamente — recálculo automático en curso');
            onClose();
        } else {
            toast.info('No hay cambios para guardar');
        }
    }, [rowPath, currentRow, editedTotalFormula, editedVhFormula, updateValue, onClose]);

    /* ── Guard: if no error selected, render closed Dialog shell only ── */
    if (!error) {
        return (
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="rounded-[2rem] sm:max-w-2xl backdrop-blur-xl bg-background/95 border-border/50 shadow-2xl shadow-black/10">
                    <DialogHeader>
                        <DialogTitle>No hay elemento seleccionado</DialogTitle>
                        <DialogDescription>Seleccione un elemento de la lista de auditoría para ver sus detalles.</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={onClose} className="rounded-xl text-xs font-bold h-9 px-4">
                            <X className="w-3.5 h-3.5 mr-1.5" />
                            Cerrar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    const severity = SEVERITY_STYLES[error.type] ?? SEVERITY_STYLES.INFO;
    const errorCodeConfig = ERROR_CODE_CONFIG[error.code] || { icon: AlertOctagon, label: error.code, color: 'text-muted-foreground bg-muted' };

    /* Check if formulas match the standard (current == suggested) */
    const totalFormulaMatches = !!(hasSuggestedTotal && suggestedRow && editedTotalFormula.trim() === suggestedRow.totalFormula?.trim());
    const vhFormulaMatches = !!(hasSuggestedVh && suggestedRow && editedVhFormula.trim() === suggestedRow.vhFormula?.trim());

    /* Determine title based on severity type */
    const detailTitle = error.type === 'INFO'
        ? `Información — Fila ${error.rowId}`
        : error.type === 'WARNING'
            ? `Advertencia — Fila ${error.rowId}`
            : `Detalle del Error — Fila ${error.rowId}`;

    const detailDescription = error.type === 'INFO'
        ? `Información de auditoría para la fila ${error.rowId}`
        : `Modal de detalle del error de cálculo para la fila ${error.rowId}`;

    const ErrorIcon = errorCodeConfig ? errorCodeConfig.icon : AlertOctagon;
    const SeverityIcon = severity.icon;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className={cn(
                'rounded-[2rem] sm:max-w-2xl',
                'backdrop-blur-xl bg-background/95 border-border/50',
                'shadow-2xl shadow-black/10',
            )}>
                {/* ── Header ── */}
                <DialogHeader className="pb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                        <Badge variant="outline" className={cn(
                            'text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border',
                            severity.badge,
                        )}>
                            {error.type}
                        </Badge>
                        {errorCodeConfig && (
                            <div className={cn('flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold', errorCodeConfig.color)}>
                                <ErrorIcon className="w-3.5 h-3.5" />
                                {errorCodeConfig.label}
                            </div>
                        )}
                    </div>
                    <DialogTitle className="text-base font-bold mt-1">
                        {detailTitle}
                    </DialogTitle>
                    <DialogDescription className="sr-only">
                        {detailDescription}
                    </DialogDescription>
                </DialogHeader>

                {/* ── Error Information ── */}
                <div className={cn('rounded-2xl border border-border/50 p-4 space-y-3', severity.bg)}>
                    <div className="flex items-start gap-2.5">
                        <SeverityIcon className={cn('w-5 h-5 mt-0.5 shrink-0', severity.badge.includes('destructive') ? 'text-destructive' : severity.badge.includes('amber') ? 'text-amber-500' : 'text-muted-foreground')} />
                        <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-medium leading-relaxed', severity.badge.includes('destructive') ? 'text-destructive/90' : severity.badge.includes('amber') ? 'text-amber-600/90' : 'text-muted-foreground')}>
                                {error.message}
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                        <div className="bg-background/60 rounded-xl px-3 py-2">
                            <span className="text-muted-foreground font-semibold uppercase tracking-wider block text-[10px]">Fila ID</span>
                            <span className="font-mono font-bold text-foreground">{error.rowId}</span>
                        </div>
                        <div className="bg-background/60 rounded-xl px-3 py-2">
                            <span className="text-muted-foreground font-semibold uppercase tracking-wider block text-[10px]">Etiqueta</span>
                            <span className="font-medium text-foreground truncate block">{currentRow?.label || '—'}</span>
                        </div>
                        <div className="bg-background/60 rounded-xl px-3 py-2 col-span-2 sm:col-span-1">
                            <span className="text-muted-foreground font-semibold uppercase tracking-wider block text-[10px]">Sección</span>
                            <span className="font-medium text-foreground truncate block">{currentSectionLabel || '—'}</span>
                        </div>
                    </div>

                    {error.code === 'MISSING_REF' && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 text-xs text-blue-600/80 leading-relaxed flex items-start gap-2">
                            <Info className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>
                                Una referencia en la fórmula apunta a una fila que no existe o fue eliminada.
                                Verifique la estructura de filas de la ficha o aplique la fórmula sugerida de la plantilla NUEVA FICHA.
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Formula Panel ── */}
                <div className="rounded-2xl border border-border/50 overflow-hidden">
                    <Tabs value={activeTab} onValueChange={setActiveTab}>
                        <div className="px-4 pt-3 pb-0 border-b border-border/30">
                            <TabsList className="bg-muted/50 h-9 p-0.5 rounded-xl w-full">
                                <TabsTrigger value="total" className="rounded-lg text-xs font-bold h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1">
                                    Fórmula Total
                                </TabsTrigger>
                                <TabsTrigger value="vh" className="rounded-lg text-xs font-bold h-7 data-[state=active]:bg-background data-[state=active]:shadow-sm flex-1">
                                    Fórmula VH
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Total Formula Tab */}
                        <TabsContent value="total" className="p-4 space-y-3 mt-0">
                            <div className="space-y-1.5">
                                <label htmlFor="error-total-formula" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Fórmula Actual (editable)
                                </label>
                                <Textarea
                                    id="error-total-formula"
                                    value={editedTotalFormula}
                                    onChange={(e) => setEditedTotalFormula(e.target.value)}
                                    placeholder="Sin fórmula definida"
                                    className={cn(
                                        'font-mono text-sm min-h-[60px] resize-y rounded-xl',
                                        'bg-background/80 border-border/50',
                                        'focus:ring-1 focus:ring-primary/50',
                                    )}
                                />
                            </div>

                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                <ArrowLeftRight className="w-3 h-3" />
                                Comparación con NUEVA FICHA
                            </div>

                            <div className="rounded-xl border border-dashed border-primary/20 bg-primary/5 p-3">
                                {hasSuggestedTotal ? (
                                    <>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                                                Fórmula Sugerida
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <FormulaMatchBadge matches={totalFormulaMatches} />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleApplySuggestedTotal}
                                                    className="h-6 px-2 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                                                >
                                                    <Copy className="w-3 h-3 mr-1" />
                                                    Copiar al editor
                                                </Button>
                                            </div>
                                        </div>
                                        <code className="block text-xs font-mono text-primary/90 bg-background/60 rounded-lg p-2.5 leading-relaxed break-all">
                                            {suggestedRow!.totalFormula}
                                        </code>
                                    </>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                                        <Info className="w-3.5 h-3.5" />
                                        No hay fórmula total sugerida en la plantilla NUEVA FICHA para esta fila.
                                    </p>
                                )}
                            </div>
                        </TabsContent>

                        {/* VH Formula Tab */}
                        <TabsContent value="vh" className="p-4 space-y-3 mt-0">
                            <div className="space-y-1.5">
                                <label htmlFor="error-vh-formula" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    Fórmula VH Actual (editable)
                                </label>
                                <Textarea
                                    id="error-vh-formula"
                                    value={editedVhFormula}
                                    onChange={(e) => setEditedVhFormula(e.target.value)}
                                    placeholder="Sin fórmula VH definida"
                                    className={cn(
                                        'font-mono text-sm min-h-[60px] resize-y rounded-xl',
                                        'bg-background/80 border-border/50',
                                        'focus:ring-1 focus:ring-primary/50',
                                    )}
                                />
                            </div>

                            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                <ArrowLeftRight className="w-3 h-3" />
                                Comparación con NUEVA FICHA
                            </div>

                            <div className="rounded-xl border border-dashed border-primary/20 bg-primary/5 p-3">
                                {hasSuggestedVh ? (
                                    <>
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-primary/70">
                                                Fórmula VH Sugerida
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <FormulaMatchBadge matches={vhFormulaMatches} />
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={handleApplySuggestedVh}
                                                    className="h-6 px-2 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                                                >
                                                    <Copy className="w-3 h-3 mr-1" />
                                                    Copiar al editor
                                                </Button>
                                            </div>
                                        </div>
                                        <code className="block text-xs font-mono text-primary/90 bg-background/60 rounded-lg p-2.5 leading-relaxed break-all">
                                            {suggestedRow!.vhFormula}
                                        </code>
                                    </>
                                ) : (
                                    <p className="text-xs text-muted-foreground italic flex items-center gap-1.5">
                                        <Info className="w-3.5 h-3.5" />
                                        No hay fórmula VH sugerida en la plantilla NUEVA FICHA para esta fila.
                                    </p>
                                )}
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>

                {/* ── Footer ── */}
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        className="rounded-xl text-xs font-bold h-9 px-4"
                    >
                        <X className="w-3.5 h-3.5 mr-1.5" />
                        Cancelar
                    </Button>

                    {(hasSuggestedTotal || hasSuggestedVh) && (
                        <Button
                            variant="outline"
                            onClick={handleApplyAllSuggested}
                            className="rounded-xl text-xs font-bold h-9 px-4 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
                        >
                            <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                            Aplicar Fórmula Sugerida
                        </Button>
                    )}

                    <Button
                        onClick={handleSave}
                        disabled={!hasChanges}
                        className="rounded-xl text-xs font-bold h-9 px-4 bg-gradient-to-r from-primary to-primary/90 hover:opacity-90 disabled:opacity-50"
                    >
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
