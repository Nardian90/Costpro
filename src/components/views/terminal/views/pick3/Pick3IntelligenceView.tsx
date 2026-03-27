"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  Activity, Shield, RefreshCw, Zap,
  TrendingDown, Coins, AlertCircle, BarChart3, LineChart,
  Sparkles,
  History,
  Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pick3Engine } from '@/services/pick3/Pick3Engine';
import { MIAMI_PICK3_HISTORICAL } from '@/services/pick3/seedData';
import { Pick3Storage } from '@/services/pick3/storage';
import { Pick3ExternalService } from '@/services/pick3/external';
import { SimulationResult, Pick3Result, BettingConfig, BacktestResult } from '@/types/pick3';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Pick3Visuals } from './Pick3Visuals';
import { Pick3HistorySection } from './Pick3HistorySection';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell
} from 'recharts';

export default function Pick3IntelligenceView() {
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [validation, setValidation] = useState<ModelValidationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  const [bConfig, setBConfig] = useState<BettingConfig>({
    mode: 'LAST2',
    payout: 90,
    digits: 2,
    maxCombinations: 3,
    riskFactor: 1.0,
    stopLoss: -30,
    criticalDrawdown: -20
  });

  const engine = useMemo(() => new Pick3Engine(history), [history]);
  const analysis = useMemo(() => history.length > 0 ? engine.analyzeAdvanced(30) : null, [engine, history.length]);
  const plays = useMemo(() => analysis ? engine.generatePlays(analysis, bConfig, bConfig.maxCombinations) : [], [engine, analysis, bConfig]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const stored = await Pick3Storage.getHistory();
        if (stored && stored.length > 0) {
          setHistory(stored);
        } else {
          setHistory(MIAMI_PICK3_HISTORICAL);
        }
      } catch (e) {
        setHistory(MIAMI_PICK3_HISTORICAL);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/pick3/sync', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        const updated = await Pick3Storage.getHistory();
        setHistory(updated);
        toast.success("Sincronización exitosa", {
          description: "El historial se ha actualizado correctamente."
        });
      } else {
        throw new Error(data.message);
      }
    } catch (e) {
      toast.error("Error al sincronizar", {
        description: "No se pudo conectar con el servidor oficial. Intente más tarde."
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const runAnalysis = () => {
    if (history.length < 30) return;
    const bt = engine.runBacktest(bConfig, 1000, 30);
    const val = engine.runValidation(bConfig, 1000, 30);
    setBacktest(bt);
    setValidation(val);
    setSimulation(engine.simulateMonteCarlo({ budget: 1000, horizonDays: 30, riskLevel: 'medium', costPerBet: 1, bettingConfig: bConfig }, bt));
    toast.success("Análisis completado", {
        description: "Se han generado nuevas proyecciones de 30 días."
    });
  };

  const recommendation = useMemo(() => {
    if (!backtest) return "Inicie un análisis para obtener recomendaciones.";
    return engine.getCapitalRecommendation(backtest.roi, backtest.maxDrawdown, bConfig);
  }, [backtest, bConfig, engine]);

  if (loading) return <div className="p-12 text-center font-black animate-pulse uppercase tracking-widest opacity-40">Accediendo al Mercado...</div>;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-20">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tighter italic flex items-center gap-3">
            <BrainCircuit className="w-10 h-10 text-primary" /> PICK 3 INTELLIGENCE
          </h1>
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground opacity-60 flex items-center gap-2 mt-1">
            <Shield className="w-3 h-3 inline mr-1 text-emerald-500" /> Quantitative Strategy v6.5 (Stable)
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={isSyncing} className="flex-1 md:flex-none rounded-full font-bold">
            <RefreshCw className={cn("w-3 h-3 mr-2", isSyncing && "animate-spin")} /> Sync
          </Button>
          <Button size="sm" onClick={runAnalysis} className="flex-1 md:flex-none rounded-full font-bold shadow-lg shadow-primary/20">
            <Zap className="w-3 h-3 mr-2" /> Analizar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="md:col-span-1 rounded-[32px] border-primary/20 bg-primary/5 shadow-inner overflow-hidden border-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2 text-primary">
              <Target className="w-4 h-4" /> Recomendación Estratégica
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-2xl bg-background/80 border border-primary/10 shadow-sm">
              <p className={cn("text-sm font-black italic leading-tight",
                recommendation.includes("PAUSA") ? "text-red-500" :
                recommendation.includes("AUMENTAR") ? "text-emerald-500" : "text-primary")}>
                {recommendation}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[10px] font-black uppercase opacity-60">
                <span>Riesgo sugerido</span>
                <span>{bConfig.riskFactor}%</span>
              </div>
              <input
                type="range" min="0.2" max="5" step="0.1"
                value={bConfig.riskFactor}
                onChange={(e) => setBConfig({...bConfig, riskFactor: parseFloat(e.target.value)})}
                className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 rounded-[32px] border-border bg-card shadow-xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-orange-500" /> Sugerencias de Alta Confianza
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {plays.slice(0, 3).map((play, i) => (
                <div key={i} className="p-4 rounded-2xl bg-muted/20 border border-border/50 relative group">
                  <div className="absolute top-2 right-2">
                    <Badge variant="outline" className="text-[8px] font-black border-primary/30 text-primary px-1.5 py-0">
                      {play.score.toFixed(0)}%
                    </Badge>
                  </div>
                  <div className="text-3xl font-black italic tracking-tighter mb-1 text-center">
                    {play.combination.join('')}
                  </div>
                  <p className="text-[9px] text-muted-foreground font-bold uppercase text-center leading-none opacity-80">
                    {play.justification.split('|')[0]}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-full h-12 w-full overflow-x-auto justify-start md:justify-center border border-border mb-4">
          <TabsTrigger value="overview" className="rounded-full px-6 font-bold text-xs">Mercado</TabsTrigger>
          <TabsTrigger value="validation" className="rounded-full px-6 font-bold text-xs">Validación 30d</TabsTrigger>
          <TabsTrigger value="history" className="rounded-full px-6 font-bold text-xs">Historial</TabsTrigger>
          <TabsTrigger value="backtest" className="rounded-full px-6 font-bold text-xs">Backtest</TabsTrigger>
          <TabsTrigger value="montecarlo" className="rounded-full px-6 font-bold text-xs">Simulación</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Trend', val: 'Bullish', icon: TrendingUp, color: 'text-emerald-500' },
              { label: 'Volatilidad', val: 'Media', icon: Activity, color: 'text-orange-500' },
              { label: 'Entropía', val: analysis?.entropy.toFixed(3) || '0.000', icon: Shield, color: 'text-blue-500' },
              { label: 'Hits 24h', val: '12/100', icon: Target, color: 'text-primary' },
            ].map((s, i) => (
              <Card key={i} className="rounded-2xl border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <s.icon className={cn("w-4 h-4", s.color)} />
                  <div>
                    <p className="text-[9px] font-black uppercase text-muted-foreground leading-none">{s.label}</p>
                    <p className="text-sm font-black italic">{s.val}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
          {analysis && <Pick3Visuals analysis={analysis} history={history} />}
        </TabsContent>

        <TabsContent value="validation" className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="rounded-[32px] border-border bg-card p-6 flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-4">Balance Proyectado (30d)</h3>
                <div className="flex items-end gap-2">
                  <span className={cn("text-5xl font-black italic", (validation?.netProfit || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                    ${validation?.equityCurve[validation.equityCurve.length-1].toFixed(0) || "1,000"}
                  </span>
                  <span className="text-xs font-bold uppercase pb-2 opacity-60">Capital Final</span>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase opacity-60">ROI Estimado</span>
                  <span className={cn("text-sm font-black", (validation?.roi || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                    {validation?.roi.toFixed(1) || 0}%
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black uppercase opacity-60">Mejor Horario</span>
                  <Badge variant="outline" className="text-[10px] font-black uppercase bg-primary/10 text-primary border-primary/20">
                    {validation?.bestDrawTime === 'midday' ? "DÍA (Midday)" : "NOCHE (Evening)"}
                  </Badge>
                </div>
              </div>
            </Card>

            <Card className="md:col-span-2 rounded-[32px] border-border bg-card overflow-hidden">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <LineChart className="w-4 h-4 text-primary" /> Curva de Validación (Presupuesto $1000)
                </CardTitle>
              </CardHeader>
              <CardContent className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={validation?.equityCurve.map((v, i) => ({ d: i, c: v })) || []}>
                    <defs>
                      <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                    <XAxis dataKey="d" hide />
                    <YAxis fontSize={10} axisLine={false} tickLine={false} domain={['dataMin - 100', 'dataMax + 100']} />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', fontWeight: 'bold' }}
                      formatter={(value: any) => [`${value.toFixed(0)}`, "Capital"]}
                    />
                    <Area isAnimationActive={false} type="monotone" dataKey="c" stroke="#10b981" fill="url(#colorVal)" strokeWidth={4} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="rounded-[32px] border-border bg-card overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Detalle de Proyección Diaria
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase opacity-60">
                Simulación siguiendo las 3 opciones recomendadas por el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40">Fecha/Tirada</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40">Apuestas (Size)</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40 text-center">Resultado</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40 text-right">Ganancia</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40 text-right">Capital</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {validation?.dailyHistory.slice().reverse().map((day, i) => (
                      <tr key={i} className="group hover:bg-muted/50 transition-colors">
                        <td className="py-4">
                          <p className="text-xs font-black italic">{day.date}</p>
                          <p className="text-[9px] font-bold uppercase opacity-60">{day.draw_time}</p>
                        </td>
                        <td className="py-4">
                          <div className="flex gap-2">
                            {day.bets.map((b, idx) => (
                              <Badge key={idx} variant="outline" className="text-[9px] font-black bg-muted/30">
                                {b.combination.join('')} (${b.size})
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <div className="inline-flex gap-1">
                            {day.result.map((n, idx) => (
                              <span key={idx} className={cn(
                                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black",
                                day.win ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"
                              )}>
                                {n}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 text-right">
                          <span className={cn("text-xs font-black italic", day.profit >= 0 ? "text-emerald-500" : "text-red-500")}>
                            {day.profit >= 0 ? "+" : ""}{day.profit.toFixed(0)}
                          </span>
                        </td>
                        <td className="py-4 text-right text-xs font-black">
                          ${day.capital.toFixed(0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Pick3HistorySection history={history} />
        </TabsContent>

        <TabsContent value="backtest" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'ROI', val: `${backtest?.roi.toFixed(1) || 0}%`, icon: TrendingUp },
              { label: 'Sharpe', val: backtest?.sharpeRatio.toFixed(2) || '0.00', icon: Activity },
              { label: 'Sortino', val: backtest?.sortinoRatio.toFixed(2) || '0.00', icon: Shield },
              { label: 'Profit Factor', val: backtest?.profitFactor.toFixed(2) || '0.00', icon: Coins },
            ].map((s, i) => (
              <Card key={i} className="rounded-2xl border-border bg-card p-4">
                <p className="text-[9px] font-black uppercase text-muted-foreground">{s.label}</p>
                <p className="text-lg font-black italic text-primary">{s.val}</p>
              </Card>
            ))}
          </div>
          <Card className="rounded-[32px] border-border bg-card overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <LineChart className="w-4 h-4" /> Curva de Equidad Histórica
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={backtest?.equityCurve.map((v, i) => ({ d: i, c: v })) || []}>
                  <defs>
                    <linearGradient id="colorC" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                  <XAxis dataKey="d" hide />
                  <YAxis fontSize={10} axisLine={false} tickLine={false} strokeOpacity={0.5} />
                  <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                  <Area isAnimationActive={false} type="monotone" dataKey="c" stroke="#3b82f6" fill="url(#colorC)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="montecarlo" className="space-y-6">
           <Card className="rounded-[32px] border-border bg-card p-6">
              <div className="flex flex-col md:flex-row justify-between gap-6">
                <div className="space-y-4 flex-1">
                  <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Riesgo Proyectado</h3>
                  <div className="flex items-end gap-2">
                    <span className="text-5xl font-black italic text-primary">{simulation?.probabilityOfRuin.toFixed(1) || 0}%</span>
                    <span className="text-xs font-bold uppercase pb-2 opacity-60">Prob. Ruina</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Basado en 10,000 iteraciones usando <b>Bootstrapping Empírico</b>.
                    Un riesgo menor al 15% se considera seguro para operación continua.
                  </p>
                </div>
                <div className="h-[200px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={simulation?.equityCurve.slice(0, 12).map((v, i) => ({ s: i, v })) || []}>
                      <Bar isAnimationActive={false} dataKey="v" radius={[4, 4, 0, 0]}>
                        {simulation?.equityCurve.slice(0, 12).map((v, i) => (
                          <Cell key={i} fill={v < 1000 ? '#ef4444' : '#10b981'} fillOpacity={0.6} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
