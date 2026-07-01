'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AccountingIntegrityService, GlobalIntegrityReport, IntegrityCheckResult } from '@/lib/ipv/integrity-service';
import { CheckCircle2, AlertCircle, AlertTriangle, RefreshCw, ChevronRight, Calculator, Banknote, CreditCard, ShieldCheck } from 'lucide-react';
import { formatCurrencyCents } from '@/lib/utils';

export function AccountingIntegrityReport() {
    const [report, setReport] = useState<GlobalIntegrityReport | null>(null);
    const [loading, setLoading] = useState(false);
    const service = new AccountingIntegrityService();

    const runAudit = async () => {
        setLoading(true);
        try {
            const result = await service.generateReport();
            setReport(result);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        runAudit();
    }, []);

    if (!report && loading) return <div className="p-8 text-center font-black uppercase tracking-widest opacity-50">Generando Reporte de Integridad...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                        <ShieldCheck className="w-8 h-8 text-primary" />
                        Auditoría de Integridad Contable
                    </h2>
                    <p className="text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
                        Validación cruzada entre Banco, IPV y Recibos
                    </p>
                </div>
                <Button
                    onClick={runAudit}
                    disabled={loading}
                    className="h-11 rounded-xl font-black uppercase tracking-widest text-xs gap-2"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Re-Evaluar
                </Button>
            </div>

            {report && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="p-6 border-2 border-success/20 bg-success/5">
                        <div className="flex justify-between items-start">
                            <CheckCircle2 className="w-8 h-8 text-success" />
                            <span className="text-2xl font-black">{report.summary.passed}</span>
                        </div>
                        <p className="text-[10px] font-black uppercase text-success mt-2 tracking-widest">Validaciones Exitosas</p>
                    </Card>
                    <Card className="p-6 border-2 border-warning/20 bg-warning/5">
                        <div className="flex justify-between items-start">
                            <AlertTriangle className="w-8 h-8 text-warning" />
                            <span className="text-2xl font-black">{report.summary.warnings}</span>
                        </div>
                        <p className="text-[10px] font-black uppercase text-warning mt-2 tracking-widest">Advertencias / Pendientes</p>
                    </Card>
                    <Card className="p-6 border-2 border-destructive/20 bg-destructive/5">
                        <div className="flex justify-between items-start">
                            <AlertCircle className="w-8 h-8 text-destructive" />
                            <span className="text-2xl font-black">{report.summary.failed}</span>
                        </div>
                        <p className="text-[10px] font-black uppercase text-destructive mt-2 tracking-widest">Errores de Integridad</p>
                    </Card>
                </div>
            )}

            <div className="space-y-4">
                {report?.checks.map((check) => (
                    <Card key={check.id} className="p-6 hover:border-primary/30 transition-all">
                        <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className={`p-4 rounded-2xl ${
                                check.status === 'OK' ? 'bg-success/10 text-success' :
                                check.status === 'WARNING' ? 'bg-warning/10 text-warning' :
                                'bg-destructive/10 text-destructive'
                            }`}>
                                {check.id === 'cash-integrity' && <Banknote className="w-6 h-6" />}
                                {check.id === 'bank-truth' && <CreditCard className="w-6 h-6" />}
                                {check.id === 'tx-management' && <Calculator className="w-6 h-6" />}
                                {check.id === 'structural-invariants' && <ShieldCheck className="w-6 h-6" />}
                            </div>

                            <div className="flex-1 space-y-1">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-black uppercase text-sm tracking-widest">{check.name}</h3>
                                    <Badge variant="outline" className={`text-[9px] font-black ${
                                        check.status === 'OK' ? 'border-green-200 text-success bg-green-50' :
                                        check.status === 'WARNING' ? 'border-orange-200 text-warning bg-orange-50' :
                                        'border-red-200 text-destructive bg-red-50'
                                    }`}>
                                        {check.status}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground font-medium">{check.message}</p>
                            </div>

                            <div className="text-right min-w-[150px]">
                                <p className="text-[10px] font-black text-muted-foreground uppercase mb-1">Diferencia</p>
                                <p className={`text-lg font-black tabular-nums ${
                                    check.status === 'OK' ? 'text-success' :
                                    check.status === 'WARNING' ? 'text-warning' : 'text-destructive'
                                }`}>
                                    {check.id === 'structural-invariants' ? check.discrepancy : formatCurrencyCents(check.discrepancy)}
                                </p>
                            </div>
                        </div>

                        {check.details && (
                            <div className="mt-6 pt-6 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
                                {Object.entries(check.details).map(([key, value]: [string, any]) => (
                                    <div key={key}>
                                        <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">{key.replace(/_/g, ' ')}</p>
                                        <p className="text-xs font-bold font-mono">
                                            {typeof value === 'number' && key.endsWith('cents') ? formatCurrencyCents(value) : String(value)}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                ))}
            </div>
        </div>
    );
}
