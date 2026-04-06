'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MatchingLogService } from '@/services/matching-log-service';
import { db } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SafePieChart } from "@/components/ui/SafePieChart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell
} from 'recharts';
import {
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Download,
  Filter,
  ArrowRightLeft,
  ChevronRight,
  TrendingUp,
  Activity,
  History,
  Zap,
  Layout,
  BarChart4
} from 'lucide-react';

export default function MatchingAuditView() {
  const [selectedTx, setSelectedTx] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const logs = useLiveQuery(() =>
    db.matching_audit_logs
      .orderBy('fecha_ejecucion')
      .reverse()
      .toArray()
  ) || [];

  const txHistory = useLiveQuery(async () => {
    if (!selectedTx) return null;
    return await db.matching_audit_logs
      .where('transaction_ref')
      .equals(selectedTx)
      .reverse()
      .toArray();
  }, [selectedTx]);

  const stats = useMemo(() => {
    if (logs.length === 0) return null;
    const completed = logs.filter(l => l.resultado_estado === 'COMPLETO').length;
    const partial = logs.filter(l => l.resultado_estado === 'PARCIAL').length;
    const pending = logs.filter(l => l.resultado_estado === 'PENDIENTE').length;
    const avgConfidence = logs.reduce((acc, l) => acc + (l.matching_confidence || 0), 0) / logs.length;
    const avgDuration = logs.reduce((acc, l) => acc + (l.duration_ms || 0), 0) / logs.length;

    return { completed, partial, pending, avgConfidence, avgDuration };
  }, [logs]);

  const chartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'Completo', value: stats.completed, color: '#10b981' },
      { name: 'Parcial', value: stats.partial, color: '#3b82f6' },
      { name: 'Pendiente', value: stats.pending, color: '#f59e0b' }
    ];
  }, [stats]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black tracking-tighter uppercase text-foreground">Auditoría del Motor</h2>
          <p className="text-xs font-black text-muted-foreground uppercase tracking-widest mt-1 opacity-70">Control de Integridad & Matching</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="BUSCAR REF..."
              className="h-9 w-48 pl-9 text-[10px] font-black tracking-widest uppercase bg-card/50"
            />
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl">
            <Filter className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Overview Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
                { label: 'Tasa Éxito', value: `${((stats.completed / logs.length) * 100).toFixed(1)}%`, icon: TrendingUp, color: 'text-primary' },
                { label: 'Confianza Promedio', value: `${(stats.avgConfidence * 100).toFixed(0)}%`, icon: Activity, color: 'text-blue-500' },
                { label: 'Latencia Promedio', value: `${stats.avgDuration.toFixed(0)}ms`, icon: Zap, color: 'text-orange-500' },
                { label: 'Total Ejecuciones', value: logs.length, icon: History, color: 'text-muted-foreground' }
            ].map((s, idx) => (
                <Card key={idx} className="p-4 flex items-center gap-4 border-muted/20">
                    <div className={`p-3 rounded-2xl bg-muted/50 ${s.color}`}>
                        <s.icon className="w-5 h-5" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">{s.label}</p>
                        <p className="text-xl font-black tabular-nums">{s.value}</p>
                    </div>
                </Card>
            ))}
        </div>
      )}

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
            <h3 className="text-xs font-black uppercase mb-4 tracking-widest text-muted-foreground">Distribución de Resultados</h3>
            <div className="w-full">
                <SafePieChart data={chartData} colors={chartData.map(d => d.color)} height={250} />
            </div>
            </Card>

            <Card className="p-4">
            <h3 className="text-xs font-black uppercase mb-4 tracking-widest text-muted-foreground">Confianza por Transacción</h3>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={logs.slice(0, 50).map((l, idx) => ({
                    idx,
                    confidence: Number(((l.matching_confidence || 0) * 100).toFixed(0))
                    }))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.1} />
                    <XAxis dataKey="idx" hide />
                    <YAxis domain={[0, 100]} />
                    <RechartsTooltip />
                    <Bar dataKey="confidence" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            </Card>
        </div>
      )}

      {/* Logs Table */}
      {logs.length > 0 && (
        <Card className="p-0 overflow-hidden">
            <div className="flex justify-between items-center p-4 border-b">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Historial de Ejecución</h3>
            <Button variant="outline" size="sm" className="h-7 text-[10px] font-black uppercase">
                <Download className="w-3 h-3 mr-2" />
                Exportar
            </Button>
            </div>

            <div className="overflow-x-auto">
            <Table>
                <TableHeader>
                <TableRow className="bg-muted/50">
                    <TableHead className="text-[10px] font-black uppercase">Transacción</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Hora</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Estado</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Confianza</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Reglas Aplicadas</TableHead>
                    <TableHead className="text-[10px] font-black uppercase text-right">Duración</TableHead>
                </TableRow>
                </TableHeader>
                <TableBody>
                {logs.map((log) => (
                    <TableRow
                    key={log.id}
                    className={`cursor-pointer transition-colors ${selectedTx === log.transaction_ref ? 'bg-primary/10' : 'hover:bg-muted/50'}`}
                    onClick={() => log.transaction_ref ? setSelectedTx(log.transaction_ref) : setSelectedTx(null)}
                    >
                    <TableCell className="font-mono text-[10px]">
                        {log.transaction_ref?.slice(-12) || "N/A"}
                    </TableCell>
                    <TableCell className="text-xs font-medium">
                        {new Date(log.fecha_ejecucion || "").toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </TableCell>
                    <TableCell>
                        <Badge
                        className="text-[9px] font-black uppercase px-1.5 h-4"
                        variant={
                            log.resultado_estado === 'COMPLETO' ? 'default' :
                            log.resultado_estado === 'PARCIAL' ? 'secondary' : 'destructive'
                        }
                        >
                        {log.resultado_estado}
                        </Badge>
                    </TableCell>
                    <TableCell>
                        <div className="flex items-center gap-2">
                            <div className="w-12 bg-muted rounded-full h-1.5 overflow-hidden">
                                <div
                                    className="bg-primary h-full"
                                    style={{ width: `${(log.matching_confidence || 0) * 100}%` }}
                                />
                            </div>
                            <span className="font-black text-xs">
                                {((log.matching_confidence || 0) * 100).toFixed(0)}%
                            </span>
                        </div>
                    </TableCell>
                    <TableCell>
                        <div className="flex gap-1 flex-wrap">
                        {log.applied_rules?.slice(0, 3).map((rule) => (
                            <Badge key={rule} variant="outline" className="text-[8px] font-bold px-1 h-3.5 bg-background">
                            {rule}
                            </Badge>
                        ))}
                        {log.applied_rules && log.applied_rules.length > 3 && (
                            <Badge variant="outline" className="text-[8px] font-bold px-1 h-3.5">
                            +{(log.applied_rules?.length || 0) - 3}
                            </Badge>
                        )}
                        </div>
                    </TableCell>
                    <TableCell className="text-[10px] font-mono text-right text-muted-foreground">
                        {log.duration_ms}ms
                    </TableCell>
                    </TableRow>
                ))}
                </TableBody>
            </Table>
            </div>
        </Card>
      )}

      {/* Transaction Detail */}
      {selectedTx && txHistory && txHistory.length > 0 && (
        <Card className="p-4 border-primary/20 bg-primary/5 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">
                    Detalle de Trazabilidad
                </h3>
                <p className="font-mono text-[10px] text-muted-foreground">{selectedTx}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTx(null)} className="h-6 w-6 p-0">×</Button>
          </div>
          <div className="space-y-3">
            {txHistory.map((log, idx) => (
              <div key={log.id} className="p-3 bg-card rounded-lg border border-border/50 text-[11px]">
                <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-muted-foreground bg-muted px-1 rounded text-[9px]">INTENTO #{txHistory.length - idx}</span>
                    <span className="text-muted-foreground">{log.fecha_ejecucion ? new Date(log.fecha_ejecucion).toLocaleString() : "N/A"}</span>
                    <Badge variant="outline" className="font-black text-[9px]">{log.resultado_estado}</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-2">
                    <div>
                        <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Reglas Ejecutadas</p>
                        <div className="flex flex-wrap gap-1">
                            {log.reglas_activas?.map(r => (
                                <span key={r} className={`px-1 rounded text-[9px] ${log.applied_rules?.includes(r) ? 'bg-green-500/20 text-green-700 font-bold' : 'bg-muted text-muted-foreground'}`}>
                                    {r}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div>
                        <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Resultado</p>
                        <p className="font-medium text-foreground">
                            {log.reconciliation_lines_count} líneas generadas en {log.duration_ms}ms.
                        </p>
                    </div>
                </div>

                {log.fail_reason && (
                    <div className="mt-2 p-2 bg-red-500/10 rounded border border-red-500/20 text-red-700 text-[10px]">
                        <strong>Error:</strong> {log.fail_reason}
                    </div>
                )}

                {log.trace && log.trace.length > 0 && (
                    <div className="mt-2">
                        <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Pipeline Trace</p>
                        <div className="space-y-1">
                            {log.trace?.map((t, i) => (
                                <div key={i} className="flex items-center gap-2 font-mono text-[9px]">
                                    <span className="w-4 text-center">{t.pass}</span>
                                    <span className="flex-1 truncate">{t.rule}</span>
                                    <span className={t.status === 'SUCCESS' ? 'text-green-600 font-bold' : 'text-muted-foreground'}>{t.status}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
