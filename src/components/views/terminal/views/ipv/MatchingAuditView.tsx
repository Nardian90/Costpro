'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MatchingLogService } from '@/services/matching-log-service';
import { db } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
import { exportAuditLogsJSON } from "@/lib/ipv/audit";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
  PieChart,
  Pie,
  Cell
} from 'recharts';
import {
  Download,
  Search,
  Filter,
  Trash2,
  FileJson,
  BarChart3,
  History,
  Activity
} from 'lucide-react';

export function MatchingAuditView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTx, setSelectedTx] = useState<string | null>(null);

  const logs = useLiveQuery(
    () => db.matching_logs.orderBy('fecha_ejecucion').reverse().toArray()
  ) || [];

  const txHistory = useLiveQuery(
    () => selectedTx ? db.matching_logs.where('transaction_ref').equals(selectedTx).sortBy('fecha_ejecucion') : [],
    [selectedTx]
  );

  const filtered = useMemo(() => {
    if (!searchTerm) return logs;
    const lower = searchTerm.toLowerCase();
    return logs.filter(l =>
        l.transaction_ref?.toLowerCase().includes(lower) ||
        l.resultado_estado?.toLowerCase().includes(lower)
    );
  }, [logs, searchTerm]);

  const stats = useMemo(() => {
    const total = logs.length;
    const success = logs.filter(l => l.resultado_estado === 'COMPLETO').length;
    const partial = logs.filter(l => l.resultado_estado === 'PARCIAL').length;
    const failed = logs.filter(l => l.resultado_estado === 'PENDIENTE').length;
    const avgConfidence = logs.length > 0
        ? (logs.reduce((sum, l) => sum + (l.matching_confidence || 0), 0) / logs.length) * 100
        : 0;

    return { total, success, partial, failed, avgConfidence };
  }, [logs]);

  const chartData = [
    { name: 'Completas', value: stats.success, color: '#22c55e' },
    { name: 'Parciales', value: stats.partial, color: '#eab308' },
    { name: 'Pendientes', value: stats.failed, color: '#ef4444' }
  ];

  const clearLogs = async () => {
    if (confirm('¿Seguro que desea limpiar todo el historial de auditoría?')) {
        await db.matching_logs.clear();
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter flex items-center gap-2">
                <History className="w-6 h-6 text-primary" />
                Auditoría de Matching
            </h2>
            <p className="text-xs text-muted-foreground font-medium">Trazabilidad forense del motor de conciliación automatizado.</p>
        </div>

        <div className="flex gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                    placeholder="Filtrar por transacción..."
                    className="pl-10 h-10 text-sm rounded-xl"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>
            <Button variant="outline" size="icon" className="h-10 w-10 rounded-xl" onClick={clearLogs}>
                <Trash2 className="w-4 h-4 text-destructive" />
            </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-primary/5 border-primary/10">
              <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Total Ejecuciones</p>
              <h3 className="text-2xl font-black">{stats.total}</h3>
          </Card>
          <Card className="p-4 bg-green-500/5 border-green-500/10">
              <p className="text-[10px] font-black uppercase text-green-600/70 mb-1">Efectividad</p>
              <h3 className="text-2xl font-black text-green-600">
                {stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0}%
              </h3>
          </Card>
          <Card className="p-4 bg-yellow-500/5 border-yellow-500/10">
              <p className="text-[10px] font-black uppercase text-yellow-600/70 mb-1">Confianza Media</p>
              <h3 className="text-2xl font-black text-yellow-600">{stats.avgConfidence.toFixed(0)}%</h3>
          </Card>
          <Card className="p-4 bg-muted/50 border-border">
              <p className="text-[10px] font-black uppercase text-muted-foreground mb-1">Pendientes</p>
              <h3 className="text-2xl font-black text-destructive">{stats.failed}</h3>
          </Card>
      </div>

      {/* Charts */}
      {logs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="p-4">
            <h3 className="text-xs font-black uppercase mb-4 tracking-widest text-muted-foreground">Distribución de Resultados</h3>
            <div className="h-[250px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                    <Pie
                        data={chartData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name}: ${value}`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                    >
                        {chartData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                        ))}
                    </Pie>
                    <RechartsTooltip />
                    </PieChart>
                </ResponsiveContainer>
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
            <Button variant="outline" size="sm" className="h-7 text-[10px] font-black uppercase" onClick={exportAuditLogsJSON}>
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
                        {log.fecha_ejecucion ? new Date(log.fecha_ejecucion).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : "N/A"}
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
