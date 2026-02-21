'use client';

import { motion } from 'framer-motion';

export default function UserFlowDiagram() {
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
    hidden: { opacity: 0, x: -20 },
    show: { opacity: 1, x: 0 }
  };

  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30">
      <div className="min-w-[600px] aspect-video flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 200"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Connection Arrows */}
        {[180, 380, 580].map((x, i) => (
          <motion.path
            key={i}
            d={`M${x} 100 L${x + 40} 100`}
            stroke="currentColor"
            strokeWidth="3"
            markerEnd="url(#arrowhead)"
            className="text-primary/40"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: i * 0.3 + 0.5 }}
          />
        ))}

        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="0" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" className="text-primary/40" />
          </marker>
        </defs>

        {/* Steps */}
        <motion.g variants={item}>
          <rect x="20" y="60" width="160" height="80" rx="20" className="fill-background stroke-primary/30" strokeWidth="2" />
          <text x="100" y="105" textAnchor="middle" className="fill-foreground font-black text-xs uppercase">1. Crear Usuario</text>
        </motion.g>

        <motion.g variants={item}>
          <rect x="220" y="60" width="160" height="80" rx="20" className="fill-background stroke-primary/30" strokeWidth="2" />
          <text x="300" y="105" textAnchor="middle" className="fill-foreground font-black text-xs uppercase">2. Asignar Rol</text>
        </motion.g>

        <motion.g variants={item}>
          <rect x="420" y="60" width="160" height="80" rx="20" className="fill-background stroke-primary/30" strokeWidth="2" />
          <text x="500" y="105" textAnchor="middle" className="fill-foreground font-black text-xs uppercase">3. Asignar Tienda</text>
        </motion.g>

        <motion.g variants={item}>
          <rect x="620" y="60" width="160" height="80" rx="20" className="fill-primary" />
          <text x="700" y="105" textAnchor="middle" className="fill-white font-black text-xs uppercase">4. Acceso Activo</text>
        </motion.g>

      </motion.svg>
      </div>
    </div>
  );
}
