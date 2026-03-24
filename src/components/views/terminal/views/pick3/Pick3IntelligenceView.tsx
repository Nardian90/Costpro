"use client";

import { DataIntegrityService, IntegrityError } from "@/services/pick3/DataIntegrityService";
import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  History, Sparkles, Activity, Info, BarChart3, Shield, RefreshCw, Zap,
  TrendingDown, Coins, Plus, Save, Download
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
import { StrategyConfig, SimulationResult, Pick3Result } from '@/types/pick3';
import { useAuthStore } from '@/store';
import { cn } from '@/lib/utils';
import { toast } from "sonner";
import { Pick3Visuals } from './Pick3Visuals';
import { Pick3StrategySection } from './Pick3StrategySection';
import { Pick3FeedbackService } from '@/services/pick3/FeedbackService';
import { Input } from '@/components/ui/input';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [simulations, setSimulations] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [integrityErrors, setIntegrityErrors] = useState<IntegrityError[]>([]);
  const [isMonteCarloRunning, setIsMonteCarloRunning] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState({ inversion: '', ganancia: '' });
  const [lookbackDays, setLookbackDays] = useState(30);

  const [config, setConfig] = useState<StrategyConfig>({
    budget: 300,
    horizonDays: 30,
    riskLevel: 'medium',
    costPerBet: 1.0
  });

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const remoteHistory = await Pick3Storage.getHistory();
      if (remoteHistory.length > 0) {
        setHistory(remoteHistory);
      } else {
        await Pick3Storage.saveHistory(MIAMI_PICK3_HISTORICAL);
        setHistory(MIAMI_PICK3_HISTORICAL);
      }

      if (user) {
        const sims = await Pick3Storage.getSimulations(user.id);
        setSimulations(sims);
      }

      const audit = await DataIntegrityService.performFullAudit();
      setIntegrityErrors(audit.errors);
    } catch (err) {
      console.error('[Pick3View] Error loading data:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [user]);

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const response = await fetch('/api/pick3/sync', { method: 'POST' });
      const data = await response.json();

      if (data.success) {
        toast.success(`Sincronización exitosa: ${data.count} registros actualizados`);
        await loadData(true);
      } else {
        toast.error(data.message || "Error al sincronizar datos");
      }
    } catch (err) {
      toast.error("Error de red al sincronizar");
    } finally {
      setIsSyncing(false);
    }
  };

  const engine = useMemo(() => new Pick3Engine(history), [history]);
  const analysis = useMemo(() => engine.analyzeAdvanced(lookbackDays), [engine, lookbackDays]);
  const plays = useMemo(() => engine.generatePlays(analysis, 5), [engine, analysis]);

  const runSimulation = async () => {
    setIsMonteCarloRunning(true);
    try {
      const result = engine.simulateMonteCarlo(config, analysis);

      if (user) {
        await Pick3Storage.saveSimulation(user.id, result);
        setSimulations(prev => [result, ...prev]);
      }

      toast.success("Simulación Monte Carlo completada");
      setActiveTab("simulator");
    } catch (err) {
      toast.error("Error al ejecutar simulación");
    } finally {
      setIsMonteCarloRunning(false);
    }
  };

  const saveFeedback = async () => {
    if (!user) return;
    const inv = parseFloat(feedbackInput.inversion);
    const gan = parseFloat(feedbackInput.ganancia);
    if (isNaN(inv) || isNaN(gan)) return;

    try {
      await Pick3FeedbackService.saveFeedback({ user_id: user.id, fecha: new Date().toISOString().split("T")[0], inversion: inv, ganancia: gan, estrategia_id: "MANUAL" });
      toast.success("Rendimiento guardado correctamente");
      setFeedbackInput({ inversion: '', ganancia: '' });
    } catch (e) {
      toast.error("Error al guardar registro");
    }
  };

  if (loading) {
     return (
       <div className="h-full flex flex-col items-center justify-center space-y-4 font-black italic text-primary uppercase tracking-widest animate-pulse">
         <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin" />
         </div>
         <span>Iniciando Terminal...</span>
       </div>
     );
  }

  return (
    <div className="flex flex-col h-full bg-background text-foreground selection:bg-primary selection:text-primary-foreground animate-in fade-in duration-500 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 md:p-6 border-b border-border/50 backdrop-blur-md bg-background/50 sticky top-0 z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <BrainCircuit className="w-5 h-5 text-primary" />
             </div>
             <h1 className="text-xl md:text-2xl font-black tracking-tighter italic uppercase flex items-center gap-2">
                Florida Pick 3 <span className="hidden sm:inline text-[10px] font-bold not-italic bg-primary text-primary-foreground px-2 py-0.5 rounded-full tracking-widest uppercase">Oficial</span>
             </h1>
          </div>
          <p className="text-[9px] md:text-[10px] text-muted-foreground font-bold uppercase tracking-[0.2em] flex items-center gap-2 pl-1">
             <Activity className="w-3 h-3 text-emerald-500" />
             Market: Miami Market | Sincronizado
          </p>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
           <Button
             variant="outline"
             size="sm"
             onClick={handleSync}
             disabled={isSyncing}
             className="h-9 md:h-10 px-3 md:px-6 rounded-xl font-black uppercase tracking-widest italic border-border/50 hover:bg-muted/50 transition-all active:scale-95"
           >
             {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2 text-primary" />}
             <span className="hidden sm:inline">Actualizar</span>
           </Button>
           <Button
             size="sm"
             onClick={runSimulation}
             disabled={isMonteCarloRunning}
             className="h-9 md:h-10 px-3 md:px-6 rounded-xl font-black uppercase tracking-widest italic bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
           >
             {isMonteCarloRunning ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : "Simular"}
           </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 md:p-6 pb-20 max-w-[1600px] mx-auto space-y-6 md:space-y-8">
          <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 md:mb-8">
              {/* Mobile Hardening for Tabs: Scrollable horizontal list */}
              <TabsList className="bg-muted/30 p-1 border border-border/50 rounded-2xl h-12 flex flex-row flex-nowrap overflow-x-auto no-scrollbar scroll-smooth w-full md:w-auto justify-start">
                <TabsTrigger value="overview" className="rounded-xl px-4 md:px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">VISTA GENERAL</TabsTrigger>
                <TabsTrigger value="strategy" className="rounded-xl px-4 md:px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">ESTRATEGIA</TabsTrigger>
                <TabsTrigger value="simulator" className="rounded-xl px-4 md:px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">SIMULADOR</TabsTrigger>
                <TabsTrigger value="history" className="rounded-xl px-4 md:px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">HISTORIAL</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                <Badge variant="outline" className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-black uppercase tracking-widest text-[9px] italic flex gap-2 shrink-0 whitespace-nowrap">
                   <Activity className="w-3 h-3 text-primary" />
                   Entropy: {(analysis.entropy || 0).toFixed(4)} bits
                </Badge>
                <div className="flex bg-muted/20 p-1 border border-border/50 rounded-xl h-10 shrink-0">
                  {[7, 30, 90].map((d: number) => (
                    <button
                      key={d}
                      onClick={() => setLookbackDays(d)}
                      className={cn(
                        "px-3 rounded-lg text-[9px] font-black uppercase transition-all",
                        lookbackDays === d ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {d}D
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6 md:space-y-8 mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Pick3Visuals analysis={analysis} history={history} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
                  <Card className="bg-card border-border/50 shadow-xl overflow-hidden rounded-[32px]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="space-y-1">
                        <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                           <Sparkles className="w-5 h-5 text-blue-500" />
                           Números Calientes
                        </CardTitle>
                        <CardDescription>Dígitos con mayor frecuencia de aparición</CardDescription>
                      </div>
                      <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20 font-black tracking-widest text-[10px]">HEAT MAP</Badge>
                    </CardHeader>
                    <CardContent className="flex gap-4 pt-6">
                       {analysis.hotNumbers.map((n: number) => (
                         <div key={n} className="flex-1 group">
                            <div className="aspect-square rounded-2xl bg-blue-500/5 border border-blue-500/10 flex flex-col items-center justify-center hover:bg-blue-500/10 transition-all active:scale-95 cursor-pointer">
                                <span className="text-3xl font-black italic text-blue-600 group-hover:scale-110 transition-transform">{n}</span>
                                <span className="text-[9px] font-bold text-blue-500/60 mt-1 uppercase tracking-tighter">Freq: {analysis.global[n]}</span>
                            </div>
                         </div>
                       ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-card border-border/50 shadow-xl overflow-hidden rounded-[32px]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="space-y-1">
                        <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                           <Target className="w-5 h-5 text-orange-500" />
                           Números Fríos
                        </CardTitle>
                        <CardDescription>Dígitos con mayor tiempo sin aparecer</CardDescription>
                      </div>
                      <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 font-black tracking-widest text-[10px]">REVERSION</Badge>
                    </CardHeader>
                    <CardContent className="flex gap-4 pt-6">
                       {analysis.coldNumbers.map((n: number) => (
                         <div key={n} className="flex-1 group">
                            <div className="aspect-square rounded-2xl bg-orange-500/5 border border-orange-500/10 flex flex-col items-center justify-center hover:bg-orange-500/10 transition-all active:scale-95 cursor-pointer">
                                <span className="text-3xl font-black italic text-orange-600 group-hover:scale-110 transition-transform">{n}</span>
                                <span className="text-[9px] font-bold text-orange-500/60 mt-1 uppercase tracking-tighter">Gaps: {analysis.gaps[n]}</span>
                            </div>
                         </div>
                       ))}
                    </CardContent>
                  </Card>
              </div>

              <div className="grid grid-cols-1 gap-6 md:gap-8">
                <Card className="bg-card border-border/50 shadow-xl rounded-[32px]">
                  <CardHeader>
                    <CardTitle className="text-xl font-black italic uppercase tracking-tighter flex items-center gap-2">
                      <Coins className="w-5 h-5 text-primary" />
                      Registro de Rendimiento Real
                    </CardTitle>
                    <CardDescription>Registre sus inversiones y ganancias para validación histórica</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="space-y-2 flex-1 min-w-[200px]">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Inversión ($)</label>
                        <Input
                          placeholder="0.00"
                          value={feedbackInput.inversion}
                          onChange={(e) => setFeedbackInput(prev => ({ ...prev, inversion: e.target.value }))}
                          className="h-12 rounded-xl bg-muted/20 border-border/50 font-black italic text-lg"
                        />
                      </div>
                      <div className="space-y-2 flex-1 min-w-[200px]">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Ganancia Real ($)</label>
                        <Input
                          placeholder="0.00"
                          value={feedbackInput.ganancia}
                          onChange={(e) => setFeedbackInput(prev => ({ ...prev, ganancia: e.target.value }))}
                          className="h-12 rounded-xl bg-muted/20 border-border/50 font-black italic text-lg text-emerald-600"
                        />
                      </div>
                      <Button
                        onClick={saveFeedback}
                        className="h-12 px-8 rounded-xl font-black uppercase tracking-widest italic flex gap-2 active:scale-95 transition-all bg-primary text-primary-foreground"
                      >
                        <Save className="w-4 h-4" />
                        Guardar Registro
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="strategy" className="mt-0 outline-none">
              <Pick3StrategySection analysis={analysis} plays={plays} />
            </TabsContent>

            <TabsContent value="simulator" className="mt-0 outline-none">
              {simulations.length === 0 ? (
                <div className="h-[500px] flex flex-col items-center justify-center text-center space-y-6 border border-dashed border-border/50 rounded-[40px] bg-muted/5">
                    <div className="p-8 rounded-full bg-primary/5 border border-primary/10">
                      <DollarSign className="w-16 h-16 text-primary/40" />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-2xl font-black uppercase italic tracking-tighter">Sin Datos de Simulación</h3>
                      <p className="text-sm text-muted-foreground max-w-sm font-medium leading-relaxed">
                        Ejecute el simulador Monte Carlo para visualizar proyecciones de capital basadas en resultados oficiales.
                      </p>
                      <Button onClick={runSimulation} className="mt-6 font-black uppercase tracking-widest italic h-12 px-8 rounded-2xl">Lanzar Simulación</Button>
                    </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-700">
                    <Card className="lg:col-span-2 bg-card border-border/50 shadow-2xl overflow-hidden rounded-[32px]">
                      <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-emerald-500" />
                      <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-2xl font-black italic tracking-tight uppercase">Curva de Capital (Monte Carlo)</CardTitle>
                            <CardDescription>Simulación de 10,000+ escenarios</CardDescription>
                          </div>
                          <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/20 font-black tracking-widest text-[9px] px-3 py-1 uppercase">LIVE SIM</Badge>
                      </CardHeader>
                      <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={simulations[0].equityCurve.map((val: number, i: number) => ({ day: i, capital: val }))}>
                                <defs>
                                  <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis dataKey="day" stroke="#999" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis stroke="#999" fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: 'white', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px' }}
                                />
                                <Area type="monotone" dataKey="capital" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCap)" strokeWidth={4} />
                            </AreaChart>
                          </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      <Card className="bg-card border-border/50 shadow-2xl rounded-[32px]">
                          <CardHeader className="pb-4">
                            <CardTitle className="text-xs font-black uppercase tracking-[0.2em] italic flex items-center gap-2">
                               <Shield className="w-3.5 h-3.5 text-primary" />
                               KPIs de Rendimiento Proyectado
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6 pb-8">
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Capital Promedio</span>
                                <span className="text-2xl font-black italic text-primary group-hover:scale-110 transition-transform">${simulations[0].finalCapital.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">ROI Estimado</span>
                                <span className={cn(
                                  "text-2xl font-black italic group-hover:scale-110 transition-transform",
                                  simulations[0].roi >= 0 ? 'text-emerald-600' : 'text-destructive'
                                )}>
                                  {simulations[0].roi >= 0 ? '+' : ''}{simulations[0].roi.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Caída Máxima</span>
                                <span className="text-2xl font-black italic text-orange-600 group-hover:scale-110 transition-transform">{simulations[0].maxDrawdown.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Prob. de Ruina</span>
                                <span className="text-2xl font-black italic text-blue-600 group-hover:scale-110 transition-transform">{simulations[0].probabilityOfRuin.toFixed(1)}%</span>
                            </div>
                            <Button
                              onClick={runSimulation}
                              disabled={isMonteCarloRunning}
                              className="w-full mt-6 font-black uppercase tracking-widest italic h-12 rounded-2xl active:scale-95 transition-all shadow-lg bg-primary text-primary-foreground"
                            >
                               {isMonteCarloRunning ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : "Nueva Simulación MC"}
                            </Button>
                          </CardContent>
                      </Card>
                    </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-0 outline-none">
              <Card className="bg-card border-border/50 shadow-2xl overflow-hidden rounded-[32px]">
                  <CardHeader className="bg-muted/5 border-b border-border/50 py-6 md:py-8 px-6 md:px-8">
                    <CardTitle className="text-2xl font-black italic tracking-tighter uppercase">Registro Oficial</CardTitle>
                    <CardDescription className="font-medium tracking-wide">Resultados auditados de la Lotería de Florida</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[600px]">
                        <div className="divide-y divide-border/30">
                          {history.map((draw, i) => (
                            <div key={i} className="flex items-center justify-between p-4 md:p-6 hover:bg-primary/[0.02] transition-all group">
                                <div className="flex items-center gap-4 md:gap-8">
                                  <div className="text-[10px] md:text-xs font-black uppercase tracking-[0.2em] text-muted-foreground w-20 md:w-28 italic">
                                      {draw.date}
                                  </div>
                                  <Badge variant="outline" className="text-[8px] md:text-[9px] uppercase font-black tracking-widest w-16 md:w-24 justify-center h-6 md:h-7 rounded-full border-border/50 bg-muted/10 group-hover:border-primary/30 group-hover:text-primary transition-colors">
                                      {draw.draw_time === 'midday' ? 'Mediodía' : 'Noche'}
                                    </Badge>
                                </div>
                                <div className="flex gap-2 md:gap-3">
                                  {draw.result?.map((n, idx) => (
                                    <div key={idx} className="w-9 h-9 md:w-11 md:h-11 rounded-lg md:rounded-[14px] bg-primary/5 border border-primary/10 flex items-center justify-center text-lg md:text-xl font-black italic text-primary group-hover:scale-110 group-hover:bg-primary/10 transition-all shadow-sm">
                                        {n}
                                    </div>
                                  ))}
                                </div>
                            </div>
                          ))}
                        </div>
                    </ScrollArea>
                  </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
