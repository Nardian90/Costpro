'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Timer, Zap, ArrowUpRight } from 'lucide-react';

export default function SpeedScaleDiagram() {
  return (
    <div className="relative w-full aspect-[16/9] bg-violet-600/5 rounded-3xl border border-violet-500/10 overflow-hidden flex flex-col items-center justify-center p-8">
      <div className="relative z-10 w-full max-w-md space-y-8">

        {/* Speed Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center text-white">
              <Timer className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-tighter text-violet-600/60">Tiempo de Procesamiento</p>
              <p className="text-xl font-black text-violet-900 tracking-tighter">&lt; 5 MINUTOS</p>
            </div>
          </div>
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="flex items-center gap-1 bg-emerald-500 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest"
          >
            <Zap className="w-3 h-3" />
            95% Más Rápido
          </motion.div>
        </div>

        {/* Scale Progress */}
        <div className="space-y-4">
          <div className="flex justify-between items-end">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fichas de Costo Generadas</span>
            <span className="text-3xl font-black text-primary tabular-nums">
              <CountUp end={100} duration={3} />
            </span>
          </div>

          <div className="h-4 w-full bg-primary/10 rounded-full overflow-hidden border border-primary/5 p-1">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="h-full bg-primary rounded-full relative"
            >
              <motion.div
                animate={{ x: [0, 10, 0], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute right-0 top-0 bottom-0 w-8 bg-white/30 blur-sm"
              />
            </motion.div>
          </div>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { label: "Carga Masiva", val: "Excel Sync" },
            { label: "Validación", val: "Automática" }
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.2 }}
              className="p-3 rounded-2xl bg-white/50 border border-violet-100 backdrop-blur-sm"
            >
              <p className="text-[8px] font-black uppercase tracking-widest text-violet-400">{item.label}</p>
              <p className="text-xs font-bold text-violet-900 flex items-center justify-between">
                {item.val}
                <ArrowUpRight className="w-3 h-3" />
              </p>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Background pulses */}
      <motion.div
        animate={{ scale: [1, 1.5], opacity: [0.1, 0] }}
        transition={{ duration: 4, repeat: Infinity }}
        className="absolute inset-0 bg-violet-500 rounded-full blur-[100px] pointer-events-none"
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
        // Reset after 1 second for looping
        setTimeout(() => {
          startTimestamp = null;
          request = window.requestAnimationFrame(step);
        }, 1000);
      }
    };

    request = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(request);
  }, [end, duration]);

  return <span>{current}</span>;
}
