"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, Activity, Shield, RefreshCw, Zap,
  Coins, AlertCircle, LineChart, Sparkles, History, Info,
  BrainCircuit
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Pick3Engine } from '@/services/pick3/Pick3Engine';
import { Pick3Storage } from '@/services/pick3/storage';
import { Pick3ScraperService } from '@/services/pick3/Pick3ScraperService';
import { SimulationResult, Pick3Result, BettingConfig, BacktestResult, Pick3SyncState, AdvancedAnalysis } from '@/types/pick3';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Pick3Visuals } from './Pick3Visuals';
import { Pick3HistorySection } from './Pick3HistorySection';
import { Pick3ControlPanel } from './Pick3ControlPanel';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  CartesianGrid, Tooltip, BarChart, Bar, Cell
} from 'recharts';

export default function Pick3IntelligenceView() {
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [validation, setValidation] = useState<ModelValidationResult | null>(null);
  const [analysis, setAnalysis] = useState<AdvancedAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<Pick3SyncState>(Pick3ScraperService.getSyncState());
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

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const stored = await Pick3Storage.getHistory();
      if (stored && stored.length > 0) {
        setHistory(stored);
      } else {
        handleSync();
      }
    } catch (error) {
      console.error("Failed to load history", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncState(Pick3ScraperService.getSyncState());

    try {
      const results = await Pick3ScraperService.scrapeLatestResults();
      setSyncState(Pick3ScraperService.getSyncState());

      if (results.length > 0) {
        setHistory(results);
        toast.success("Sincronización exitosa");
      } else {
        toast.error("No se pudieron obtener resultados nuevos");
      }
    } catch (error) {
      setSyncState(Pick3ScraperService.getSyncState());
      toast.error("Error en la sincronización");
    }
  };

  useEffect(() => {
    if (history.length > 0) {
      runAnalysis();
    }
  }, [history, bConfig]);

  const runAnalysis = () => {
    try {
      const advAnalysis = engine.analyzeAdvanced(30);
      setAnalysis(advAnalysis);

      const backtestRes = engine.runBacktest(bConfig, 1000, 30);
      setBacktest(backtestRes);

      const simRes = engine.simulateMonteCarlo({
        budget: 1000,
        horizonDays: 30,
        riskLevel: 'medium',
        costPerBet: 1,
        bettingConfig: bConfig
      }, backtestRes);
      setSimulation(simRes);

      const valRes = engine.runValidation(bConfig, 1000, 30);
      setValidation(valRes);
    } catch (error) {
      console.error("Analysis failed", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] gap-4">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-xs font-black uppercase tracking-widest opacity-50">Cargando Inteligencia Pick3...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black italic tracking-tighter flex items-center gap-3">
            <BrainCircuit className="w-8 h-8 text-primary" /> PICK3 INTELLIGENCE <Badge className="bg-primary text-primary-foreground text-[10px] font-black italic">v8.1</Badge>
          </h1>
          <p className="text-xs font-bold uppercase opacity-60 tracking-widest mt-1">
            Análisis Cuantitativo y Proyección Probabilística de Florida Pick 3
          </p>
        </div>
      </div>

      <Pick3ControlPanel syncState={syncState} onSync={handleSync} />

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-full border border-border/50 mb-6">
          <TabsTrigger value="overview" className="rounded-full px-6 text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Resumen de IA
          </TabsTrigger>
          <TabsTrigger value="history" className="rounded-full px-6 text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Historial de Resultados
          </TabsTrigger>
          <TabsTrigger value="backtest" className="rounded-full px-6 text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Rendimiento (30D)
          </TabsTrigger>
          <TabsTrigger value="montecarlo" className="rounded-full px-6 text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Simulación Montecarlo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          {analysis && <Pick3Visuals analysis={analysis} history={history} />}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="rounded-[32px] border-border bg-card overflow-hidden">
              <CardHeader>
                <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" /> Recomendación de Modelo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 rounded-2xl bg-muted/30 border border-border/50">
                  <p className="text-[9px] font-black uppercase text-muted-foreground mb-1">Mejor Horario Detectado</p>
                  <Badge variant="outline" className="text-[10px] font-black uppercase bg-primary/10 text-primary border-primary/20">
                    {validation?.bestDrawTime === 'midday' ? "DÍA (Midday)" : "NOCHE (Evening)"}
                  </Badge>
                </div>
              </CardContent>
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
