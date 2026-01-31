'use client';

import { motion } from 'framer-motion';

export default function MobilePosDiagram() {
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
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 800 400"
        className="w-full h-full"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Device Frame */}
        <rect x="250" y="20" width="300" height="360" rx="30" className="fill-background stroke-primary/20" strokeWidth="4" />
        <rect x="260" y="30" width="280" height="340" rx="20" className="fill-muted/20" />

        {/* Notch */}
        <rect x="350" y="20" width="100" height="20" rx="10" className="fill-primary/10" />

        {/* Catalog Items (Dummy) */}
        <rect x="275" y="60" width="120" height="80" rx="10" className="fill-primary/5 stroke-primary/10" />
        <rect x="405" y="60" width="120" height="80" rx="10" className="fill-primary/5 stroke-primary/10" />
        <rect x="275" y="150" width="120" height="80" rx="10" className="fill-primary/5 stroke-primary/10" />
        <rect x="405" y="150" width="120" height="80" rx="10" className="fill-primary/5 stroke-primary/10" />

        {/* Mobile Drawer (Bottom Sheet) */}
        <motion.g
          initial={{ y: 150 }}
          animate={{ y: 0 }}
          transition={{ duration: 1, repeat: Infinity, repeatType: "reverse", repeatDelay: 1 }}
        >
          <path
            d="M260 250 L540 250 L540 370 L260 370 Z"
            className="fill-background stroke-primary shadow-2xl"
            strokeWidth="2"
          />
          <rect x="375" y="260" width="50" height="4" rx="2" className="fill-primary/20" />
          <text x="400" y="285" textAnchor="middle" className="fill-primary font-black text-[10px] uppercase">Carrito (1-Tap Discount)</text>

          <rect x="275" y="300" width="250" height="30" rx="8" className="fill-primary" />
          <text x="400" y="320" textAnchor="middle" className="fill-white font-black text-[10px] uppercase tracking-widest">Pagar $450.00</text>
        </motion.g>

        {/* Action Menu (Bottom Bar) */}
        <rect x="260" y="340" width="280" height="30" className="fill-background/90 backdrop-blur-md" />
        <circle cx="400" cy="355" r="12" className="fill-primary/10 stroke-primary" strokeWidth="1" />
        <text x="400" y="359" textAnchor="middle" className="fill-primary font-black text-[8px]">POS</text>

        {/* Annotations */}
        <motion.g initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1 }}>
          <line x1="150" y1="310" x2="260" y2="310" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <circle cx="150" cy="310" r="4" className="fill-primary" />
          <text x="140" y="315" textAnchor="end" className="fill-foreground font-black text-xs uppercase">44px Touch Target</text>
        </motion.g>

        <motion.g initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.5 }}>
          <line x1="650" y1="355" x2="540" y2="355" stroke="currentColor" className="text-primary" strokeWidth="1" strokeDasharray="4,2" />
          <circle cx="650" cy="355" r="4" className="fill-primary" />
          <text x="660" y="360" textAnchor="start" className="fill-foreground font-black text-xs uppercase">Thumb Zone</text>
        </motion.g>

      </motion.svg>
    </div>
  );
}
