'use client';

import { motion } from 'framer-motion';

export default function StoreSkuDiagram() {
  return (
    <div className="w-full aspect-video bg-muted/30 rounded-3xl border border-primary/10 flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Store A */}
        <motion.g
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8 }}
        >
          <rect x="50" y="50" width="300" height="300" rx="20" className="fill-primary/5 stroke-primary/20" strokeWidth="2" strokeDasharray="6,4" />
          <text x="200" y="80" textAnchor="middle" className="fill-primary font-black text-sm uppercase">Tienda A</text>

          <rect x="100" y="120" width="200" height="60" rx="10" className="fill-background/80 stroke-primary/40 shadow-xl" strokeWidth="2" />
          <text x="200" y="155" textAnchor="middle" className="fill-foreground font-bold text-xs">SKU: ARROZ-1KG</text>

          <motion.rect
            x="120" y="220" width="160" height="80" rx="10" className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="2"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <text x="200" y="255" textAnchor="middle" className="fill-emerald-600 font-black text-[10px] uppercase">Inventario A</text>
          <text x="200" y="275" textAnchor="middle" className="fill-emerald-600 font-bold text-lg">50 Unid.</text>
        </motion.g>

        {/* Store B */}
        <motion.g
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <rect x="450" y="50" width="300" height="300" rx="20" className="fill-primary/5 stroke-primary/20" strokeWidth="2" strokeDasharray="6,4" />
          <text x="600" y="80" textAnchor="middle" className="fill-primary font-black text-sm uppercase">Tienda B</text>

          <rect x="500" y="120" width="200" height="60" rx="10" className="fill-background/80 stroke-primary/40 shadow-xl" strokeWidth="2" />
          <text x="600" y="155" textAnchor="middle" className="fill-foreground font-bold text-xs">SKU: ARROZ-1KG</text>

          <motion.rect
            x="520" y="220" width="160" height="80" rx="10" className="fill-blue-500/10 stroke-blue-500" strokeWidth="2"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, delay: 1 }}
          />
          <text x="600" y="255" textAnchor="middle" className="fill-blue-600 font-black text-[10px] uppercase">Inventario B</text>
          <text x="600" y="275" textAnchor="middle" className="fill-blue-600 font-bold text-lg">120 Unid.</text>
        </motion.g>

        {/* Separation Line */}
        <line x1="400" y1="50" x2="400" y2="350" stroke="currentColor" className="text-white/10" strokeWidth="2" strokeDasharray="8,8" />

        {/* Active Context Marker */}
        <motion.g
          animate={{
            x: [0, 400, 0],
          }}
          transition={{ duration: 6, repeat: Infinity }}
        >
           <circle cx="200" cy="40" r="10" className="fill-primary" />
           <text x="200" y="25" textAnchor="middle" className="fill-primary font-black text-[8px] uppercase">Tienda Activa</text>
        </motion.g>

      </motion.svg>
    </div>
  );
}
