'use client';

import { motion } from 'framer-motion';

export default function CashFlowDiagram() {
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
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1 }
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
        {/* Main Flow Path */}
        <motion.path
          d="M100 200 L700 200"
          stroke="currentColor"
          strokeWidth="4"
          className="text-primary/10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2 }}
        />

        {/* Nodes */}
        <motion.g variants={item} transform="translate(100, 200)">
          <circle r="60" className="fill-emerald-500" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Apertura</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Base de Efectivo</text>
        </motion.g>

        <motion.g variants={item} transform="translate(300, 200)">
          <circle r="60" className="fill-emerald-600" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Ventas</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Registro de Cobros</text>
        </motion.g>

        <motion.g variants={item} transform="translate(500, 200)">
          <circle r="60" className="fill-amber-500" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Arqueo</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Conteo Físico</text>
        </motion.g>

        <motion.g variants={item} transform="translate(700, 200)">
          <circle r="60" className="fill-primary" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Cierre</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Reporte Final</text>
        </motion.g>

        {/* Transaction icons floating */}
        {[0, 1, 2].map(i => (
          <motion.circle
            key={i}
            r="8"
            className="fill-primary/40"
            animate={{
              x: [200 + i * 50, 400 + i * 50],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              delay: i * 0.5
            }}
            cy="160"
          />
        ))}

      </motion.svg>
    </div>
  );
}
