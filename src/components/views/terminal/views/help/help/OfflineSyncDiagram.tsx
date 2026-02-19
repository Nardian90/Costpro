'use client';

import { motion } from 'framer-motion';

export default function OfflineSyncDiagram() {
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
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30">
      <div className="min-w-[600px] aspect-video flex items-center justify-center p-4">
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
          <rect x="-60" y="-60" width="120" height="120" rx="20" className="fill-emerald-600" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Operación</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Venta / Compra</text>
        </motion.g>

        <motion.g variants={item} transform="translate(300, 200)">
          <rect x="-60" y="-60" width="120" height="120" rx="20" className="fill-amber-500" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Local</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">IndexedDB (Offline)</text>
        </motion.g>

        <motion.g variants={item} transform="translate(500, 200)">
          <rect x="-60" y="-60" width="120" height="120" rx="20" className="fill-emerald-500" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Sincro</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Background Worker</text>
        </motion.g>

        <motion.g variants={item} transform="translate(700, 200)">
          <rect x="-60" y="-60" width="120" height="120" rx="20" className="fill-primary" />
          <text textAnchor="middle" y="5" className="fill-white font-black text-xs uppercase">Nube</text>
          <text textAnchor="middle" y="80" className="fill-muted-foreground font-bold text-xs uppercase">Supabase (Global)</text>
        </motion.g>

        {/* Data packets floating */}
        {[0, 1, 2].map(i => (
          <motion.rect
            key={i}
            width="12"
            height="12"
            rx="2"
            className="fill-primary/40"
            animate={{
              x: [150 + i * 40, 650 + i * 40],
              opacity: [0, 1, 0],
              rotate: [0, 180]
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              delay: i * 0.8
            }}
            y="170"
          />
        ))}

        {/* Connection status indicator */}
        <motion.circle
          cx="400"
          cy="100"
          r="10"
          className="fill-emerald-500"
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <text x="420" y="104" className="fill-emerald-500 font-black text-xs uppercase">Online Status</text>

      </motion.svg>
      </div>
    </div>
  );
}
