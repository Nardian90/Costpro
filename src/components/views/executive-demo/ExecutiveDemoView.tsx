'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, CheckCircle2, AlertTriangle, Timer,
  TrendingUp, BarChart3, ArrowRight, RotateCcw,
  Shield, Zap, FileText, ChevronRight, XCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DEMO_DATASET, DemoProduct } from '@/lib/data/demo-products';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { cn } from '@/lib/utils';
import Link from 'next/link';

type DemoPhase = 'INTRO' | 'LOADING' | 'PROCESSING' | 'ANALYSIS' | 'DASHBOARD';

export default function ExecutiveDemoView() {
  const [phase, setPhase] = useState<DemoPhase>('INTRO');
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [results, setResults] = useState<DemoProduct[]>([]);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [narrative, setNarrative] = useState('');

  const products = useMemo(() => DEMO_DATASET, []);

  // Timer logic
  useEffect(() => {
    let timer: any;
    if (phase === 'PROCESSING' || phase === 'LOADING') {
      timer = setInterval(() => {
        setElapsedTime(prev => prev + 0.1);
      }, 100);
    }
    return () => clearInterval(timer);
  }, [phase]);

  const startDemo = () => {
    setPhase('LOADING');
    setNarrative('Cargando dataset preconfigurado (100 productos)...');

    setTimeout(() => {
      setPhase('PROCESSING');
      runSimulation();
    }, 2000);
  };

  const runSimulation = async () => {
    const batchSize = 5;
    const total = products.length;

    for (let i = 0; i <= total; i += batchSize) {
      if (i > 0) {
        const currentBatch = products.slice(i - batchSize, i);
        setResults(prev => [...prev, ...currentBatch]);
        setProcessedCount(i);
        setProgress((i / total) * 100);
      }

      // Narrative updates
      if (i === 20) setNarrative('Validando reglas contables y márgenes...');
      if (i === 40) setNarrative('Calculando costos indirectos de fabricación...');
      if (i === 60) setNarrative('Sincronizando con inventario multi-sede...');
      if (i === 80) setNarrative('Detectando inconsistencias en datos maestros...');
      if (i === 100) setNarrative('Finalizando generación masiva...');

      await new Promise(resolve => setTimeout(resolve, 300));
    }

    setTimeout(() => {
      setPhase('ANALYSIS');
      setNarrative('Analizando calidad de datos y riesgos detectados...');
    }, 1000);

    setTimeout(() => {
      setPhase('DASHBOARD');
      setNarrative('Generando informe de impacto al negocio.');
    }, 4000);
  };

  const resetDemo = () => {
    setPhase('INTRO');
    setProgress(0);
    setProcessedCount(0);
    setResults([]);
    setElapsedTime(0);
    setNarrative('');
  };

  const errorsCount = results.filter(r => r.status === 'error').length;
  const validCount = results.filter(r => r.status === 'valid').length;

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 overflow-hidden">
      <AnimatePresence mode="wait">
        {phase === 'INTRO' && (
          <motion.div
            key="intro"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="max-w-2xl text-center space-y-8"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/5 border border-primary/10 text-primary text-xs font-black uppercase tracking-widest">
              <Zap className="w-3 h-3" />
              Executive Demo Mode
            </div>

            <h1 className="text-4xl md:text-6xl font-black tracking-tighter uppercase leading-none">
              Vea el impacto en <br />
              <span className="text-primary italic">tiempo real</span>.
            </h1>

            <p className="text-xl text-muted-foreground font-medium leading-relaxed">
              Experimente cómo CostPro automatiza el procesamiento de un lote completo de 100 productos,
              detectando errores y garantizando rentabilidad en segundos.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button
                size="lg"
                onClick={startDemo}
                className="h-16 px-12 rounded-2xl text-base font-black uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-transform"
              >
                Comenzar Demo Automático
                <Play className="ml-2 w-5 h-5 fill-current" />
              </Button>
              <Link href="/">
                <Button variant="ghost" className="h-16 px-8 rounded-2xl text-xs font-black uppercase tracking-widest">
                  Volver
                </Button>
              </Link>
            </div>

            <div className="pt-8 grid grid-cols-3 gap-8 opacity-50 grayscale">
              <div className="text-center">
                <div className="text-2xl font-black">100</div>
                <div className="text-xs font-bold uppercase tracking-widest">Productos</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black">{'< 1min'}</div>
                <div className="text-xs font-bold uppercase tracking-widest">Tiempo</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black">0</div>
                <div className="text-xs font-bold uppercase tracking-widest">Fricción</div>
              </div>
            </div>
          </motion.div>
        )}

        {(phase === 'LOADING' || phase === 'PROCESSING') && (
          <motion.div
            key="processing"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-4xl space-y-8"
          >
            <div className="flex justify-between items-end">
              <div className="space-y-1">
                <h2 className="text-xs font-black uppercase tracking-[0.2em] text-primary">Generación Masiva en Curso</h2>
                <div className="text-3xl font-black uppercase tracking-tighter">Procesando Catálogo</div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-mono font-black">{elapsedTime.toFixed(1)}s</div>
                <div className="text-xs font-bold uppercase text-muted-foreground">Tiempo Transcurrido</div>
              </div>
            </div>

            <div className="p-8 rounded-[2.5rem] bg-sidebar/50 border border-sidebar-border/50 backdrop-blur-xl relative overflow-hidden">
               {phase === 'LOADING' && (
                 <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm">
                    <ViewLoadingSplash label="PREPARANDO" showTips={false} />
                 </div>
               )}

               <div className="space-y-6">
                 <div className="flex justify-between items-center text-xs font-black uppercase tracking-widest">
                    <span className="flex items-center gap-2">
                       <div className="w-2 h-2 rounded-full bg-primary animate-pulse" aria-hidden="true" />
                       Lote de 100 Fichas de Costo
                    </span>
                    <span aria-live="polite">{processedCount} / 100</span>
                 </div>
                 <Progress value={progress} className="h-4 rounded-full bg-primary/10" aria-label={`Progreso: ${Math.round(progress)}%`} />

                 <div className="grid grid-cols-10 gap-2" role="img" aria-label={`Cuadrícula de progreso: ${validCount} procesadas correctamente, ${errorsCount} con error, ${100 - processedCount} pendientes`}>
                   {Array.from({ length: 100 }).map((_, i) => {
                     const isProcessed = i < processedCount;
                     const isError = isProcessed && products[i]?.status === 'error';
                     return (
                       <motion.div
                         key={i}
                         role="presentation"
                         initial={{ opacity: 0.2 }}
                         animate={{
                           opacity: isProcessed ? 1 : 0.2,
                           scale: isProcessed ? [1, 1.2, 1] : 1,
                           backgroundColor: isError ? '#ef4444' : (isProcessed ? '#10b981' : 'rgba(255,255,255,0.1)')
                         }}
                         className="aspect-square rounded-sm transition-colors duration-300"
                       />
                     );
                   })}
                 </div>

                 <div className="flex justify-center pt-4">
                    <div className="px-4 py-2 rounded-xl bg-primary/10 border border-primary/20 text-xs font-bold uppercase tracking-widest text-primary animate-bounce">
                      {narrative}
                    </div>
                 </div>
               </div>
            </div>
          </motion.div>
        )}

        {phase === 'ANALYSIS' && (
          <motion.div
            key="analysis"
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-4xl space-y-8"
          >
            <div className="text-center space-y-4">
               <Shield className="w-16 h-16 text-primary mx-auto animate-pulse" />
               <h2 className="text-4xl font-black uppercase tracking-tighter leading-none">Inteligencia Detectada</h2>
               <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Protección de rentabilidad activada</p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
               <Card className="rounded-[2rem] border-success/20 bg-success/5 overflow-hidden">
                 <CardContent className="p-8 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-success/20 flex items-center justify-center text-success">
                        <CheckCircle2 className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-black uppercase">Listas para Venta</h3>
                    </div>
                    <div className="text-6xl font-black text-success tracking-tighter">{validCount}</div>
                    <p className="text-xs font-medium text-muted-foreground">Productos procesados con éxito, con cálculos de impuestos y márgenes validados.</p>
                 </CardContent>
               </Card>

               <Card className="rounded-[2rem] border-danger/20 bg-danger/5 overflow-hidden">
                 <CardContent className="p-8 space-y-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-danger/20 flex items-center justify-center text-danger">
                        <AlertTriangle className="w-6 h-6" />
                      </div>
                      <h3 className="text-xl font-black uppercase">Riesgos Bloqueados</h3>
                    </div>
                    <div className="text-6xl font-black text-danger tracking-tighter">{errorsCount}</div>
                    <p className="text-xs font-medium text-muted-foreground">El sistema evitó la generación de fichas con errores de stock o costos inexistentes.</p>
                 </CardContent>
               </Card>
            </div>
          </motion.div>
        )}

        {phase === 'DASHBOARD' && (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl space-y-12 pb-20"
          >
             <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                <div className="space-y-2 text-center md:text-left">
                  <Badge className="bg-primary text-foreground font-black px-4 py-1 rounded-full uppercase tracking-widest text-xs">Informe de Resultado</Badge>
                  <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none">Impacto al <span className="text-primary italic">Negocio</span></h2>
                </div>
                <div className="flex gap-4">
                  <Button variant="outline" onClick={resetDemo} className="rounded-2xl h-14 px-8 text-xs font-black uppercase tracking-widest border-2">
                    <RotateCcw className="w-4 h-4 mr-2" />
                    Repetir Demo
                  </Button>
                  <Link href="/">
                    <Button className="rounded-2xl h-14 px-8 text-xs font-black uppercase tracking-widest shadow-xl shadow-primary/20">
                      Cargar Mis Datos Reales
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
             </div>

             <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
               <KPIBox
                icon={<Timer className="w-5 h-5 text-violet-500" />}
                label="Tiempo Ahorrado"
                value="96%"
                subtext="vs. Proceso Manual"
                color="bg-violet-500/10 text-violet-600"
               />
               <KPIBox
                icon={<TrendingUp className="w-5 h-5 text-emerald-500" />}
                label="Eficiencia"
                value="100/100"
                subtext="Productos Procesados"
                color="bg-emerald-500/10 text-emerald-600"
               />
               <KPIBox
                icon={<Shield className="w-5 h-5 text-amber-500" />}
                label="Errores Evitados"
                value={errorsCount.toString()}
                subtext="Inconsistencias Contables"
                color="bg-amber-500/10 text-amber-600"
               />
               <KPIBox
                icon={<Zap className="w-5 h-5 text-primary" />}
                label="ROI Estimado"
                value="+240h"
                subtext="Ahorro Mensual / Operario"
                color="bg-primary/10 text-primary"
               />
             </div>

             <div className="grid lg:grid-cols-3 gap-8">
               <div className="lg:col-span-2 space-y-6">
                  <div className="p-8 rounded-[3rem] bg-sidebar/40 border border-sidebar-border/50 space-y-8">
                    <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
                       <BarChart3 className="w-5 h-5 text-primary" />
                       Comparativa de Velocidad
                    </h3>

                    <div className="space-y-6">
                       <div className="space-y-2">
                          <div className="flex justify-between text-xs font-black uppercase tracking-widest opacity-70">
                             <span>Método Tradicional (Excel/Papel)</span>
                             <span>~ 4 Horas</span>
                          </div>
                          <div className="h-4 w-full bg-muted rounded-full overflow-hidden">
                             <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ duration: 2 }} className="h-full bg-muted-foreground/30" />
                          </div>
                       </div>

                       <div className="space-y-2">
                          <div className="flex justify-between text-xs font-black uppercase tracking-widest text-primary">
                             <span>CostPro Automation</span>
                             <span>{elapsedTime.toFixed(1)} Segundos</span>
                          </div>
                          <div className="h-8 w-full bg-primary/10 rounded-full overflow-hidden border border-primary/20">
                             <motion.div initial={{ width: 0 }} animate={{ width: '5%' }} transition={{ duration: 1 }} className="h-full bg-primary shadow-[0_0_20px_rgba(16,185,129,0.5)]" />
                          </div>
                       </div>
                    </div>

                    <div className="p-6 rounded-3xl bg-primary/5 border border-primary/10 text-sm font-medium leading-relaxed italic">
                      "Este proceso ahorra en promedio un 96% del tiempo operativo mensual de su equipo contable, eliminando el error humano en un 100%."
                    </div>
                  </div>
               </div>

               <div className="space-y-6">
                 <Card className="rounded-[3rem] bg-foreground text-background p-8 border-none overflow-hidden relative group">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-150 transition-transform duration-1000">
                       <FileText className="w-32 h-32 rotate-12" />
                    </div>
                    <div className="relative z-10 space-y-6">
                       <h3 className="text-2xl font-black uppercase tracking-tighter leading-tight">¿Listo para modernizar su MiPyME?</h3>
                       <p className="text-sm font-medium opacity-70 leading-relaxed">Pase de la teoría a la práctica hoy mismo con sus datos reales.</p>
                       <Link href="/">
                        <Button className="w-full h-14 rounded-2xl bg-primary text-foreground font-black uppercase tracking-widest hover:scale-105 transition-transform">
                          Comenzar Gratis
                          <ChevronRight className="w-5 h-5 ml-2" />
                        </Button>
                       </Link>
                    </div>
                 </Card>

                 <div className="flex flex-col gap-4 p-4">
                    <div className="flex items-center gap-3 opacity-50">
                       <CheckCircle2 className="w-4 h-4 text-primary" />
                       <span className="text-xs font-black uppercase tracking-widest">Soporte 24/7</span>
                    </div>
                    <div className="flex items-center gap-3 opacity-50">
                       <CheckCircle2 className="w-4 h-4 text-primary" />
                       <span className="text-xs font-black uppercase tracking-widest">Infraestructura AWS</span>
                    </div>
                 </div>
               </div>
             </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function KPIBox({ icon, label, value, subtext, color }: any) {
  return (
    <Card className="rounded-3xl border-border/50 bg-background/50 backdrop-blur-md overflow-hidden">
      <CardContent className="p-6 space-y-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", color)}>
          {icon}
        </div>
        <div className="space-y-1">
          <div className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="text-3xl font-black tracking-tighter">{value}</div>
          <div className="text-xs font-bold uppercase text-primary/70">{subtext}</div>
        </div>
      </CardContent>
    </Card>
  );
}
