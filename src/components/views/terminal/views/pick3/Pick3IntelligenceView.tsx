"use client";

import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  History, Sparkles, Activity, Info, BarChart3, Shield, RefreshCw
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
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, AreaChart, Area
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Pick3StrategySection } from './Pick3StrategySection';
import { Pick3Visuals } from './Pick3Visuals';

/**
 * Terminal Inteligente para Pick 3 - Versión 5.1 (Production Hardened)
 * Integra análisis cuántico, simulación financiera y visualización avanzada.
 */
export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [history, setHistory] = useState<Pick3Result[]>(MIAMI_PICK3_HISTORICAL);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [simulations, setSimulations] = useState<SimulationResult[]>([]);

  const engine = useMemo(() => new Pick3Engine(history), [history]);
  const analysis = useMemo(() => engine.analyzeAdvanced(30), [engine]);
  const plays = useMemo(() => engine.generatePlays(analysis), [analysis]);

  const syncLatest = async () => {
    setSyncing(true);
    try {
      const res = await Pick3ExternalService.syncLatestResults();
      if (res.newCount > 0) {
        const updatedHistory = await Pick3Storage.getHistory();
        setHistory(updatedHistory);
        toast.success(`Sincronizados ${res.newCount} nuevos resultados`);
      } else if (res.errors && res.errors.length > 0) {
        res.errors.forEach(err => toast.error(err));
      } else {
        toast.info("El mercado ya está actualizado");
      }
    } catch (err) {
      toast.error("Error al sincronizar datos");
    } finally {
      setSyncing(false);
    }
  };

  const [config] = useState<StrategyConfig>({
    budget: 100,
    horizonDays: 30,
    riskLevel: 'medium',
    costPerBet: 1.0
  });

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const remoteHistory = await Pick3Storage.getHistory();
        if (remoteHistory.length > 0) {
          setHistory(remoteHistory);
        } else {
          await Pick3Storage.saveHistory(MIAMI_PICK3_HISTORICAL);
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

  const runSimulation = async () => {
    if (!user) {
      toast.error("Inicie sesión para guardar simulaciones");
      return;
    }
    try {
      const result = engine.simulate(config);
      await Pick3Storage.saveSimulation(user.id, result);
      const updatedSims = await Pick3Storage.getSimulations(user.id);
      setSimulations(updatedSims);
      toast.success('Simulación completada y persistida');
      setActiveTab('simulator');
    } catch (err) {
      toast.error("Error al ejecutar simulación");
    }
  };

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
      {/* HEADER SECTION */}
      <div className="flex items-center justify-between p-6 border-b border-border/50 backdrop-blur-md bg-background/50 sticky top-0 z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Target className="w-6 h-6 text-primary" />
             </div>
             <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Pick 3 Intelligence <span className="text-primary/50 text-sm">v5.1</span></h1>
          </div>
          <p className="text-xs text-muted-foreground font-bold tracking-widest uppercase flex items-center gap-2">
             <Activity className="w-3 h-3 text-emerald-500" />
             Quantum Analysis Engine • Florida Lottery Market
          </p>
        </div>
        <div className="flex items-center gap-4">
           <div className="hidden lg:flex flex-col items-end mr-4">
              <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Market Status</span>
              <span className="text-xs font-black italic text-emerald-400 uppercase tracking-tighter">Live / Synchronized</span>
           </div>
           <Button
            onClick={syncLatest}
            disabled={syncing}
            variant="outline"
            className="bg-primary/5 hover:bg-primary/10 text-primary border-primary/20 font-black uppercase tracking-widest italic flex gap-2 h-10 px-6 rounded-xl transition-all active:scale-95"
           >
             {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
             Sync Market
           </Button>
        </div>
      </div>

      {/* CONTENT SCROLL AREA */}
      <ScrollArea className="flex-1">
        <div className="p-6 pb-20">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="bg-muted/10 border border-border/50 p-1 mb-8 gap-1 backdrop-blur-md sticky top-0 z-20">
              {[
                { id: 'dashboard', label: 'Dashboard', icon: BarChart3 },
                { id: 'strategy', label: 'Strategy', icon: BrainCircuit },
                { id: 'simulator', label: 'Financial Sim', icon: TrendingUp },
                { id: 'history', label: 'Quant History', icon: History },
              ].map(tab => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black uppercase tracking-widest text-[10px] italic py-2.5 px-6 rounded-lg transition-all"
                >
                   <tab.icon className="w-3.5 h-3.5 mr-2" />
                   {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="dashboard" className="mt-0 outline-none space-y-6">
              <Pick3Visuals analysis={analysis} history={history} />

              <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  <Card className="lg:col-span-3 bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                          <CardTitle className="text-xl font-black italic tracking-tight uppercase">Positional Frequency</CardTitle>
                          <CardDescription>Probabilidades por posición (Centena, Decena, Unidad)</CardDescription>
                        </div>
                        <Info className="w-5 h-5 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={Object.entries(analysis.global).map(([num, count]) => ({ number: num, frequency: count }))}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                              <XAxis dataKey="number" stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                              <YAxis stroke="#666" fontSize={10} axisLine={false} tickLine={false} />
                              <Tooltip
                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                              />
                              <Bar dataKey="frequency" radius={[4, 4, 0, 0]}>
                                {Object.entries(analysis.global).map((entry, index) => (
                                  <Cell key={index} fill={analysis.hotNumbers.includes(parseInt(entry[0])) ? '#3b82f6' : 'rgba(255,255,255,0.1)'} />
                                ))}
                              </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <div className="space-y-6">
                    <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden group">
                        <div className="h-1 w-full bg-blue-500/50" />
                        <CardHeader className="pb-2">
                          <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400">Hot Digits</CardTitle>
                        </CardHeader>
                        <CardContent className="flex gap-3 pb-6">
                          {analysis.hotNumbers.map(n => (
                            <div key={n} className="flex-1 aspect-square rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl font-black italic text-blue-400 group-hover:scale-105 transition-transform">
                                {n}
                            </div>
                          ))}
                        </CardContent>
                    </Card>

                    <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden group">
                        <div className="h-1 w-full bg-orange-500/50" />
                        <CardHeader className="pb-2">
                          <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Cold Digits</CardTitle>
                        </CardHeader>
                        <CardContent className="flex gap-3 pb-6">
                          {analysis.coldNumbers.map(n => (
                            <div key={n} className="flex-1 aspect-square rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-2xl font-black italic text-orange-400 group-hover:scale-105 transition-transform">
                                {n}
                            </div>
                          ))}
                        </CardContent>
                    </Card>
                  </div>
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
                            <CardTitle className="text-2xl font-black italic tracking-tight uppercase">Equity Curve</CardTitle>
                            <CardDescription>Proyección temporal del capital operativo</CardDescription>
                          </div>
                          <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/20 font-black tracking-widest text-[9px] px-3 py-1">LIVE SIM v2.0</Badge>
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
                               KPIs de Rendimiento
                            </CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-6 pb-8">
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Capital Final</span>
                                <span className="text-2xl font-black italic text-primary group-hover:scale-110 transition-transform">${simulations[0].finalCapital.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Retorno Absoluto</span>
                                <span className={cn(
                                  "text-2xl font-black italic group-hover:scale-110 transition-transform",
                                  simulations[0].roi >= 0 ? 'text-emerald-400' : 'text-destructive'
                                )}>
                                  {simulations[0].roi >= 0 ? '+' : ''}{simulations[0].roi.toFixed(1)}%
                                </span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Max Drawdown</span>
                                <span className="text-2xl font-black italic text-orange-400 group-hover:scale-110 transition-transform">{simulations[0].maxDrawdown.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between items-center group">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">Prob. de Ruina</span>
                                <span className="text-2xl font-black italic text-blue-400 group-hover:scale-110 transition-transform">{simulations[0].probabilityOfRuin}%</span>
                            </div>
                            <Button onClick={runSimulation} className="w-full mt-6 font-black uppercase tracking-widest italic h-12 rounded-2xl active:scale-95 transition-all shadow-lg">Nueva Simulación</Button>
                          </CardContent>
                      </Card>
                    </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-0 outline-none">
              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden rounded-[32px]">
                  <CardHeader className="bg-muted/5 border-b border-border/50 py-8 px-8">
                    <CardTitle className="text-2xl font-black italic tracking-tighter uppercase">Quant Registry</CardTitle>
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
