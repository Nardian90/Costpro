"use client";
import React from 'react';
import { BrainCircuit, Activity, Shield, TrendingUp, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AdvancedAnalysis, IntelligencePlay, BettingConfig } from '@/types/pick3';
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Pick3StrategySectionProps {
  analysis: AdvancedAnalysis;
  plays: IntelligencePlay[];
  config?: BettingConfig;
}

export function Pick3StrategySection({ analysis, plays, config }: Pick3StrategySectionProps) {
  const accuracies = analysis.strategyAccuracy || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
      {/* Recommended Plays */}
      <Card className="lg:col-span-2 bg-card border-border/50 shadow-xl rounded-[32px]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              Sugerencias de Análisis
            </CardTitle>
            <CardDescription className="text-[10px] font-bold uppercase opacity-60">Combinaciones basadas en probabilidad histórica oficial</CardDescription>
          </div>
          <Badge className="bg-primary/10 text-primary border-primary/20 font-bold uppercase tracking-widest text-[9px]">Alpha v9</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {plays.map((play, i) => (
              <div key={i} className={cn(
                "p-4 rounded-2xl border transition-all group relative overflow-hidden",
                i === 0 ? "bg-primary/5 border-primary/20 shadow-md" : "bg-muted/20 border-border/50 hover:bg-muted/30"
              )}>
                {i === 0 && (
                  <div className="absolute top-0 right-0 px-3 py-1 bg-primary text-[8px] font-black uppercase text-white rounded-bl-xl italic">
                    Top Alpha
                  </div>
                )}
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-1">
                    {play.combination.map((num, idx) => {
                      // FIX-LAST2 (2026-07-05): primer dígito en transparencia en modo LAST2
                      const isLast2Dimmed = config?.mode === 'LAST2' && idx === 0;
                      return (
                        <div key={idx} className={cn(
                          "w-10 h-10 rounded-xl bg-background border border-primary/20 flex items-center justify-center text-xl font-black italic text-primary group-hover:scale-110 transition-transform shadow-sm",
                          isLast2Dimmed && "opacity-30 border-dashed border-muted-foreground/20 text-muted-foreground scale-90"
                        )}>
                          {num}
                        </div>
                      );
                    })}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase flex items-center justify-end gap-1">
                      Confianza
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="w-3 h-3 opacity-40" />
                        </TooltipTrigger>
                        <TooltipContent className="text-[10px] font-bold max-w-[150px]">Puntuación de 0 a 100 basada en la convergencia de múltiples modelos.</TooltipContent>
                      </Tooltip>
                    </div>
                    <div className="text-lg font-black text-success tracking-tighter">{play.confidence.toFixed(1)}%</div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/20 text-primary bg-primary/5 italic">
                    {play.strategyLabel || "Análisis Estadístico"}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground font-medium leading-relaxed italic opacity-80 line-clamp-2">
                    "{play.justification}"
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Strategy Performance */}
      <Card className="bg-card border-border/50 shadow-xl rounded-[32px]">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            <Activity className="w-4 h-4 text-warning" />
            Rendimiento de Modelos
          </CardTitle>
          <CardDescription className="text-[10px] font-bold uppercase opacity-60">Backtest sobre resultados oficiales</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(accuracies).length > 0 ? (
            Object.entries(accuracies).map(([name, acc]) => (
              <div key={name} className="space-y-2">
                <div className="flex justify-between items-end">
                  <span className="text-[10px] font-bold uppercase text-muted-foreground">{name}</span>
                  <span className="text-xs font-black text-primary italic">{acc.toFixed(1)}% Aciertos</span>
                </div>
                <Progress value={acc} className="h-1.5 bg-muted" />
              </div>
            ))
          ) : (
            <div className="py-8 text-center opacity-40 italic space-y-2">
              <Activity className="w-8 h-8 mx-auto opacity-20" />
              <p className="text-[10px] font-bold uppercase tracking-widest leading-tight">Analizando consistencia de modelos...</p>
            </div>
          )}

          <div className="pt-4 border-t border-border/50 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                <TrendingUp className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase text-muted-foreground flex items-center gap-1">
                  Entropía
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-2.5 h-2.5 opacity-40" />
                    </TooltipTrigger>
                    <TooltipContent className="text-[10px] font-bold max-w-[150px]">Mide el desorden o aleatoriedad. Menor entropía indica patrones más predecibles.</TooltipContent>
                  </Tooltip>
                </div>
                <div className="text-xs font-black italic">{(analysis.entropy || 0).toFixed(3)} bits</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center border border-success/20">
                <Shield className="w-4 h-4 text-success" />
              </div>
              <div>
                <div className="text-[9px] font-bold uppercase text-muted-foreground">Varianza de Datos</div>
                <div className="text-xs font-black italic text-success uppercase">Estable v1.2</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
