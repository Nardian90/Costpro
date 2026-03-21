'use client';

import React, { useState } from 'react';
import { db, type Product, type MatchingRule } from '@/lib/dexie';
import { MatchingEngine, type MatchingResult } from '@/lib/ipv/engine';
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

interface MatchingSimulationProps {
  products: Product[];
  rules: MatchingRule[];
}

export function MatchingSimulation({ products, rules }: MatchingSimulationProps) {
  const { simulatedAmount: target, setSimulatedAmount: setTarget } = useSimulationConfig();
  const [isSimulating, setIsSimulating] = useState(false);
  const [result, setResult] = useState<MatchingResult | null>(null);
  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [isDistributing, setIsDistributing] = useState(false);
  const [globalStrategy, setGlobalStrategy] = useState<"MIN_STOCK" | "MAX_VALUE">("MIN_STOCK");

  const reconciliationLines = useLiveQuery(() => db.reconciliation_lines.toArray());

  const handleSimulate = async () => {
    if (target <= 0) {
        toast.error('Monto inválido');
        return;
    }

    setIsSimulating(true);
    try {
        const engine = new MatchingEngine(products, rules);
        const res = await engine.matchSimulation(target);
        setResult(res);
        if (res.status === 'COMPLETO') {
            toast.success('¡Coincidencia exacta encontrada!');
        } else if (res.status === 'PARCIAL') {
            toast.info('Coincidencia parcial');
        } else {
            toast.error('No se encontró ninguna coincidencia');
        }
    } catch (error) {
        toast.error('Error en simulación');
    } finally {
        setIsSimulating(false);
    }
  };

  const handleGlobalGoal = async () => {
    if (globalTarget <= 0) {
        toast.error('Meta global inválida');
        return;
    }

    setIsDistributing(true);
    try {
        const currentKpiTotal = reconciliationLines?.reduce((sum, l) => sum + l.importe_linea_cents, 0) || 0;
        const dates = Array.from(new Set(reconciliationLines?.map(l => l.fecha_operacion) || []));

        if (dates.length === 0) {
            toast.error('No hay fechas en el desglose actual para distribuir');
            setIsDistributing(false);
            return;
        }

        const engine = new MatchingEngine(products, rules);
        const extraLines = await engine.distributeGlobalGoal(globalTarget, currentKpiTotal, dates, { strategy: globalStrategy });

        if (extraLines.length === 0) {
            toast.warning('No se generaron nuevas líneas de ajuste o el objetivo ya se alcanzó');
        } else {
            await db.reconciliation_lines.bulkAdd(extraLines);
            toast.success(`¡Éxito! Se han inyectado ${extraLines.length} líneas para alcanzar la meta.`);
        }
    } catch (error) {
        toast.error('Error distribuyendo meta global');
    } finally {
        setIsDistributing(false);
    }
  };

  const handleReset = () => {
    setTarget(0);
    setResult(null);
  };

  const handleResetGlobalGoal = () => {
      setGlobalTarget(0);
  };

  return (
    <div className="p-6 space-y-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-primary" />
            Simulador de Coincidencias
          </h2>
          <p className="text-muted-foreground text-sm font-medium">Prueba cómo responde el motor de matching ante diferentes montos.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6">
            <Card className="p-6 space-y-4 border-none shadow-md bg-card/50 backdrop-blur-sm">
            <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-muted-foreground">Monto a Simular ($)</label>
                <Input
                type="number"
                value={target}
                onChange={e => setTarget(Number(e.target.value))}
                placeholder="0.00"
                className="text-lg font-black"
                />
            </div>
            <div className="flex gap-2">
                <Button onClick={handleSimulate} disabled={isSimulating} className="flex-1 neu-btn-primary uppercase font-black text-xs">
                <Play className="w-4 h-4 mr-2" />
                Simular
                </Button>
                <Button variant="outline" onClick={handleReset} className="neu-btn uppercase font-bold text-xs">
                <RotateCcw className="w-4 h-4" />
                </Button>
            </div>
            </Card>

            <Card className="p-6 space-y-4 border-purple-100 bg-purple-50/30 relative">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-purple-600 flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      Objetivo Global (Mes)
                  </h3>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleResetGlobalGoal}
                    className="h-6 w-6 text-purple-600 hover:bg-purple-100"
                    title="Reiniciar objetivo global"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground font-medium uppercase leading-tight">
                    Reparte la diferencia entre el total actual y tu meta mensual usando productos comodín.
                </p>
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Estrategia de Distribución</label>
                    <select
                        value={globalStrategy}
                        onChange={(e) => setGlobalStrategy(e.target.value as "MIN_STOCK" | "MAX_VALUE")}
                        className="w-full h-10 rounded-md border border-input bg-background px-3 py-1 text-sm font-bold uppercase"
                    >
                        <option value="MIN_STOCK">MIN EXISTENCIA (Priorizar agotados)</option>
                        <option value="MAX_VALUE">MAX SALDO (Priorizar más caros)</option>
                    </select>
                </div>
                <div className="space-y-2">
                    <label className="text-xs font-bold uppercase text-muted-foreground">Meta Mensual ($)</label>
                    <Input
                        type="number"
                        value={globalTarget}
                        onChange={e => setGlobalTarget(Number(e.target.value))}
                        placeholder="0.00"
                        className="text-lg font-black"
                    />
                </div>
                <Button onClick={handleGlobalGoal} disabled={isDistributing} className="w-full bg-purple-600 hover:bg-purple-700 text-foreground uppercase font-black text-xs gap-2">
                    <Save className="w-4 h-4" />
                    Distribuir y Aplicar
                </Button>
            </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {result && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-primary/5 border-none">
                  <p className="text-xs font-black text-primary uppercase mb-1">Total Alcanzado</p>
                  <p className="text-2xl font-black">
                    {result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0).toFixed(2)}
                  </p>
                </Card>
                <Card className="p-4 bg-orange-500/5 border-none">
                  <p className="text-xs font-black text-orange-500 uppercase mb-1">Diferencia</p>
                  <p className="text-2xl font-black">
                    {(target - result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0)).toFixed(2)}
                  </p>
                </Card>
              </div>

              {result.status !== 'COMPLETO' && result.failReason && (
                  <div className="p-4 bg-red-500/10 border-2 border-red-500/20 rounded-2xl flex items-center gap-4 animate-in slide-in-from-top-2">
                      <AlertTriangle className="w-8 h-8 text-red-500" />
                      <div>
                          <p className="text-xs font-black text-red-600 uppercase tracking-widest">Motivo de Descuadre</p>
                          <p className="text-sm font-bold text-red-500">{result.failReason}</p>
                      </div>
                  </div>
              )}

              {result.movements && result.movements.length > 0 && (
                  <Card className="p-4 border-orange-200 bg-orange-50/30">
                      <h4 className="text-xs font-black uppercase text-orange-600 mb-3 flex items-center gap-2">
                          <Workflow className="w-4 h-4" />
                          Descomposiciones Automáticas Requeridas
                      </h4>
                      <div className="space-y-2">
                          {result.movements.map((m, i) => (
                              <div key={i} className="flex items-center gap-3 bg-white/60 p-2 rounded-xl border border-orange-100 shadow-sm">
                                  <Badge variant="outline" className="font-black text-orange-600 border-orange-200">{m.producto_origen_cod}</Badge>
                                  <ArrowRight className="w-3 h-3 text-orange-400" />
                                  <span className="text-xs font-bold text-muted-foreground uppercase">-{m.cantidad_origen}</span>
                                  <ArrowRight className="w-4 h-4 text-orange-500" />
                                  <Badge className="bg-orange-500 text-foreground font-black">{m.producto_destino_cod}</Badge>
                                  <span className="text-xs font-bold text-orange-600 uppercase">+{m.cantidad_destino}</span>
                              </div>
                          ))}
                      </div>
                  </Card>
              )}

              <Card className="overflow-hidden border-none shadow-md">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-xs font-black uppercase">Producto</TableHead>
                      <TableHead className="text-xs font-black uppercase text-center">Cant.</TableHead>
                      <TableHead className="text-xs font-black uppercase text-right">Precio Aplicado</TableHead>
                      <TableHead className="text-xs font-black uppercase text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.lines.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={4} className="h-24 text-center text-muted-foreground font-bold uppercase text-xs">
                                No se encontraron combinaciones válidas.
                            </TableCell>
                        </TableRow>
                    ) : result.lines.map((l, i) => {
                      const product = products.find(p => p.cod === l.product_cod);
                      const adjustment = l.cuadre_cents || (product ? l.precio_unitario_cents - product.precio_cents : 0);
                      const isAdjusted = Math.abs(adjustment) > 0.001;

                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="font-bold text-xs">{product?.descripcion || l.product_cod}</div>
                            {isAdjusted && (
                              <Badge
                                variant="outline"
                                className={`text-xs h-3 px-1 mt-1 font-black gap-1 uppercase ${
                                    adjustment > 0
                                        ? 'border-green-200 text-green-600 bg-green-50'
                                        : 'border-red-200 text-red-600 bg-red-50'
                                }`}
                              >
                                <Sparkles className="w-2 h-2" />
                                {adjustment > 0 ? `+${adjustment.toFixed(2)} Propina` : `${adjustment.toFixed(2)} Descuento`}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs">{l.cantidad}</TableCell>
                          <TableCell className="text-right">
                            <span className={isAdjusted ? (adjustment > 0 ? "text-green-600 font-black" : "text-red-600 font-black") : ""}>
                                {l.precio_unitario_cents.toFixed(2)}
                            </span>
                            {isAdjusted && <div className="text-xs line-through opacity-50">{product?.precio_cents?.toFixed(2)}</div>}
                          </TableCell>
                          <TableCell className="text-right font-black text-xs">{l.importe_linea_cents.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              <Card className="p-4 bg-muted/30 border-none">
                <h4 className="text-xs font-black uppercase mb-2 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    Trace de Ejecución (Logs)
                </h4>
                <div className="space-y-1">
                  {result.logs.map((log, i) => (
                    <p key={i} className="text-xs font-medium text-muted-foreground leading-tight">
                        <span className="opacity-30 mr-2">[{i+1}]</span> {log}
                    </p>
                  ))}
                </div>
              </Card>
            </>
          )}

          {!result && (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-muted-foreground border-2 border-dashed rounded-3xl opacity-50 bg-muted/5">
              <Sparkles className="w-12 h-12 mb-2 text-primary/20" />
              <p className="font-black uppercase text-xs">Esperando ejecución de simulación...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
