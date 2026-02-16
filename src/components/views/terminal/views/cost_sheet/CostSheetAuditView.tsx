'use client';

import React, { useMemo } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertTriangle, CheckCircle2, Info, Zap, Calculator, Activity, Target } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CostSheetAuditLog } from './CostSheetAuditLog';

import { ValidationResult } from '@/lib/cost-engine/validations';

interface CostSheetAuditViewProps {
    data: any;
    calculatedValues: any;
    calculatedHeader: any;
    audits: any[];
    validations?: ValidationResult[];
}

export const CostSheetAuditView: React.FC<CostSheetAuditViewProps> = ({
    data,
    calculatedValues,
    calculatedHeader,
    audits,
    validations = []
}) => {

    const criticals = validations.filter(v => v.type === 'CRITICAL');
    const warnings = validations.filter(v => v.type === 'WARNING');
    const successes = validations.filter(v => v.type === 'SUCCESS');

    return (
        <div className="space-y-8 pb-20">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card className="bg-destructive/5 border-destructive/20 rounded-3xl overflow-hidden relative group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <AlertTriangle className="w-16 h-16 text-destructive" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-destructive/70">Errores Críticos</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-destructive">{criticals.length}</div>
                        <p className="text-[10px] text-destructive/60 font-bold uppercase mt-1">Requieren Corrección Inmediata</p>
                    </CardContent>
                </Card>

                <Card className="bg-amber-500/5 border-amber-500/20 rounded-3xl overflow-hidden relative group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <AlertTriangle className="w-16 h-16 text-amber-500" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-amber-500/70">Advertencias</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-amber-500">{warnings.length}</div>
                        <p className="text-[10px] text-amber-500/60 font-bold uppercase mt-1">Revisión de Parámetros Sugerida</p>
                    </CardContent>
                </Card>

                <Card className="bg-primary/5 border-primary/20 rounded-3xl overflow-hidden relative group">
                    <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <CheckCircle2 className="w-16 h-16 text-primary" />
                    </div>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-[10px] font-black uppercase tracking-widest text-primary/70">Validaciones OK</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-4xl font-black text-primary">{successes.length}</div>
                        <p className="text-[10px] text-primary/60 font-bold uppercase mt-1">Integridad de Datos Confirmada</p>
                    </CardContent>
                </Card>
            </div>

            {/* Expanded Audit List */}
            <Card className="border-border/50 dark:border-white/5 bg-background/50 backdrop-blur-sm rounded-[2rem]">
                <CardHeader className="border-b border-border/50 dark:border-white/5 pb-4">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                            <Activity className="w-4 h-4 text-primary" />
                            Auditoría de Cumplimiento y Normativas
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider px-3 h-6 rounded-full">
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
                                             v.category === 'Rentabilidad' ? <Target className="w-4 h-4" /> :
                                             <Zap className="w-4 h-4" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={cn(
                                                    "text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border",
                                                    v.type === 'CRITICAL' ? "border-destructive/20 text-destructive" :
                                                    v.type === 'WARNING' ? "border-amber-500/20 text-amber-500" :
                                                    "border-primary/20 text-primary"
                                                )}>
                                                    {v.category}
                                                </span>
                                                {v.rowId && (
                                                    <span className="text-[10px] font-mono text-muted-foreground">REF: {v.rowId}</span>
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
