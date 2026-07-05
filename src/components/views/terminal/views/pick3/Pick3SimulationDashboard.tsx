"use client";
import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AreaChart,
  Table as TableIcon,
  Info,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  ShieldAlert,
  Flame,
  Trophy,
  Activity,
  Percent,
  DollarSign,
  Scale,
} from 'lucide-react';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { BettingConfig } from '@/types/pick3';
import { cn } from '@/lib/utils';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  ReferenceLine,
  AreaChart as RechartsAreaChart,
} from 'recharts';
import {
  Tooltip as UI_Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Pick3SimulationDashboardProps {
  result: ModelValidationResult;
  initialBankroll: number;
  config?: BettingConfig;
}

export function Pick3SimulationDashboard({ result, initialBankroll, config }: Pick3SimulationDashboardProps) {
  // FIX-BITACORA-FILTER (2026-07-05): filtro de la bitácora, default 'straights' (solo aciertos straight)
  const [bitacoraFilter, setBitacoraFilter] = useState<'all' | 'wins' | 'straights' | 'boxes' | 'losses'>('straights');

  const filteredDailyHistory = useMemo(() => {
    const reversed = result.dailyHistory.slice().reverse();
    switch (bitacoraFilter) {
      case 'wins':
        return reversed.filter(d => d.win);
      case 'straights':
        return reversed.filter(d => d.win && d.isStraight);
      case 'boxes':
        return reversed.filter(d => d.win && d.isBox);
      case 'losses':
        return reversed.filter(d => !d.win);
      default:
        return reversed;
    }
  }, [result.dailyHistory, bitacoraFilter]);

  const chartData = result.equityCurve.map((value, index) => ({
    draw: index,
    capital: value,
    profit: value - initialBankroll,
  }));

  const formatMoney = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  const formatPercent = (val: number) => `${val >= 0 ? '+' : ''}${val.toFixed(2)}%`;

  // === Calcular min/max para escalar bien el gráfico ===
  const minCapital = Math.min(...result.equityCurve, initialBankroll);
  const maxCapital = Math.max(...result.equityCurve, initialBankroll);
  const range = maxCapital - minCapital;
  const padding = Math.max(range * 0.15, 50);
  const yMin = Math.floor((minCapital - padding) / 50) * 50;
  const yMax = Math.ceil((maxCapital + padding) / 50) * 50;

  // === Overfitting / Honestidad badges ===
  const isOverfitting = result.isOverfitting === true;
  const isRandom = result.statisticalTests?.isRandom ?? false;
  const statsConfidence = result.statisticalTests?.confidence ?? 0;
  const driftDetected = result.regimeChange?.driftDetected ?? false;

  // === CAGR con IC ===
  const cagr = result.cagr ?? 0;
  const ciLower = result.cagrConfidenceInterval?.lower ?? cagr;
  const ciUpper = result.cagrConfidenceInterval?.upper ?? cagr;

  // === Interpretación honesta ===
  const honestVerdict = (): { label: string; color: string; icon: any; text: string } => {
    if (isOverfitting) {
      return {
        label: 'OVERFITTING DETECTADO',
        color: 'text-red-500 bg-red-500/10 border-red-500/30',
        icon: AlertTriangle,
        text: 'Los resultados simulados son estadísticamente sospechosos. ROI anormalmente alto con muestra pequeña. NO confíes en estos números hasta validar con más datos fuera de muestra.',
      };
    }
    if (isRandom && Math.abs(result.roi) < 50) {
      return {
        label: 'CONSISTENTE CON AZAR',
        color: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
        icon: ShieldCheck,
        text: `Los tests estadísticos confirman aleatoriedad (confianza ${statsConfidence.toFixed(1)}%). El ROI de ${result.roi.toFixed(1)}% es atribuible a varianza muestral, no a edge predictivo. La ventaja del jugador está en gestionar bankroll, no en predecir.`,
      };
    }
    if (!isRandom && result.roi > 30) {
      return {
        label: 'EDGE POTENCIAL DETECTADO',
        color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
        icon: ShieldAlert,
        text: 'Los tests estadísticos detectaron anomalías. Hay patrón potencialmente explotable, pero VERIFICA con walk-forward analysis antes de aumentar exposición. Podría ser overfitting.',
      };
    }
    return {
      label: 'RESULTADO NEUTRO',
      color: 'text-muted-foreground bg-muted/30 border-border',
      icon: Activity,
      text: 'No hay señal estadística fuerte en ninguna dirección. La estrategia se comporta como se esperaría de un proceso aleatorio con ligera varianza.',
    };
  };

  const verdict = honestVerdict();
  const VerdictIcon = verdict.icon;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* === HONESTY BANNER === */}
      <Card className={cn("rounded-[24px] border-2 p-5", verdict.color)}>
        <div className="flex items-start gap-4">
          <div className="shrink-0 mt-0.5">
            <VerdictIcon className="w-6 h-6" />
          </div>
          <div className="flex-1 space-y-1">
            <p className="text-[11px] font-black uppercase tracking-widest">{verdict.label}</p>
            <p className="text-sm font-medium leading-relaxed opacity-90">{verdict.text}</p>
          </div>
        </div>
      </Card>

      {/* === HIGH IMPACT SUMMARY === */}
      <Card className="rounded-[40px] bg-card border-2 border-primary/10 overflow-hidden shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* LADO IZQUIERDO: Números */}
          <div className="p-6 lg:p-10 space-y-6 border-b lg:border-b-0 lg:border-r border-primary/5 bg-primary/5">
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-widest opacity-60 italic flex items-center gap-2">
                Capital Final Proyectado
                <UI_Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[10px] font-bold max-w-[200px]">
                    Simulación backtest de los últimos {result.periodDays} días siguiendo las 3 mejores recomendaciones diarias del motor estadístico.
                  </TooltipContent>
                </UI_Tooltip>
              </h3>
              <div className="text-5xl lg:text-6xl font-black italic tracking-tighter text-primary">
                {formatMoney(result.finalCapital)}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">P&L Total</p>
                <p className={cn("text-2xl font-black italic", result.netProfit >= 0 ? "text-success" : "text-destructive")}>
                  {result.netProfit >= 0 ? "+" : ""}{formatMoney(result.netProfit)}
                </p>
              </div>
              <div className="h-12 w-px bg-primary/10" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">Retorno Total</p>
                <p className={cn("text-2xl font-black italic", result.roi >= 0 ? "text-success" : "text-destructive")}>
                  {formatPercent(result.roi)}
                </p>
              </div>
              <div className="h-12 w-px bg-primary/10" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">CAGR Anualizado</p>
                <p className={cn("text-2xl font-black italic", cagr >= 0 ? "text-success" : "text-destructive")}>
                  {formatPercent(cagr)}
                </p>
              </div>
            </div>

            {/* FIX-LAYOUT (2026-07-05): Métricas cuantitativas integradas aquí para reducir espacios muertos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2 rounded-xl bg-background/50 border border-border/30 text-center">
                <p className="text-[8px] font-black uppercase opacity-50">Sharpe</p>
                <p className={cn("text-base font-black italic", result.sharpeRatio >= 1 ? "text-success" : result.sharpeRatio < 0 ? "text-destructive" : "")}>
                  {result.sharpeRatio.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-background/50 border border-border/30 text-center">
                <p className="text-[8px] font-black uppercase opacity-50">Sortino</p>
                <p className={cn("text-base font-black italic", result.sortinoRatio >= 1 ? "text-success" : result.sortinoRatio < 0 ? "text-destructive" : "")}>
                  {result.sortinoRatio.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-background/50 border border-border/30 text-center">
                <p className="text-[8px] font-black uppercase opacity-50">Calmar</p>
                <p className={cn("text-base font-black italic", result.calmarRatio >= 1 ? "text-success" : result.calmarRatio < 0 ? "text-destructive" : "")}>
                  {result.calmarRatio.toFixed(2)}
                </p>
              </div>
              <div className="p-2 rounded-xl bg-background/50 border border-border/30 text-center">
                <p className="text-[8px] font-black uppercase opacity-50">Profit Factor</p>
                <p className={cn("text-base font-black italic", result.profitFactor >= 1.5 ? "text-success" : result.profitFactor < 1 ? "text-destructive" : "")}>
                  {result.profitFactor >= 999 ? '∞' : result.profitFactor.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Confidence interval */}
            {result.cagrConfidenceInterval && (
              <div className="p-2 rounded-xl bg-background/50 border border-primary/10">
                <p className="text-[9px] font-black uppercase opacity-60 mb-1">IC 95% (CAGR)</p>
                <p className="text-xs font-black italic">
                  [{ciLower.toFixed(1)}% , {ciUpper.toFixed(1)}%]
                </p>
              </div>
            )}

            <div className="p-4 rounded-2xl bg-background/50 border border-primary/10">
              <p className="text-[11px] font-bold italic leading-relaxed opacity-80">
                "Empezando con <span className="font-black text-primary">{formatMoney(initialBankroll)}</span> hace {result.periodDays} días, con esta estrategia hoy tendrías <span className="font-black text-primary">{formatMoney(result.finalCapital)}</span>. La simulación asume ejecución perfecta sin costos de transacción."
              </p>
            </div>
          </div>

          {/* LADO DERECHO: Curva de Capital ARREGLADA */}
          <div className="p-4 sm:p-6 lg:p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 opacity-60">
                <AreaChart className="w-4 h-4" /> Curva de Capital
              </h3>
              <Badge variant="outline" className="text-[9px] font-black uppercase">
                {result.equityCurve.length} sorteos
              </Badge>
            </div>

            {/* === FIX: Gráfico más grande y mejor escalado === */}
            <div className="h-[360px] sm:h-[400px] w-full bg-background/30 rounded-2xl border border-border/30 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsAreaChart data={chartData} margin={{ top: 15, right: 20, bottom: 15, left: 10 }}>
                  <defs>
                    <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorCapNeg" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.15} />
                  <XAxis
                    dataKey="draw"
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    stroke="currentColor"
                    opacity={0.4}
                    tickFormatter={(v) => `#${v}`}
                  />
                  <YAxis
                    domain={[yMin, yMax]}
                    tick={{ fontSize: 11, fill: 'currentColor' }}
                    stroke="currentColor"
                    opacity={0.5}
                    width={70}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                  />
                  {/* Línea de referencia: capital inicial */}
                  <ReferenceLine
                    y={initialBankroll}
                    stroke="currentColor"
                    strokeDasharray="5 5"
                    opacity={0.4}
                    label={{
                      value: `Inicial: ${formatMoney(initialBankroll)}`,
                      position: 'insideTopLeft',
                      fontSize: 10,
                      fill: 'currentColor',
                      opacity: 0.6,
                    }}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const data = payload[0].payload;
                        const isProfit = data.capital >= initialBankroll;
                        return (
                          <div className="bg-card border border-border p-3 rounded-2xl shadow-xl">
                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Sorteo #{data.draw}</p>
                            <p className={cn("text-sm font-black italic", isProfit ? "text-emerald-500" : "text-red-500")}>
                              {formatMoney(data.capital)}
                            </p>
                            <p className="text-[9px] opacity-60 mt-0.5">
                              {data.profit >= 0 ? '+' : ''}{formatMoney(data.profit)} vs inicial
                            </p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="capital"
                    stroke="#22c55e"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorCap)"
                    dot={false}
                    activeDot={{ r: 6, fill: '#22c55e', stroke: 'white', strokeWidth: 2 }}
                  />
                </RechartsAreaChart>
              </ResponsiveContainer>
            </div>

            {/* Métricas rápidas del drawdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-muted/30">
                <p className="text-[9px] font-black uppercase opacity-50">Drawdown Máximo</p>
                <p className="text-lg font-black text-destructive italic">
                  {result.maxDrawdown.toFixed(2)}%
                </p>
                <p className="text-[8px] opacity-50 mt-0.5">
                  {result.maxDrawdownDuration || 0} sorteos en recovery
                </p>
              </div>
              <div className="p-3 rounded-xl bg-muted/30">
                <p className="text-[9px] font-black uppercase opacity-50">Hit Rate</p>
                <p className="text-lg font-black text-success italic">
                  {result.totalWins} / {result.totalBets / 3 || 0}
                </p>
                <p className="text-[8px] opacity-50 mt-0.5">
                  {result.hitRate.toFixed(1)}% acierto
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* FIX-LAYOUT (2026-07-05): Quant Metrics Grid removido — ya integrado en la sección de Capital Final */}

      {/* === RISK METRICS GRID === */}
      <Card className="rounded-[28px] border-border/50 p-5">
        <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2 mb-4">
          <ShieldCheck className="w-4 h-4 text-primary" /> Métricas de Riesgo & Gestión
        </CardTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60">Recovery Factor</p>
            <p className={cn("text-xl font-black italic", result.recoveryFactor > 1 ? "text-success" : "text-amber-500")}>
              {result.recoveryFactor.toFixed(2)}
            </p>
            <p className="text-[8px] opacity-50">Net profit / MaxDD</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60">Prob. Ruina</p>
            <p className={cn("text-xl font-black italic", (result.probabilityOfRuin || 0) < 0.1 ? "text-success" : (result.probabilityOfRuin || 0) > 0.5 ? "text-destructive" : "text-amber-500")}>
              {((result.probabilityOfRuin || 0) * 100).toFixed(1)}%
            </p>
            <p className="text-[8px] opacity-50">Gambler's ruin</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60">Kelly Safe</p>
            <p className="text-xl font-black italic text-primary">
              {((result.kellyFraction || 0) * 100).toFixed(2)}%
            </p>
            <p className="text-[8px] opacity-50">25% Kelly cap</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60">Expectancy</p>
            <p className={cn("text-xl font-black italic", (result.expectancy || 0) > 0 ? "text-success" : "text-destructive")}>
              {formatMoney(result.expectancy || 0)}
            </p>
            <p className="text-[8px] opacity-50">Por trade</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-border/30">
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-500" /> Win Streak
            </p>
            <p className="text-lg font-black italic text-success">{result.winStreak}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60 flex items-center gap-1">
              <TrendingDown className="w-3 h-3 text-destructive" /> Loss Streak
            </p>
            <p className="text-lg font-black italic text-destructive">{result.lossStreak}</p>
          </div>
          <div className="space-y-1">
            <p className="text-[9px] font-black uppercase opacity-60">Volatilidad</p>
            <p className="text-lg font-black italic">
              {((result.volatility || 0) * 100).toFixed(1)}%
            </p>
          </div>
        </div>
      </Card>

      {/* === STATISTICAL TESTS PANEL (NEW) === */}
      {result.statisticalTests && (
        <Card className="rounded-[28px] border-border/50 overflow-hidden">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
              <Scale className="w-4 h-4 text-primary" /> Validación Estadística
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase opacity-60">
              4 tests sobre {result.equityCurve.length - 1} sorteos · Confianza global: {statsConfidence.toFixed(1)}%
            </CardDescription>
          </CardHeader>
          <CardContent className="p-5 space-y-4">
            <div className={cn(
              "p-4 rounded-2xl border text-xs font-medium leading-relaxed",
              isRandom ? "bg-blue-500/5 border-blue-500/30 text-blue-600 dark:text-blue-400"
                       : "bg-amber-500/5 border-amber-500/30 text-amber-600 dark:text-amber-400"
            )}>
              {result.statisticalTests.summary}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {[
                { test: result.statisticalTests.chiSquare, label: 'Chi-cuadrado' },
                { test: result.statisticalTests.kolmogorovSmirnov, label: 'Kolmogorov-Smirnov' },
                { test: result.statisticalTests.runsTest, label: 'Runs Test' },
                { test: result.statisticalTests.entropy, label: 'Entropía' },
              ].map(({ test, label }, i) => (
                <div
                  key={i}
                  className={cn(
                    "p-3 rounded-xl border",
                    test.isSignificant
                      ? "bg-amber-500/5 border-amber-500/30"
                      : "bg-emerald-500/5 border-emerald-500/30"
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-[10px] font-black uppercase opacity-70">{label}</p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[9px] font-black uppercase",
                        test.isSignificant
                          ? "bg-amber-500/20 text-amber-600 border-amber-500/30"
                          : "bg-emerald-500/20 text-emerald-600 border-emerald-500/30"
                      )}
                    >
                      {test.isSignificant ? 'ANOMALÍA' : 'OK'}
                    </Badge>
                  </div>
                  <p className="text-[10px] opacity-70">
                    p-value: <span className="font-black">{test.pValue.toFixed(4)}</span>
                    {' · '}
                    stat: <span className="font-black">{test.statistic.toFixed(3)}</span>
                  </p>
                  <p className="text-[9px] opacity-60 mt-1 leading-tight">{test.interpretation}</p>
                </div>
              ))}
            </div>

            {/* Regime change alert */}
            {driftDetected && (
              <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/30 flex items-start gap-2">
                <Activity className="w-4 h-4 text-purple-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-black uppercase text-purple-500">Cambio de Régimen Detectado</p>
                  <p className="text-[10px] opacity-70 leading-relaxed mt-0.5">
                    {result.regimeChange?.description}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* === PROFIT/LOSS DETAIL === */}
      <Card className="rounded-[32px] border-border shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-primary" /> Bitácora de Aciertos Simulados
              </CardTitle>
              <CardDescription className="text-[10px] font-bold uppercase opacity-60">
                {filteredDailyHistory.length} de {result.dailyHistory.length} sorteos · ventana de {result.periodDays} días
              </CardDescription>
            </div>
            {/* FIX-BITACORA-FILTER (2026-07-05): filtros con default 'straights' */}
            <div className="flex items-center gap-1 bg-background/50 p-1 rounded-full border border-border/30 flex-wrap">
              {([
                { id: 'straights', label: 'Straights', count: result.dailyHistory.filter(d => d.win && d.isStraight).length },
                { id: 'boxes', label: 'Boxes', count: result.dailyHistory.filter(d => d.win && d.isBox).length },
                { id: 'wins', label: 'Todos aciertos', count: result.dailyHistory.filter(d => d.win).length },
                { id: 'losses', label: 'Pérdidas', count: result.dailyHistory.filter(d => !d.win).length },
                { id: 'all', label: 'Todos', count: result.dailyHistory.length },
              ] as const).map(f => (
                <button
                  key={f.id}
                  onClick={() => setBitacoraFilter(f.id)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[9px] font-black uppercase transition-all whitespace-nowrap",
                    bitacoraFilter === f.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label} <span className="opacity-60">({f.count})</span>
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredDailyHistory.length === 0 ? (
            <div className="p-12 text-center opacity-40">
              <TableIcon className="w-12 h-12 mx-auto mb-3" />
              <p className="text-xs font-black uppercase">No hay registros para este filtro</p>
            </div>
          ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/10 text-[9px] font-black uppercase tracking-widest opacity-60">
                  <th className="px-6 py-4">Fecha / Turno</th>
                  <th className="px-6 py-4">Sugerencias (Top 3)</th>
                  <th className="px-6 py-4 text-center">Resultado Real</th>
                  <th className="px-6 py-4 text-center">Modelo Ganador</th>
                  <th className="px-6 py-4 text-right">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y border-t">
                {filteredDailyHistory.map((day, i) => (
                  <tr key={i} className={cn("group transition-colors", day.win ? "bg-success/5" : "hover:bg-muted/30")}>
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-black italic">{day.date}</p>
                      <p className="text-[9px] font-bold uppercase opacity-50">{day.draw_time}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {day.bets.map((b, idx) => (
                          <Badge key={idx} variant="outline" className={cn(
                            "text-[9px] font-black italic rounded-lg px-2",
                            day.win && (day.result.join('') === b.combination.join('') || [...day.result].sort().join('') === [...b.combination].sort().join('')) ? "bg-success text-white border-none" : "bg-muted/50"
                          )}>
                            {b.combination.join('')}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-1">
                        {day.result.map((n, idx) => {
                          // FIX-LAST2 (2026-07-05): en modo LAST2, primer dígito del resultado real (3 dígitos) en transparencia
                          const isLast2Dimmed = config?.mode === 'LAST2' && day.result.length === 3 && idx === 0;
                          return (
                            <div key={idx} className={cn(
                              "w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black italic",
                              day.win ? "bg-success text-white" : "bg-muted border border-border",
                              isLast2Dimmed && "opacity-30 border-dashed"
                            )}>
                              {n}
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {day.win ? (
                        <div className="flex flex-col items-center gap-1">
                          <Badge className={cn(
                            "text-[9px] font-black uppercase italic",
                            day.isStraight ? "bg-success" : "bg-primary"
                          )}>
                            {day.isStraight ? "Straight" : "Box"}
                          </Badge>
                          <span className="text-[8px] font-black text-muted-foreground uppercase italic">{day.winningStrategy || "Estadístico"}</span>
                        </div>
                      ) : (
                        <span className="text-[10px] font-bold opacity-20 uppercase">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className={cn("text-xs font-black italic", day.profit >= 0 ? "text-success" : "text-destructive/60")}>
                        {day.profit >= 0 ? "+" : ""}{day.profit.toFixed(0)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
