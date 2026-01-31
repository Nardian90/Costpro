'use client';

import { motion } from 'framer-motion';

export default function IPVFlowDiagram() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
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
        {/* Connection Path */}
        <motion.path
          d="M100 200 L700 200"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="8 4"
          className="text-primary/20"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1 }}
        />

        {/* Node 1: Ingestion */}
        <g transform="translate(100, 200)">
          <motion.g variants={item}>
            <rect x="-50" y="-50" width="100" height="100" rx="20" className="fill-blue-500/20 stroke-blue-500 stroke-2" />
            <text textAnchor="middle" y="5" className="fill-blue-700 font-black text-[10px] uppercase">Ingesta</text>
            <text textAnchor="middle" y="70" className="fill-muted-foreground font-bold text-[8px] uppercase">CSV Bancario</text>
          </motion.g>
        </g>

        {/* Node 2: Pending State */}
        <g transform="translate(250, 200)">
          <motion.g variants={item}>
            <circle r="40" className="fill-orange-500/20 stroke-orange-500 stroke-2" />
            <text textAnchor="middle" y="5" className="fill-orange-700 font-black text-[8px] uppercase">Pendiente</text>
          </motion.g>
        </g>

        {/* Node 3: Matching Engine (Main Central Node) */}
        <g transform="translate(450, 200)">
          <motion.g variants={item}>
            <rect x="-70" y="-70" width="140" height="140" rx="30" className="fill-primary/20 stroke-primary stroke-2" />
            <motion.path
              d="M-30 -30 L30 30 M30 -30 L-30 30"
              stroke="currentColor"
              strokeWidth="4"
              className="text-primary"
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
            <text textAnchor="middle" y="85" className="fill-primary font-black text-[10px] uppercase">Matching Engine</text>
            <text textAnchor="middle" y="100" className="fill-muted-foreground font-bold text-[7px] uppercase">4 Pasos de Validación</text>
          </motion.g>
        </g>

        {/* Node 4: Completed/Partial State */}
        <g transform="translate(650, 200)">
          <motion.g variants={item}>
            <circle r="40" className="fill-emerald-500/20 stroke-emerald-500 stroke-2" />
            <text textAnchor="middle" y="5" className="fill-emerald-700 font-black text-[8px] uppercase">Conciliado</text>
          </motion.g>
        </g>

        {/* Labels for passes floating around engine */}
        <g transform="translate(450, 110)">
          <motion.g variants={item}>
            <rect x="-40" y="-10" width="80" height="20" rx="5" className="fill-background stroke-border" />
            <text textAnchor="middle" y="3" className="fill-foreground font-bold text-[6px] uppercase">1. Hard Ref</text>
          </motion.g>
        </g>
        <g transform="translate(560, 160)">
          <motion.g variants={item}>
            <rect x="-40" y="-10" width="80" height="20" rx="5" className="fill-background stroke-border" />
            <text textAnchor="middle" y="3" className="fill-foreground font-bold text-[6px] uppercase">2. Exact Sum</text>
          </motion.g>
        </g>
        <g transform="translate(560, 240)">
          <motion.g variants={item}>
            <rect x="-40" y="-10" width="80" height="20" rx="5" className="fill-background stroke-border" />
            <text textAnchor="middle" y="3" className="fill-foreground font-bold text-[6px] uppercase">3. Tolerance</text>
          </motion.g>
        </g>
        <g transform="translate(450, 290)">
          <motion.g variants={item}>
            <rect x="-40" y="-10" width="80" height="20" rx="5" className="fill-background stroke-border" />
            <text textAnchor="middle" y="3" className="fill-foreground font-bold text-[6px] uppercase">4. Cash Fill</text>
          </motion.g>
        </g>

      </motion.svg>
    </div>
  );
}
