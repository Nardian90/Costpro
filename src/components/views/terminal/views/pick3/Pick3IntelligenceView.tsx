import React, { useState, useMemo, useEffect } from 'react';
import {
  TrendingUp, DollarSign, BrainCircuit, Target,
  History, Sparkles, Activity, Info, BarChart3, LineChart, PieChart, Shield, RefreshCw
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Pick3Engine, AdvancedAnalysis } from '@/services/pick3/Pick3Engine';
import { MIAMI_PICK3_HISTORICAL } from '@/services/pick3/seedData';
import { Pick3Storage } from '@/services/pick3/storage';
import { Pick3ExternalService } from '@/services/pick3/external';
import { StrategyConfig, IntelligencePlay, SimulationResult, Pick3Result } from '@/types/pick3';
import { useAuthStore } from '@/store';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, AreaChart, Area, PieChart as RePieChart, Pie
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Pick3StrategySection } from './Pick3StrategySection';
import { Pick3Visuals } from './Pick3Visuals';

export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [history, setHistory] = useState<Pick3Result[]>(MIAMI_PICK3_HISTORICAL);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const engine = useMemo(() => new Pick3Engine(history), [history]);
  const analysis = useMemo(() => engine.analyzeAdvanced(30), [engine]);
  const plays = useMemo(() => engine.generatePlays(analysis), [analysis]);
  const [simulations, setSimulations] = useState<SimulationResult[]>([]);

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


  const [config, setConfig] = useState<StrategyConfig>({
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
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user]);

  const runSimulation = async () => {
    if (!user) return;
    const result = engine.simulate(config);
    await Pick3Storage.saveSimulation(user.id, result);
    const updatedSims = await Pick3Storage.getSimulations(user.id);
    setSimulations(updatedSims);
    toast.success('Simulación completada y persistida');
    setActiveTab('simulator');
  };

  const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

  if (loading) {
     return <div className="h-full flex items-center justify-center font-black italic text-primary animate-pulse uppercase tracking-widest">Iniciando Terminal Cuántica...</div>;
  }

  return (
    <div className="flex flex-col h-full bg-background/95 text-foreground selection:bg-primary selection:text-primary-foreground animate-in fade-in duration-500">
      <div className="flex items-center justify-between p-6 border-b border-border/50 backdrop-blur-md bg-background/50 sticky top-0 z-10">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
                <Target className="w-6 h-6 text-primary" />
             </div>
             <h1 className="text-3xl font-black italic tracking-tighter uppercase leading-none">Pick 3 Intelligence <span className="text-primary/50">v5.0</span></h1>
          </div>
          <p className="text-xs text-muted-foreground font-bold tracking-widest uppercase flex items-center gap-2">
             <Activity className="w-3 h-3 text-emerald-500" />
             Quantum Analysis Engine • Florida Lottery Market • High Volatility
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
            className="bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-black uppercase tracking-widest italic flex gap-2"
           >
             {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
             Sync Market
           </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 p-6 overflow-y-auto no-scrollbar">
        <TabsList className="bg-muted/10 border border-border/50 p-1 mb-8 gap-1 backdrop-blur-md">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black uppercase tracking-widest text-[10px] italic py-2.5 px-6 rounded-md transition-all">
             <BarChart3 className="w-3.5 h-3.5 mr-2" />
             Dashboard
          </TabsTrigger>
          <TabsTrigger value="strategy" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black uppercase tracking-widest text-[10px] italic py-2.5 px-6 rounded-md transition-all">
             <BrainCircuit className="w-3.5 h-3.5 mr-2" />
             Strategy
          </TabsTrigger>
          <TabsTrigger value="simulator" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black uppercase tracking-widest text-[10px] italic py-2.5 px-6 rounded-md transition-all">
             <TrendingUp className="w-3.5 h-3.5 mr-2" />
             Financial Sim
          </TabsTrigger>
          <TabsTrigger value="history" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground font-black uppercase tracking-widest text-[10px] italic py-2.5 px-6 rounded-md transition-all">
             <History className="w-3.5 h-3.5 mr-2" />
             Quant History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-0 outline-none space-y-6">
           <Pick3Visuals analysis={analysis} history={history} />

           <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <Card className="lg:col-span-3 bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                 <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                      <CardTitle className="text-xl font-black italic tracking-tight uppercase">Positional Frequency Analysis</CardTitle>
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
                 <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                    <CardHeader>
                       <CardTitle className="text-xs font-black uppercase tracking-widest italic">Hot Digits</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-3">
                       {analysis.hotNumbers.map(n => (
                         <div key={n} className="flex-1 aspect-square rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-xl font-black italic text-blue-400">
                            {n}
                         </div>
                       ))}
                    </CardContent>
                 </Card>

                 <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                    <CardHeader>
                       <CardTitle className="text-xs font-black uppercase tracking-widest italic">Cold Digits</CardTitle>
                    </CardHeader>
                    <CardContent className="flex gap-3">
                       {analysis.coldNumbers.map(n => (
                         <div key={n} className="flex-1 aspect-square rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-xl font-black italic text-orange-400">
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

        <TabsContent value="simulator" className="mt-6 outline-none">
           {simulations.length === 0 ? (
             <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-6 rounded-full bg-muted/20 border border-dashed border-border">
                   <DollarSign className="w-12 h-12 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                   <h3 className="text-lg font-bold uppercase italic tracking-tight">Sin Datos de Simulación</h3>
                   <p className="text-sm text-muted-foreground max-w-xs">Configura una estrategia y ejecuta el simulador para ver proyecciones financieras persistidas en Supabase.</p>
                   <Button onClick={runSimulation} className="mt-4 font-black uppercase tracking-widest italic">Lanzar Simulación</Button>
                </div>
             </div>
           ) : (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <Card className="lg:col-span-2 bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                   <CardHeader className="flex flex-row items-center justify-between">
                      <div>
                        <CardTitle className="text-xl font-black italic tracking-tight uppercase">Equity Curve (PROYECCIÓN)</CardTitle>
                        <CardDescription>Evolución esperada del capital operativo</CardDescription>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-500 border-emerald-500/20 font-bold tracking-widest">REALTIME SIM</Badge>
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
                            <Area type="monotone" dataKey="capital" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCap)" strokeWidth={3} />
                         </AreaChart>
                      </ResponsiveContainer>
                   </CardContent>
                </Card>

                <div className="space-y-6">
                   <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                      <CardHeader>
                         <CardTitle className="text-sm font-black uppercase tracking-widest italic">KPIs de Rendimiento</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase font-bold">Capital Final</span>
                            <span className="text-lg font-black italic text-primary">${simulations[0].finalCapital.toFixed(2)}</span>
                         </div>
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase font-bold">Retorno Absoluto</span>
                            <span className={cn(
                              "text-lg font-black italic",
                              simulations[0].roi >= 0 ? 'text-emerald-400' : 'text-destructive'
                            )}>
                               {simulations[0].roi >= 0 ? '+' : ''}{simulations[0].roi.toFixed(1)}%
                            </span>
                         </div>
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase font-bold">Max Drawdown</span>
                            <span className="text-lg font-black italic text-orange-400">{simulations[0].maxDrawdown.toFixed(1)}%</span>
                         </div>
                         <div className="flex justify-between items-center">
                            <span className="text-xs text-muted-foreground uppercase font-bold">Prob. de Ruina</span>
                            <span className="text-lg font-black italic text-blue-400">{simulations[0].probabilityOfRuin}%</span>
                         </div>
                         <Button onClick={runSimulation} className="w-full mt-4 font-black uppercase tracking-widest italic">Nueva Simulación</Button>
                      </CardContent>
                   </Card>
                </div>
             </div>
           )}
        </TabsContent>

        <TabsContent value="history" className="mt-6 outline-none">
           <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
              <CardHeader>
                 <CardTitle className="text-xl font-black italic tracking-tight uppercase">Quant Registry (Miami Market)</CardTitle>
              </CardHeader>
              <CardContent>
                 <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-2">
                       {history.map((draw, i) => (
                         <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-muted/10 border border-border/50 hover:bg-muted/20 transition-all group">
                            <div className="flex items-center gap-6">
                               <div className="text-xs font-black uppercase tracking-widest text-muted-foreground w-24">
                                  {draw.date}
                               </div>
                               <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-tighter w-20 justify-center">
                                  {draw.draw_time === 'midday' ? 'Mediodía' : 'Noche'}
                                </Badge>
                            </div>
                            <div className="flex gap-2">
                               {draw.result?.map((n, idx) => (
                                 <div key={idx} className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-lg font-black italic text-primary group-hover:scale-110 transition-transform">
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
  );
}
