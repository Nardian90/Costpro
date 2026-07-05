'use client';

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ArrowLeft, TrendingUp, Calendar, Activity, Target, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CombinationStats {
  combination: string;
  totalAppearances: number;
  totalBoxAppearances: number;
  expectedAppearances: number;
  expectedBox: number;
  biasPercentage: number;
  lastAppearance: string | null;
  firstAppearance: string | null;
  gapDays: number | null;
  isRandom: boolean;
  confidence: number;
}

interface Props {
  stats: CombinationStats;
  recentAppearances: any[];
}

export default function Pick3CombinationPageClient({ stats, recentAppearances }: Props) {
  const formatMoney = (val: number) => val.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  const digits = stats.combination;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1 text-xs font-black uppercase opacity-60 hover:opacity-100">
          <ArrowLeft className="w-3 h-3" /> Volver a CostPro
        </Link>

        {/* Header */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl md:text-5xl font-black italic tracking-tighter uppercase">
            Pick 3 Florida <span className="text-primary">{digits}</span>
          </h1>
          <p className="text-xs font-bold uppercase tracking-widest opacity-60">
            Historial · Frecuencia · Análisis Estadístico
          </p>
        </div>

        {/* Combination display */}
        <Card className="rounded-[32px] border-2 border-primary/20 bg-primary/5 p-8">
          <div className="flex justify-center gap-3 mb-6">
            {digits.split('').map((d, i) => (
              <div
                key={i}
                className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center text-4xl md:text-5xl font-black italic shadow-lg"
              >
                {d}
              </div>
            ))}
          </div>
          <p className="text-center text-sm font-bold italic opacity-80">
            {stats.totalAppearances === 0
              ? `La combinación ${digits} NO ha aparecido en el histórico analizado`
              : `La combinación ${digits} ha aparecido ${stats.totalAppearances} veces (straight) y ${stats.totalBoxAppearances} veces (box)`}
          </p>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="rounded-[20px] p-4 space-y-1">
            <Target className="w-5 h-5 text-primary" />
            <p className="text-[9px] font-black uppercase opacity-60">Apariciones Straight</p>
            <p className="text-2xl font-black italic">{stats.totalAppearances}</p>
            <p className="text-[9px] opacity-50">Esperadas: {stats.expectedAppearances.toFixed(1)}</p>
          </Card>
          <Card className="rounded-[20px] p-4 space-y-1">
            <Activity className="w-5 h-5 text-primary" />
            <p className="text-[9px] font-black uppercase opacity-60">Apariciones Box</p>
            <p className="text-2xl font-black italic">{stats.totalBoxAppearances}</p>
            <p className="text-[9px] opacity-50">Esperadas: {stats.expectedBox.toFixed(1)}</p>
          </Card>
          <Card className="rounded-[20px] p-4 space-y-1">
            <TrendingUp className={cn("w-5 h-5", stats.biasPercentage > 0 ? "text-emerald-500" : "text-red-500")} />
            <p className="text-[9px] font-black uppercase opacity-60">Sesgo</p>
            <p className={cn("text-2xl font-black italic", stats.biasPercentage > 0 ? "text-emerald-500" : "text-red-500")}>
              {stats.biasPercentage >= 0 ? '+' : ''}{stats.biasPercentage.toFixed(1)}%
            </p>
          </Card>
          <Card className="rounded-[20px] p-4 space-y-1">
            <Calendar className="w-5 h-5 text-primary" />
            <p className="text-[9px] font-black uppercase opacity-60">Última vez</p>
            <p className="text-2xl font-black italic">
              {stats.gapDays !== null ? `${stats.gapDays}d` : 'Nunca'}
            </p>
            <p className="text-[9px] opacity-50">{stats.lastAppearance || '—'}</p>
          </Card>
        </div>

        {/* Honest disclaimer */}
        <Card className={cn(
          "rounded-[24px] border-2 p-5",
          stats.isRandom
            ? "bg-blue-500/5 border-blue-500/30"
            : "bg-amber-500/5 border-amber-500/30"
        )}>
          <div className="flex items-start gap-3">
            <AlertCircle className={cn("w-5 h-5 shrink-0 mt-0.5", stats.isRandom ? "text-blue-500" : "text-amber-500")} />
            <div className="space-y-1">
              <p className="text-xs font-black uppercase tracking-widest opacity-80">
                {stats.isRandom ? 'Distribución Aleatoria Confirmada' : 'Anomalía Estadística Detectada'}
              </p>
              <p className="text-xs leading-relaxed opacity-80">
                {stats.isRandom
                  ? `Los tests estadísticos (chi-cuadrado, KS, runs test, entropía) confirman que los datos de Florida Pick 3 son consistentes con un proceso aleatorio uniforme (confianza ${stats.confidence.toFixed(1)}%). La frecuencia de aparición de ${digits} no difiere significativamente de lo esperado por azar. La ventaja del jugador NO está en predecir, está en gestionar bankroll.`
                  : `Se detectaron anomalías estadísticas en el histórico. La combinación ${digits} podría tener sesgo marginal, pero VERIFICA overfitting antes de aumentar exposición.`}
              </p>
            </div>
          </div>
        </Card>

        {/* Recent appearances */}
        {recentAppearances.length > 0 && (
          <Card className="rounded-[24px] border-border/50">
            <CardHeader>
              <CardTitle className="text-sm font-black uppercase tracking-widest">
                Últimas apariciones de {digits}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {recentAppearances.map((draw, i) => (
                  <div key={i} className="p-3 rounded-xl bg-muted/30 text-center">
                    <p className="text-[10px] font-black uppercase opacity-60">{draw.date}</p>
                    <p className="text-[9px] opacity-50 mb-1">{draw.draw_time}</p>
                    <p className="text-sm font-black italic">{draw.result.join('-')}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* CTA */}
        <Card className="rounded-[24px] border-2 border-primary/30 bg-primary/5 p-6 text-center space-y-4">
          <h2 className="text-xl font-black italic uppercase tracking-tight">
            Análisis completo con IA Cuantitativa
          </h2>
          <p className="text-sm opacity-80 leading-relaxed">
            Accede al módulo Gestor de Riesgo: ensemble de 4 modelos estadísticos,
            4 tests de validación, gestión de bankroll con Kelly adaptativo, y asesor IA
            con rol de Senior Quant Analyst.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/">
              <Button className="rounded-full font-black uppercase h-12 px-6">
                Probar gratis 14 días
              </Button>
            </Link>
            <Link href="/#pricing">
              <Button variant="outline" className="rounded-full font-black uppercase h-12 px-6">
                Ver planes
              </Button>
            </Link>
          </div>
        </Card>

        {/* SEO content */}
        <div className="prose prose-sm dark:prose-invert max-w-none pt-6 space-y-4">
          <h2 className="text-lg font-black uppercase tracking-tight">
            Sobre la combinación {digits} en Florida Pick 3
          </h2>
          <p className="text-sm leading-relaxed opacity-80">
            Florida Pick 3 es un juego de lotería diario con dos sorteos (mediodía y noche).
            Cada sorteo genera un número de 3 dígitos (000-999), dando 1000 combinaciones posibles.
            La probabilidad teórica de que salga cualquier combinación específica (straight) es
            de 1 en 1000 (0.1%), y la probabilidad de un box 6-way es de 1 en 167 (0.6%).
          </p>
          <p className="text-sm leading-relaxed opacity-80">
            En el histórico analizado de {recentAppearances.length > 0 ? `${stats.totalAppearances} apariciones` : 'sin apariciones'} de {digits},
            la frecuencia observada es {stats.biasPercentage >= 0 ? 'superior' : 'inferior'} a la esperada
            en {Math.abs(stats.biasPercentage).toFixed(1)}%. Sin embargo, esta desviación
            {stats.isRandom ? ' NO es estadísticamente significativa según los 4 tests aplicados (chi-cuadrado, Kolmogorov-Smirnov, runs test, entropía de Shannon).' : ' SÍ podría ser estadísticamente significativa, pero debe verificarse con walk-forward analysis.'}
          </p>
          <p className="text-sm leading-relaxed opacity-80">
            <strong>Importante:</strong> Las loterías son juegos de azar con expected value negativo.
            Ningún método estadístico puede garantizar ganancias. CostPro Gestor de Riesgo
            proporciona herramientas de gestión de bankroll y análisis educativo, NO predicciones.
          </p>
        </div>
      </div>
    </div>
  );
}
