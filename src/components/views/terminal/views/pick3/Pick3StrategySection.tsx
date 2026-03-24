"use client";
import React from 'react';
import { BrainCircuit, Activity, Shield, TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AdvancedAnalysis, IntelligencePlay } from '@/types/pick3';

interface Pick3StrategySectionProps {
  analysis: AdvancedAnalysis;
  plays: IntelligencePlay[];
}

export function Pick3StrategySection({ analysis, plays }: Pick3StrategySectionProps) {
  const accuracies = analysis.strategyAccuracy || {};

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
      {/* Recommended Plays */}
      <Card className="lg:col-span-2 bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
              <BrainCircuit className="w-5 h-5 text-primary" />
              JUGADAS RECOMENDADAS
            </CardTitle>
            <CardDescription>Basado en algoritmos de frecuencia y cadenas de Markov</CardDescription>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/20 font-bold animate-pulse">AI-POWERED</Badge>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            {plays.map((play, i) => (
              <div key={i} className="p-4 rounded-xl bg-muted/10 border border-border/50 hover:bg-muted/20 transition-all group">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex gap-1">
                    {play.combination.map((num, idx) => (
                      <div key={idx} className="w-10 h-10 rounded-lg bg-primary/20 border border-primary/40 flex items-center justify-center text-xl font-black italic text-primary group-hover:scale-110 transition-transform">
                        {num}
                      </div>
                    ))}
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] font-bold text-muted-foreground uppercase">Confianza</div>
                    <div className="text-lg font-black text-emerald-400">{play.confidence.toFixed(1)}%</div>
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground font-medium leading-relaxed italic opacity-80">
                  "{play.justification}"
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Strategy Performance */}
      <Card className="bg-background/40 backdrop-blur-md border-border/50 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-sm font-black uppercase tracking-widest italic flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-400" />
            RENDIMIENTO DE ESTRATEGIAS
          </CardTitle>
          <CardDescription>Backtest histórico (últimas 50 muestras)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.entries(accuracies).map(([name, acc]) => (
            <div key={name} className="space-y-2">
              <div className="flex justify-between items-end">
                <span className="text-xs font-bold uppercase text-muted-foreground">{name}</span>
                <span className="text-sm font-black text-primary italic">{acc.toFixed(1)}% Aciertos</span>
              </div>
              <Progress value={acc} className="h-1.5" />
            </div>
          ))}

          <div className="pt-4 border-t border-border/50 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Entropía del Mercado</div>
                <div className="text-sm font-black italic">{(analysis.entropy || 0).toFixed(3)} bits</div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
                <Shield className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-muted-foreground">Varianza Detectada</div>
                <div className="text-sm font-black italic text-emerald-400">Low Risk Area</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
