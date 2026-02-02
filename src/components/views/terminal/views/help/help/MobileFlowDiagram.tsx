'use client';

import { motion } from 'framer-motion';

export default function MobileFlowDiagram() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  return (
    <div className="w-full aspect-video bg-muted/30 rounded-3xl border border-primary/10 flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Device Frame */}
        <rect x="250" y="20" width="300" height="360" rx="30" className="fill-background stroke-primary/20" strokeWidth="4" />

        {/* Sticky Header Zone */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <rect x="260" y="30" width="280" height="100" rx="10" className="fill-primary/5 stroke-primary/10" strokeWidth="1" />
          {/* Search Bar Placeholder */}
          <rect x="270" y="45" width="260" height="30" rx="8" className="fill-background stroke-border" />
          <circle cx="285" cy="60" r="5" className="fill-none stroke-muted-foreground" strokeWidth="2" />
          {/* Category Chips Placeholder */}
          <rect x="270" y="85" width="50" height="25" rx="12" className="fill-primary" />
          <rect x="325" y="85" width="50" height="25" rx="12" className="fill-muted/20 stroke-border" />
          <rect x="380" y="85" width="50" height="25" rx="12" className="fill-muted/20 stroke-border" />
        </motion.g>

        {/* Content Area */}
        <g>
          <rect x="270" y="140" width="125" height="100" rx="12" className="fill-muted/10 stroke-border" />
          <rect x="405" y="140" width="125" height="100" rx="12" className="fill-muted/10 stroke-border" />
          <rect x="270" y="250" width="125" height="100" rx="12" className="fill-muted/10 stroke-border opacity-50" />
          <rect x="405" y="250" width="125" height="100" rx="12" className="fill-muted/10 stroke-border opacity-50" />
        </g>

        {/* Sticky Footer / Action Menu */}
        <rect x="260" y="340" width="280" height="40" rx="0" className="fill-background/80 backdrop-blur-md stroke-primary/10" strokeWidth="1" />
        <rect x="270" y="345" width="260" height="30" rx="8" className="fill-primary shadow-lg shadow-primary/20" />
        <text x="400" y="365" textAnchor="middle" className="fill-white font-black text-[8px] uppercase tracking-widest">Carrito de Ventas</text>

        {/* Callouts */}
        <motion.g initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <path d="M150 80 L260 80" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <text x="140" y="85" textAnchor="end" className="fill-foreground font-black text-xs uppercase">Búsqueda Sticky</text>
        </motion.g>

        <motion.g initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }}>
          <path d="M650 360 L540 360" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <text x="660" y="365" textAnchor="start" className="fill-foreground font-black text-xs uppercase">Zona Ergonómica</text>
        </motion.g>

        <motion.g initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2 }}>
          <circle cx="400" cy="190" r="20" className="fill-primary/20 stroke-primary animate-pulse" strokeWidth="2" strokeDasharray="4,2" />
          <text x="400" y="160" textAnchor="middle" className="fill-primary font-black text-[10px] uppercase">Touch Targets 44px</text>
        </motion.g>
      </motion.svg>
    </div>
  );
}
