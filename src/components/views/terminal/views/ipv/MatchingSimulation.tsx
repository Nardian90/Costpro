'use client';

import React, { useState } from 'react';
import { type Product, type MatchingRule, type ReconciliationLine, db } from '@/lib/dexie';
import { MatchingEngine } from '@/lib/ipv/engine';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Play, RotateCcw, Target, Sparkles, TrendingUp, Calendar, Save } from 'lucide-react';
import { toast } from 'sonner';

export function MatchingSimulation({ products, rules }: { products: Product[], rules: MatchingRule[] }) {
  const [target, setTarget] = useState<number>(0);
  const [result, setResult] = useState<{ lines: ReconciliationLine[], logs: string[] } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  // Global Goal State
  const [globalTarget, setGlobalTarget] = useState<number>(0);
  const [isDistributing, setIsDistributing] = useState(false);

  const handleSimulate = async () => {
    if (target <= 0) {
      toast.error('Ingrese un objetivo válido');
      return;
    }

    setIsSimulating(true);
    try {
      const engine = new MatchingEngine(products, rules);
      const sim = await engine.matchSimulation(target);
      setResult(sim);
      toast.success('Simulación completada');
    } catch (error) {
      toast.error('Error en la simulación');
    } finally {
      setIsSimulating(false);
    }
  };

  const handleGlobalGoal = async () => {
    if (globalTarget <= 0) {
        toast.error('Ingrese un objetivo global válido');
        return;
    }

    setIsDistributing(true);
    try {
        const engine = new MatchingEngine(products, rules);

        // Obtener fechas con movimientos
        const txs = await db.bank_statements.toArray();
        const dates = Array.from(new Set(txs.map(t => t.fecha))).sort();

        const currentLines = await db.reconciliation_lines.toArray();
        const currentTotal = currentLines.reduce((sum, l) => sum + l.importe_linea_cents, 0);

        const extraLines = await engine.distributeGlobalGoal(globalTarget, currentTotal, dates);

        if (extraLines.length === 0) {
            toast.info('El objetivo ya se ha alcanzado o superado');
            return;
        }

        if (confirm(`Se han generado ${extraLines.length} líneas de ajuste para cubrir $${(globalTarget - currentTotal).toFixed(2)} entre ${dates.length} días. ¿Deseas aplicarlas?`)) {
            await db.reconciliation_lines.bulkAdd(extraLines);
            toast.success('Ajuste global aplicado correctamente');
        }
    } catch (error) {
        toast.error('Error al distribuir objetivo global');
    } finally {
        setIsDistributing(false);
    }
  };

  const handleReset = () => {
    setTarget(0);
    setResult(null);
  };

  return (
    <div className="p-6 space-y-8">
      {/* Sección 1: Simulación Unitaria */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-4">
            <Card className="p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <Target className="w-4 h-4" />
                Simulación Unitaria
            </h3>
            <p className="text-[10px] text-muted-foreground font-medium uppercase leading-tight">
                Prueba el motor de matching contra un monto específico sin afectar los datos reales.
            </p>
            <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground">Monto Objetivo ($)</label>
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

            <Card className="p-6 space-y-4 border-purple-100 bg-purple-50/30">
                <h3 className="text-sm font-black uppercase tracking-widest text-purple-600 flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Objetivo Global (Mes)
                </h3>
                <p className="text-[10px] text-muted-foreground font-medium uppercase leading-tight">
                    Reparte la diferencia entre el total actual y tu meta mensual usando productos comodín.
                </p>
                <div className="space-y-2">
                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Meta Mensual ($)</label>
                    <Input
                        type="number"
                        value={globalTarget}
                        onChange={e => setGlobalTarget(Number(e.target.value))}
                        placeholder="0.00"
                        className="text-lg font-black"
                    />
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleGlobalGoal} disabled={isDistributing} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white uppercase font-black text-xs gap-2">
                        <Save className="w-4 h-4" />
                        Distribuir y Aplicar
                    </Button>
                    <Button variant="outline" onClick={() => setGlobalTarget(0)} className="neu-btn uppercase font-bold text-xs border-purple-200 text-purple-600">
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </div>
            </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {result && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Card className="p-4 bg-primary/5 border-none">
                  <p className="text-[10px] font-black text-primary uppercase mb-1">Total Alcanzado</p>
                  <p className="text-2xl font-black">
                    {result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0).toFixed(2)}
                  </p>
                </Card>
                <Card className="p-4 bg-orange-500/5 border-none">
                  <p className="text-[10px] font-black text-orange-500 uppercase mb-1">Diferencia</p>
                  <p className="text-2xl font-black">
                    {(target - result.lines.reduce((sum, l) => sum + l.importe_linea_cents, 0)).toFixed(2)}
                  </p>
                </Card>
              </div>

              <Card className="overflow-hidden border-none shadow-md">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow>
                      <TableHead className="text-[10px] font-black uppercase">Producto</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-center">Cant.</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-right">Precio Aplicado</TableHead>
                      <TableHead className="text-[10px] font-black uppercase text-right">Total</TableHead>
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
                      const isAdjusted = product && Math.abs(l.precio_unitario_cents - product.precio_cents) > 0.001;

                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="font-bold text-xs">{product?.descripcion || (l.product_cod === 'CASH' ? 'AJUSTE EFECTIVO' : l.product_cod)}</div>
                            {isAdjusted && (
                              <Badge className="bg-purple-500/10 text-purple-600 text-[8px] h-3 px-1 mt-1 font-black gap-1">
                                <Sparkles className="w-2 h-2" />
                                PRICE FLEX (+{(l.precio_unitario_cents - product.precio_cents).toFixed(2)})
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-bold text-xs">{l.cantidad}</TableCell>
                          <TableCell className="text-right">
                            <span className={isAdjusted ? "text-purple-600 font-black" : ""}>{l.precio_unitario_cents.toFixed(2)}</span>
                            {isAdjusted && <div className="text-[8px] line-through opacity-50">{product.precio_cents.toFixed(2)}</div>}
                          </TableCell>
                          <TableCell className="text-right font-black text-xs">{l.importe_linea_cents.toFixed(2)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </Card>

              <Card className="p-4 bg-muted/30 border-none">
                <h4 className="text-[10px] font-black uppercase mb-2 flex items-center gap-2">
                    <TrendingUp className="w-3 h-3" />
                    Trace de Ejecución (Logs)
                </h4>
                <div className="space-y-1">
                  {result.logs.map((log, i) => (
                    <p key={i} className="text-[10px] font-medium text-muted-foreground leading-tight">
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
