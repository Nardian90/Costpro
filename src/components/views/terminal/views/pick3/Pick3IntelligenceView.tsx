"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  History, Sparkles, Activity, Info, BarChart3, Shield, RefreshCw, Zap,
  TrendingDown, Coins, Plus, Save, Download, AlertCircle, RotateCcw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pick3Engine } from '@/services/pick3/Pick3Engine';
import { MIAMI_PICK3_HISTORICAL } from '@/services/pick3/seedData';
import { Pick3Storage } from '@/services/pick3/storage';
import { Pick3ExternalService } from '@/services/pick3/external';
import { StrategyConfig, SimulationResult, Pick3Result, AdvancedAnalysis, IntelligencePlay, BettingConfig, BacktestResult } from '@/types/pick3';
import { useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Pick3Visuals } from './Pick3Visuals';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar, Cell } from 'recharts';

export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [backtest, setBacktest] = useState<BacktestResult | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [lookbackDays, setLookbackDays] = useState(30);

  const [bConfig, setBConfig] = useState<BettingConfig>({
    mode: 'LAST2',
    payout: 90,
    digits: 2,
    maxCombinations: 5,
    riskFactor: 1.0,
    stopLoss: -30,
    criticalDrawdown: -20
  });

  const engine = useMemo(() => new Pick3Engine(history), [history]);
  const analysis = useMemo(() => history.length > 0 ? engine.analyzeAdvanced(lookbackDays) : null, [engine, lookbackDays, history.length]);
  const plays = useMemo(() => analysis ? engine.generatePlays(analysis, bConfig, bConfig.maxCombinations) : [], [engine, analysis, bConfig]);

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const stored = await Pick3Storage.getHistory();
      if (stored && stored.length > 0) {
        setHistory(stored);
      } else {
        setHistory(MIAMI_PICK3_HISTORICAL);
      }
    } catch (error) {
      toast.error("Error cargando datos locales");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const latest = await Pick3ExternalService.syncOfficialResults();
      if (latest && latest.length > 0) {
        setHistory(latest);
        toast.success("Sincronización exitosa");
      }
    } catch (error) {
      toast.error("Sync Market error: Reintentando...");
    } finally {
      setIsSyncing(false);
    }
  };

  const runAnalysis = () => {
    if (history.length === 0) return;
    const bt = engine.runBacktest(bConfig, 1000, 60);
    setBacktest(bt);
    const sim = engine.simulateMonteCarlo({ budget: 1000, horizonDays: 30, riskLevel: 'medium', costPerBet: 1, bettingConfig: bConfig }, bt);
    setSimulation(sim);
    toast.success("Backtesting y Monte Carlo completados");
  };

  const recommendation = useMemo(() => {
    if (!backtest) return "Pendiente de análisis";
    return engine.getCapitalRecommendation(backtest.roi, backtest.maxDrawdown, bConfig);
  }, [backtest, bConfig, engine]);

  if (loading) return <div className="p-8 text-center animate-pulse">Cargando Inteligencia Pick 3...</div>;

  return (
    <div className="flex flex-col gap-6 p-4 md:p-8 bg-background/50 min-h-screen">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-card p-6 rounded-[40px] border border-border/50 shadow-2xl">
        <div>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter text-primary flex items-center gap-3">
            <BrainCircuit className="w-10 h-10" />
            Pick 3 Intelligence <span className="text-xs bg-primary/20 text-primary px-3 py-1 rounded-full not-italic">ENTERPRISE v5.1</span>
          </h1>
          <p className="text-muted-foreground font-medium flex items-center gap-2 mt-1">
            <Shield className="w-4 h-4 text-emerald-500" />
            Motor Predictivo Cuantitativo - Modelo Cuba 2D (90:1)
          </p>
        </div>
        <div className="flex gap-3 w-full md:w-auto">
          <Button variant="outline" onClick={handleSync} disabled={isSyncing} className="rounded-full h-12 px-6 border-2">
            <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
            {isSyncing ? 'Sincronizando...' : 'Sincronizar Mercado'}
          </Button>
          <Button onClick={runAnalysis} className="rounded-full h-12 px-8 font-bold shadow-lg shadow-primary/20">
            <Zap className="w-4 h-4 mr-2" />
            Ejecutar Backtesting
          </Button>
        </div>
      </div>

      {/* Main Dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Sidebar: Controls & Recs */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="rounded-[32px] border-border/50 bg-card overflow-hidden">
             <CardHeader className="bg-primary/5 pb-4">
               <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                 <DollarSign className="w-4 h-4" />
                 Gestión de Capital
               </CardTitle>
             </CardHeader>
             <CardContent className="pt-6 space-y-4">
                <div className="p-4 rounded-2xl bg-background/50 border border-border/30">
                   <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1">Recomendación AI</p>
                   <p className={cn("text-sm font-black italic",
                     recommendation.includes("PAUSA") ? "text-red-500" :
                     recommendation.includes("AUMENTAR") ? "text-emerald-500" : "text-primary")}>
                     {recommendation}
                   </p>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-bold uppercase text-muted-foreground">Riesgo por Jugada (%)</label>
                   <input
                     type="range" min="0.2" max="5" step="0.1"
                     value={bConfig.riskFactor}
                     onChange={(e) => setBConfig({...bConfig, riskFactor: parseFloat(e.target.value)})}
                     className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                   />
                   <div className="flex justify-between text-[10px] font-bold">
                     <span>0.2%</span>
                     <span className="text-primary">{bConfig.riskFactor}%</span>
                     <span>5%</span>
                   </div>
                </div>
             </CardContent>
          </Card>

          <Card className="rounded-[32px] border-border/50 bg-card">
             <CardHeader>
               <CardTitle className="text-sm font-black uppercase tracking-widest">Configuración</CardTitle>
             </CardHeader>
             <CardContent className="space-y-3">
               <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30">
                  <span className="text-xs font-bold">Modo de Juego</span>
                  <Badge variant="secondary" className="rounded-md">Cuba 2D (YZ)</Badge>
               </div>
               <div className="flex justify-between items-center p-3 rounded-xl bg-muted/30">
                  <span className="text-xs font-bold">Payout</span>
                  <Badge className="bg-emerald-500">90:1</Badge>
               </div>
             </CardContent>
          </Card>
        </div>

        {/* Center: Plays & Charts */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
             {plays.map((play, i) => (
               <Card key={i} className="rounded-[32px] border-border/50 bg-card relative overflow-hidden group hover:border-primary/50 transition-all">
                  <div className="absolute top-0 right-0 p-3">
                    <Badge className="bg-primary/20 text-primary border-none text-[10px] font-black">
                      SCORE: {play.score.toFixed(1)}
                    </Badge>
                  </div>
                  <CardContent className="pt-8 pb-6 flex flex-col items-center">
                    <div className="text-5xl font-black tracking-tighter italic text-foreground mb-2">
                      {play.combination.map(n => n).join('')}
                    </div>
                    <div className="w-full h-1 bg-muted rounded-full mb-3 overflow-hidden">
                       <div className="h-full bg-primary" style={{ width: `${play.confidence}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground font-bold uppercase text-center px-4 leading-tight">
                      {play.justification}
                    </p>
                  </CardContent>
               </Card>
             ))}
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-card border border-border/50 p-1 rounded-full h-14 w-full md:w-auto">
               <TabsTrigger value="overview" className="rounded-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">Resumen</TabsTrigger>
               <TabsTrigger value="backtest" className="rounded-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">Backtesting</TabsTrigger>
               <TabsTrigger value="montecarlo" className="rounded-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">Monte Carlo</TabsTrigger>
               <TabsTrigger value="visuals" className="rounded-full px-8 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-bold">Análisis Pro</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6 space-y-6">
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {[
                    { label: 'Bankroll', val: `$${backtest?.equityCurve[backtest.equityCurve.length-1].toFixed(2) || '1,000'}`, icon: Coins, color: 'text-primary' },
                    { label: 'ROI Histórico', val: `${backtest?.roi.toFixed(1) || '0.0'}%`, icon: TrendingUp, color: 'text-emerald-500' },
                    { label: 'Max Drawdown', val: `${backtest?.maxDrawdown.toFixed(1) || '0.0'}%`, icon: TrendingDown, color: 'text-red-500' },
                    { label: 'Prob. Ruina', val: `${simulation?.probabilityOfRuin.toFixed(1) || '0.0'}%`, icon: AlertCircle, color: 'text-orange-500' },
                  ].map((stat, i) => (
                    <Card key={i} className="rounded-3xl border-border/50 bg-card">
                       <CardContent className="p-6 flex items-center gap-4">
                          <div className={cn("p-3 rounded-2xl bg-muted/50", stat.color)}>
                            <stat.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <p className="text-[10px] font-black uppercase text-muted-foreground">{stat.label}</p>
                            <p className="text-xl font-black italic">{stat.val}</p>
                          </div>
                       </CardContent>
                    </Card>
                  ))}
               </div>
               {analysis && <Pick3Visuals analysis={analysis} history={history} />}
            </TabsContent>

            <TabsContent value="backtest" className="mt-6">
               <Card className="rounded-[40px] border-border/50 bg-card overflow-hidden">
                  <CardHeader>
                    <CardTitle className="text-lg font-black italic uppercase tracking-tighter">Curva de Equidad (Equity Curve)</CardTitle>
                    <CardDescription>Simulación histórica de 60 días con gestión de riesgo dinámica</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[400px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={backtest?.equityCurve.map((v, i) => ({ day: i, capital: v })) || []}>
                        <defs>
                          <linearGradient id="colorCapital" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                        <XAxis dataKey="day" hide />
                        <YAxis stroke="#999" fontSize={10} axisLine={false} tickLine={false} />
                        <Tooltip
                          contentStyle={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '16px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }}
                        />
                        <Area type="monotone" dataKey="capital" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCapital)" strokeWidth={4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </CardContent>
               </Card>
            </TabsContent>

            <TabsContent value="montecarlo" className="mt-6">
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card className="rounded-[40px] border-border/50 bg-card">
                     <CardHeader>
                       <CardTitle className="text-sm font-black uppercase tracking-widest">Simulación Monte Carlo (10k)</CardTitle>
                       <CardDescription>Resultados proyectados a 30 días</CardDescription>
                     </CardHeader>
                     <CardContent className="space-y-6">
                        <div className="flex justify-between items-end">
                           <div className="text-4xl font-black italic text-primary">ROI Avg: {simulation?.roi.toFixed(1)}%</div>
                           <Badge className="bg-emerald-500 mb-2">Exitoso</Badge>
                        </div>
                        <div className="space-y-4">
                           <div className="flex justify-between text-xs font-bold">
                              <span className="text-muted-foreground">Probabilidad de Ruina</span>
                              <span className={cn(simulation && simulation.probabilityOfRuin > 20 ? "text-red-500" : "text-emerald-500")}>
                                {simulation?.probabilityOfRuin.toFixed(1)}%
                              </span>
                           </div>
                           <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary" style={{ width: `${simulation?.probabilityOfRuin}%` }} />
                           </div>
                           <p className="text-[10px] text-muted-foreground leading-relaxed">
                             Este modelo utiliza <b>Empirical Replay</b>, analizando rachas históricas reales para proyectar el riesgo.
                             Un ROI positivo con baja probabilidad de ruina indica una estrategia sostenible.
                           </p>
                        </div>
                     </CardContent>
                  </Card>

                  <Card className="rounded-[40px] border-border/50 bg-card overflow-hidden">
                     <CardHeader>
                       <CardTitle className="text-sm font-black uppercase tracking-widest">Escenarios de Riesgo</CardTitle>
                     </CardHeader>
                     <CardContent className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={simulation?.equityCurve.slice(0, 10).map((v, i) => ({ scenario: i, val: v })) || []}>
                             <XAxis dataKey="scenario" hide />
                             <YAxis hide />
                             <Bar dataKey="val" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                               {simulation?.equityCurve.slice(0, 10).map((v, i) => (
                                 <Cell key={i} fill={v < 1000 ? '#ef4444' : '#10b981'} />
                               ))}
                             </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                     </CardContent>
                  </Card>
               </div>
            </TabsContent>

            <TabsContent value="visuals" className="mt-6">
               {analysis && <Pick3Visuals analysis={analysis} history={history} />}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
