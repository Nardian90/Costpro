"use client";
import React, { useState, useEffect, useCallback } from 'react';
import {
  BrainCircuit,
  TrendingUp,
  History,
  Settings,
  RefreshCw,
  ShieldAlert,
  Wallet,
  Target,
  Plus,
  PlayCircle,
  BookOpen
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
import { Pick3Visuals } from './Pick3Visuals';
import { Pick3HistorySection } from './Pick3HistorySection';
import { Pick3ControlPanel } from './Pick3ControlPanel';
import { Pick3StrategySection } from './Pick3StrategySection';
import { Pick3OnboardingWizard } from './Pick3OnboardingWizard';
import { BankrollDashboard } from './BankrollDashboard';
import { BetEntryDialog } from './BetEntryDialog';
import { Pick3SimulationDashboard } from './Pick3SimulationDashboard';
import { Pick3HeroCard } from './Pick3HeroCard';
import { Pick3HelpSection } from './Pick3HelpSection';
import { BacktestEngine, ModelValidationResult } from '@/services/pick3/backtest.engine';
import { supabase } from '@/lib/supabaseClient';
import { useAuthStore } from '@/store';
import { TooltipProvider } from "@/components/ui/tooltip";

export default function Pick3IntelligenceView() {
  const { user } = useAuthStore();
  const [history, setHistory] = useState<Pick3Result[]>([]);
  const [analysis, setAnalysis] = useState<AdvancedAnalysis | null>(null);
  const [plays, setPlays] = useState<IntelligencePlay[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [profile, setProfile] = useState<Pick3Profile | null>(null);
  const [ledger, setLedger] = useState<Pick3LedgerEntry[]>([]);
  const [showBetDialog, setShowBetDialog] = useState(false);
  const [simResult, setSimResult] = useState<ModelValidationResult | null>(null);

  const [bConfig, setBConfig] = useState<BettingConfig>({
    mode: 'PICK3',
    payout: 500,
    digits: 3,
    maxCombinations: 10,
    riskFactor: 1.0,
    stopLoss: 50.0,
    criticalDrawdown: 30.0
  });

  const [syncState, setSyncState] = useState({
    isSyncing: false,
    lastGlobalSync: undefined,
    sources: []
  });

  const runSimulation = useCallback((hist: Pick3Result[], config: BettingConfig) => {
    if (hist.length < 60) return;
    const backtestEngine = new BacktestEngine(hist);
    const result = backtestEngine.runValidation(config, 1000, 30);
    setSimResult(result);
  }, []);

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

        // Run simulation by default
        runSimulation(hist, currentBConfig);
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
      const response = await fetch('/api/pick3/sync', { method: 'POST' });
      const data = await response.json();
      const error = !response.ok || !data.success ? (data.message || 'Sync failed') : null;
      if (error) throw error;
      toast.success("Sincronización completada");
      fetchData();
    } catch (err) {
      toast.error("Error en sincronización automática");
    } finally {
      setSyncState(s => ({ ...s, isSyncing: false }));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 animate-pulse">
        <div className="w-16 h-16 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-xs font-black uppercase tracking-widest opacity-40 italic">Sincronizando Probabilidades...</p>
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
      <div className="max-w-7xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
        {/* Header & Main Stats */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <h1 className="text-4xl font-black italic tracking-tighter uppercase flex items-center gap-3">
              <BrainCircuit className="w-10 h-10 text-primary" />
              Pick 3 Intelligence <span className="text-primary">v9.0</span>
            </h1>
            <p className="text-xs font-bold uppercase opacity-60 tracking-widest">Auditoría Estadística & Gestión de Bankroll</p>
          </div>

          <div className="flex flex-wrap gap-3">
             <Button
              variant="outline"
              className="rounded-full font-black uppercase h-12 px-6 border-primary/20 hover:bg-primary/5 group"
              onClick={handleSync}
              disabled={syncState.isSyncing}
            >
              <RefreshCw className={cn("w-4 h-4 mr-2", syncState.isSyncing && "animate-spin")} />
              {syncState.isSyncing ? "Sincronizando..." : "Sincronizar"}
            </Button>
            <Button
              className="rounded-full font-black uppercase h-12 px-8 shadow-lg shadow-primary/20 group"
              onClick={() => setShowBetDialog(true)}
            >
              <Plus className="w-4 h-4 mr-2 group-hover:scale-125 transition-transform" /> Registrar Apuesta
            </Button>
          </div>
        </div>

        {/* Hero Card - Next Recommended Play */}
        {plays.length > 0 && profile && (
          <Pick3HeroCard plays={plays} config={bConfig} bankroll={profile.current_bankroll / 100} />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-7 h-auto p-1 bg-muted/30 rounded-[28px] border border-border/50 sticky top-4 z-50 backdrop-blur-md">
            <TabsTrigger value="dashboard" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider">
              <Wallet className="w-3.5 h-3.5 mr-2" /> Dashboard
            </TabsTrigger>
            <TabsTrigger value="prediction" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider">
              <Target className="w-3.5 h-3.5 mr-2" /> Predicciones
            </TabsTrigger>
            <TabsTrigger value="simulation" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider">
              <PlayCircle className="w-3.5 h-3.5 mr-2" /> Simulación
            </TabsTrigger>
            <TabsTrigger value="intel" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider">
              <TrendingUp className="w-3.5 h-3.5 mr-2" /> Análisis
            </TabsTrigger>
            <TabsTrigger value="history" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider">
              <History className="w-3.5 h-3.5 mr-2" /> Histórico
            </TabsTrigger>
            <TabsTrigger value="help" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider bg-primary/5 text-primary">
              <BookOpen className="w-3.5 h-3.5 mr-2" /> Guía de Usuario
            </TabsTrigger>
            <TabsTrigger value="config" className="rounded-full py-3 font-black text-[10px] uppercase tracking-wider">
              <Settings className="w-3.5 h-3.5 mr-2" /> Ajustes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="pt-6">
            {profile && <BankrollDashboard profile={profile} ledger={ledger} />}
          </TabsContent>

          <TabsContent value="prediction" className="pt-6">
             {analysis && <Pick3StrategySection analysis={analysis} plays={plays} />}
          </TabsContent>

          <TabsContent value="simulation" className="pt-6">
             {simResult ? (
                <Pick3SimulationDashboard result={simResult} initialBankroll={1000} />
             ) : (
                <div className="p-12 text-center opacity-40">
                  <PlayCircle className="w-16 h-16 mx-auto mb-4" />
                  <p className="text-sm font-black uppercase">No hay datos suficientes para simular (Mínimo 60 sorteos)</p>
                </div>
             )}
          </TabsContent>

          <TabsContent value="intel" className="pt-6">
             <Pick3Visuals history={history} analysis={analysis || ({} as any)} />
          </TabsContent>

          <TabsContent value="history" className="pt-6 space-y-6">
             <Pick3HistorySection history={history} onRefresh={fetchData} />
             <Pick3ControlPanel syncState={syncState as any} onSync={handleSync} />
          </TabsContent>

          <TabsContent value="help" className="pt-6">
             <Pick3HelpSection />
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
                         <label className="text-[10px] font-black uppercase ml-1">Modo de Juego</label>
                         <select
                            className="w-full h-12 rounded-xl border-border bg-background px-4 text-sm font-black italic uppercase"
                            value={bConfig.mode}
                            onChange={(e) => setBConfig({...bConfig, mode: e.target.value as any})}
                         >
                            <option value="PICK3">Florida Lottery Pick 3 (Official)</option>
                            <option value="LAST2">Terminal / Bolita (Last 2)</option>
                         </select>
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-black uppercase ml-1">Riesgo por Jugada (%)</label>
                         <input
                            type="number" step="0.1"
                            value={bConfig.riskFactor}
                            onChange={(e) => setBConfig({...bConfig, riskFactor: parseFloat(e.target.value)})}
                            className="w-full h-12 rounded-xl border border-border bg-background px-4 font-black text-lg"
                         />
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
