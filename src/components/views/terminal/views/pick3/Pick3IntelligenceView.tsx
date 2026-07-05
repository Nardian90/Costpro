"use client";
import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  TrendingUp,
  History,
  Settings,
  RefreshCw,
  ShieldAlert,
  Wallet,
  Target,
  Plus,
  PlayCircle,
  BookOpen,
  Bot,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Pick3Engine } from '@/services/pick3/Pick3Engine';
import { Pick3Storage } from '@/services/pick3/storage';
import { Pick3Result, AdvancedAnalysis, IntelligencePlay, BettingConfig, Pick3Profile, Pick3LedgerEntry } from '@/types/pick3';
import dynamic from 'next/dynamic';
import { Pick3HistorySection } from './Pick3HistorySection';
import { Pick3ControlPanel } from './Pick3ControlPanel';
import { Pick3StrategySection } from './Pick3StrategySection';
import { Pick3OnboardingWizard } from './Pick3OnboardingWizard';
import { BankrollDashboard } from './BankrollDashboard';
import { BetEntryDialog } from './BetEntryDialog';

const Pick3Visuals = dynamic(() => import('./Pick3Visuals').then(m => ({ default: m.Pick3Visuals })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});
const Pick3SimulationDashboard = dynamic(() => import('./Pick3SimulationDashboard').then(m => ({ default: m.Pick3SimulationDashboard })), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});
const Pick3AIAdvisor = dynamic(() => import('./Pick3AIAdvisor'), {
  ssr: false,
  loading: () => <div className="animate-pulse bg-muted rounded h-64" />,
});
import { Pick3HeroCard } from './Pick3HeroCard';
import { Pick3HelpSection } from './Pick3HelpSection';
import { SimulationConfigPanel, DEFAULT_CONFIG as SIM_DEFAULT_CONFIG, SimulationConfig as SimConfig } from './SimulationConfigPanel';
import { BacktestEngine, ModelValidationResult } from '@/services/pick3/backtest.engine';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { TooltipProvider } from "@/components/ui/tooltip";
import { CostProLoader } from '@/components/ui/CostProLoader';

export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [analysis, setAnalysis] = useState<AdvancedAnalysis | null>(null);
  const [plays, setPlays] = useState<IntelligencePlay[]>([]);
  const [loading, setLoading] = useState(true);

  // FIX-PERSIST (2026-07-04): persistir activeTab en localStorage
  const [activeTab, setActiveTab] = useState<string>(() => {
    if (typeof window === 'undefined') return 'dashboard';
    return localStorage.getItem('pick3-active-tab') || 'dashboard';
  });

  // Persistir activeTab cuando cambie
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pick3-active-tab', activeTab);
    }
  }, [activeTab]);

  const [profile, setProfile] = useState<Pick3Profile | null>(null);
  const [ledger, setLedger] = useState<Pick3LedgerEntry[]>([]);
  const [showBetDialog, setShowBetDialog] = useState(false);
  const [simResult, setSimResult] = useState<ModelValidationResult | null>(null);

  // FIX-SIM-CONFIG (2026-07-05): configuración de simulación (auto/manual)
  const [simConfig, setSimConfig] = useState<SimConfig>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pick3-sim-config');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return SIM_DEFAULT_CONFIG;
  });
  const [simRunning, setSimRunning] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pick3-sim-config', JSON.stringify(simConfig));
    }
  }, [simConfig]);

  const [bConfig, setBConfig] = useState<BettingConfig>(() => {
    // FIX-PERSIST: cargar bConfig de localStorage al iniciar
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('pick3-bconfig');
      if (saved) {
        try { return JSON.parse(saved); } catch {}
      }
    }
    return {
      mode: 'PICK3',
      payout: 500,
      boxPayout: 80,
      digits: 3,
      maxCombinations: 10,
      riskFactor: 1.0,
      stopLoss: 50.0,
      criticalDrawdown: 30.0
    };
  });

  // Persistir bConfig cuando cambie
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pick3-bconfig', JSON.stringify(bConfig));
    }
  }, [bConfig]);

  const [syncState, setSyncState] = useState({
    isSyncing: false,
    lastGlobalSync: undefined,
    sources: []
  });

  const runSimulation = useCallback((hist: Pick3Result[], config: BettingConfig, useEnsemble: boolean = false) => {
    if (hist.length < 60) return;
    setSimRunning(true);
    try {
      const backtestEngine = new BacktestEngine(hist);
      const days = simConfig.mode === 'manual' ? simConfig.windowDays : 30;
      // FIX-PERF (2026-07-05): solo pasar simConfig (que activa EnsembleEngine) cuando
      // el usuario explícitamente lo pide (useEnsemble=true). En el auto-load inicial,
      // NO pasar simConfig para que use PredictionEngine (ligero, O(n) no O(n²)).
      // EnsembleEngine calibra 4 modelos × 440 iteraciones × 60 sorteos = 105,600 cálculos
      // que bloquean el navegador. PredictionEngine hace 60 cálculos simples.
      const result = useEnsemble
        ? backtestEngine.runValidation(config, 1000, days, simConfig)
        : backtestEngine.runValidation(config, 1000, days);
      setSimResult(result);
    } finally {
      setSimRunning(false);
    }
  }, [simConfig]);

  // FIX-SIM-RERUN (2026-07-05): re-ejecutar simulación con config manual
  // Esta función SÍ usa EnsembleEngine (pesado) porque el usuario lo pidió explícitamente
  const handleReRunSimulation = useCallback(() => {
    if (history.length < 60) {
      toast.error("Se necesitan al menos 60 sorteos");
      return;
    }
    setSimRunning(true);
    // FIX-PERF: usar setTimeout para no bloquear el hilo principal inmediatamente
    // y permitir que el spinner se renderice antes del cálculo pesado
    setTimeout(() => {
      try {
        const backtestEngine = new BacktestEngine(history);
        const days = simConfig.mode === 'manual' ? simConfig.windowDays : 30;
        // Pasar simConfig activa EnsembleEngine (pesado pero preciso)
        const result = backtestEngine.runValidation(bConfig, 1000, days, simConfig);
        setSimResult(result);
        toast.success(`Simulación re-ejecutada (${days} días, modo ${simConfig.mode})`);
      } catch (err) {
        toast.error("Error en simulación");
      } finally {
        setSimRunning(false);
      }
    }, 50);
  }, [history, bConfig, simConfig]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const hist = await Pick3Storage.getHistory();
      setHistory(hist);

      // Fetch Profile
      const { data: profData } = await supabase
        .from('pick3_profiles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      setProfile(profData);

      // Fetch Ledger
      const { data: ledgerData } = await supabase
        .from('pick3_ledger')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      setLedger(ledgerData || []);

      if (hist.length > 0) {
        const engine = new Pick3Engine(hist);
        const advAnalysis = engine.analyzeAdvanced(60);
        setAnalysis(advAnalysis);

        const savedConfig = Pick3Storage.getConfig();
        const currentBConfig = savedConfig?.bettingConfig || bConfig;
        if (savedConfig?.bettingConfig) setBConfig(savedConfig.bettingConfig);

        const genPlays = engine.generateSimulatedPicks(currentBConfig);
        setPlays(genPlays);

        // FIX-PERF (2026-07-05): NO auto-ejecutar simulación con EnsembleEngine en mount.
        // EnsembleEngine es O(n²) y bloquea el navegador (~105,600 cálculos).
        // Usar PredictionEngine (ligero) para el auto-load inicial.
        // El usuario puede re-ejecutar con EnsembleEngine desde el tab Simulación.
        runSimulation(hist, currentBConfig, false);
      }
    } catch (err) {
      console.error("Error fetching Pick 3 data:", err);
      toast.error("Error al cargar datos de Pick 3");
    } finally {
      setLoading(false);
    }
  }, [user, runSimulation]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSync = async () => {
    setSyncState(s => ({ ...s, isSyncing: true }));
    try {
      // FIX-SYNC-7DIAS (2026-07-04): solo sincronizar últimos 7 días
      // desde LotteryUSA (scraper client-side). El histórico completo
      // viene del PDF oficial cargado previamente.
      const response = await fetch('/api/pick3/sync?days=7', { method: 'POST', headers: { 'Authorization': `Bearer ${useAuthStore.getState().token}` } });
      const data = await response.json();
      const error = !response.ok || !data.success ? (data.message || 'Sync failed') : null;
      if (error) throw error;

      // FIX-TOAST (2026-07-05): mostrar fechas sincronizadas para feedback claro
      const sorteos = data.data || [];
      if (sorteos.length > 0) {
        const dates = [...new Set(sorteos.map((s: any) => s.date))].sort().reverse();
        const dateRange = dates.length > 0
          ? `${dates[dates.length - 1]} → ${dates[0]}`
          : '';
        toast.success(`Sincronización completada: ${sorteos.length} sorteos (${dateRange})`);
      } else {
        toast.info("Sincronización completada. No hay sorteos nuevos para los últimos 7 días.");
      }
      fetchData();
    } catch (err) {
      toast.error("Error en sincronización automática");
    } finally {
      setSyncState(s => ({ ...s, isSyncing: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <CostProLoader text="PICK3" subtext="Sincronizando Probabilidades..." showText showSubtext />
      </div>
    );
  }

  if (user && (!profile || !profile.onboarding_completed)) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <Pick3OnboardingWizard
          userId={user.id}
          onComplete={(amount) => {
            fetchData();
            setActiveTab('dashboard');
          }}
        />
      </div>
    );
  }

  return (
    <TooltipProvider>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-in fade-in duration-700">
        {/* Header & Main Stats — FIX-SIZE (2026-07-05): tamaño reducido, nombre en español */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h1 className="text-lg sm:text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6 text-primary shrink-0" />
              <span>Gestor de <span className="text-primary">Riesgo</span> de Inversión</span>
            </h1>
            <p className="text-[9px] sm:text-[10px] font-bold uppercase opacity-50 tracking-widest">Análisis Estadístico & Gestión de Capital</p>
          </div>

          <div className="flex flex-wrap gap-2 sm:gap-3">
             <Button
              variant="outline"
              className="rounded-full font-black uppercase h-11 sm:h-12 px-4 sm:px-6 border-primary/20 hover:bg-primary/5 group text-[11px] sm:text-xs"
              onClick={handleSync}
              disabled={syncState.isSyncing}
              title="Actualiza los últimos 7 días desde LotteryUSA"
            >
              <RefreshCw className={cn("w-4 h-4 mr-1.5 sm:mr-2", syncState.isSyncing && "animate-spin")} />
              <span className="hidden sm:inline">{syncState.isSyncing ? "Actualizando..." : "Actualizar 7 días"}</span>
              <span className="sm:hidden">{syncState.isSyncing ? "..." : "7 días"}</span>
            </Button>
            <Button
              className="rounded-full font-black uppercase h-11 sm:h-12 px-4 sm:px-8 shadow-lg shadow-primary/20 group text-[11px] sm:text-xs"
              onClick={() => setShowBetDialog(true)}
            >
              <Plus className="w-4 h-4 mr-1.5 sm:mr-2 group-hover:scale-125 transition-transform" />
              <span className="hidden sm:inline">Registrar Apuesta</span>
              <span className="sm:hidden">Apuesta</span>
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* FIX-MOBILE-FIRST (2026-07-05): tabs optimizadas para mobile
              - En mobile: scroll horizontal fluido con snap, iconos siempre visibles, texto abreviado
              - En desktop: grid de 8 columnas con texto completo
              - El tab activo se resalta con escala y sombra */}
          <TabsList className="flex md:grid md:grid-cols-8 overflow-x-auto md:overflow-visible h-auto p-1.5 bg-muted/30 rounded-[24px] border border-border/50 sticky top-4 z-50 backdrop-blur-md gap-1 md:gap-0.5 no-scrollbar snap-x snap-mandatory">
            <TabsTrigger value="dashboard" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all">
              <Wallet className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Dashboard</span><span className="sm:hidden">Inicio</span>
            </TabsTrigger>
            <TabsTrigger value="prediction" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all">
              <Target className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Predicciones</span><span className="sm:hidden">Pred.</span>
            </TabsTrigger>
            <TabsTrigger value="simulation" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all">
              <PlayCircle className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Simulación</span><span className="sm:hidden">Sim.</span>
            </TabsTrigger>
            <TabsTrigger value="intel" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all">
              <TrendingUp className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Análisis</span><span className="sm:hidden">Anál.</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all">
              <History className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Histórico</span><span className="sm:hidden">Hist.</span>
            </TabsTrigger>
            <TabsTrigger value="help" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all bg-primary/5 text-primary">
              <BookOpen className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Guía</span><span className="sm:hidden">Guía</span>
            </TabsTrigger>
            <TabsTrigger value="advisor" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all bg-primary/10 text-primary">
              <Bot className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Asesor IA</span><span className="sm:hidden">IA</span>
            </TabsTrigger>
            <TabsTrigger value="config" className="rounded-full py-2.5 font-black text-[10px] uppercase tracking-wider whitespace-nowrap shrink-0 px-4 sm:px-3 snap-start data-[state=active]:scale-105 data-[state=active]:shadow-md transition-all">
              <Settings className="w-4 h-4 mr-1.5 shrink-0" /> <span className="hidden sm:inline">Ajustes</span><span className="sm:hidden">Ajust.</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="pt-6 space-y-6">
            {/* FIX-DASHBOARD (2026-07-05): Hero Card con bankroll integrado */}
            {plays.length > 0 && profile && (
              <Pick3HeroCard
                plays={plays}
                config={bConfig}
                bankroll={profile.current_bankroll / 100}
                profile={profile}
                ledger={ledger}
              />
            )}
            {/* FIX-CRUD (2026-07-05): mantener el BankrollDashboard con el ledger/historial de jugadas */}
            {profile && <BankrollDashboard profile={profile} ledger={ledger} />}
          </TabsContent>

          <TabsContent value="prediction" className="pt-6">
             {analysis && <Pick3StrategySection analysis={analysis} plays={plays} config={bConfig} />}
          </TabsContent>

          <TabsContent value="simulation" className="pt-6 space-y-6">
             {simResult ? (
                <Pick3SimulationDashboard
                  result={simResult}
                  initialBankroll={1000}
                  config={bConfig}
                  simConfigPanel={
                    <SimulationConfigPanel
                      config={simConfig}
                      onChange={setSimConfig}
                      onReRun={handleReRunSimulation}
                      isRunning={simRunning}
                    />
                  }
                />
             ) : (
                <div className="p-12 text-center opacity-40">
                  <PlayCircle className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm font-black uppercase">No hay datos suficientes para simular (Mínimo 60 sorteos)</p>
                </div>
             )}
             {/* Panel de configuración también aquí para cuando no hay simResult */}
             {simResult === null && (
               <SimulationConfigPanel
                 config={simConfig}
                 onChange={setSimConfig}
                 onReRun={handleReRunSimulation}
                 isRunning={simRunning}
               />
             )}
          </TabsContent>

          <TabsContent value="intel" className="pt-6">
             <Pick3Visuals history={history} analysis={analysis || ({} as any)} />
          </TabsContent>

          <TabsContent value="history" className="pt-6 space-y-6">
             <Pick3HistorySection history={history} onRefresh={fetchData} config={bConfig} />
             <Pick3ControlPanel syncState={syncState as any} onSync={handleSync} />
          </TabsContent>

          <TabsContent value="help" className="pt-6">
             <Pick3HelpSection />
          </TabsContent>

          <TabsContent value="advisor" className="pt-6">
             <Pick3AIAdvisor
               history={history}
               analysis={analysis}
               plays={plays}
               config={bConfig}
               simResult={simResult}
               profile={profile}
             />
          </TabsContent>

          <TabsContent value="config" className="pt-6">
             <Card className="rounded-[32px] p-6">
                <CardHeader className="px-0">
                   <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                      <Settings className="w-4 h-4" /> Configuración Estratégica
                   </CardTitle>
                </CardHeader>
                <CardContent className="px-0 space-y-6">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                         <label htmlFor="pick3-mode" className="text-[10px] font-black uppercase ml-1">Modo de Juego</label>
                         <select
                            id="pick3-mode"
                            className="w-full h-12 rounded-xl border-border bg-background px-4 text-sm font-black italic uppercase"
                            value={bConfig.mode}
                            onChange={(e) => {
                              const newMode = e.target.value as any;
                              // FIX-PAYOUT (2026-07-05): ajustar payout default según modo
                              const newPayout = newMode === 'LAST2' ? 90 : 500;
                              const newBoxPayout = newMode === 'LAST2' ? 60 : 80;
                              setBConfig({...bConfig, mode: newMode, payout: newPayout, boxPayout: newBoxPayout});
                            }}
                         >
                            <option value="PICK3">Florida Lottery Pick 3 (Official)</option>
                            <option value="LAST2">Terminal / Bolita (Last 2)</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label htmlFor="pick3-risk" className="text-[10px] font-black uppercase ml-1">Riesgo por Jugada (%)</label>
                         <input
                            id="pick3-risk"
                            type="number" step="0.1"
                            aria-label="Riesgo por Jugada"
                            value={bConfig.riskFactor}
                            onChange={(e) => setBConfig({...bConfig, riskFactor: parseFloat(e.target.value)})}
                            className="w-full h-12 rounded-xl border border-border bg-background px-4 font-black text-lg"
                         />
                      </div>
                      {/* FIX-PAYOUT (2026-07-05): premio por coincidencia configurable */}
                      <div className="space-y-2">
                         <label htmlFor="pick3-payout" className="text-[10px] font-black uppercase ml-1">
                            Premio Straight (coincidencia exacta)
                         </label>
                         <div className="flex items-center gap-2">
                           <input
                              id="pick3-payout"
                              type="number" step="1" min="1"
                              aria-label="Premio Straight"
                              value={bConfig.payout}
                              onChange={(e) => setBConfig({...bConfig, payout: parseFloat(e.target.value) || 500})}
                              className="w-full h-12 rounded-xl border border-border bg-background px-4 font-black text-lg"
                           />
                           <span className="text-[10px] font-black uppercase opacity-50 shrink-0">x por $1</span>
                         </div>
                         <p className="text-[9px] opacity-50 ml-1">
                           {bConfig.mode === 'LAST2' ? 'Default: 90 (Last 2)' : 'Default: 500 (Pick 3 straight)'}
                         </p>
                      </div>
                      <div className="space-y-2">
                         <label htmlFor="pick3-box-payout" className="text-[10px] font-black uppercase ml-1">
                            Premio Box (cualquier orden)
                         </label>
                         <div className="flex items-center gap-2">
                           <input
                              id="pick3-box-payout"
                              type="number" step="1" min="1"
                              aria-label="Premio Box"
                              value={(bConfig as any).boxPayout || (bConfig.mode === 'LAST2' ? 60 : 80)}
                              onChange={(e) => setBConfig({...bConfig, boxPayout: parseFloat(e.target.value) || 80} as any)}
                              className="w-full h-12 rounded-xl border border-border bg-background px-4 font-black text-lg"
                           />
                           <span className="text-[10px] font-black uppercase opacity-50 shrink-0">x por $1</span>
                         </div>
                         <p className="text-[9px] opacity-50 ml-1">
                           {bConfig.mode === 'LAST2' ? 'Default: 60 (Last 2 pares)' : 'Default: 80 (Pick 3 box 6-way)'}
                         </p>
                      </div>
                   </div>
                   <Button
                      className="w-full h-14 rounded-full font-black uppercase shadow-lg hover:shadow-xl transition-all"
                      onClick={() => {
                         Pick3Storage.saveConfig({ budget: (profile?.current_bankroll || 0)/100, horizonDays: 30, riskLevel: 'medium', costPerBet: 1, bettingConfig: bConfig });
                         toast.success("Estrategia actualizada correctamente");
                         fetchData();
                      }}
                   >
                      Guardar Perfil Estratégico
                   </Button>
                </CardContent>
             </Card>
          </TabsContent>
        </Tabs>

        <BetEntryDialog
          open={showBetDialog}
          onOpenChange={setShowBetDialog}
          userId={user?.id || ''}
          onSuccess={fetchData}
          history={history}
        />

        <div className="text-center opacity-30 group hover:opacity-100 transition-opacity duration-700">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] italic flex items-center justify-center gap-2">
            <ShieldAlert className="w-3 h-3" /> Statistical simulation engine for educational purposes
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
