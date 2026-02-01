'use client';

import { motion } from 'framer-motion';

export default function StickyCartFlowDiagram() {
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

        {/* Cart Header */}
        <rect x="260" y="30" width="280" height="40" rx="10" className="fill-primary" />
        <text x="400" y="55" textAnchor="middle" className="fill-white font-black text-[10px] uppercase">Caja Registradora</text>

        {/* Scrollable Items List */}
        <g>
          <rect x="270" y="80" width="260" height="60" rx="8" className="fill-muted/20 stroke-border" />
          <rect x="270" y="150" width="260" height="60" rx="8" className="fill-muted/20 stroke-border" />
          <rect x="270" y="220" width="260" height="60" rx="8" className="fill-muted/20 stroke-border opacity-50" />

          {/* Gradient Indicator */}
          <rect x="260" y="240" width="280" height="40" className="fill-gradient-to-t from-background to-transparent opacity-80" />
        </g>

        {/* Sticky Footer Section */}
        <motion.g
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <rect x="260" y="280" width="280" height="90" rx="0" className="fill-background stroke-primary/10 shadow-2xl" strokeWidth="1" />

          {/* Totals */}
          <text x="280" y="300" className="fill-muted-foreground font-black text-[8px] uppercase">Total Final</text>
          <text x="520" y="305" textAnchor="end" className="fill-primary font-black text-lg font-mono">$1,250.00</text>

          {/* Action Button */}
          <rect x="270" y="320" width="260" height="40" rx="10" className="fill-primary shadow-lg shadow-primary/20" />
          <text x="400" y="345" textAnchor="middle" className="fill-white font-black text-[10px] uppercase tracking-widest">Finalizar Venta</text>
        </motion.g>

        {/* Annotations */}
        <motion.g initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <path d="M150 150 L260 150" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <text x="140" y="155" textAnchor="end" className="fill-foreground font-black text-xs uppercase">Scroll Infinito</text>
        </motion.g>

        <motion.g initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }}>
          <path d="M650 340 L540 340" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <text x="660" y="345" textAnchor="start" className="fill-foreground font-black text-xs uppercase">Sticky Checkout</text>
        </motion.g>
      </motion.svg>
    </div>
  );
}
