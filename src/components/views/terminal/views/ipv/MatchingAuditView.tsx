'use client';

import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { MatchingLogService } from '@/services/matching-log-service';
import { db } from '@/lib/dexie';
import { Card } from '@/components/ui/card';
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
  CheckCircle2,
  UserCheck,
  Clock,
  AlertCircle,
  TrendingUp,
  Download,
  History
} from 'lucide-react';

export function MatchingAuditView() {
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [selectedTx, setSelectedTx] = useState<string | null>(null);

  const logs = useLiveQuery(
    () => MatchingLogService.getLogsByDateAndStatus(selectedDate),
    [selectedDate]
  );

  const transactions = useLiveQuery(() => db.bank_statements.where('fecha').equals(selectedDate).toArray(), [selectedDate]);

  const txHistory = useLiveQuery(
    () => selectedTx ? MatchingLogService.getTransactionHistory(selectedTx) : Promise.resolve([]),
    [selectedTx]
  );

  const stats = useMemo(() => {
    if (!logs || !transactions) return null;

    // Transacciones cuadradas reales en la DB
    const realComplete = transactions.filter(t => t.estado_conciliacion === 'COMPLETO').length;
    const realPartial = transactions.filter(t => t.estado_conciliacion === 'PARCIAL').length;
    const realPending = transactions.filter(t => t.estado_conciliacion === 'PENDIENTE').length;

    // Diferenciar entre automático (en logs) y manual
    const autoCompleteRefs = new Set(logs.filter(l => l.resultado_estado === 'COMPLETO').map(l => l.transaction_ref));
    const manualComplete = transactions.filter(t => t.estado_conciliacion === 'COMPLETO' && !autoCompleteRefs.has(t.referencia_origen)).length;

    return {
      total: transactions.length,
      completo: realComplete,
      manualCompleto: manualComplete,
      autoCompleto: autoCompleteRefs.size,
      parcial: realPartial,
      pendiente: realPending,
      avgConfidence: logs.length > 0 ? logs.reduce((sum, l) => sum + (l.matching_confidence || 0), 0) / logs.length : 0,
      successRate: transactions.length > 0 ? (realComplete / transactions.length) * 100 : 0
    };
  }, [logs, transactions]);

  const chartData = useMemo(() => {
    if (!stats) return [];
    return [
      { name: 'AUTO', value: stats.autoCompleto, color: '#22c55e' },
      { name: 'MANUAL', value: stats.manualCompleto, color: '#3b82f6' },
      { name: 'PARCIAL', value: stats.parcial, color: '#f97316' },
      { name: 'PENDIENTE', value: stats.pendiente, color: '#ef4444' }
    ];
  }, [stats]);

  if (!logs) return <div className="p-8 text-center font-bold animate-pulse">Cargando auditoría...</div>;

  return (
    <div className="space-y-6 p-4">
      {/* Date Filter */}
      <div className="flex items-center gap-4">
        <History className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-black uppercase tracking-tight">Auditoría del Motor</h2>
        <Input
          type="date"
          value={selectedDate}
          onChange={(e) => {
            setSelectedDate(e.target.value);
            setSelectedTx(null);
          }}
          className="w-40 font-mono text-xs"
        />
      </div>

      {/* Stats Cards */}
      {stats ? (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card className="p-4 bg-green-500/5 border-green-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CUADRADAS (TOTAL)</p>
                <p className="text-2xl font-black text-green-600">{stats.completo}</p>
                <div className="flex gap-2 mt-1">
                    <span className="text-[9px] font-bold text-green-700 bg-green-500/10 px-1 rounded">AUTO: {stats.autoCompleto}</span>
                    <span className="text-[9px] font-bold text-blue-700 bg-blue-500/10 px-1 rounded">MANUAL: {stats.manualCompleto}</span>
                </div>
              </div>
              <CheckCircle2 className="w-6 h-6 text-green-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-4 bg-orange-500/5 border-orange-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">PARCIALES</p>
                <p className="text-2xl font-black text-orange-600">{stats.parcial}</p>
              </div>
              <Clock className="w-6 h-6 text-orange-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-4 bg-red-500/5 border-red-500/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">PENDIENTES</p>
                <p className="text-2xl font-black text-red-600">{stats.pendiente}</p>
              </div>
              <AlertCircle className="w-6 h-6 text-red-600 opacity-20" />
            </div>
          </Card>

          <Card className="p-4 bg-primary/5 border-primary/20">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">CONFIANZA AVG</p>
                <p className="text-2xl font-black">{(stats.avgConfidence * 100).toFixed(0)}%</p>
              </div>
              <TrendingUp className="w-6 h-6 text-primary opacity-20" />
            </div>
          </Card>

          <Card className="p-4 bg-card border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">TASA ÉXITO</p>
                <p className="text-2xl font-black">{stats.successRate.toFixed(1)}%</p>
              </div>
              <CheckCircle2 className="w-6 h-6 text-primary opacity-20" />
            </div>
          </Card>
        </div>
      ) : (
        <Card className="p-8 text-center text-muted-foreground italic border-dashed">
            No hay actividad registrada para esta fecha.
        </Card>
      )}

      {/* Charts */}
      {stats && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
