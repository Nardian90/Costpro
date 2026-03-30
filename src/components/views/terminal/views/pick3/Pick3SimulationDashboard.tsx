"use client";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target, AlertTriangle, Table as TableIcon, AreaChart } from 'lucide-react';
import { ModelValidationResult } from '@/services/pick3/backtest.engine';
import { cn } from '@/lib/utils';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart as RechartsAreaChart
} from 'recharts';

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
              <h3 className="text-sm font-black uppercase tracking-widest opacity-60 italic">Resultado Final Proyectado</h3>
              <div className="text-5xl lg:text-6xl font-black italic tracking-tighter text-primary">
                {formatMoney(result.finalCapital)}
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">Profit/Loss Total</p>
                <p className={cn("text-2xl font-black italic", result.netProfit >= 0 ? "text-emerald-500" : "text-red-500")}>
                  {result.netProfit >= 0 ? "+" : ""}{formatMoney(result.netProfit)}
                </p>
              </div>
              <div className="h-12 w-px bg-primary/10" />
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase opacity-50">ROI Simulado</p>
                <p className="text-2xl font-black italic text-blue-500">{result.roi.toFixed(1)}%</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-background/50 border border-primary/10">
              <p className="text-[11px] font-bold italic leading-relaxed opacity-80">
                "Empezando con <span className="font-black text-primary">{formatMoney(initialBankroll)}</span> hace 30 días, con esta estrategia hoy tendrías <span className="font-black text-primary">{formatMoney(result.finalCapital)}</span>."
              </p>
            </div>
          </div>

          <div className="p-8 space-y-6">
            <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 opacity-60">
              <AreaChart className="w-4 h-4" /> Curva de Capital (Equity Curve)
            </h3>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsAreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorCap" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                  <XAxis dataKey="draw" hide />
                  <YAxis hide domain={['dataMin - 100', 'dataMax + 100']} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-background border border-border p-3 rounded-2xl shadow-xl">
                            <p className="text-[10px] font-black uppercase opacity-60 mb-1">Sorteo #{payload[0].payload.draw}</p>
                            <p className="text-sm font-black italic text-primary">{formatMoney(payload[0].value as number)}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="capital"
                    stroke="hsl(var(--primary))"
                    strokeWidth={4}
                    fillOpacity={1}
                    fill="url(#colorCap)"
                  />
                </RechartsAreaChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase opacity-50">Drawdown Máximo</p>
                <p className="text-lg font-black text-red-500 italic">{result.maxDrawdown.toFixed(1)}%</p>
              </div>
              <div className="space-y-1">
                <p className="text-[9px] font-black uppercase opacity-50">Aciertos Totales</p>
                <p className="text-lg font-black text-emerald-500 italic">{result.totalWins} / {result.totalBets / 3}</p>
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
          <CardDescription className="text-[10px]">Detalle sorteo a sorteo en la ventana de 30 días</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-muted/10 text-[9px] font-black uppercase tracking-widest opacity-60">
                  <th className="px-6 py-4">Fecha / Turno</th>
                  <th className="px-6 py-4">Sugerencias (Top 3)</th>
                  <th className="px-6 py-4 text-center">Resultado Real</th>
                  <th className="px-6 py-4 text-center">Tipo</th>
                  <th className="px-6 py-4 text-right">P&L</th>
                </tr>
              </thead>
              <tbody className="divide-y border-t">
                {result.dailyHistory.slice().reverse().map((day, i) => (
                  <tr key={i} className={cn("group transition-colors", day.win ? "bg-emerald-500/5" : "hover:bg-muted/30")}>
                    <td className="px-6 py-4">
                      <p className="text-[11px] font-black italic">{day.date}</p>
                      <p className="text-[9px] font-bold uppercase opacity-50">{day.draw_time}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex gap-1">
                        {day.bets.map((b, idx) => (
                          <Badge key={idx} variant="outline" className={cn(
                            "text-[9px] font-black italic rounded-lg px-2",
                            day.win && day.result.join('') === b.combination.join('') ? "bg-emerald-500 text-white border-none" : "bg-muted/50"
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
                            day.win ? "bg-emerald-500 text-white" : "bg-muted border border-border"
                          )}>
                            {n}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {day.win && (
                        <Badge className={cn(
                          "text-[9px] font-black uppercase italic",
                          day.isStraight ? "bg-emerald-600" : "bg-blue-600"
                        )}>
                          {day.isStraight ? "Straight" : "Box"}
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className={cn("text-xs font-black italic", day.profit >= 0 ? "text-emerald-600" : "text-red-500/60")}>
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
