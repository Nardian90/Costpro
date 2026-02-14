'use client';

import { motion } from 'framer-motion';

export default function QuickModeMassiveDiagram() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3
      }
    }
  };

  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30">
      <div className="min-w-[600px] sm:min-w-0 aspect-video flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Quick Mode Entry (Input) */}
        <motion.g
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <rect x="50" y="150" width="180" height="100" rx="20" className="fill-amber-500/10 stroke-amber-500" strokeWidth="3" />
          <text x="140" y="195" textAnchor="middle" className="fill-amber-600 font-black text-xs uppercase">Modo Rápido</text>
          <text x="140" y="220" textAnchor="middle" className="fill-amber-400 font-bold text-[10px] uppercase">(Entrada Manual Express)</text>
          <path d="M230 200 L320 200" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrow-amber)" strokeDasharray="4,2" />
        </motion.g>

        {/* Transition / Logic */}
        <motion.circle
          cx="400" cy="200" r="60"
          className="fill-blue-500/10 stroke-blue-500"
          strokeWidth="3"
        />
        <text x="400" y="195" textAnchor="middle" className="fill-blue-600 font-black text-xs uppercase">Mapeo</text>
        <text x="400" y="215" textAnchor="middle" className="fill-blue-400 font-bold text-[10px] uppercase">Automático</text>

        {/* Massive Generation (Process) */}
        <motion.g
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <rect x="570" y="150" width="180" height="100" rx="20" className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="3" />
          <text x="660" y="195" textAnchor="middle" className="fill-emerald-600 font-black text-xs uppercase">Gen. Masiva</text>
          <text x="660" y="220" textAnchor="middle" className="fill-emerald-400 font-bold text-[10px] uppercase">(Fichas Listas)</text>
          <path d="M460 200 L560 200" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow-emerald)" />
        </motion.g>

        {/* Connecting Arrows Decor */}
        <defs>
          <marker id="arrow-amber" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
          </marker>
          <marker id="arrow-emerald" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
          </marker>
        </defs>

        {/* Floating elements (representing multiple products) */}
        <motion.rect
          x="280" y="80" width="40" height="40" rx="8"
          className="fill-amber-500/20 stroke-amber-500/30"
          animate={{ y: [80, 100, 80], rotate: [0, 10, 0] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <motion.rect
          x="480" y="280" width="40" height="40" rx="8"
          className="fill-emerald-500/20 stroke-emerald-500/30"
          animate={{ y: [280, 260, 280], rotate: [0, -10, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
        />

        {/* Data flow dots */}
        <motion.circle
          r="4"
          className="fill-amber-500"
          animate={{
            cx: [140, 400],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          cy="200"
        />
        <motion.circle
          r="4"
          className="fill-emerald-500"
          animate={{
            cx: [400, 660],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
          cy="200"
        />

      </motion.svg>
      </div>
    </div>
  );
}
