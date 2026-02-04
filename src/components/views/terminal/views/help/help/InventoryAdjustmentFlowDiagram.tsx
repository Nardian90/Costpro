'use client';

import { motion } from 'framer-motion';

export default function InventoryAdjustmentFlowDiagram() {
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
        {/* Mobile Device Frame */}
        <rect x="300" y="50" width="200" height="300" rx="20" className="fill-background stroke-muted-foreground/20" strokeWidth="4" />
        <rect x="310" y="70" width="180" height="260" rx="10" className="fill-muted/20" />

        {/* Drawer Trigger (Button in List) */}
        <motion.g
          variants={{
            hidden: { opacity: 0, scale: 0.8 },
            show: { opacity: 1, scale: 1 }
          }}
        >
          <rect x="320" y="240" width="160" height="30" rx="4" className="fill-primary/20 stroke-primary/40" strokeWidth="1" />
          <text x="400" y="260" textAnchor="middle" className="fill-primary font-bold text-[8px] uppercase tracking-tighter">Ajustar Stock</text>
        </motion.g>

        {/* Drawer Overlay (Appearing from bottom) */}
        <motion.g
          initial={{ y: 200, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8, type: "spring", stiffness: 100 }}
        >
          <rect x="310" y="150" width="180" height="180" rx="15" className="fill-background shadow-2xl stroke-primary/10" strokeWidth="1" />
          <rect x="380" y="160" width="40" height="4" rx="2" className="fill-muted-foreground/30" />

          {/* Header */}
          <text x="400" y="180" textAnchor="middle" className="fill-foreground font-black text-[8px] uppercase tracking-widest">Ajuste Rápido</text>

          {/* Stepper Controls */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
            <rect x="330" y="195" width="30" height="30" rx="6" className="fill-muted stroke-border" />
            <text x="345" y="215" textAnchor="middle" className="fill-foreground font-bold text-lg">-</text>

            <rect x="440" y="195" width="30" height="30" rx="6" className="fill-muted stroke-border" />
            <text x="455" y="215" textAnchor="middle" className="fill-foreground font-bold text-lg">+</text>

            <text x="400" y="215" textAnchor="middle" className="fill-primary font-black text-xl">0</text>
          </motion.g>

          {/* Quick Reason Chips */}
          <motion.g
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.5 }}
          >
            <rect x="325" y="240" width="40" height="15" rx="8" className="fill-primary/10 stroke-primary/30" />
            <rect x="370" y="240" width="50" height="15" rx="8" className="fill-muted stroke-border" />
            <rect x="425" y="240" width="45" height="15" rx="8" className="fill-muted stroke-border" />
            <text x="345" y="250" textAnchor="middle" className="fill-primary font-bold text-[6px] uppercase">Merma</text>
          </motion.g>

          {/* Confirm Button */}
          <motion.g
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.8 }}
          >
            <rect x="330" y="280" width="140" height="35" rx="10" className="fill-primary shadow-lg" />
            <text x="400" y="302" textAnchor="middle" className="fill-primary-foreground font-black text-[10px] uppercase tracking-widest">Confirmar</text>
          </motion.g>
        </motion.g>

        {/* Interaction Arrows */}
        <motion.path
          d="M200 255 L290 255"
          className="stroke-primary/40"
          strokeWidth="2"
          strokeDasharray="4 2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1 }}
          markerEnd="url(#arrow-primary)"
        />
        <text x="245" y="245" textAnchor="middle" className="fill-primary/60 font-bold text-[10px] uppercase italic">1. Click</text>

        <motion.path
          d="M500 215 L590 215"
          className="stroke-primary/40"
          strokeWidth="2"
          strokeDasharray="4 2"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 2 }}
          markerEnd="url(#arrow-primary)"
        />
        <text x="545" y="205" textAnchor="middle" className="fill-primary/60 font-bold text-[10px] uppercase italic">2. Ajuste</text>

        <defs>
          <marker id="arrow-primary" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" className="fill-primary/40" />
          </marker>
        </defs>
      </motion.svg>
    </div>
  );
}
