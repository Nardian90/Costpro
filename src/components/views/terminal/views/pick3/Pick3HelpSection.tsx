"use client";
import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BookOpen, HelpCircle, Target, ShieldCheck, Zap, Info, ArrowRight, Wallet, PieChart } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

export function Pick3HelpSection() {
  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000 pb-12">
      {/* Glossary Hero */}
      <Card className="rounded-[40px] border-none bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-2xl overflow-hidden">
        <CardContent className="p-12 relative">
          <div className="absolute top-0 right-0 p-12 opacity-10">
            <BookOpen className="w-64 h-64" />
          </div>
          <div className="relative z-10 space-y-4 max-w-2xl">
            <Badge className="bg-white/20 text-white font-black uppercase tracking-widest px-4 py-1 rounded-full border-none">
              Guía del Usuario Pick 3 v9.0
            </Badge>
            <h2 className="text-5xl font-black italic tracking-tighter leading-none">
              Domina la Probabilidad <br />con Inteligencia Artificial.
            </h2>
            <p className="text-sm font-bold opacity-80 leading-relaxed italic">
              Esta plataforma utiliza algoritmos avanzados de teoría de juegos, cadenas de Markov y estadística bayesiana para identificar patrones en la Florida Lottery. A continuación, todo lo que necesitas saber.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Quick Start Guide */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-[32px] bg-background border border-border/50 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
             <Target className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-black uppercase italic text-sm">1. Elige tu Jugada</h3>
          <p className="text-xs font-medium opacity-60 leading-relaxed italic">Revisa la "Hero Card" en el dashboard o la pestaña de Predicciones. El sistema resalta las 3 combinaciones con mayor convergencia estadística hoy.</p>
        </div>
        <div className="p-6 rounded-[32px] bg-background border border-border/50 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
             <Wallet className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="font-black uppercase italic text-sm">2. Gestiona el Capital</h3>
          <p className="text-xs font-medium opacity-60 leading-relaxed italic">No apuestes al azar. Usa el "Monto Sugerido" calculado por nuestro Bankroll Manager basado en tu capital actual y el riesgo configurado.</p>
        </div>
        <div className="p-6 rounded-[32px] bg-background border border-border/50 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
             <PieChart className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-black uppercase italic text-sm">3. Valida el Modelo</h3>
          <p className="text-xs font-medium opacity-60 leading-relaxed italic">¿Dudas de la IA? Ve a la pestaña de "Simulación". Verás qué habría pasado si hubieras seguido nuestras 3 sugerencias en los últimos 30 días.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Terminology */}
        <Card className="lg:col-span-2 rounded-[32px] border-border shadow-lg">
          <CardHeader>
            <CardTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-3 italic">
              <Info className="w-6 h-6 text-primary" /> Glosario de Términos
            </CardTitle>
            <CardDescription className="text-xs font-bold uppercase opacity-60 italic">Conceptos clave para entender tus jugadas</CardDescription>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="w-full">
              <AccordionItem value="straight" className="border-border">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Target className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black uppercase italic">Straight (Exacto)</p>
                      <p className="text-[10px] font-bold opacity-50 uppercase">Pago: 500x | Probabilidad: 0.1%</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs font-medium leading-relaxed opacity-80 px-4 pb-4 italic space-y-2">
                  <p>Es la apuesta al número exacto en el orden exacto. Es la forma más difícil de ganar pero la que mejor paga (500 a 1). </p>
                  <p className="font-black text-primary">Ejemplo: Juegas 123 y sale 123.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="box" className="border-border">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                      <Zap className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black uppercase italic">Box (Combinado)</p>
                      <p className="text-[10px] font-bold opacity-50 uppercase">Pago: 80x | Probabilidad: 0.6%</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs font-medium leading-relaxed opacity-80 px-4 pb-4 italic space-y-2">
                  <p>Ganas si tus números salen en cualquier orden. La probabilidad de éxito es mucho mayor (aprox 1 de cada 167 sorteos para números de 3 dígitos distintos).</p>
                  <p className="font-black text-blue-600">Ejemplo: Juegas 123 en Box y sale 321, 213, 132, etc.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="bankroll" className="border-border">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20">
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black uppercase italic">Gestión de Bankroll</p>
                      <p className="text-[10px] font-bold opacity-50 uppercase">Regla de Oro: Nunca arriesgues más del 2%</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs font-medium leading-relaxed opacity-80 px-4 pb-4 italic">
                  El "Bankroll" es tu capital total destinado al juego. El sistema calcula automáticamente cuánto apostar basándose en tu capital actual y el nivel de confianza de la predicción para evitar que pierdas todo tu dinero en una mala racha. <span className="font-black text-emerald-600">Es el secreto de los apostadores profesionales.</span>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        {/* Model Explanations */}
        <Card className="rounded-[32px] border-border shadow-lg bg-muted/20">
          <CardHeader>
            <CardTitle className="text-xl font-black uppercase tracking-tighter italic flex items-center gap-3">
              <HelpCircle className="w-6 h-6 text-primary" /> Modelos IA
            </CardTitle>
            <CardDescription className="text-xs font-bold uppercase opacity-60 italic">¿Cómo calculamos los números?</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2 group">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px] font-black uppercase border-primary/20 text-primary">Rundown 123 / 317</Badge>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-bold italic opacity-70 leading-tight">
                Técnica matemática que suma secuencias específicas al último resultado para encontrar "armónicos" numéricos que suelen repetirse en ciclos cortos.
              </p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px] font-black uppercase border-blue-500/20 text-blue-600">Ley de Tercios</Badge>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-bold italic opacity-70 leading-tight">
                Principio estadístico que dicta que en 30 sorteos, aproximadamente 1/3 de los números no saldrán, 1/3 saldrán una vez y 1/3 se repetirán. Filtramos los números "saturados".
              </p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px] font-black uppercase border-orange-500/20 text-orange-600">Cadenas de Markov</Badge>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-bold italic opacity-70 leading-tight">
                Analizamos la probabilidad de que un dígito 'X' sea seguido por un dígito 'Y' basándonos en toda la historia de la lotería de Florida.
              </p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px] font-black uppercase border-emerald-500/20 text-emerald-600">Tic-Tac-Toe Grid</Badge>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-bold italic opacity-70 leading-tight">
                Método visual clásico que colocamos en una matriz 3x3 los resultados recientes para identificar patrones diagonales y verticales de alta recurrencia.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="rounded-[32px] border-none bg-muted/30 p-8 text-center italic">
        <p className="text-xs font-black uppercase opacity-40">"La suerte es lo que sucede cuando la preparación encuentra la oportunidad."</p>
      </Card>
    </div>
  );
}
