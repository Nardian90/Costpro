'use client';

import { motion } from 'framer-motion';

export default function SalesFlowDiagram() {
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
        viewBox="0 0 800 300"
        className="w-full h-full"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Progress Line */}
        <motion.line
          x1="100" y1="150" x2="700" y2="150"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="8,8"
          className="text-primary/20"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5 }}
        />

        {/* Step 1: Search */}
        <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}>
          <circle cx="100" cy="150" r="40" className="fill-background stroke-primary" strokeWidth="2" />
          <text x="100" y="155" textAnchor="middle" className="fill-primary font-black text-xs">BUSCAR</text>
        </motion.g>

        {/* Step 2: Cart */}
        <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.5 }}>
          <circle cx="300" cy="150" r="40" className="fill-background stroke-primary" strokeWidth="2" />
          <text x="300" y="155" textAnchor="middle" className="fill-primary font-black text-xs">CARRITO</text>
        </motion.g>

        {/* Step 3: Payment */}
        <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.8 }}>
          <circle cx="500" cy="150" r="40" className="fill-background stroke-primary" strokeWidth="2" />
          <text x="500" y="155" textAnchor="middle" className="fill-primary font-black text-xs">PAGO</text>
        </motion.g>

        {/* Step 4: Receipt */}
        <motion.g initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.1 }}>
          <circle cx="700" cy="150" r="40" className="fill-primary" />
          <text x="700" y="155" textAnchor="middle" className="fill-white font-black text-xs">TICKET</text>
        </motion.g>

        {/* Animated dots */}
        <motion.circle
          r="6" className="fill-primary"
          animate={{
            cx: [100, 300, 500, 700],
            opacity: [0, 1, 1, 0]
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          cy="150"
        />

      </motion.svg>
    </div>
  );
}
