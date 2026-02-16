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

  return (
    <div className="w-full aspect-video bg-muted/30 rounded-3xl border border-primary/10 flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Shield in Background */}
        <motion.path
          d="M400 50 L600 100 L600 250 C600 350 400 400 400 400 C400 400 200 350 200 250 L200 100 Z"
          className="fill-primary/5 stroke-primary/10"
          strokeWidth="2"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1 }}
        />

        {/* Steps */}
        <motion.g transform="translate(400, 100)" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
          <rect x="-120" y="-30" width="240" height="60" rx="10" className="fill-background stroke-primary/40" strokeWidth="2" />
          <text textAnchor="middle" y="5" className="fill-foreground font-black text-xs uppercase">1. Verificación de Rol</text>
        </motion.g>

        <motion.g transform="translate(400, 200)" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1 }}>
          <rect x="-120" y="-30" width="240" height="60" rx="10" className="fill-background stroke-primary/40" strokeWidth="2" />
          <text textAnchor="middle" y="5" className="fill-foreground font-black text-xs uppercase">2. Aislamiento de Tienda</text>
        </motion.g>

        <motion.g transform="translate(400, 300)" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.5 }}>
          <rect x="-120" y="-30" width="240" height="60" rx="10" className="fill-primary" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">3. Registro de Auditoría</text>
        </motion.g>

        {/* Scan line effect */}
        <motion.line
          x1="200" x2="600"
          stroke="currentColor"
          strokeWidth="2"
          className="text-primary/40"
          animate={{
            y: [100, 350, 100],
          }}
          transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
        />

      </motion.svg>
    </div>
  );
}
