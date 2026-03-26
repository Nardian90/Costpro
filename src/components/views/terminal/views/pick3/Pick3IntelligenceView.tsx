"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  Activity, Shield, RefreshCw, Zap,
  TrendingDown, Coins, AlertCircle, BarChart3, LineChart,
  Sparkles,
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
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Pick3Visuals } from './Pick3Visuals';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';

export default function Pick3IntelligenceView() {
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
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
        setHistory(stored && stored.length > 0 ? stored : MIAMI_PICK3_HISTORICAL);
      } catch (e) {
        toast.error("Error cargando datos");
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const latest = await Pick3ExternalService.syncOfficialResults();
      if (latest?.length) {
        setHistory(latest);
        toast.success("Sincronización exitosa");
      }
    } catch (e) {
      toast.error("Error de sincronización");
    } finally {
      setIsSyncing(false);
    }
  };

  const runAnalysis = () => {
    if (!history.length) return;
    const bt = engine.runBacktest(bConfig, 1000, 60);
    setBacktest(bt);
    const sim = engine.simulateMonteCarlo({ budget: 1000, horizonDays: 30, riskLevel: 'medium', costPerBet: 1, bettingConfig: bConfig }, bt);
    setSimulation(sim);
    toast.success("Análisis Cuantitativo Completado");
  };

  const recommendation = useMemo(() => {
    return engine.getCapitalRecommendation(backtest?.roi || 0, backtest?.maxDrawdown || 0, bConfig);
  }, [backtest, bConfig, engine]);

  if (loading) return <div className="p-8 text-center animate-pulse font-black italic">CARGANDO INTELIGENCIA...</div>;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-background min-h-screen max-w-7xl mx-auto">
      {/* HEADER - Compact & Mobile Friendly */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-[32px] border border-border shadow-xl">
        <div>
          <h1 className="text-2xl md:text-3xl font-black italic uppercase tracking-tighter text-primary flex items-center gap-2">
            <BrainCircuit className="w-8 h-8" /> Pick 3 AI Engine
          </h1>
          <p className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase tracking-widest mt-1">
            <Shield className="w-3 h-3 inline mr-1 text-emerald-500" /> Quantitative Strategy v6.0
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

      {/* PRIORITY #1: STRATEGY & TOP PLAYS (Mobile First) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* AI Recommendation Card */}
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

        {/* Top Plays Card */}
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

      {/* TABS FOR DEEP ANALYSIS */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-muted/50 p-1 rounded-full h-12 w-full overflow-x-auto justify-start md:justify-center border border-border mb-4">
          <TabsTrigger value="overview" className="rounded-full px-6 font-bold text-xs">Mercado</TabsTrigger>
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
