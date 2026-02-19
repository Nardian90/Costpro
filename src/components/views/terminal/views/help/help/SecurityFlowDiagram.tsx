'use client';

import { motion } from 'framer-motion';

export default function SecurityFlowDiagram() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.3
      }
    }
  };

  const item = {
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1 }
  };

  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30 relative">
      <div className="min-w-[600px] aspect-video flex items-center justify-center p-4 overflow-hidden relative">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Connection Lines (Cross layout) */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}>
          <path d="M400 200 L400 100" stroke="currentColor" className="text-primary/20" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M400 200 L400 300" stroke="currentColor" className="text-primary/20" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M400 200 L250 200" stroke="currentColor" className="text-primary/20" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M400 200 L550 200" stroke="currentColor" className="text-primary/20" strokeWidth="1" strokeDasharray="4 4" />
        </motion.g>

        {/* Central Security Core */}
        <g transform="translate(400, 200)">
          <motion.g variants={item}>
            {/* Shield Base */}
            <motion.path
              d="M0 -60 L50 -40 L50 10 C50 40 0 60 0 60 C0 60 -50 40 -50 10 L-50 -40 Z"
              className="fill-primary/10 stroke-primary/30"
              strokeWidth="2"
              animate={{ scale: [1, 1.05, 1] }}
              transition={{ duration: 3, repeat: Infinity }}
            />
            {/* Inner Shield */}
            <path
              d="M0 -40 L35 -25 L35 10 C35 30 0 45 0 45 C0 45 -35 30 -35 10 L-35 -25 Z"
              className="fill-primary shadow-2xl shadow-primary/40"
            />
            <text textAnchor="middle" y="5" className="fill-white font-black text-[10px] uppercase tracking-widest">RLS</text>
          </motion.g>
        </g>

        {/* Security Components */}
        <g transform="translate(400, 100)">
          <motion.g variants={item}>
            <rect x="-70" y="-20" width="140" height="40" rx="12" className="fill-background stroke-primary/20" strokeWidth="1" />
            <circle cx="-55" cy="0" r="5" className="fill-blue-500" />
            <text x="5" y="4" textAnchor="middle" className="fill-foreground font-black text-[9px] uppercase tracking-widest">Verificación Rol</text>
          </motion.g>
        </g>

        <g transform="translate(400, 300)">
          <motion.g variants={item}>
            <rect x="-70" y="-20" width="140" height="40" rx="12" className="fill-background stroke-primary/20" strokeWidth="1" />
            <circle cx="-55" cy="0" r="5" className="fill-violet-500" />
            <text x="5" y="4" textAnchor="middle" className="fill-foreground font-black text-[9px] uppercase tracking-widest">Aislamiento</text>
          </motion.g>
        </g>

        <g transform="translate(180, 200)">
          <motion.g variants={item}>
            <rect x="-70" y="-20" width="140" height="40" rx="12" className="fill-background stroke-primary/20" strokeWidth="1" />
            <circle cx="-55" cy="0" r="5" className="fill-emerald-500" />
            <text x="5" y="4" textAnchor="middle" className="fill-foreground font-black text-[9px] uppercase tracking-widest">Multitenancy</text>
          </motion.g>
        </g>

        <g transform="translate(620, 200)">
          <motion.g variants={item}>
            <rect x="-70" y="-20" width="140" height="40" rx="12" className="fill-background stroke-primary/20" strokeWidth="1" />
            <circle cx="-55" cy="0" r="5" className="fill-amber-500" />
            <text x="5" y="4" textAnchor="middle" className="fill-foreground font-black text-[9px] uppercase tracking-widest">Auditoría</text>
          </motion.g>
        </g>

        {/* Scan effect */}
        <motion.rect
          x="150" width="500" height="2"
          className="fill-primary/20"
          animate={{
            y: [50, 350, 50],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />

      </motion.svg>
      </div>
    </div>
  );
}
