"use client";
import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Target, Zap, TrendingUp, Info, PlayCircle } from 'lucide-react';
import { IntelligencePlay, BettingConfig } from '@/types/pick3';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Pick3HeroCardProps {
  plays: IntelligencePlay[];
  config: BettingConfig;
  bankroll: number;
}

export function Pick3HeroCard({ plays, config, bankroll }: Pick3HeroCardProps) {
  if (!plays || plays.length === 0) return null;

  const mainPlay = plays[0];
  const alternatives = plays.slice(1, 3);

  const betSize = Math.max(1, Math.floor((bankroll * (config.riskFactor / 100)) * (mainPlay.confidence / 100)));
  const potentialWin = betSize * (config.mode === 'LAST2' ? 80 : 500);

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <Card className="relative overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background rounded-[40px] shadow-2xl group hover:border-primary transition-all duration-500">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:scale-110 transition-transform duration-700">
            <Target className="w-48 h-48 text-primary" />
          </div>

          <CardContent className="p-8 lg:p-12 relative z-10">
            <div className="flex flex-col lg:flex-row gap-12 items-center">
              {/* Left side: The Numbers */}
              <div className="space-y-6 text-center lg:text-left">
                <div className="space-y-1">
                  <Badge className="bg-primary text-primary-foreground font-black uppercase italic px-4 py-1 rounded-full text-[10px] tracking-widest animate-pulse flex items-center gap-2">
                    <PlayCircle className="w-3 h-3" /> Simulación: Top Pick Alpha v9
                  </Badge>
                  <h2 className="text-sm font-bold uppercase opacity-50 tracking-[0.3em] ml-1">Estrategia Dominante</h2>
                </div>

                <div className="flex gap-4 justify-center lg:justify-start">
                  {mainPlay.combination.map((digit, i) => {
                    // FIX-LAST2 (2026-07-05): En modo LAST2, las recomendaciones son
                    // de 2 dígitos y AMBOS son importantes. Solo se dimmea el primer
                    // dígito si la combinación tiene 3 dígitos (modo PICK3 viendo Last2).
                    const isLast2Dimmed = config.mode === 'LAST2' && mainPlay.combination.length === 3 && i === 0;
                    return (
                      <div
                        key={i}
                        className={cn(
                          "w-20 h-24 lg:w-24 lg:h-32 rounded-[32px] bg-background border-4 border-primary/10 flex items-center justify-center text-5xl lg:text-7xl font-black italic text-primary shadow-xl group-hover:border-primary/40 transition-all duration-500",
                          isLast2Dimmed && "opacity-30 border-dashed border-muted-foreground/20 text-muted-foreground scale-90"
                        )}
                      >
                        {digit}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2 justify-center lg:justify-start text-success font-black italic text-sm">
                  <TrendingUp className="w-5 h-5" />
                  Prob. Simulación: {(mainPlay as any).simProb?.toFixed(1) || mainPlay.confidence.toFixed(1)}%
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

                <div className="p-6 rounded-[32px] bg-success/5 border border-success/10 space-y-2 hover:bg-success/10 transition-colors">
                  <p className="text-[10px] font-black uppercase opacity-60">Retorno Potencial</p>
                  <p className="text-4xl font-black italic text-success tracking-tighter">${potentialWin}</p>
                  <p className="text-[10px] font-bold opacity-40 italic">Basado en pago {config.mode === 'LAST2' ? '80x' : '500x'}</p>
                </div>

                <div className="sm:col-span-2 p-6 rounded-[32px] bg-muted/30 border border-border/50 space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Zap className="w-4 h-4 text-warning fill-warning" />
                    <p className="text-[10px] font-black uppercase">Estrategia Aplicada</p>
                  </div>
                  <p className="text-sm font-black italic opacity-80">{mainPlay.strategyLabel || "Análisis Multivariante"}</p>
                  <p className="text-[11px] font-bold italic opacity-40 leading-tight">"{mainPlay.justification}"</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Alternative Picks from Simulation */}
        {alternatives.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {alternatives.map((alt, i) => (
              <Card key={i} className="rounded-[28px] border-border bg-card/40 hover:border-primary/30 transition-all p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex gap-1">
                      {alt.combination.map((d, j) => {
                        const isLast2Dimmed = config.mode === 'LAST2' && alt.combination.length === 3 && j === 0;
                        return (
                          <span key={j} className={cn(
                            "w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center font-black italic text-primary text-sm",
                            isLast2Dimmed && "opacity-30 bg-muted/30 text-muted-foreground"
                          )}>
                            {d}
                          </span>
                        );
                      })}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[8px] font-black uppercase opacity-40">Opción Alternativa {i + 2}</span>
                      <span className="text-[10px] font-black italic text-success">{(alt as any).simProb?.toFixed(1) || alt.confidence.toFixed(1)}% Éxito</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[8px] font-black px-2 py-0 h-5 border-primary/20">{alt.strategyLabel}</Badge>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
