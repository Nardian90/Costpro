"use client";

import { DataIntegrityService, IntegrityError } from "@/services/pick3/DataIntegrityService";
import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  History, Sparkles, Activity, Info, BarChart3, Shield, RefreshCw, Zap,
  TrendingDown, Coins, Plus, Save
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

export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [simulations, setSimulations] = useState<SimulationResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [lookbackDays, setLookbackDays] = useState(30);
  const [integrityErrors, setIntegrityErrors] = useState<IntegrityError[]>([]);
  const [isMonteCarloRunning, setIsMonteCarloRunning] = useState(false);
  const [feedbackInput, setFeedbackInput] = useState({ inversion: '', ganancia: '' });

  const [config, setConfig] = useState<StrategyConfig>({
    budget: 300,
    horizonDays: 30,
    riskLevel: 'medium',
    costPerBet: 1.0
  });

  useEffect(() => {
    const loadData = async () => {
      const audit = await DataIntegrityService.performFullAudit();
      setIntegrityErrors(audit.errors);

      setLoading(true);
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
      } catch (err) {
        console.error('[Pick3View] Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const engine = useMemo(() => new Pick3Engine(history), [history]);
  const analysis = useMemo(() => engine.analyzeAdvanced(lookbackDays), [engine]);
  const plays = useMemo(() => engine.generatePlays(analysis, 5), [engine, analysis]);

  const runSimulation = async () => {
    setIsMonteCarloRunning(true);
    try {
      const result = engine.simulateMonteCarlo(config, analysis);

      if (user) {
        await Pick3Storage.saveSimulation(user.id, result);
        setSimulations(prev => [result, ...prev]);
      }

      toast.success("Simulación Monte Carlo completada (10,000+ escenarios)");
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

    if (isNaN(inv) || isNaN(gan)) {
      toast.error("Valores de inversión o ganancia no válidos");
      return;
    }

    const success = await Pick3FeedbackService.saveFeedback({
      user_id: user.id,
      fecha: new Date().toISOString().split('T')[0],
      inversion: inv,
      ganancia: gan,
      estrategia_id: 'default'
    });

    if (success) {
      toast.success("Retroalimentación guardada con éxito");
      setFeedbackInput({ inversion: '', ganancia: '' });
    } else {
      toast.error("Error al guardar retroalimentación");
    }
  };

  if (integrityErrors.length > 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black/95 text-white h-screen overflow-auto">
        <div className="max-w-md w-full p-8 border border-destructive/50 rounded-3xl bg-destructive/5 space-y-6 text-center animate-in zoom-in-95 duration-500">
          <div className="w-20 h-20 rounded-full bg-destructive/10 border border-destructive/20 flex items-center justify-center mx-auto animate-pulse">
            <span className="text-4xl">❌</span>
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter text-destructive">DATA INTEGRITY ERROR</h2>
            <p className="text-sm text-muted-foreground font-medium leading-relaxed italic">
              Se ha detectado una discrepancia crítica entre los resultados locales y la fuente oficial del Miami Pick 3.
            </p>
          </div>

          <div className="space-y-4 pt-4">
            {integrityErrors.map((err, i) => (
              <div key={i} className="p-4 rounded-2xl bg-black/40 border border-white/10 text-left space-y-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest opacity-50">
                  <span>{err.date} - {err.drawTime === "midday" ? "MEDIODÍA" : "NOCHE"}</span>
                  <span>Origen: {err.source}</span>
                </div>
                <div className="flex justify-between items-center">
                  <div className="space-y-1">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Oficial</div>
                    <div className="text-xl font-black text-emerald-400 tracking-tighter">{err.official?.join("-")}</div>
                  </div>
                  <div className="h-8 w-px bg-white/10" />
                  <div className="space-y-1 text-right">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Sistema</div>
                    <div className="text-xl font-black text-destructive tracking-tighter">{err.system?.join("-")}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <Button
            onClick={() => window.location.reload()}
            className="w-full h-12 rounded-2xl font-black uppercase tracking-widest italic bg-destructive hover:bg-destructive/90 transition-all active:scale-95 shadow-lg shadow-destructive/20"
          >
            Reintentar Sincronización
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
     return (
       <div className="h-full flex flex-col items-center justify-center space-y-4 font-black italic text-primary uppercase tracking-widest animate-pulse">
         <div className="w-16 h-16 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <RefreshCw className="w-8 h-8 animate-spin" />
         </div>
         <span>Iniciando Terminal Cuántica...</span>
       </div>
     );
  }

  return (
    <div className="flex flex-col h-full bg-background/95 text-foreground selection:bg-primary selection:text-primary-foreground animate-in fade-in duration-500 overflow-hidden">
      <div className="flex items-center justify-between p-6 border-b border-border/50 backdrop-blur-md bg-background/50 sticky top-0 z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <BrainCircuit className="w-5 h-5 text-primary" />
             </div>
             <h1 className="text-2xl font-black tracking-tighter italic uppercase flex items-center gap-2">
                Pick 3 Intelligence <span className="text-[10px] font-bold not-italic bg-primary text-primary-foreground px-2 py-0.5 rounded-full tracking-widest">v5.5 PRO</span>
             </h1>
          </div>
          <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-[0.3em] flex items-center gap-2 pl-1">
             <Activity className="w-3 h-3 text-emerald-400" />
             Market: Miami Lottery / Probabilistic Analysis Active
          </p>
        </div>

        <div className="flex items-center gap-4">
           <div className="hidden md:flex flex-col items-end border-r border-border/50 pr-4">
              <span className="text-[9px] font-black uppercase text-muted-foreground tracking-widest">Estado del Mercado</span>
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Sincronizado
              </span>
           </div>
           <Button
             onClick={runSimulation}
             disabled={isMonteCarloRunning}
             className="h-10 px-6 rounded-xl font-black uppercase tracking-widest italic bg-primary hover:bg-primary/90 transition-all active:scale-95 shadow-lg shadow-primary/20"
           >
             {isMonteCarloRunning ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Simular"}
           </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-6 pb-20 max-w-[1600px] mx-auto space-y-8">
          <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
              <TabsList className="bg-muted/10 p-1 border border-border/50 rounded-2xl h-12 self-start md:self-auto no-scrollbar overflow-x-auto flex-nowrap shrink-0">
                <TabsTrigger value="overview" className="rounded-xl px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">VISTA GENERAL</TabsTrigger>
                <TabsTrigger value="strategy" className="rounded-xl px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">ESTRATEGIA</TabsTrigger>
                <TabsTrigger value="simulator" className="rounded-xl px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">SIMULADOR</TabsTrigger>
                <TabsTrigger value="history" className="rounded-xl px-6 font-black uppercase italic text-[10px] tracking-widest transition-all data-[state=active]:bg-background data-[state=active]:shadow-lg shrink-0 whitespace-nowrap">HISTORIAL</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-black uppercase tracking-widest text-[9px] italic flex gap-2 shrink-0 whitespace-nowrap">
                   <Activity className="w-3 h-3 text-primary" />
                   Entropy: {(analysis.entropy || 0).toFixed(4)} bits
                </Badge>
                <Badge variant="outline" className="h-10 px-4 rounded-xl border-border/50 bg-background/50 font-black uppercase tracking-widest text-[9px] italic flex gap-2 shrink-0 whitespace-nowrap">
                   <History className="w-3 h-3 text-orange-400" />
                <div className="flex bg-muted/10 p-1 border border-border/50 rounded-xl h-10 shrink-0">
                  {[7, 30, 90].map(d => (
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
                </Badge>
              </div>
            </div>

            <TabsContent value="overview" className="space-y-8 mt-0 outline-none animate-in fade-in slide-in-from-bottom-4 duration-700">
              <Pick3Visuals analysis={analysis} history={history} />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden rounded-[32px]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="space-y-1">
                        <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                           <Sparkles className="w-5 h-5 text-blue-400" />
                           Números Calientes
                        </CardTitle>
                        <CardDescription>Dígitos con mayor probabilidad de aparición</CardDescription>
                      </div>
                      <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-black tracking-widest text-[10px]">HEAT MAP</Badge>
                    </CardHeader>
                    <CardContent className="flex gap-4 pt-6">
                       {analysis.hotNumbers.map(n => (
                         <div key={n} className="flex-1 group">
                            <div className="aspect-square rounded-2xl bg-blue-500/10 border border-blue-500/20 flex flex-col items-center justify-center group-hover:bg-blue-500/20 transition-all active:scale-95 cursor-pointer">
                                <span className="text-3xl font-black italic text-blue-400 group-hover:scale-110 transition-transform">{n}</span>
                                <span className="text-[9px] font-bold text-blue-400/60 mt-1 uppercase tracking-tighter">Freq: {analysis.global[n]}</span>
                            </div>
                         </div>
                       ))}
                    </CardContent>
                  </Card>

                  <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden rounded-[32px]">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                      <div className="space-y-1">
                        <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                           <Target className="w-5 h-5 text-orange-400" />
                           Números Fríos
                        </CardTitle>
                        <CardDescription>Dígitos con mayor tiempo en latencia</CardDescription>
                      </div>
                      <Badge className="bg-orange-500/10 text-orange-400 border-orange-500/20 font-black tracking-widest text-[10px]">REVERSION</Badge>
                    </CardHeader>
                    <CardContent className="flex gap-4 pt-6">
                       {analysis.coldNumbers.map(n => (
                         <div key={n} className="flex-1 group">
                            <div className="aspect-square rounded-2xl bg-orange-500/10 border border-orange-500/20 flex flex-col items-center justify-center group-hover:bg-orange-500/20 transition-all active:scale-95 cursor-pointer">
                                <span className="text-3xl font-black italic text-orange-400 group-hover:scale-110 transition-transform">{n}</span>
                                <span className="text-[9px] font-bold text-orange-400/60 mt-1 uppercase tracking-tighter">Gaps: {analysis.gaps[n]}</span>
                            </div>
                         </div>
                       ))}
                    </CardContent>
                  </Card>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-1 gap-8">
                <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl rounded-[32px]">
                  <CardHeader>
                    <CardTitle className="text-xl font-black italic uppercase tracking-tighter flex items-center gap-2">
                      <Coins className="w-5 h-5 text-primary" />
                      Registro de Rendimiento Real
                    </CardTitle>
                    <CardDescription>Sincronice sus inversiones y ganancias reales para ajustar el modelo</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="space-y-2 flex-1 min-w-[200px]">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Inversión ($)</label>
                        <Input
                          placeholder="0.00"
                          value={feedbackInput.inversion}
                          onChange={(e) => setFeedbackInput(prev => ({ ...prev, inversion: e.target.value }))}
                          className="h-12 rounded-xl bg-muted/10 border-border/50 font-black italic text-lg"
                        />
                      </div>
                      <div className="space-y-2 flex-1 min-w-[200px]">
                        <label className="text-[10px] font-black uppercase tracking-widest opacity-50 ml-1">Ganancia Real ($)</label>
                        <Input
                          placeholder="0.00"
                          value={feedbackInput.ganancia}
                          onChange={(e) => setFeedbackInput(prev => ({ ...prev, ganancia: e.target.value }))}
                          className="h-12 rounded-xl bg-muted/10 border-border/50 font-black italic text-lg text-emerald-400"
                        />
                      </div>
                      <Button
                        onClick={saveFeedback}
                        className="h-12 px-8 rounded-xl font-black uppercase tracking-widest italic flex gap-2 active:scale-95 transition-all"
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
                        Configure una estrategia cuántica y ejecute el simulador para visualizar proyecciones de capital operativo.
                      </p>
                      <Button onClick={runSimulation} className="mt-6 font-black uppercase tracking-widest italic h-12 px-8 rounded-2xl">Lanzar Simulación</Button>
                    </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in slide-in-from-bottom-4 duration-700">
                    <Card className="lg:col-span-2 bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden">
                      <div className="h-1.5 w-full bg-gradient-to-r from-blue-500 to-emerald-500" />
                      <CardHeader className="flex flex-row items-center justify-between">
                          <div>
                            <CardTitle className="text-2xl font-black italic tracking-tight uppercase">Curva de Capital (Monte Carlo)</CardTitle>
                            <CardDescription>Escenarios de capital basados en 10,000+ simulaciones</CardDescription>
                          </div>
                          <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/20 font-black tracking-widest text-[9px] px-3 py-1">LIVE SIM v5.5</Badge>
                      </CardHeader>
                      <CardContent className="h-[400px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={simulations[0].equityCurve.map((val, i) => ({ day: i, capital: val }))}>
                                <defs>
                                  <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="day" stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                                <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                                />
                                <Area type="monotone" dataKey="capital" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCap)" strokeWidth={4} />
                            </AreaChart>
                          </ResponsiveContainer>
                      </CardContent>
                    </Card>

                    <div className="space-y-6">
                      <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
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
                                  simulations[0].roi >= 0 ? 'text-emerald-400' : 'text-destructive'
                                )}>
                                  {simulations[0].roi >= 0 ? '+' : ''}{simulations[0].roi.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Caída Máxima</span>
                                <span className="text-2xl font-black italic text-orange-400 group-hover:scale-110 transition-transform">{simulations[0].maxDrawdown.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Prob. de Ruina</span>
                                <span className="text-2xl font-black italic text-blue-400 group-hover:scale-110 transition-transform">{simulations[0].probabilityOfRuin.toFixed(1)}%</span>
                            </div>
                            <Button
                              onClick={runSimulation}
                              disabled={isMonteCarloRunning}
                              className="w-full mt-6 font-black uppercase tracking-widest italic h-12 rounded-2xl active:scale-95 transition-all shadow-lg"
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
              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden rounded-[32px]">
                  <CardHeader className="bg-muted/5 border-b border-border/50 py-8 px-8">
                    <CardTitle className="text-2xl font-black italic tracking-tighter uppercase">Registro Cuántico</CardTitle>
                    <CardDescription className="font-medium tracking-wide">Registro auditado de sorteos (Miami Market)</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="h-[600px]">
                        <div className="divide-y divide-border/30">
                          {history.map((draw, i) => (
                            <div key={i} className="flex items-center justify-between p-6 hover:bg-primary/[0.02] transition-all group">
                                <div className="flex items-center gap-8">
                                  <div className="text-xs font-black uppercase tracking-[0.2em] text-muted-foreground w-28 italic">
                                      {draw.date}
                                  </div>
                                  <Badge variant="outline" className="text-[9px] uppercase font-black tracking-widest w-24 justify-center h-7 rounded-full border-border/50 bg-muted/10 group-hover:border-primary/30 group-hover:text-primary transition-colors">
                                      {draw.draw_time === 'midday' ? 'Mediodía' : 'Noche'}
                                    </Badge>
                                </div>
                                <div className="flex gap-3">
                                  {draw.result?.map((n, idx) => (
                                    <div key={idx} className="w-11 h-11 rounded-[14px] bg-primary/5 border border-primary/10 flex items-center justify-center text-xl font-black italic text-primary group-hover:scale-110 group-hover:bg-primary/10 transition-all shadow-sm">
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
