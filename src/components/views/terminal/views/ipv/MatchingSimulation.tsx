'use client';

import React, { useState, useEffect } from 'react';
import { db, type Product, type MatchingRule } from '@/lib/dexie';
import { MatchingEngine, type MatchingResult } from '@/lib/ipv/engine';
import { useSimulationConfig } from '@/hooks/logic/useSimulationConfig';
import { useFinancialPlanning } from '@/hooks/logic/useFinancialPlanning';
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
  Play,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Package,
  ArrowRight,
  Workflow,
  AlertTriangle,
  Calendar,
  Save
} from 'lucide-react';
import { toast } from 'sonner';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatCurrencyCents } from '@/lib/utils';

interface MatchingSimulationProps {
  products: Product[];
  rules: MatchingRule[];
}

export function MatchingSimulation({ products, rules }: MatchingSimulationProps) {
  const { simulatedAmount: target, setSimulatedAmount: setTarget } = useSimulationConfig();

  const lastTxDate = useLiveQuery(() =>
    db.bank_statements.orderBy('fecha').last().then(tx => tx?.fecha || new Date().toISOString().slice(0, 10))
  );

  const [selectedMonth, setSelectedMonth] = useState<string>('');

  useEffect(() => {
    if (lastTxDate && !selectedMonth) {
      setSelectedMonth(lastTxDate.slice(0, 7));
    }
  }, [lastTxDate]);

  const year = selectedMonth ? parseInt(selectedMonth.split('-')[0]) : new Date().getFullYear();
  const { goals } = useFinancialPlanning(year);
  const currentMonthGoal = goals.find(g => g.month === selectedMonth);

  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<MatchingResult | null>(null);

  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [globalStrategy, setGlobalStrategy] = useState<"MIN_STOCK" | "MAX_VALUE">("MIN_STOCK");

  useEffect(() => {
    if (currentMonthGoal) {
      setGlobalTarget(currentMonthGoal.goalAmount);
      setGlobalStrategy(currentMonthGoal.strategy || "MIN_STOCK");
    }
  }, [currentMonthGoal]);

  const [isDistributing, setIsDistributing] = useState(false);

  const handleSimulate = async () => {
    if (target <= 0) {
        toast.error('El monto debe ser mayor a 0');
        return;
    }

    setIsSimulating(true);
    try {
        const engine = new MatchingEngine(products, rules);
        const res = await engine.matchSimulation(target * 100);
        setResult(res);
        toast.success('Simulación completada');
    } catch (error) {
        console.error(error);
        toast.error('Error al simular');
    } finally {
        setIsSimulating(false);
    }
  };

  const handleGlobalGoal = async () => {
    if (globalTarget <= 0) {
        toast.error('El objetivo global debe ser mayor a 0');
        return;
    }

    setIsDistributing(true);
    try {
        const engine = new MatchingEngine(products, rules);

        const transactions = await db.bank_statements
            .where('fecha')
            .startsWith(selectedMonth)
            .toArray();

        const dates = Array.from(new Set(transactions.map(t => t.fecha)));

        if (dates.length === 0) {
            toast.error('No hay transacciones en el periodo seleccionado para cuadrar');
            return;
        }

        const monthLines = await db.reconciliation_lines
            .where('fecha_operacion')
            .startsWith(selectedMonth)
            .toArray();
        const currentKpiTotal = monthLines.reduce((sum, l) => sum + (l.total_amount_cents || l.importe_linea_cents || 0), 0);

        const extraLines = await engine.distributeGlobalGoal(globalTarget * 100, currentKpiTotal, dates);

        if (extraLines.length > 0) {
            await db.reconciliation_lines.bulkPut(extraLines);
            toast.success(`${extraLines.length} líneas de ajuste generadas para ${selectedMonth}`);
        } else {
            toast.warning('No se pudo distribuir el objetivo');
        }
    } catch (error) {
        console.error(error);
        toast.error('Error al distribuir objetivo global');
    } finally {
        setIsDistributing(false);
    }
  };

  const handleResetGlobalGoal = () => {
      if (currentMonthGoal) {
        setGlobalTarget(currentMonthGoal.goalAmount);
        setGlobalStrategy(currentMonthGoal.strategy || "MIN_STOCK");
      } else {
        setGlobalTarget(0);
        setGlobalStrategy("MIN_STOCK");
      }
  };

  return (
    <div className="p-6 space-y-8 animate-in fade-in duration-500 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6 border-muted">
        <div>
          <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" />
            Motor de Simulación
          </h2>
          <p className="text-muted-foreground font-bold uppercase text-xs tracking-widest">
            Encuentra combinaciones óptimas de productos para cuadrar ingresos
          </p>
        </div>

        <div className="flex items-center gap-2 bg-muted/30 p-1 rounded-xl border">
            <span className="text-[10px] font-black uppercase text-muted-foreground px-2">Periodo:</span>
            <Input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="h-8 w-40 text-xs font-black uppercase bg-transparent border-none"
            />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="space-y-6">
            <Card className="p-6 border-none shadow-xl bg-card/50 backdrop-blur-sm relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <TrendingUp className="w-16 h-16 text-primary" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-2">
                    <Play className="w-4 h-4 fill-primary" />
                    Simulador Rápido
                </h3>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="sim-target" className="text-xs font-bold uppercase text-muted-foreground">Monto a Simular ($)</label>
                        <Input
                            id="sim-target"
                            type="number"
                            value={target}
                            onChange={e => setTarget(Number(e.target.value))}
                            placeholder="0.00"
                            className="text-lg font-black bg-background/50"
                        />
                    </div>
                    <Button
                        onClick={handleSimulate}
                        disabled={isSimulating}
                        className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-black uppercase text-xs tracking-widest rounded-xl transition-all hover:scale-[1.02] active:scale-95 shadow-lg flex gap-2"
                    >
                        {isSimulating ? (
                            <RotateCcw className="w-4 h-4 animate-spin" />
                        ) : (
                            <Sparkles className="w-4 h-4" />
                        )}
                        Ejecutar Inteligencia
                    </Button>
                </div>
            </Card>

            <Card className="p-6 border-purple-100 bg-purple-50/30 relative shadow-lg">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-purple-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Objetivo Global ({selectedMonth})
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleResetGlobalGoal}
                    className="h-6 w-6 text-purple-600 hover:bg-purple-100"
                    title="Cargar desde planeación"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-medium uppercase leading-tight mb-4">
                    Reparte la diferencia entre el total actual y tu meta mensual usando productos comodín.
                </p>
                <div className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="sim-strategy" className="text-xs font-bold uppercase text-muted-foreground">Estrategia de Distribución</label>
                        <select
                            id="sim-strategy"
                            value={globalStrategy}
                            onChange={(e) => setGlobalStrategy(e.target.value as "MIN_STOCK" | "MAX_VALUE")}
                            className="w-full h-10 rounded-xl border border-input bg-background/50 px-3 py-1 text-sm font-bold uppercase"
                        >
                            <option value="MIN_STOCK">MIN EXISTENCIA (Priorizar agotados)</option>
                            <option value="MAX_VALUE">MAX SALDO (Priorizar más caros)</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="sim-global-target" className="text-xs font-bold uppercase text-muted-foreground">Meta Mensual ($)</label>
                        <Input
                            id="sim-global-target"
                            type="number"
                            value={globalTarget}
                            onChange={e => setGlobalTarget(Number(e.target.value))}
                            placeholder="0.00"
                            className="text-lg font-black bg-background/50"
                        />
                    </div>
                    <Button onClick={handleGlobalGoal} disabled={isDistributing} className="w-full h-12 bg-purple-600 hover:bg-purple-700 text-foreground uppercase font-black text-xs tracking-widest rounded-xl gap-2 shadow-lg">
                        <Save className="w-4 h-4" />
                        Ejecutar Simulación Global
                    </Button>
                </div>
            </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {result && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card className="p-5 bg-primary/5 border-none shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-primary uppercase mb-1 tracking-widest">Total Alcanzado</p>
                  <p className="text-3xl font-black">
                    {formatCurrencyCents(result.lines.reduce((sum, l) => sum + (l.total_amount_cents || l.importe_linea_cents || 0), 0))}
                  </p>
                </Card>
                <Card className="p-5 bg-warning/5 border-none shadow-sm flex flex-col justify-center">
                  <p className="text-[10px] font-black text-warning uppercase mb-1 tracking-widest">Diferencia</p>
                  <p className="text-3xl font-black">
                    {formatCurrencyCents((target * 100) - result.lines.reduce((sum, l) => sum + (l.total_amount_cents || l.importe_linea_cents || 0), 0))}
                  </p>
                </Card>
              </div>

              {result.status !== 'COMPLETO' && result.failReason && (
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2">
                      <AlertTriangle className="w-8 h-8 text-destructive" />
                      <div>
                          <p className="text-[10px] font-black text-destructive uppercase tracking-widest">Motivo de Descuadre</p>
                          <p className="text-sm font-bold text-destructive">{result.failReason}</p>
                      </div>
                  </div>
              )}

              {result.movements && result.movements.length > 0 && (
                  <Card className="p-4 border-orange-200 bg-orange-50/30 shadow-sm">
                      <h4 className="text-[10px] font-black uppercase text-warning mb-3 flex items-center gap-2 tracking-widest">
                          <Workflow className="w-4 h-4" />
                          Descomposiciones Automáticas Requeridas
                      </h4>
                      <div className="space-y-2">
                          {result.movements.map((m, i) => (
                              <div key={i} className="flex items-center gap-3 bg-white/60 p-2 rounded-xl border border-orange-100 shadow-sm">
                                  <Badge variant="outline" className="font-black text-warning border-orange-200 uppercase">{m.producto_origen_cod}</Badge>
                                  <ArrowRight className="w-3 h-3 text-orange-400" />
                                  <span className="text-xs font-bold text-muted-foreground uppercase">-{m.cantidad_origen}</span>
                                  <ArrowRight className="w-4 h-4 text-warning" />
                                  <Badge className="bg-warning text-foreground font-black uppercase">{m.producto_destino_cod}</Badge>
                                  <span className="text-xs font-bold text-warning uppercase">+{m.cantidad_destino}</span>
                              </div>
                          ))}
                      </div>
                  </Card>
              )}

              <Card className="overflow-hidden border-none shadow-xl bg-card rounded-2xl">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider">Producto</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-center">Cant.</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-right">Precio</TableHead>
                      <TableHead className="text-[10px] font-black uppercase tracking-wider text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.lines.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground font-bold uppercase text-[10px]">
                                No se encontraron combinaciones válidas.
                            </TableCell>
                        </TableRow>
                    ) : result.lines.map((l, i) => {
                      const product = products.find(p => p.cod === l.product_cod);
                      const totalLine = l.total_amount_cents || l.importe_linea_cents || 0;
                      return (
                        <TableRow key={i} className="hover:bg-muted/30 transition-colors">
                          <TableCell>
                            <div className="font-bold text-xs uppercase">{product?.descripcion || l.product_name || l.product_cod}</div>
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs">{l.cantidad}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-medium">
                                {formatCurrencyCents(l.precio_unitario_cents)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-black text-xs">{formatCurrencyCents(totalLine)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              <Card className="p-5 bg-muted/30 border-none shadow-inner rounded-2xl">
                <h4 className="text-[10px] font-black uppercase mb-3 flex items-center gap-2 tracking-widest text-muted-foreground">
                    <TrendingUp className="w-3 h-3" />
                    Trace de Ejecución (Logs)
                </h4>
                <div className="space-y-1.5">
                  {result.logs.map((log, i) => (
                    <p key={i} className="text-[10px] font-medium text-muted-foreground leading-tight font-mono">
                        <span className="opacity-30 mr-2">[{i+1}]</span> {log}
                    </p>
                  ))}
                </div>
              </Card>
            </>
          )}

          {!result && (
            <div className="h-full min-h-[500px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-[2.5rem] opacity-50 bg-muted/5 transition-all hover:bg-muted/10">
              <div className="p-6 bg-muted/20 rounded-full mb-4">
                <Sparkles className="w-16 h-16 text-primary/20" />
              </div>
              <p className="font-black uppercase text-xs tracking-widest">Esperando ejecución de simulación...</p>
              <p className="text-[10px] font-bold uppercase mt-2 opacity-60">Configura un monto a la izquierda para comenzar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
