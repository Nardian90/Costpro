"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, Activity, Shield, RefreshCw, Zap,
  Coins, AlertCircle, LineChart, Sparkles, History, Info,
  BrainCircuit, Calendar, Settings, HelpCircle, Save, Check, Target, ArrowUpRight
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Pick3Engine } from '@/services/pick3/Pick3Engine';
import { Pick3Storage } from '@/services/pick3/storage';
import { Pick3ScraperService } from '@/services/pick3/Pick3ScraperService';
import { SimulationResult, Pick3Result, BettingConfig, BacktestResult, Pick3SyncState, AdvancedAnalysis, IntelligencePlay } from '@/types/pick3';
import { UserPlayStorage } from '@/services/pick3/storage';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Pick3Visuals } from './Pick3Visuals';
import { Pick3HistorySection } from './Pick3HistorySection';
import { Pick3ControlPanel } from './Pick3ControlPanel';
import { useAuthStore } from '@/store';
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
  const [activeTab, setActiveTab] = useState('today');
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  const [bConfig, setBConfig] = useState<BettingConfig>(() => {
    const saved = Pick3Storage.getConfig();
    return (saved?.bettingConfig as BettingConfig) || {
      mode: 'LAST2',
      payout: 90,
      digits: 2,
      maxCombinations: 3,
      riskFactor: 1.0,
      stopLoss: -30,
      criticalDrawdown: -20
    };
  });

  const [plays, setPlays] = useState<any[]>([]);
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

      // Load saved plays
      const localPlays = localStorage.getItem('pick3_saved_plays');
      if (localPlays) setPlays(JSON.parse(localPlays));

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
      const advAnalysis = engine.analyzeAdvanced(60);
      setAnalysis(advAnalysis);
      const backtestRes = engine.runBacktest(bConfig, 1000, 30);
      setBacktest(backtestRes);
      const valRes = engine.runValidation(bConfig, 1000, 30);
      setValidation(valRes);
    } catch (error) {
      console.error("Analysis failed", error);
    }
  };

  const runMonteCarlo = () => {
    if (!backtest) return;
    const simRes = engine.simulateMonteCarlo({ budget: 1000, horizonDays: 30, riskLevel: 'medium', costPerBet: 1, bettingConfig: bConfig }, backtest);
    setSimulation(simRes);
    toast.success("Simulación Monte Carlo completada");
  };

  const savePlay = (play: IntelligencePlay, amount: number) => {
    const newPlay = {
      ...play,
      amount,
      timestamp: Date.now(),
      status: 'pending'
    };
    UserPlayStorage.savePlay(user?.id, newPlay, isAdmin);
    const updated = [newPlay, ...plays].slice(0, 50);
    setPlays(updated);
    localStorage.setItem('pick3_saved_plays', JSON.stringify(updated));
    toast.success("Jugada guardada para seguimiento");
  };

  const currentRecommendation = useMemo(() => {
    if (!analysis) return [];
    return engine.generatePlays(analysis, bConfig, bConfig.maxCombinations);
  }, [analysis, bConfig, engine]);

  const bankrollStatus = useMemo(() => {
    if (!validation) return null;
    return engine.getCapitalRecommendation(validation.roi, validation.maxDrawdown, bConfig);
  }, [validation, bConfig, engine]);

  const HelpButton = ({ title, content }: { title: string, content: string }) => (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full opacity-50 hover:opacity-100">
          <HelpCircle className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4 rounded-2xl border-primary/20 shadow-2xl">
        <h4 className="text-xs font-black uppercase mb-2 flex items-center gap-2">
           <Info className="w-3 h-3 text-primary" /> {title}
        </h4>
        <p className="text-[11px] leading-relaxed opacity-80">{content}</p>
      </PopoverContent>
    </Popover>
  );

  return (
    <div className="space-y-6 pb-20 md:pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 px-1">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter flex items-center gap-2">
            PICK 3 <span className="text-primary not-italic tracking-normal">FLORIDA</span>
            <Badge variant="outline" className="text-[10px] font-black bg-primary/10">ADVANCED v8.0</Badge>
          </h2>
          <p className="text-[10px] font-bold uppercase opacity-50 tracking-widest">
            Sincronización Cuántica & Gestión de Riesgo Internacional
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncState.isSyncing}
            className="rounded-full h-10 px-4 text-[10px] font-black uppercase gap-2 flex-1 md:flex-none"
          >
            {syncState.isSyncing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Sync
          </Button>
          <Button
             onClick={() => { setActiveTab('config'); }}
             variant="ghost" size="icon" className="h-10 w-10 rounded-full border border-border/50">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full bg-muted/30 p-1 rounded-full grid grid-cols-5 h-12 sticky top-0 z-50 backdrop-blur-md">
          <TabsTrigger value="today" className="rounded-full text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Hoy</TabsTrigger>
          <TabsTrigger value="proyect" className="rounded-full text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Proy.</TabsTrigger>
          <TabsTrigger value="intel" className="rounded-full text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Intel.</TabsTrigger>
          <TabsTrigger value="history" className="rounded-full text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Hist.</TabsTrigger>
          <TabsTrigger value="help" className="rounded-full text-[10px] font-black uppercase data-[state=active]:bg-primary data-[state=active]:text-white transition-all">Ayuda</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-6 pt-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
           {/* Summary Stats Mobile First */}
           <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="rounded-[24px] border-border bg-card/50 p-4">
                 <p className="text-[9px] font-black uppercase opacity-40 mb-1">Status Sistema</p>
                 <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full animate-pulse", bankrollStatus?.color.replace('text-', 'bg-'))}></div>
                    <span className={cn("text-xs font-black italic", bankrollStatus?.color)}>{bankrollStatus?.status}</span>
                 </div>
              </Card>
              <Card className="rounded-[24px] border-border bg-card/50 p-4">
                 <p className="text-[9px] font-black uppercase opacity-40 mb-1">ROI (30d)</p>
                 <span className="text-sm font-black italic text-emerald-500">+{validation?.roi.toFixed(1)}%</span>
              </Card>
              <Card className="rounded-[24px] border-border bg-card/50 p-4">
                 <p className="text-[9px] font-black uppercase opacity-40 mb-1">Max DD</p>
                 <span className="text-sm font-black italic text-red-500">{validation?.maxDrawdown.toFixed(1)}%</span>
              </Card>
              <Card className="rounded-[24px] border-border bg-card/50 p-4">
                 <p className="text-[9px] font-black uppercase opacity-40 mb-1">Prob. Éxito</p>
                 <span className="text-sm font-black italic">{validation?.hitRate.toFixed(1)}%</span>
              </Card>
           </div>

           {plays.length > 0 && (
              <Card className="rounded-[32px] border-border bg-card/50 overflow-hidden">
                 <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                       <Target className="w-4 h-4 text-primary" /> Mis Jugadas Recientes
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-2">
                    {plays.slice(0, 3).map((play, i) => (
                       <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-muted/30 border border-border/50">
                          <div className="flex gap-1">
                             {play.combination.map((n: number, j: number) => (
                                <span key={j} className="text-xs font-black">{n}</span>
                             ))}
                          </div>
                          <div className="flex items-center gap-2">
                             <Badge variant="outline" className="text-[8px] font-black uppercase">{play.status}</Badge>
                             <span className="text-[10px] font-black">${play.amount}</span>
                          </div>
                       </div>
                    ))}
                 </CardContent>
              </Card>
           )}
           {/* Recommendations Card */}
           <Card className="rounded-[32px] border-primary/20 bg-primary/[0.02] overflow-hidden">
              <CardHeader className="pb-2">
                 <div className="flex justify-between items-center">
                    <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                       <Sparkles className="w-4 h-4 text-primary" /> Recomendación del Día
                    </CardTitle>
                    <HelpButton
                      title="Recomendaciones Diarias"
                      content="Basado en una combinación de modelos de frecuencia, Rundown 123 y Lottodds. Se sugiere jugar estas líneas con el tamaño indicado por la gestión de banca."
                    />
                 </div>
                 <CardDescription className="text-[10px] font-bold uppercase opacity-60">
                    Basado en la última tirada: {history[0]?.result.join('')} ({history[0]?.draw_time})
                 </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                 <div className="grid gap-3">
                    {currentRecommendation.map((play, idx) => (
                       <div key={idx} className="flex items-center justify-between p-4 rounded-2xl bg-card border border-border/50 group hover:border-primary/50 transition-all">
                          <div className="flex items-center gap-4">
                             <div className="flex gap-1">
                                {play.combination.map((num, i) => (
                                   <div key={i} className="w-8 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-black italic text-primary">
                                      {num}
                                   </div>
                                ))}
                             </div>
                             <div className="hidden md:block">
                                <p className="text-[10px] font-black uppercase opacity-40">Confianza</p>
                                <div className="flex items-center gap-1">
                                   <div className="h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                                      <div className="h-full bg-primary" style={{ width: `${play.confidence}%` }}></div>
                                   </div>
                                   <span className="text-[9px] font-black">{play.confidence}%</span>
                                </div>
                             </div>
                          </div>
                          <div className="flex items-center gap-3">
                             <div className="text-right">
                                <p className="text-[10px] font-black uppercase opacity-40">Apuesta Sugerida</p>
                                <p className="text-sm font-black italic text-primary">${engine.calculateBetSize(1000, bConfig, play.confidence)}</p>
                             </div>
                             <Button size="icon" variant="ghost" className="rounded-full hover:bg-primary/10" onClick={() => savePlay(play, engine.calculateBetSize(1000, bConfig, play.confidence))}>
                                <Save className="w-4 h-4 text-primary" />
                             </Button>
                          </div>
                       </div>
                    ))}
                 </div>

                 <div className="p-4 rounded-2xl bg-muted/30 border border-dashed border-border flex items-start gap-3">
                    <Target className="w-5 h-5 text-primary mt-0.5" />
                    <div className="space-y-1">
                       <p className="text-xs font-black uppercase">Instrucción Táctica</p>
                       <p className="text-[11px] font-bold opacity-60 leading-relaxed italic">{bankrollStatus?.action}</p>
                    </div>
                 </div>

                 <Button
                    onClick={() => { setActiveTab('proyect'); runMonteCarlo(); }}
                    className="w-full h-12 rounded-full font-black uppercase gap-2 bg-primary hover:bg-primary/90 transition-all shadow-lg shadow-primary/20"
                 >
                    <Zap className="w-4 h-4 fill-white" /> Ejecutar Simulación Completa
                 </Button>
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="proyect" className="space-y-6 pt-4">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="rounded-[32px] overflow-hidden">
                 <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                       <LineChart className="w-4 h-4" /> Curva de Equidad Proyectada
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                       <AreaChart data={validation?.equityCurve.map((v, i) => ({ d: i, c: v })) || []}>
                          <defs>
                             <linearGradient id="colorP" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                             </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                          <XAxis dataKey="d" hide />
                          <YAxis fontSize={10} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)' }} />
                          <Area type="monotone" dataKey="c" stroke="#10b981" fill="url(#colorP)" strokeWidth={4} />
                       </AreaChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>

              <Card className="rounded-[32px] p-6 flex flex-col justify-center gap-4 bg-primary/5 border-primary/10">
                 <h3 className="text-sm font-black uppercase tracking-widest text-muted-foreground">Riesgo Proyectado</h3>
                 <div className="flex items-end gap-2">
                    <span className="text-5xl font-black italic text-primary">{simulation?.probabilityOfRuin.toFixed(1) || 0}%</span>
                    <span className="text-xs font-bold uppercase pb-2 opacity-60">Prob. Ruina</span>
                 </div>
                 <p className="text-xs text-muted-foreground leading-relaxed">
                    Basado en 10,000 iteraciones usando <b>Bootstrapping Empírico</b>. Un riesgo menor al 15% se considera seguro para operación continua.
                 </p>
              </Card>
           </div>

           <Card className="rounded-[32px] border-border bg-card overflow-hidden">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <History className="w-4 h-4" /> Histórico de Validación (30 Días)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b">
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40">Fecha</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40">Proyección</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40 text-center">Real</th>
                      <th className="pb-3 text-[10px] font-black uppercase opacity-40 text-right">PnL</th>
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
                          <div className="flex gap-1">
                            {day.bets.map((b, idx) => (
                              <Badge key={idx} variant="outline" className="text-[9px] font-black bg-muted/30">
                                {b.combination.join('')}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-4 text-center">
                          <div className="inline-flex gap-0.5">
                            {day.result.map((n, idx) => (
                              <span key={idx} className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black",
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="intel" className="space-y-6 pt-4">
           <Pick3Visuals history={history} />
        </TabsContent>

        <TabsContent value="history" className="pt-4">
           <Pick3HistorySection history={history} />
           <Pick3ControlPanel syncState={syncState} onSync={handleSync} />
        </TabsContent>

        <TabsContent value="config" className="space-y-6 pt-4">
           <Card className="rounded-[32px] p-6">
              <CardHeader className="px-0">
                 <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                    <Settings className="w-4 h-4" /> Configuración Estratégica
                 </CardTitle>
              </CardHeader>
              <CardContent className="px-0 space-y-6">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase">Modo de Juego</Label>
                       <select
                          className="w-full h-10 rounded-xl border-border bg-background px-3 text-xs font-black uppercase"
                          value={bConfig.mode}
                          onChange={(e) => setBConfig({...bConfig, mode: e.target.value as any})}
                       >
                          <option value="PICK3">Pick 3 (3 Dígitos)</option>
                          <option value="LAST2">Terminal (Últimos 2)</option>
                       </select>
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase">Factor de Riesgo (%)</Label>
                       <Input
                          type="number" step="0.1"
                          value={bConfig.riskFactor}
                          onChange={(e) => setBConfig({...bConfig, riskFactor: parseFloat(e.target.value)})}
                          className="h-10 rounded-xl font-black"
                       />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase">Max Combinaciones</Label>
                       <Input
                          type="number"
                          value={bConfig.maxCombinations}
                          onChange={(e) => setBConfig({...bConfig, maxCombinations: parseInt(e.target.value)})}
                          className="h-10 rounded-xl font-black"
                       />
                    </div>
                    <div className="space-y-2">
                       <Label className="text-[10px] font-black uppercase">Stop Loss (%)</Label>
                       <Input
                          type="number"
                          value={bConfig.stopLoss}
                          onChange={(e) => setBConfig({...bConfig, stopLoss: parseFloat(e.target.value)})}
                          className="h-10 rounded-xl font-black"
                       />
                    </div>
                 </div>
                 <Button
                    className="w-full h-12 rounded-full font-black uppercase"
                    onClick={() => {
                       Pick3Storage.saveConfig({ budget: 1000, horizonDays: 30, riskLevel: 'medium', costPerBet: 1, bettingConfig: bConfig });
                       toast.success("Configuración guardada");
                       runAnalysis();
                    }}
                 >
                    Aplicar Cambios
                 </Button>
              </CardContent>
           </Card>
        </TabsContent>

        <TabsContent value="help" className="space-y-6 pt-4 animate-in fade-in duration-700">
           <Card className="rounded-[32px] overflow-hidden border-primary/20 bg-primary/5">
              <CardHeader>
                 <CardTitle className="text-xl font-black italic flex items-center gap-2">
                    <BrainCircuit className="w-6 h-6 text-primary" /> GUÍA DE INTELIGENCIA PICK 3
                 </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                 <section className="space-y-3">
                    <h3 className="text-xs font-black uppercase border-b border-primary/20 pb-1">1. Flujo de Trabajo Operativo</h3>
                    <div className="grid gap-2">
                       {[
                          "Sincronizar el histórico para obtener los últimos resultados reales.",
                          "Revisar la sección 'Hoy' para ver las líneas sugeridas por el modelo.",
                          "Ajustar el tamaño de la apuesta según la 'Instrucción Táctica'.",
                          "Ejecutar la 'Simulación Monte Carlo' para validar la salud del sistema.",
                          "Guardar tus jugadas para que el sistema aprenda de tu éxito real."
                       ].map((step, i) => (
                          <div key={i} className="flex gap-3 items-start p-3 rounded-2xl bg-card border border-border/50">
                             <span className="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                             <p className="text-[11px] font-bold opacity-80 leading-relaxed">{step}</p>
                          </div>
                       ))}
                    </div>
                 </section>

                 <section className="space-y-3">
                    <h3 className="text-xs font-black uppercase border-b border-primary/20 pb-1">2. Arquitectura de los Algoritmos</h3>
                    <div className="space-y-4">
                       <div className="p-4 rounded-2xl bg-card border border-border/50">
                          <p className="text-[10px] font-black text-primary uppercase mb-1">Detección de Sesgo (Bias)</p>
                          <p className="text-[11px] opacity-70 leading-relaxed">Analiza la desviación estándar de cada dígito por posición contra la probabilidad teórica (10%). Identifica números que están saliendo con una frecuencia estadísticamente significativa.</p>
                       </div>
                       <div className="p-4 rounded-2xl bg-card border border-border/50">
                          <p className="text-[10px] font-black text-primary uppercase mb-1">Cadenas de Markov</p>
                          <p className="text-[11px] opacity-70 leading-relaxed">Modelamos la probabilidad de transición entre un dígito y el siguiente. Si hoy salió 7, ¿qué probabilidad hay de que mañana salga 2 basándonos en los últimos 20 años de historia?</p>
                       </div>
                       <div className="p-4 rounded-2xl bg-card border border-border/50">
                          <p className="text-[10px] font-black text-primary uppercase mb-1">Kelly Criterion (Fraccional)</p>
                          <p className="text-[11px] opacity-70 leading-relaxed">Usamos la fórmula de Kelly para optimizar el crecimiento de la banca. Calculamos el tamaño exacto de la apuesta basado en la ventaja del modelo y la probabilidad de pérdida para evitar la ruina.</p>
                       </div>
                    </div>
                 </section>

                 <div className="p-6 rounded-3xl bg-primary text-white space-y-2">
                    <p className="text-sm font-black italic">¿Necesitas ayuda avanzada?</p>
                    <p className="text-[10px] font-bold opacity-80 uppercase leading-relaxed">Contacta con el soporte técnico de CostPro o consulta el manual PDF detallado en la sección de recursos.</p>
                 </div>
              </CardContent>
           </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
