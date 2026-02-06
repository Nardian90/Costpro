'use client';

import { motion } from 'framer-motion';

export default function MobileOptimizedPOSFlowDiagram() {
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

        {/* Optimized Header (Sticky Search & Categories) */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
          <rect x="260" y="30" width="280" height="70" rx="10" className="fill-primary/5 stroke-primary/10" strokeWidth="1" />
          <rect x="270" y="40" width="260" height="25" rx="6" className="fill-background stroke-border" />
          <rect x="270" y="70" width="40" height="20" rx="10" className="fill-primary" />
          <rect x="315" y="70" width="40" height="20" rx="10" className="fill-muted/20 stroke-border" />
        </motion.g>

        {/* Tactile Product Cards */}
        <g>
          <motion.rect
            x="270" y="110" width="260" height="50" rx="12"
            className="fill-background stroke-primary/20 shadow-sm"
            whileHover={{ scale: 1.02 }}
          />
          <circle cx="295" cy="135" r="15" className="fill-muted/20" />
          <rect x="320" y="125" width="100" height="8" rx="4" className="fill-foreground/10" />
          <rect x="320" y="138" width="60" height="8" rx="4" className="fill-primary/20" />

          <rect x="270" y="170" width="260" height="50" rx="12" className="fill-background stroke-border opacity-50" />
          <rect x="270" y="230" width="260" height="50" rx="12" className="fill-background stroke-border opacity-30" />
        </g>

        {/* Sticky Tactile Footer (Thumb Zone) */}
        <motion.g initial={{ y: 50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 1 }}>
          <rect x="260" y="300" width="280" height="80" rx="0" className="fill-background/90 backdrop-blur-md stroke-primary/10" strokeWidth="1" />
          {/* Main Action Button */}
          <rect x="270" y="315" width="260" height="50" rx="15" className="fill-primary shadow-xl shadow-primary/20" />
          <text x="400" y="345" textAnchor="middle" className="fill-white font-black text-[10px] uppercase tracking-widest">Finalizar Venta (Thumb-Ready)</text>

          {/* Pulse Indicator on Cart */}
          <circle cx="510" cy="315" r="8" className="fill-primary stroke-background animate-pulse" strokeWidth="2" />
        </motion.g>

        {/* Callouts */}
        <motion.g initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }}>
          <path d="M150 135 L260 135" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <text x="140" y="140" textAnchor="end" className="fill-foreground font-black text-xs uppercase">Feedback Tactil (Check)</text>
        </motion.g>

        <motion.g initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 2 }}>
          <path d="M650 340 L540 340" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <text x="660" y="345" textAnchor="start" className="fill-foreground font-black text-xs uppercase">Zona Ergonómica h-14</text>
        </motion.g>

        {/* Standard Verification */}
        <motion.g initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 2.5 }}>
           <rect x="300" y="385" width="200" height="15" rx="5" className="fill-success/10 stroke-success/20" />
           <text x="400" y="396" textAnchor="middle" className="fill-success font-black text-[7px] uppercase tracking-widest">Touch Targets ≥ 44px Verificados</text>
        </motion.g>
      </motion.svg>
    </div>
  );
}
