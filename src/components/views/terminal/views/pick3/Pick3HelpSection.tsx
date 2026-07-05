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
              Guía del Gestor de Riesgo
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
          <p className="text-xs font-medium opacity-60 leading-relaxed italic">Revisa la tarjeta principal en el Dashboard o la pestaña de Predicciones. El sistema resalta las 3 combinaciones con mayor convergencia estadística hoy.</p>
        </div>
        <div className="p-6 rounded-[32px] bg-background border border-border/50 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-success/10 flex items-center justify-center">
             <Wallet className="w-6 h-6 text-success" />
          </div>
          <h3 className="font-black uppercase italic text-sm">2. Gestiona el Capital</h3>
          <p className="text-xs font-medium opacity-60 leading-relaxed italic">No apuestes al azar. Usa el "Monto Sugerido" calculado por nuestro Bankroll Manager basado en tu capital actual y el riesgo configurado.</p>
        </div>
        <div className="p-6 rounded-[32px] bg-background border border-border/50 shadow-sm space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
             <PieChart className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-black uppercase italic text-sm">3. Valida el Modelo</h3>
          <p className="text-xs font-medium opacity-60 leading-relaxed italic">¿Dudas de la IA? Ve a la pestaña de "Simulación". Verás qué habría pasado si hubieras seguido nuestras 3 sugerencias en los últimos 30 días.</p>
        </div>
      </div>

      {/* FIX-GUIDE (2026-07-05): sección crítica sobre la realidad estadística de la lotería */}
      <Card className="rounded-[32px] border-2 border-amber-500/30 bg-amber-500/5">
        <CardHeader>
          <CardTitle className="text-base font-black uppercase tracking-tight flex items-center gap-2 text-amber-600">
            <ShieldCheck className="w-5 h-5" /> La Realidad Estadística: ¿Cuánto se Puede Ganar?
          </CardTitle>
          <CardDescription className="text-[11px] font-bold uppercase opacity-70">
            Lee esto ANTES de apostar. Es la verdad matemática que ningún "gurú" te dice.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-[12px] leading-relaxed">
          <div className="space-y-2">
            <p className="font-black uppercase text-[10px] text-amber-600">Las matemáticas no mienten</p>
            <p className="opacity-80">
              Pick 3 tiene <strong>1000 combinaciones posibles</strong> (000-999). La probabilidad de acertar
              el número exacto (straight) en un solo sorteo es de <strong>1 en 1000 = 0.1%</strong>.
              Si juegas 3 combinaciones por día, tu probabilidad sube a <strong>3 en 1000 = 0.3%</strong> por sorteo.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-black uppercase text-[10px] text-amber-600">¿Cuántos aciertos puedes esperar?</p>
            <p className="opacity-80">
              En <strong>30 días (60 sorteos)</strong> con 3 picks por sorteo, los aciertos esperados por
              puro azar son: <strong>60 × 0.3% = 0.18 aciertos</strong>. Es decir, lo más probable es que
              <strong> NO aciertes ni una vez</strong> en 30 días. La probabilidad de acertar al menos 1 vez
              es solo del <strong>~16.5%</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-black uppercase text-[10px] text-amber-600">Expected Value (EV) negativo</p>
            <p className="opacity-80">
              El pago típico de Pick 3 straight es <strong>$500 por $1 apostado</strong>. Pero la probabilidad
              de ganar es 0.1%. El EV = (0.001 × $500) - (0.999 × $1) = <strong>-$0.499 por cada $1 apostado</strong>.
              Esto significa que <strong>por cada dólar que apuestes, pierdes 50 centavos a largo plazo</strong>.
              La lotería es por diseño un juego de expected value negativo.
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-black uppercase text-[10px] text-amber-600">¿Por qué solo 1 acierto en la simulación?</p>
            <p className="opacity-80">
              Si en la pestaña Simulación ves solo 1 acierto en 30 días, <strong>eso es estadísticamente normal</strong>.
              No es un bug del sistema: es la realidad matemática de la lotería. Nuestros tests estadísticos
              (chi-cuadrado, Kolmogorov-Smirnov, runs test, entropía de Shannon) confirman que los datos de
              Florida Pick 3 son consistentes con un proceso aleatorio uniforme. <strong>No hay patrón explotable.</strong>
            </p>
          </div>

          <div className="space-y-2">
            <p className="font-black uppercase text-[10px] text-amber-600">¿Entonces para qué sirve este módulo?</p>
            <p className="opacity-80">
              Este módulo NO promete ganancias. Su valor está en:
            </p>
            <ul className="list-disc pl-5 space-y-1 opacity-80">
              <li><strong>Gestión de bankroll profesional</strong>: si vas a jugar igual, al menos gestiona tu capital con métricas cuantitativas reales (Kelly, Sharpe, drawdown).</li>
              <li><strong>Honestidad estadística</strong>: ningún "gurú de lotería" te va a mostrar p-values o EV negativo. Nosotros sí.</li>
              <li><strong>Education financiera</strong>: aprende conceptos de trading (Sharpe, Sortino, Calmar) aplicados a un contexto simple.</li>
              <li><strong>Detección de anomalías</strong>: si algún día los datos dejan de ser aleatorios (e.g., sesgo físico en el equipo de sorteos), este módulo lo detectará.</li>
            </ul>
          </div>

          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
            <p className="text-[10px] font-black text-destructive uppercase">
              ⚠ Advertencia: Las loterías son juegos de azar con EV negativo. Ningún método garantiza ganancias.
              Juega responsablemente. Solo apuesta lo que puedes permitirte perder.
            </p>
          </div>
        </CardContent>
      </Card>

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
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center border border-primary/20">
                      <Zap className="w-5 h-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black uppercase italic">Box (Combinado)</p>
                      <p className="text-[10px] font-bold opacity-50 uppercase">Pago: 80x | Probabilidad: 0.6%</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs font-medium leading-relaxed opacity-80 px-4 pb-4 italic space-y-2">
                  <p>Ganas si tus números salen en cualquier orden. La probabilidad de éxito es mucho mayor (aprox 1 de cada 167 sorteos para números de 3 dígitos distintos).</p>
                  <p className="font-black text-primary">Ejemplo: Juegas 123 en Box y sale 321, 213, 132, etc.</p>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="bankroll" className="border-border">
                <AccordionTrigger className="hover:no-underline py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-success/10 flex items-center justify-center border border-success/20">
                      <ShieldCheck className="w-5 h-5 text-success" />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-black uppercase italic">Gestión de Bankroll</p>
                      <p className="text-[10px] font-bold opacity-50 uppercase">Regla de Oro: Nunca arriesgues más del 2%</p>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="text-xs font-medium leading-relaxed opacity-80 px-4 pb-4 italic">
                  El "Bankroll" es tu capital total destinado al juego. El sistema calcula automáticamente cuánto apostar basándose en tu capital actual y el nivel de confianza de la predicción para evitar que pierdas todo tu dinero en una mala racha. <span className="font-black text-success">Es el secreto de los apostadores profesionales.</span>
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
                <Badge variant="outline" className="text-[9px] font-black uppercase border-primary/20 text-primary">Ley de Tercios</Badge>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-bold italic opacity-70 leading-tight">
                Principio estadístico que dicta que en 30 sorteos, aproximadamente 1/3 de los números no saldrán, 1/3 saldrán una vez y 1/3 se repetirán. Filtramos los números "saturados".
              </p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px] font-black uppercase border-warning/20 text-warning">Cadenas de Markov</Badge>
                <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-[11px] font-bold italic opacity-70 leading-tight">
                Analizamos la probabilidad de que un dígito 'X' sea seguido por un dígito 'Y' basándonos en toda la historia de la lotería de Florida.
              </p>
            </div>
            <div className="space-y-2 group">
              <div className="flex items-center justify-between">
                <Badge variant="outline" className="text-[9px] font-black uppercase border-success/20 text-success">Tic-Tac-Toe Grid</Badge>
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
