'use client';

import { motion } from 'framer-motion';

export default function InventoryFlowDiagram() {
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
    <div className="w-full aspect-video bg-muted/30 rounded-3xl border border-primary/10 flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Warehouse Building */}
        <motion.path
          d="M300 300 L300 150 L400 100 L500 150 L500 300 Z"
          className="fill-primary/5 stroke-primary/40"
          strokeWidth="3"
        />
        <text x="400" y="220" textAnchor="middle" className="fill-primary font-black text-xs uppercase">Almacén Central</text>

        {/* Entry Flow */}
        <motion.g
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          <rect x="50" y="150" width="120" height="60" rx="10" className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="2" />
          <text x="110" y="185" textAnchor="middle" className="fill-emerald-600 font-bold text-[10px] uppercase">Entrada / Compra</text>
          <path d="M170 180 L290 180" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow-emerald)" strokeDasharray="4,2" />
        </motion.g>

        {/* Exit Flow */}
        <motion.g
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <rect x="630" y="150" width="120" height="60" rx="10" className="fill-blue-500/10 stroke-blue-500" strokeWidth="2" />
          <text x="690" y="185" textAnchor="middle" className="fill-blue-600 font-bold text-[10px] uppercase">Venta / Salida</text>
          <path d="M510 180 L620 180" stroke="#3b82f6" strokeWidth="2" markerEnd="url(#arrow-blue)" strokeDasharray="4,2" />
        </motion.g>

        {/* Adjustments */}
        <motion.g
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <rect x="340" y="320" width="120" height="40" rx="10" className="fill-amber-500/10 stroke-amber-500" strokeWidth="2" />
          <text x="400" y="345" textAnchor="middle" className="fill-amber-600 font-bold text-[10px] uppercase">Ajustes / Merma</text>
          <path d="M400 320 L400 300" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrow-amber)" />
        </motion.g>

        <defs>
          <marker id="arrow-emerald" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
          </marker>
          <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
          <marker id="arrow-amber" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
          </marker>
        </defs>

        {/* Moving boxes animation */}
        <motion.rect
          width="20" height="20" rx="4"
          className="fill-primary/60"
          animate={{
            x: [170, 290],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
          y="170"
        />
        <motion.rect
          width="20" height="20" rx="4"
          className="fill-primary/60"
          animate={{
            x: [500, 620],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 1.5 }}
          y="170"
        />

      </motion.svg>
    </div>
  );
}
