'use client';

import React, { useMemo, useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, MatchingLog, MatchingTrace } from '@/lib/dexie';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Search,
  Calendar,
  Filter,
  Activity,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Database,
  ArrowRightLeft,
  Clock,
  ExternalLink,
  Target
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function MatchingHistoryView() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [ruleFilter, setRuleFilter] = useState<string>('ALL');
  const [confidenceFilter, setConfidenceFilter] = useState<string>('ALL');
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);

  // Fetching logs with filters
  const logs = useLiveQuery(async () => {
    let collection = db.matching_logs.orderBy('fecha_ejecucion').reverse();

    // Basic filtering in memory for complex combinations if needed,
    // but we try to use Dexie collection as much as possible.
    const allLogs = await collection.toArray();

    return allLogs.filter(log => {
      const matchesSearch = !searchTerm || log.transaction_ref?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || log.resultado_estado === statusFilter;
      const matchesRule = ruleFilter === 'ALL' || log.applied_rules?.includes(ruleFilter);

      let matchesConfidence = true;
      if (confidenceFilter === 'LOW') matchesConfidence = (log.matching_confidence || 0) < 0.7;
      if (confidenceFilter === 'MEDIUM') matchesConfidence = (log.matching_confidence || 0) >= 0.7 && (log.matching_confidence || 0) < 0.9;
      if (confidenceFilter === 'HIGH') matchesConfidence = (log.matching_confidence || 0) >= 0.9;

      return matchesSearch && matchesStatus && matchesRule && matchesConfidence;
    });
  }, [searchTerm, statusFilter, ruleFilter, confidenceFilter]);

  const selectedLog = useMemo(() =>
    logs?.find(l => l.id === selectedLogId),
    [logs, selectedLogId]
  );

  // Virtualizer setup
  const parentRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: logs?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });

  // KPI Calculations
  const stats = useMemo(() => {
    if (!logs || logs.length === 0) return { successRate: 0, partialRate: 0, avgConfidence: 0, total: 0 };
    const total = logs.length;
    const success = logs.filter(l => l.resultado_estado === 'COMPLETO').length;
    const partial = logs.filter(l => l.resultado_estado === 'PARCIAL').length;
    const avgConf = logs.reduce((acc, l) => acc + (l.matching_confidence || 0), 0) / total;

    return {
      successRate: (success / total) * 100,
      partialRate: (partial / total) * 100,
      avgConfidence: avgConf * 100,
      total
    };
  }, [logs]);

  const availableRules = useMemo(() => {
    const rules = new Set<string>();
    logs?.forEach(l => l.applied_rules?.forEach(r => rules.add(r)));
    return Array.from(rules);
  }, [logs]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-10">
      {/* Header & Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-green-500" />
              Tasa de Éxito
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.successRate.toFixed(1)}%</div>
            <p className="text-[9px] text-muted-foreground mt-1">Solo estados COMPLETO</p>
          </CardContent>
        </Card>

        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Activity className="w-3 h-3 text-blue-500" />
              Conciliación Parcial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.partialRate.toFixed(1)}%</div>
            <p className="text-[9px] text-muted-foreground mt-1">Requieren revisión manual</p>
          </CardContent>
        </Card>

        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Target className="w-3 h-3 text-amber-500" />
              Confianza Promedio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black">{stats.avgConfidence.toFixed(1)}%</div>
            <div className="w-full bg-muted h-1 rounded-full mt-2 overflow-hidden">
                <div className="bg-amber-500 h-full" style={{ width: `${stats.avgConfidence}%` }} />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/30 border-dashed">
          <CardHeader className="pb-2">
            <CardTitle className="text-[10px] font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <Database className="w-3 h-3" />
              Total Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-black tabular-nums">{stats.total.toLocaleString()}</div>
            <p className="text-[9px] text-muted-foreground mt-1">Filtrados en tiempo real</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-primary/10">
        <CardContent className="p-4 flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-0 sm:min-w-[200px] space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Referencia</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por transaction_ref..."
                className="pl-9 h-10 rounded-xl"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="w-full sm:w-[140px] space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Estado</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todos</SelectItem>
                <SelectItem value="COMPLETO">Completo</SelectItem>
                <SelectItem value="PARCIAL">Parcial</SelectItem>
                <SelectItem value="PENDIENTE">Pendiente</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[160px] space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Regla Aplicada</label>
            <Select value={ruleFilter} onValueChange={setRuleFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Regla" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Todas</SelectItem>
                {availableRules.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-full sm:w-[140px] space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Confianza</label>
            <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
              <SelectTrigger className="h-10 rounded-xl">
                <SelectValue placeholder="Rango" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Cualquiera</SelectItem>
                <SelectItem value="HIGH">Alta ({'>'}90%)</SelectItem>
                <SelectItem value="MEDIUM">Media (70-90%)</SelectItem>
                <SelectItem value="LOW">Baja ({'<'}70%)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl hover:bg-red-500/10 hover:text-red-500"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('ALL');
              setRuleFilter('ALL');
              setConfidenceFilter('ALL');
            }}
          >
            <Filter className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Virtualized Table */}
        <Card className={cn("xl:col-span-2 overflow-hidden flex flex-col h-[400px] sm:h-[600px]", !selectedLogId && "xl:col-span-3")}>
          <div className="flex-1 overflow-auto relative border-t" ref={parentRef}>
            <div
              style={{
                height: `${rowVirtualizer.getTotalSize()}px`,
                width: '100%',
                position: 'relative',
              }}
            >
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="text-[10px] font-black uppercase w-[200px]">Transacción</TableHead>
                    <TableHead className="text-[10px] font-black uppercase w-[120px]">Fecha</TableHead>
                    <TableHead className="text-[10px] font-black uppercase w-[100px]">Estado</TableHead>
                    <TableHead className="text-[10px] font-black uppercase w-[120px]">Confianza</TableHead>
                    <TableHead className="text-[10px] font-black uppercase">Reglas</TableHead>
                    <TableHead className="text-right text-[10px] font-black uppercase w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                    const log = logs![virtualRow.index];
                    const isSelected = selectedLogId === log.id;

                    return (
                      <TableRow
                        key={log.id}
                        data-index={virtualRow.index}
                        ref={rowVirtualizer.measureElement}
                        className={cn(
                          "cursor-pointer group hover:bg-primary/5 transition-colors",
                          isSelected && "bg-primary/10 border-l-2 border-l-primary"
                        )}
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          transform: `translateY(${virtualRow.start}px)`,
                        }}
                        onClick={() => setSelectedLogId(isSelected ? null : log.id)}
                      >
                        <TableCell className="font-mono text-[10px] truncate max-w-[200px]">
                          {log.transaction_ref}
                        </TableCell>
                        <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {new Date(log.fecha_ejecucion!).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={log.resultado_estado === 'COMPLETO' ? 'default' : log.resultado_estado === 'PARCIAL' ? 'secondary' : 'destructive'}
                            className="text-[9px] font-black uppercase h-4 px-1.5"
                          >
                            {log.resultado_estado}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold w-7 text-right">{((log.matching_confidence || 0) * 100).toFixed(0)}%</span>
                            <div className="flex-1 bg-muted h-1 rounded-full overflow-hidden min-w-[40px]">
                                <div
                                    className={cn(
                                        "h-full",
                                        (log.matching_confidence || 0) > 0.9 ? "bg-green-500" : (log.matching_confidence || 0) > 0.7 ? "bg-blue-500" : "bg-amber-500"
                                    )}
                                    style={{ width: `${(log.matching_confidence || 0) * 100}%` }}
                                />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 overflow-hidden">
                            {log.applied_rules?.slice(0, 2).map(rule => (
                              <Badge key={rule} variant="outline" className="text-[8px] h-3.5 px-1 whitespace-nowrap">{rule}</Badge>
                            ))}
                            {log.applied_rules && log.applied_rules.length > 2 && (
                              <span className="text-[8px] text-muted-foreground">+{log.applied_rules.length - 2}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition-transform", isSelected && "rotate-90 text-primary")} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </Card>

        {/* Detail Panel */}
        {selectedLog && (
          <Card className="border-primary/30 shadow-2xl animate-in slide-in-from-right-4 duration-300 h-[600px] flex flex-col">
            <CardHeader className="border-b pb-4 bg-muted/20">
              <div className="flex justify-between items-start">
                <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Clock className="w-4 h-4 text-primary" />
                    Trace de Ejecución
                </CardTitle>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedLogId(null)}>×</Button>
              </div>
              <div className="mt-2 space-y-1">
                <div className="text-[10px] font-mono text-muted-foreground break-all">{selectedLog.transaction_ref}</div>
                <div className="flex gap-2 items-center">
                    <Badge variant="outline" className="text-[9px] font-mono">{selectedLog.duration_ms}ms</Badge>
                    <Badge variant="outline" className="text-[9px] font-mono">v{selectedLog.engine_version}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-auto p-4 space-y-4">
                {selectedLog.fail_reason && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-red-500 mt-0.5" />
                        <div>
                            <div className="text-[10px] font-black text-red-500 uppercase tracking-widest">Fallo Crítico</div>
                            <div className="text-xs font-medium text-red-700">{selectedLog.fail_reason}</div>
                        </div>
                    </div>
                )}

                <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pipeline Step-by-Step</label>
                    <div className="space-y-2 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-px before:bg-border">
                        {selectedLog.trace?.map((step, idx) => (
                            <div key={idx} className="relative pl-7 group">
                                <div className={cn(
                                    "absolute left-0 top-1.5 w-6 h-6 rounded-full border-2 bg-background flex items-center justify-center z-10 transition-colors",
                                    step.status === 'SUCCESS' ? "border-green-500" : step.status === 'FAIL' ? "border-red-500" : "border-muted"
                                )}>
                                    <span className="text-[8px] font-bold">{step.pass}</span>
                                </div>
                                <div className="p-2.5 rounded-xl border bg-muted/30 group-hover:bg-muted/50 transition-colors">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="text-[10px] font-black">{step.rule}</div>
                                        <Badge
                                            variant="outline"
                                            className={cn(
                                                "text-[8px] h-3.5 px-1 font-black",
                                                step.status === 'SUCCESS' ? "bg-green-500/10 text-green-600 border-green-500/20" :
                                                step.status === 'FAIL' ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                                "bg-muted/50 text-muted-foreground"
                                            )}
                                        >
                                            {step.status}
                                        </Badge>
                                    </div>
                                    {step.reason && (
                                        <p className="text-[10px] text-muted-foreground leading-tight mb-2">{step.reason}</p>
                                    )}

                                    {/* Structured Metrics Drill-down */}
                                    {step.metrics && (
                                        <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-dashed border-border/50">
                                            <div className="space-y-0.5">
                                                <div className="text-[8px] font-black uppercase text-muted-foreground">Esperado</div>
                                                <div className="text-[10px] font-mono font-bold">${step.metrics.expected_value?.toFixed(2)}</div>
                                            </div>
                                            <div className="space-y-0.5">
                                                <div className="text-[8px] font-black uppercase text-muted-foreground">Obtenido</div>
                                                <div className="text-[10px] font-mono font-bold">${step.metrics.actual_value?.toFixed(2)}</div>
                                            </div>
                                            <div className="space-y-0.5">
                                                <div className="text-[8px] font-black uppercase text-muted-foreground">Delta</div>
                                                <div className={cn(
                                                    "text-[10px] font-mono font-bold",
                                                    (step.metrics.delta || 0) > 0 ? "text-red-500" : "text-green-600"
                                                )}>
                                                    {step.metrics.delta && step.metrics.delta > 0 ? '+' : ''}${step.metrics.delta?.toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {step.details && !step.metrics && (
                                        <pre className="text-[8px] bg-muted p-1 rounded mt-1 overflow-hidden truncate">
                                            {JSON.stringify(step.details)}
                                        </pre>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="pt-4 border-t space-y-3">
                    <Button variant="outline" className="w-full justify-between h-9 text-xs rounded-xl group" onClick={() => {
                        toast.info("Navegando a transacción...");
                    }}>
                        Ver en Tabla de Movimientos
                        <ExternalLink className="w-3 h-3 text-muted-foreground group-hover:text-primary transition-colors" />
                    </Button>
                </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
