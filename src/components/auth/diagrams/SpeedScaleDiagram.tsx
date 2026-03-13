'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Timer, Zap, ArrowUpRight, TrendingUp } from 'lucide-react';

export default function SpeedScaleDiagram() {
  return (
    <div
      className="relative w-full min-h-[400px] lg:aspect-[16/9] bg-gradient-to-br from-violet-600/10 via-background to-primary/10 rounded-[2.5rem] sm:rounded-[3rem] border border-border/50 overflow-x-auto flex flex-col items-center justify-center p-4 sm:p-10 shadow-2xl"
      style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
    >
      {/* Decorative Glows */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.05),transparent_70%)]" />

      <div className="relative z-10 w-full max-w-md space-y-8 sm:space-y-10">

        {/* Speed Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-violet-600 flex items-center justify-center text-foreground shadow-lg shadow-violet-500/30 shrink-0">
              <Timer className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-0.5">Tiempo de Procesamiento</p>
              <p className="text-[clamp(1.5rem,5vw,2rem)] font-black text-foreground tracking-tighter leading-none">
                &lt; 5 <span className="text-violet-600 italic">MINUTOS</span>
              </p>
            </div>
          </div>
          <motion.div
            animate={{ scale: [1, 1.05, 1], boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 20px rgba(16,185,129,0.3)', '0 0 0px rgba(16,185,129,0)'] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex items-center gap-1 bg-emerald-500 text-foreground px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20"
          >
            <Zap className="w-3 h-3" />
            95% Ahorro
          </motion.div>
        </div>

        {/* Scale Progress */}
        <div className="p-6 sm:p-8 rounded-[2rem] bg-background/60 backdrop-blur-2xl border border-border/50 shadow-2xl space-y-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full -mr-16 -mt-16" />

          <div className="flex justify-between items-end relative z-10">
            <div className="space-y-1">
               <span className="text-xs font-black uppercase tracking-widest text-muted-foreground opacity-70">Capacidad Operativa</span>
               <div className="flex items-center gap-2 text-primary">
                 <div className="p-1 rounded-lg bg-primary/10">
                   <TrendingUp className="w-4 h-4" />
                 </div>
                 <span className="text-xs font-black uppercase tracking-widest">Escala MiPyME</span>
               </div>
            </div>
            <div className="text-right">
              <span className="text-[clamp(2rem,8vw,3.5rem)] font-black text-foreground tabular-nums tracking-tighter leading-none block">
                <CountUp end={100} duration={3} />
              </span>
              <span className="text-xs font-black text-muted-foreground block uppercase tracking-widest mt-1">Fichas / Lote</span>
            </div>
          </div>

          <div className="h-3 w-full bg-muted rounded-full overflow-hidden p-0.5 border border-border/50">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="h-full bg-gradient-to-r from-violet-500 to-primary rounded-full relative shadow-[0_0_15px_rgba(16,185,129,0.5)]"
            >
              <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-[shimmer_2s_linear_infinite]" />
            </motion.div>
          </div>
        </div>

        {/* Dynamic Badges */}
        <div className="flex flex-wrap gap-3 justify-center">
            <div className="px-4 py-2 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center gap-2 shadow-sm">
              <ArrowUpRight className="w-3 h-3 text-violet-600" />
              <span className="text-xs font-black uppercase tracking-widest text-violet-700">Carga Masiva</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-2 shadow-sm">
              <ArrowUpRight className="w-3 h-3 text-emerald-600" />
              <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Validación AI</span>
            </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes shimmer {
          from { background-position: 0 0; }
          to { background-position: 40px 0; }
        }
      `}</style>

      {/* Background pulses */}
      <motion.div
        animate={{ scale: [1, 1.2], opacity: [0.05, 0] }}
        transition={{ duration: 5, repeat: Infinity }}
        className="absolute -top-20 -right-20 w-64 h-64 bg-primary rounded-full blur-[100px] pointer-events-none"
      />
    </div>
  );
}

function CountUp({ end, duration }: { end: number, duration: number }) {
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    let startTimestamp: number | null = null;
    let request: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / (duration * 1000), 1);
      setCurrent(Math.floor(progress * end));

      if (progress < 1) {
        request = window.requestAnimationFrame(step);
      } else {
        // Reset after 2 seconds for looping
        setTimeout(() => {
          startTimestamp = null;
          request = window.requestAnimationFrame(step);
        }, 2000);
      }
    };

    request = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(request);
  }, [end, duration]);

  return <span>{current}</span>;
}
