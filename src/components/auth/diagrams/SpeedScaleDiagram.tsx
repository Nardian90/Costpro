'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Timer, Zap, ArrowUpRight, TrendingUp } from 'lucide-react';

export default function SpeedScaleDiagram() {
  return (
    <div className="relative w-full aspect-[16/9] bg-gradient-to-br from-violet-600/5 to-primary/5 rounded-[3rem] border border-border/50 overflow-hidden flex flex-col items-center justify-center p-8 shadow-2xl">
      <div className="relative z-10 w-full max-w-md space-y-8">

        {/* Speed Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-violet-600 flex items-center justify-center text-white shadow-lg shadow-violet-500/20">
              <Timer className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground">Tiempo de Procesamiento</p>
              <p className="text-2xl font-black text-foreground tracking-tighter">
                &lt; 5 <span className="text-violet-600 italic">MINUTOS</span>
              </p>
            </div>
          </div>
          <motion.div
            animate={{ scale: [1, 1.05, 1], boxShadow: ['0 0 0px rgba(16,185,129,0)', '0 0 20px rgba(16,185,129,0.3)', '0 0 0px rgba(16,185,129,0)'] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex items-center gap-1 bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20"
          >
            <Zap className="w-3 h-3" />
            95% Ahorro
          </motion.div>
        </div>

        {/* Scale Progress */}
        <div className="p-6 rounded-3xl bg-background/40 backdrop-blur-xl border border-white/10 shadow-xl space-y-6">
          <div className="flex justify-between items-end">
            <div className="space-y-1">
               <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Capacidad Operativa</span>
               <div className="flex items-center gap-2 text-primary">
                 <TrendingUp className="w-4 h-4" />
                 <span className="text-xs font-bold uppercase tracking-widest">Escala MiPyME</span>
               </div>
            </div>
            <div className="text-right">
              <span className="text-4xl font-black text-foreground tabular-nums tracking-tighter">
                <CountUp end={100} duration={3} />
              </span>
              <span className="text-[10px] font-black text-muted-foreground block uppercase tracking-widest">Fichas / Lote</span>
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
        <div className="flex gap-4 justify-center">
            <div className="px-4 py-2 rounded-xl bg-violet-500/5 border border-violet-500/10 flex items-center gap-2">
              <ArrowUpRight className="w-3 h-3 text-violet-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-violet-600/70">Carga Masiva</span>
            </div>
            <div className="px-4 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/10 flex items-center gap-2">
              <ArrowUpRight className="w-3 h-3 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600/70">Validación AI</span>
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
