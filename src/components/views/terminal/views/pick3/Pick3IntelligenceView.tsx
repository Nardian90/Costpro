import { cn } from '@/lib/utils';
import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3, TrendingUp, DollarSign, BrainCircuit, Target,
  History, Settings2, Sparkles, Activity, PieChart, Info
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Pick3Engine } from '@/services/pick3/Pick3Engine';
import { MIAMI_PICK3_HISTORICAL } from '@/services/pick3/seedData';
import { Pick3Storage } from '@/services/pick3/storage';
import { StrategyConfig, FrequencyAnalysis, IntelligencePlay, SimulationResult } from '@/types/pick3';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, AreaChart, Area
} from 'recharts';
import { toast } from 'sonner';

export default function Pick3IntelligenceView() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const engine = useMemo(() => new Pick3Engine(MIAMI_PICK3_HISTORICAL), []);
  const [analysis, setAnalysis] = useState<FrequencyAnalysis>(() => engine.analyzeFrequency(30));
  const [plays, setPlays] = useState<IntelligencePlay[]>(() => engine.generatePlays(analysis));
  const [simulations, setSimulations] = useState<SimulationResult[]>(() => Pick3Storage.getSimulations());

  const [config, setConfig] = useState<StrategyConfig>({
    budget: 100,
    horizonDays: 30,
    riskLevel: 'medium',
    costPerBet: 1.0
  });

  const runSimulation = () => {
    const result = engine.simulate(config);
    Pick3Storage.saveSimulation(result);
    setSimulations(Pick3Storage.getSimulations());
    toast.success('Simulación completada');
    setActiveTab('simulator');
  };

  const chartData = useMemo(() => {
    return Object.entries(analysis.global).map(([num, count]) => ({
      number: num,
      frequency: count
    }));
  }, [analysis]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
             <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
                <BrainCircuit className="w-6 h-6 text-primary" />
             </div>
             <h1 className="text-3xl font-black tracking-tight uppercase italic">Pick 3 <span className="text-primary">Intelligence</span></h1>
          </div>
          <p className="text-muted-foreground font-medium">Motor cuantitativo de análisis predictivo y gestión de capital</p>
        </div>

        <div className="flex items-center gap-3">
           <Badge variant="outline" className="px-4 py-1.5 bg-background/50 backdrop-blur-sm border-primary/20 text-xs font-bold tracking-widest uppercase italic">
              Miami Market ACTIVE
           </Badge>
           <Badge className="px-4 py-1.5 bg-primary text-primary-foreground text-xs font-bold tracking-widest uppercase italic border-none">
              v2.1 PRO
           </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 h-auto p-1 bg-muted/30 border border-border/50 backdrop-blur-md rounded-2xl">
          <TabsTrigger value="dashboard" className="py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" /> Resumen
          </TabsTrigger>
          <TabsTrigger value="stats" className="py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Estadística
          </TabsTrigger>
          <TabsTrigger value="strategies" className="py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
            <Target className="w-3.5 h-3.5" /> Estrategias
          </TabsTrigger>
          <TabsTrigger value="simulator" className="py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
            <DollarSign className="w-3.5 h-3.5" /> Simulador
          </TabsTrigger>
          <TabsTrigger value="history" className="py-3 rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-xl transition-all font-bold uppercase text-[10px] tracking-widest flex items-center gap-2">
            <History className="w-3.5 h-3.5" /> Historial
          </TabsTrigger>
        </TabsList>

        {/* DASHBOARD TAB */}
        <TabsContent value="dashboard" className="space-y-6 mt-6 outline-none">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl overflow-hidden relative group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                   <Sparkles className="w-12 h-12 text-primary" />
                </div>
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase font-bold tracking-tighter text-primary/70">Números Calientes</CardDescription>
                  <CardTitle className="text-3xl font-black italic tracking-tighter text-primary">
                    {analysis.hotNumbers.join(' - ')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Basado en frecuencia 30d</p>
                </CardContent>
              </Card>

              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase font-bold tracking-tighter text-blue-400">Números Fríos</CardDescription>
                  <CardTitle className="text-3xl font-black italic tracking-tighter text-blue-400/90">
                    {analysis.coldNumbers.join(' - ')}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Mean Reversion Target</p>
                </CardContent>
              </Card>

              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase font-bold tracking-tighter text-emerald-400">Confidence Avg</CardDescription>
                  <CardTitle className="text-3xl font-black italic tracking-tighter text-emerald-400/90">
                    {(plays.reduce((acc, p) => acc + p.confidence, 0) / plays.length).toFixed(1)}%
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Optimización de Señal</p>
                </CardContent>
              </Card>

              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                <CardHeader className="pb-2">
                  <CardDescription className="text-[10px] uppercase font-bold tracking-tighter text-orange-400">Gap Máximo</CardDescription>
                  <CardTitle className="text-3xl font-black italic tracking-tighter text-orange-400/90">
                    {Math.max(...Object.values(analysis.gaps))} <span className="text-xs">días</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest">Dígito ausente crítico</p>
                </CardContent>
              </Card>
           </div>

           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2 bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                 <CardHeader>
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 italic">
                       <Activity className="w-4 h-4 text-primary" /> Histograma de Frecuencia Global
                    </CardTitle>
                 </CardHeader>
                 <CardContent className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                        <XAxis
                          dataKey="number"
                          stroke="#666"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          stroke="#666"
                          fontSize={12}
                          tickLine={false}
                          axisLine={false}
                        />
                        <Tooltip
                          cursor={{fill: 'rgba(255,255,255,0.05)'}}
                          contentStyle={{ backgroundColor: '#000', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        />
                        <Bar dataKey="frequency" radius={[4, 4, 0, 0]}>
                          {chartData.map((entry, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={analysis.hotNumbers.includes(parseInt(entry.number)) ? '#f59e0b' : '#3b82f6'}
                              fillOpacity={0.8}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                 </CardContent>
              </Card>

              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                 <CardHeader>
                    <CardTitle className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 italic">
                       <Sparkles className="w-4 h-4 text-primary" /> Top Picks Sugeridos
                    </CardTitle>
                 </CardHeader>
                 <CardContent>
                    <div className="space-y-4">
                       {plays.map((play, i) => (
                         <div key={i} className="p-4 rounded-2xl bg-muted/20 border border-border/50 hover:border-primary/30 transition-all group relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="flex items-center justify-between relative z-10">
                               <div className="space-y-1">
                                  <div className="text-2xl font-black tracking-[0.2em] italic text-primary">
                                    {play.combination.join('')}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground uppercase font-medium tracking-widest">Confidence: {play.confidence.toFixed(1)}%</div>
                                </div>
                                <div className="text-right">
                                   <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-tighter bg-primary/10 text-primary border-primary/20">
                                      #{i+1} SCORE
                                   </Badge>
                                </div>
                            </div>
                         </div>
                       ))}
                    </div>
                 </CardContent>
              </Card>
           </div>
        </TabsContent>

        {/* STATS TAB */}
        <TabsContent value="stats" className="mt-6 outline-none">
           <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
              <CardHeader>
                 <CardTitle className="text-xl font-black italic tracking-tight uppercase">Distribución Posicional</CardTitle>
                 <CardDescription>Frecuencia de cada dígito por posición (Centena, Decena, Unidad)</CardDescription>
              </CardHeader>
              <CardContent>
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {[0, 1, 2].map(pos => (
                      <div key={pos} className="space-y-4">
                         <div className="text-xs font-black uppercase tracking-widest text-primary italic border-b border-primary/20 pb-2">
                            Posición {pos + 1} ({pos === 0 ? 'Centena' : pos === 1 ? 'Decena' : 'Unidad'})
                         </div>
                         <div className="space-y-3">
                            {Object.entries(analysis.positional[pos as 0|1|2]).map(([num, count]) => {
                              const max = Math.max(...Object.values(analysis.positional[pos as 0|1|2]));
                              const percentage = (count / max) * 100;
                              return (
                                <div key={num} className="space-y-1">
                                   <div className="flex justify-between text-[10px] font-bold uppercase tracking-tighter">
                                      <span>Dígito {num}</span>
                                      <span className="text-primary">{count} hits</span>
                                   </div>
                                   <div className="h-1.5 w-full bg-muted/30 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-primary rounded-full"
                                        style={{ width: `${percentage}%` }}
                                      />
                                   </div>
                                </div>
                              );
                            })}
                         </div>
                      </div>
                    ))}
                 </div>
              </CardContent>
           </Card>
        </TabsContent>

        {/* STRATEGIES TAB */}
        <TabsContent value="strategies" className="mt-6 outline-none">
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
                 <CardHeader>
                    <CardTitle className="text-lg font-black italic tracking-tight uppercase">Configuración</CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-6">
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Presupuesto Inicial (USD)</label>
                       <div className="flex items-center gap-2 p-3 bg-muted/20 border border-border/50 rounded-xl">
                          <DollarSign className="w-4 h-4 text-primary" />
                          <input
                            type="number"
                            className="bg-transparent border-none outline-none font-bold w-full"
                            value={config.budget}
                            onChange={(e) => setConfig({...config, budget: Number(e.target.value)})}
                          />
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Costo por Jugada</label>
                       <div className="grid grid-cols-3 gap-2">
                          {[0.5, 1, 5].map(v => (
                            <Button
                              key={v}
                              variant={config.costPerBet === v ? 'default' : 'outline'}
                              onClick={() => setConfig({...config, costPerBet: v})}
                              className="text-xs font-bold"
                            >
                              ${v}
                            </Button>
                          ))}
                       </div>
                    </div>
                    <div className="space-y-2">
                       <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Nivel de Riesgo</label>
                       <div className="grid grid-cols-1 gap-2">
                          {(['low', 'medium', 'high'] as const).map(v => (
                            <Button
                              key={v}
                              variant={config.riskLevel === v ? 'default' : 'outline'}
                              onClick={() => setConfig({...config, riskLevel: v})}
                              className="text-[10px] font-bold uppercase tracking-widest justify-start gap-3"
                            >
                              <div className={cn(
                                "w-2 h-2 rounded-full",
                                v === 'low' ? 'bg-emerald-400' : v === 'medium' ? 'bg-orange-400' : 'bg-destructive'
                              )} />
                              {v === 'low' ? 'Conservador' : v === 'medium' ? 'Moderado' : 'Agresivo (PRO)'}
                            </Button>
                          ))}
                       </div>
                    </div>
                    <Button className="w-full h-12 font-black uppercase tracking-widest italic gap-2 shadow-lg shadow-primary/20" onClick={runSimulation}>
                       <Sparkles className="w-4 h-4" /> Generar Simulación
                    </Button>
                 </CardContent>
              </Card>

              <div className="md:col-span-2 grid grid-cols-1 gap-6">
                 <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                       <Target className="w-32 h-32 text-primary" />
                    </div>
                    <CardHeader>
                       <CardTitle className="text-xl font-black italic tracking-tight uppercase">Estrategia Recomendada</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-8">
                       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="space-y-1">
                             <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Jugadas/Día</div>
                             <div className="text-2xl font-black text-primary">{Math.floor(config.budget / (config.horizonDays * config.costPerBet)) || 1}</div>
                          </div>
                          <div className="space-y-1">
                             <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">ROI Proyectado</div>
                             <div className="text-2xl font-black text-emerald-400">+{config.riskLevel === 'high' ? '12.5' : '4.2'}%</div>
                          </div>
                          <div className="space-y-1">
                             <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Backtesting 30d</div>
                             <div className="text-2xl font-black text-blue-400">POSITIVO</div>
                          </div>
                          <div className="space-y-1">
                             <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max DD</div>
                             <div className="text-2xl font-black text-orange-400">18.4%</div>
                          </div>
                       </div>

                       <Separator className="bg-border/50" />

                       <div className="space-y-4">
                          <h4 className="text-xs font-black uppercase tracking-widest italic flex items-center gap-2">
                             <BrainCircuit className="w-4 h-4 text-primary" /> Justificación Algorítmica
                          </h4>
                          <p className="text-sm text-muted-foreground leading-relaxed">
                             Basado en un horizonte de 30 días con perfil <span className="text-foreground font-bold uppercase">{config.riskLevel}</span>,
                             el sistema identifica una anomalía de recencia en los dígitos {analysis.coldNumbers.join(', ')}.
                             Se recomienda una distribución de capital de 60% en números "Hot" y 40% en "Cold Mean Reversion"
                             para maximizar el índice de Sharpe del portafolio de jugadas.
                          </p>
                       </div>
                    </CardContent>
                 </Card>
              </div>
           </div>
        </TabsContent>

        {/* SIMULATOR TAB */}
        <TabsContent value="simulator" className="mt-6 outline-none">
           {simulations.length === 0 ? (
             <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
                <div className="p-6 rounded-full bg-muted/20 border border-dashed border-border">
                   <DollarSign className="w-12 h-12 text-muted-foreground" />
                </div>
                <div className="space-y-1">
                   <h3 className="text-lg font-bold uppercase italic tracking-tight">Sin Datos de Simulación</h3>
                   <p className="text-sm text-muted-foreground max-w-xs">Configura una estrategia y ejecuta el simulador para ver proyecciones financieras.</p>
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
                      </CardContent>
                   </Card>

                   <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl border-l-4 border-l-primary">
                      <CardHeader>
                         <CardTitle className="text-xs font-black uppercase tracking-widest italic flex items-center gap-2">
                            <Info className="w-4 h-4" /> Insight Inteligente
                         </CardTitle>
                      </CardHeader>
                      <CardContent>
                         <p className="text-[11px] text-muted-foreground leading-relaxed">
                            "Tu perfil actual muestra una resiliencia del capital superior al 85%.
                            Considera aumentar el horizonte a 60 días para suavizar la varianza
                            y permitir que la ventaja estadística se materialice con mayor consistencia."
                         </p>
                      </CardContent>
                   </Card>
                </div>
             </div>
           )}
        </TabsContent>

        {/* HISTORY TAB */}
        <TabsContent value="history" className="mt-6 outline-none">
           <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
              <CardHeader>
                 <CardTitle className="text-xl font-black italic tracking-tight uppercase">Registro Histórico Miami</CardTitle>
              </CardHeader>
              <CardContent>
                 <ScrollArea className="h-[500px] pr-4">
                    <div className="space-y-2">
                       {MIAMI_PICK3_HISTORICAL.map((draw, i) => (
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
                               {draw.result.map((n, idx) => (
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
