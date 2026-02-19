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
        viewBox="-50 0 900 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Main Flow Path */}
        <motion.path
          d="M50 200 L750 200"
          stroke="currentColor"
          strokeWidth="4"
          className="text-primary/10"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2 }}
        />

        {/* Nodes */}
        <motion.g variants={item} transform="translate(50, 200)">
          <circle r="60" className="fill-emerald-500" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-[10px] uppercase tracking-widest">Apertura</text>
          <text textAnchor="middle" y="85" className="fill-muted-foreground font-bold text-[9px] uppercase tracking-wider">Base de Efectivo</text>
        </motion.g>

        <motion.g variants={item} transform="translate(250, 200)">
          <circle r="60" className="fill-emerald-600" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-[10px] uppercase tracking-widest">Ventas</text>
          <text textAnchor="middle" y="85" className="fill-muted-foreground font-bold text-[9px] uppercase tracking-wider">Registro de Cobros</text>
        </motion.g>

        <motion.g variants={item} transform="translate(500, 200)">
          <circle r="60" className="fill-amber-500" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-[10px] uppercase tracking-widest">Arqueo</text>
          <text textAnchor="middle" y="85" className="fill-muted-foreground font-bold text-[9px] uppercase tracking-wider text-center">
            <tspan x="0" dy="0">CONTEO FÍSICO</tspan>
          </text>
        </motion.g>

        <motion.g variants={item} transform="translate(750, 200)">
          <circle r="60" className="fill-primary shadow-xl shadow-primary/20" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-[10px] uppercase tracking-widest">Cierre</text>
          <text textAnchor="middle" y="85" className="fill-muted-foreground font-bold text-[9px] uppercase tracking-wider">
             <tspan x="0" dy="0">REPORTE FINAL</tspan>
          </text>
        </motion.g>

        {/* Transaction icons floating */}
        {[0, 1, 2].map(i => (
          <motion.circle
            key={i}
            r="6"
            className="fill-primary/40"
            animate={{
              x: [200 + i * 60, 450 + i * 60],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              delay: i * 0.7
            }}
            cy="150"
          />
        ))}

      </motion.svg>
    </div>
  );
}
