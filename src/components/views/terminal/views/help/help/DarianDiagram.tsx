'use client';

import { motion } from 'framer-motion';

export default function DarianDiagram() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1 }
  };

  return (
    <div className="w-full overflow-x-auto no-scrollbar bg-card dark:bg-slate-950 rounded-[3rem] border border-border dark:border-white/10">
      <div className="min-w-[600px] aspect-video flex items-center justify-center p-8 overflow-hidden relative group">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />

      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl relative z-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Central Orchestrator */}
        <g transform="translate(400, 200)">
          <motion.g variants={item}>
            <motion.circle
              r="80"
              className="fill-primary/5 stroke-primary/20"
              strokeWidth="1"
              strokeDasharray="10 5"
              animate={{ rotate: 360 }}
              transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
            />
            <motion.circle
              r="60"
              className="fill-primary/10 stroke-primary/40"
              strokeWidth="2"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <circle r="45" className="fill-primary shadow-2xl shadow-primary/50" />
            <text textAnchor="middle" y="8" className="fill-white font-black text-2xl uppercase tracking-widest">ELI</text>
          </motion.g>
        </g>

        {/* Connection Lines (Cross layout) */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          <path d="M400 120 L400 60" stroke="currentColor" className="text-primary/30" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M400 280 L400 340" stroke="currentColor" className="text-primary/30" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M320 200 L240 200" stroke="currentColor" className="text-primary/30" strokeWidth="2" strokeDasharray="4 4" />
          <path d="M480 200 L560 200" stroke="currentColor" className="text-primary/30" strokeWidth="2" strokeDasharray="4 4" />
        </motion.g>

        {/* Intelligence Nodes */}
        <g transform="translate(400, 60)">
          <motion.g variants={item}>
            <rect x="-70" y="-25" width="140" height="50" rx="15" className="fill-blue-500/10 stroke-blue-500" strokeWidth="2" />
            <text textAnchor="middle" y="5" className="fill-blue-400 font-black text-[10px] uppercase tracking-widest">Análisis Predictivo</text>
          </motion.g>
        </g>

        <g transform="translate(400, 340)">
          <motion.g variants={item}>
            <rect x="-70" y="-25" width="140" height="50" rx="15" className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="2" />
            <text textAnchor="middle" y="5" className="fill-emerald-400 font-black text-[10px] uppercase tracking-widest">Sincro Offline</text>
          </motion.g>
        </g>

        <g transform="translate(140, 200)">
          <motion.g variants={item}>
            <rect x="-60" y="-25" width="120" height="50" rx="15" className="fill-amber-500/10 stroke-amber-500" strokeWidth="2" />
            <text textAnchor="middle" y="5" className="fill-amber-400 font-black text-[10px] uppercase tracking-widest">Finanzas 360°</text>
          </motion.g>
        </g>

        <g transform="translate(660, 200)">
          <motion.g variants={item}>
            <rect x="-60" y="-25" width="120" height="50" rx="15" className="fill-violet-500/10 stroke-violet-500" strokeWidth="2" />
            <text textAnchor="middle" y="5" className="fill-violet-400 font-black text-[10px] uppercase tracking-widest">Tendencias</text>
          </motion.g>
        </g>

        {/* Floating Data Particles moving towards center */}
        {[
          { from: [400, 60], delay: 0 },
          { from: [400, 340], delay: 1 },
          { from: [140, 200], delay: 0.5 },
          { from: [660, 200], delay: 1.5 }
        ].map((p, i) => (
          <motion.circle
            key={i}
            r="3"
            className="fill-primary"
            animate={{
              x: [p.from[0], 400],
              y: [p.from[1], 200],
              opacity: [0, 1, 0]
            }}
            transition={{ duration: 2, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          />
        ))}

      </motion.svg>
      </div>
    </div>
  );
}
