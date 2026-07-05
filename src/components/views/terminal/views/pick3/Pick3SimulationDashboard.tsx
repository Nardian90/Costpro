"use client";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Target, AreaChart, Table as TableIcon, Info, HelpCircle } from 'lucide-react';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { cn } from '@/lib/utils';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart as RechartsAreaChart
} from 'recharts';
import {
  Tooltip as UI_Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Pick3SimulationDashboardProps {
  result: ModelValidationResult;
  initialBankroll: number;
}

export function Pick3SimulationDashboard({ result, initialBankroll }: Pick3SimulationDashboardProps) {
  const chartData = result.equityCurve.map((value, index) => ({
    draw: index,
    capital: value,
    profit: value - initialBankroll
  }));

  const formatMoney = (val: number) =>
    val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {/* High Impact Summary */}
      <Card className="rounded-[40px] bg-card border-2 border-primary/10 overflow-hidden shadow-2xl">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="p-8 lg:p-12 space-y-6 border-b lg:border-b-0 lg:border-r border-primary/5 bg-primary/5">
            <div className="space-y-2">
              <h3 className="text-sm font-black uppercase tracking-widest opacity-60 italic flex items-center gap-2">
                Resultado Final Proyectado
                <UI_Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="w-3 h-3" />
                  </TooltipTrigger>
                  <TooltipContent className="text-[10px] font-bold max-w-[200px]">Simulamos apostar en los últimos 30 días siguiendo estrictamente las 3 mejores recomendaciones de la IA cada día.</TooltipContent>
                </UI_Tooltip>
              </h3>
              <div className="text-5xl lg:text-6xl font-black italic tracking-tighter text-primary">
                {formatMoney(result.finalCapital)}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">Profit/Loss Total</p>
                <p className={cn("text-2xl font-black italic", result.netProfit >= 0 ? "text-success" : "text-destructive")}>
                  {result.netProfit >= 0 ? "+" : ""}{formatMoney(result.netProfit)}
                </p>
              </div>
              <div className="h-12 w-px bg-primary/10" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">ROI Simulado</p>
                <p className="text-2xl font-black italic text-primary">{result.roi.toFixed(1)}%</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-background/50 border border-primary/10">
              <p className="text-[11px] font-bold italic leading-relaxed opacity-80">
                "Empezando con <span className="font-black text-primary">{formatMoney(initialBankroll)}</span> hace 30 días, con esta estrategia hoy tendrías <span className="font-black text-primary">{formatMoney(result.finalCapital)}</span>."
              </p>
            </div>
          </div>

          <div className="p-4 sm:p-8 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 opacity-60">
              <AreaChart className="w-4 h-4" /> Curva de Capital (Equity Curve)
            </h3>
            <div className="h-[280px] sm:h-[300px] w-full bg-background/30 rounded-2xl border border-border/30 p-3">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsAreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <defs>
                    <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.4}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" opacity={0.1} />
                  <XAxis dataKey="draw" hide />
                  <YAxis
                    domain={['dataMin - 100', 'dataMax + 100']}
                    tick={{ fontSize: 10, fill: 'currentColor' }}
                    stroke="currentColor"
                    opacity={0.4}
                    width={60}
                    tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-card border border-border p-3 rounded-2xl shadow-xl">
                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Sorteo #{payload[0].payload.draw}</p>
                            <p className="text-sm font-black italic text-emerald-500">{formatMoney(payload[0].value as number)}</p>
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
                    activeDot={{ r: 5, fill: '#22c55e' }}
                  />
                </RechartsAreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase opacity-50">Drawdown Máximo</p>
                <p className="text-lg font-black text-destructive italic">{result.maxDrawdown.toFixed(1)}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase opacity-50">Aciertos Totales</p>
                <p className="text-lg font-black text-success italic">{result.totalWins} / {result.totalBets / 3}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Accuracy Table */}
      <Card className="rounded-[32px] border-border shadow-lg overflow-hidden">
        <CardHeader className="border-b border-border/50 bg-muted/20">
          <CardTitle className="text-sm font-black uppercase tracking-widest flex items-center gap-2">
            <TableIcon className="w-4 h-4 text-primary" /> Bitácora de Aciertos Simulados
          </CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase opacity-60">Detalle sorteo a sorteo en la ventana de 30 días</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
                {result.dailyHistory.slice().reverse().map((day, i) => (
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
                        {day.result.map((n, idx) => (
                          <div key={idx} className={cn(
                            "w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black italic",
                            day.win ? "bg-success text-white" : "bg-muted border border-border"
                          )}>
                            {n}
                          </div>
                        ))}
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
        </CardContent>
      </Card>
    </div>
  );
}
