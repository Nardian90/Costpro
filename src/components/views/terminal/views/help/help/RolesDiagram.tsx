'use client';

import { motion } from 'framer-motion';

export default function RolesDiagram() {
  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30">
      <div className="min-w-[600px] sm:min-w-0 aspect-video flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 500"
        className="w-full h-full max-w-2xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Connection Lines */}
        <motion.path
          d="M400 150 L200 250 M400 150 L400 250 M400 150 L600 250"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5,5"
          className="text-primary/30"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        />
        <motion.path
          d="M400 310 L300 400 M400 310 L500 400"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5,5"
          className="text-primary/30"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, delay: 1 }}
        />

        {/* Admin */}
        <motion.g variants={item}>
          <rect x="300" y="50" width="200" height="100" rx="20" className="fill-primary" />
          <text x="400" y="95" textAnchor="middle" className="fill-white font-black text-xl uppercase">ADMIN</text>
          <text x="400" y="125" textAnchor="middle" className="fill-white/80 font-bold text-xs uppercase tracking-widest">Control Total</text>
        </motion.g>

        {/* Encargado */}
        <motion.g variants={item}>
          <rect x="300" y="250" width="200" height="60" rx="15" className="fill-violet-500" />
          <text x="400" y="288" textAnchor="middle" className="fill-white font-black text-sm uppercase">ENCARGADO</text>
        </motion.g>

        {/* Almacenero */}
        <motion.g variants={item}>
          <rect x="200" y="400" width="180" height="60" rx="15" className="fill-amber-500" />
          <text x="290" y="438" textAnchor="middle" className="fill-white font-black text-sm uppercase">ALMACENERO</text>
        </motion.g>

        {/* Cajero */}
        <motion.g variants={item}>
          <rect x="420" y="400" width="180" height="60" rx="15" className="fill-emerald-500" />
          <text x="510" y="438" textAnchor="middle" className="fill-white font-black text-sm uppercase">CAJERO</text>
        </motion.g>

        {/* Labels for multi-store */}
        <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
          <circle cx="100" cy="100" r="40" className="fill-primary/10 stroke-primary/30" strokeWidth="2" />
          <text x="100" y="105" textAnchor="middle" className="fill-primary font-black text-xs uppercase">Multi-Tienda</text>
        </motion.g>

      </motion.svg>
      </div>
    </div>
  );
}
