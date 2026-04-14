'use client';

import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle2, Info, Zap, Calculator, Activity, Target, ShieldAlert, ArrowRight, RefreshCw, Unplug, GitBranch, AlertOctagon, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostSheetAuditLog } from './CostSheetAuditLog';

import { ValidationResult } from '@/lib/cost-engine/validations';
import { ValidationError } from '@/lib/cost-engine/types';

interface CostSheetAuditViewProps {
    data: any;
    calculatedValues: any;
    calculatedHeader: any;
    audits: any[];
    validations?: ValidationResult[];
    deepValidationErrors?: ValidationError[];
}

const ERROR_CODE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
    CYCLE:                   { icon: RefreshCw, label: 'Ciclo', color: 'text-violet-500 bg-violet-500/10' },
    MISSING_REF:             { icon: Unplug, label: 'Ref. Faltante', color: 'text-red-500 bg-red-500/10' },
    SEMANTIC_DISCREPANCY:   { icon: GitBranch, label: 'Discrepancia', color: 'text-orange-500 bg-orange-500/10' },
    INVALID_FORMULA:         { icon: AlertOctagon, label: 'Fórmula Inválida', color: 'text-red-600 bg-red-600/10' },
    HARD_RULE_VIOLATION:     { icon: ShieldAlert, label: 'Regla Violada', color: 'text-rose-600 bg-rose-600/10' },
    TRIVIAL_FORMULA:         { icon: FileWarning, label: 'Fórmula Trivial', color: 'text-amber-500 bg-amber-500/10' },
    HIERARCHY:               { icon: GitBranch, label: 'Jerarquía', color: 'text-sky-500 bg-sky-500/10' },
    EXTERNAL_LINK:           { icon: ArrowRight, label: 'Enlace Externo', color: 'text-slate-400 bg-slate-400/10' },
};

export const CostSheetAuditView: React.FC<CostSheetAuditViewProps> = ({
    data,
    calculatedValues,
    calculatedHeader,
    audits,
    validations = [],
    deepValidationErrors = []
}) => {

    // Merge deep validation errors into the summary counts
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

    return (
        <div className="space-y-8 pb-20" role="status" aria-live="polite" aria-label="Resultados de auditoría de ficha de costo">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className={cn(
                    "rounded-3xl overflow-hidden relative group transition-all",
                    totalCriticals > 0 ? "bg-destructive/5 border-destructive/20" : "bg-muted/30 border-border/50"
                )}>
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <AlertTriangle className="w-16 h-16 text-destructive" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-destructive/70">Errores Críticos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-destructive">{totalCriticals}</div>
                        <p className="text-xs text-destructive/60 font-bold uppercase mt-1">
                            {engineCriticals.length > 0 && `${engineCriticals.length} motor`}
                            {engineCriticals.length > 0 && healthCriticals.length > 0 && ' + '}
                            {healthCriticals.length > 0 && `${healthCriticals.length} salud`}
                            {totalCriticals === 0 && 'Sin errores'}
                        </p>
                    </CardContent>
                </Card>

                <Card className={cn(
                    "rounded-3xl overflow-hidden relative group transition-all",
                    totalWarnings > 0 ? "bg-amber-500/5 border-amber-500/20" : "bg-muted/30 border-border/50"
                )}>
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <AlertTriangle className="w-16 h-16 text-amber-500" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-amber-500/70">Advertencias</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-amber-500">{totalWarnings}</div>
                        <p className="text-xs text-amber-500/60 font-bold uppercase mt-1">Revisión de Parámetros Sugerida</p>
                    </CardContent>
                </Card>

                <Card className={cn(
                    "rounded-3xl overflow-hidden relative group transition-all",
                    totalOk > 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30 border-border/50"
                )}>
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <CheckCircle2 className="w-16 h-16 text-primary" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-xs font-black uppercase tracking-widest text-primary/70">Validaciones OK</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-primary">{totalOk}</div>
                        <p className="text-xs text-primary/60 font-bold uppercase mt-1">Integridad de Datos Confirmada</p>
                    </CardContent>
                </Card>
            </div>

            {/* Deep Validation Errors — Engine Row-Level Errors */}
            {totalErrors > 0 && (
            <Card className="border-destructive/20 bg-destructive/5 backdrop-blur-sm rounded-[2rem] overflow-hidden">
                <CardHeader className="border-b border-destructive/10 pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 text-destructive">
                            <ShieldAlert className="w-4 h-4" />
                            Errores del Motor de Cálculo
                        </CardTitle>
                        <div className="flex items-center gap-2">
                            {engineCriticals.length > 0 && (
                                <Badge className="bg-destructive/20 text-destructive border-destructive/30 text-xs font-bold">
                                    {engineCriticals.length} Críticos
                                </Badge>
                            )}
                            {engineWarnings.length > 0 && (
                                <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-xs font-bold">
                                    {engineWarnings.length} Advertencias
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className={cn("w-full", totalErrors > 6 ? "h-[400px]" : "max-h-[400px]")}>
                        <div className="divide-y divide-destructive/10">
                            {deepValidationErrors.map((err, i) => {
                                const config = ERROR_CODE_CONFIG[err.code] || { icon: Zap, label: err.code, color: 'text-muted-foreground bg-muted' };
                                const IconComp = config.icon;
                                const isCritical = err.type === 'CRITICAL';
                                const isWarning = err.type === 'WARNING';

                                return (
                                    <div key={i} className={cn(
                                        "p-5 transition-all group hover:bg-destructive/5",
                                        isCritical && "border-l-2 border-l-destructive",
                                        isWarning && "border-l-2 border-l-amber-500"
                                    )}>
                                        <div className="flex gap-4 items-start">
                                            <div className={cn(
                                                "mt-0.5 p-2 rounded-xl shrink-0",
                                                config.color
                                            )}>
                                                <IconComp className="w-4 h-4" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <Badge variant="outline" className={cn(
                                                        "text-[10px] font-black uppercase tracking-wider px-2 py-0 rounded-full border",
                                                        isCritical ? "border-destructive/30 text-destructive bg-destructive/5" :
                                                        isWarning ? "border-amber-500/30 text-amber-600 bg-amber-500/5" :
                                                        "border-border text-muted-foreground bg-muted/50"
                                                    )}>
                                                        {config.label}
                                                    </Badge>
                                                    <span className="text-xs font-mono text-muted-foreground">
                                                        Fila: {err.rowId}
                                                    </span>
                                                    <Badge variant="outline" className={cn(
                                                        "text-[9px] font-bold uppercase px-1.5 py-0 rounded",
                                                        isCritical ? "border-destructive/20 text-destructive/70" :
                                                        isWarning ? "border-amber-500/20 text-amber-500/70" :
                                                        "border-border text-muted-foreground"
                                                    )}>
                                                        {err.type}
                                                    </Badge>
                                                </div>
                                                <p className={cn(
                                                    "text-sm font-medium",
                                                    isCritical ? "text-destructive/90" :
                                                    isWarning ? "text-amber-600/90" :
                                                    "text-muted-foreground"
                                                )}>
                                                    {err.message}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>
            )}

            {/* Health / Compliance Audit List */}
            <Card className="border-border/50 dark:border-white/5 bg-background/50 backdrop-blur-sm rounded-[2rem]">
                <CardHeader className="border-b border-border/50 dark:border-white/5 pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Auditoría de Cumplimiento y Normativas
                        </CardTitle>
                        <Badge variant="outline" className="text-xs font-bold uppercase tracking-wider px-3 h-6 rounded-full">
                            Protocolo v5.7
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <ScrollArea className="h-[400px]">
                        <div className="divide-y divide-border/50 dark:divide-white/5">
                            {validations.length === 0 && (
                                <div className="p-12 text-center">
                                    <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <CheckCircle2 className="w-8 h-8 text-primary" />
                                    </div>
                                    <h3 className="font-bold text-sm uppercase">Ficha Impecable</h3>
                                    <p className="text-xs text-muted-foreground mt-1">No se detectaron inconsistencias estructurales ni normativas.</p>
                                </div>
                            )}
                            {validations.map((v, i) => (
                                <div key={i} className="p-6 hover:bg-muted/30 transition-all group">
                                    <div className="flex gap-4 items-start">
                                        <div className={cn(
                                            "mt-1 p-2 rounded-xl shrink-0",
                                            v.type === 'CRITICAL' ? "bg-destructive/10 text-destructive" :
                                            v.type === 'WARNING' ? "bg-amber-500/10 text-amber-500" :
                                            "bg-primary/10 text-primary"
                                        )}>
                                            {v.category === 'Integridad Estructural' ? <Calculator className="w-4 h-4" /> :
                                             v.category === 'Rentabilidad' ? <Target className="w-4 h-4" /> : v.category === 'Formato Estándar Recomendado' ? <Activity className="w-4 h-4" /> :
                                             <Zap className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={cn(
                                                    "text-xs font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                    v.type === 'CRITICAL' ? "border-destructive/20 text-destructive" :
                                                    v.type === 'WARNING' ? "border-amber-500/20 text-amber-500" :
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
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                </CardContent>
            </Card>

            {/* Original Declarative Engine Audit */}
            <CostSheetAuditLog audits={audits} />
        </div>
    );
};
