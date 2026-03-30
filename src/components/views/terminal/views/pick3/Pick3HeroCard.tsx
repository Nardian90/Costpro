"use client";
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Zap, TrendingUp, Info } from 'lucide-react';
import { IntelligencePlay, BettingConfig } from '@/types/pick3';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Pick3HeroCardProps {
  play: IntelligencePlay;
  config: BettingConfig;
  bankroll: number;
}

export function Pick3HeroCard({ play, config, bankroll }: Pick3HeroCardProps) {
  // Simple bet sizing logic for the UI
  const betSize = Math.max(1, Math.floor((bankroll * (config.riskFactor / 100)) * (play.confidence / 100)));
  const potentialWin = betSize * (config.mode === 'LAST2' ? 80 : 500);

  return (
    <TooltipProvider>
      <Card className="relative overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background rounded-[40px] shadow-2xl group hover:border-primary transition-all duration-500">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
          <Target className="w-48 h-48 text-primary" />
        </div>

        <CardContent className="p-8 lg:p-12 relative z-10">
          <div className="flex flex-col lg:flex-row gap-12 items-center">
            {/* Left side: The Numbers */}
            <div className="space-y-6 text-center lg:text-left">
              <div className="space-y-1">
                <Badge className="bg-primary text-primary-foreground font-black uppercase italic px-4 py-1 rounded-full text-[10px] tracking-widest animate-pulse">
                  Próxima Jugada Recomendada
                </Badge>
                <h2 className="text-sm font-bold uppercase opacity-50 tracking-[0.3em] ml-1">Top Pick Alpha v9</h2>
              </div>

              <div className="flex gap-4 justify-center lg:justify-start">
                {play.combination.map((digit, i) => (
                  <div
                    key={i}
                    className="w-20 h-24 lg:w-24 lg:h-32 rounded-[32px] bg-background border-4 border-primary/10 flex items-center justify-center text-5xl lg:text-7xl font-black italic text-primary shadow-xl group-hover:border-primary/40 transition-all duration-500"
                  >
                    {digit}
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 justify-center lg:justify-start text-emerald-500 font-black italic text-sm">
                <TrendingUp className="w-5 h-5" />
                Confianza: {play.confidence.toFixed(1)}%
              </div>
            </div>

            {/* Right side: The Action */}
            <div className="flex-1 w-full lg:w-auto grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-6 rounded-[32px] bg-primary/5 border border-primary/10 space-y-2 hover:bg-primary/10 transition-colors">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase opacity-60">Monto Sugerido</p>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 opacity-40" />
                    </TooltipTrigger>
                    <TooltipContent className="bg-background border border-border p-3 rounded-2xl max-w-[200px]">
                      <p className="text-[10px] font-bold leading-relaxed">Calculado en base a tu capital actual (${bankroll.toFixed(0)}) y un factor de riesgo de {config.riskFactor}% ajustado por la confianza del modelo.</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <p className="text-4xl font-black italic text-primary tracking-tighter">${betSize}</p>
                <p className="text-[10px] font-bold opacity-40 italic">Inversión controlada</p>
              </div>

              <div className="p-6 rounded-[32px] bg-emerald-500/5 border border-emerald-500/10 space-y-2 hover:bg-emerald-500/10 transition-colors">
                <p className="text-[10px] font-black uppercase opacity-60">Retorno Potencial</p>
                <p className="text-4xl font-black italic text-emerald-600 tracking-tighter">${potentialWin}</p>
                <p className="text-[10px] font-bold opacity-40 italic">Basado en pago {config.mode === 'LAST2' ? '80x' : '500x'}</p>
              </div>

              <div className="sm:col-span-2 p-6 rounded-[32px] bg-muted/30 border border-border/50 space-y-2">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="w-4 h-4 text-orange-500 fill-orange-500" />
                  <p className="text-[10px] font-black uppercase">Estrategia Aplicada</p>
                </div>
                <p className="text-sm font-black italic opacity-80">{play.strategyLabel || "Análisis Multivariante"}</p>
                <p className="text-[11px] font-bold italic opacity-40 leading-tight">"{play.justification}"</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
