'use client';

import { motion } from 'framer-motion';

export default function IpvFlowDiagram() {
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
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30">
      <div className="min-w-[600px] sm:min-w-0 aspect-video flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Core Engine (Matching) */}
        <motion.rect
          x="300" y="150" width="200" height="100" rx="20"
          className="fill-blue-500/10 stroke-blue-500"
          strokeWidth="3"
        />
        <text x="400" y="195" textAnchor="middle" className="fill-blue-600 font-black text-xs uppercase">Motor de Matching</text>
        <text x="400" y="220" textAnchor="middle" className="fill-blue-400 font-bold text-xs uppercase">(Multi-Pass AI)</text>

        {/* Bank Extract (Input) */}
        <motion.g
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 0.5, duration: 1 }}
        >
          <rect x="50" y="160" width="150" height="80" rx="10" className="fill-amber-500/10 stroke-amber-500" strokeWidth="2" />
          <text x="125" y="195" textAnchor="middle" className="fill-amber-600 font-bold text-xs uppercase">Extracto Bancario</text>
          <text x="125" y="215" textAnchor="middle" className="fill-amber-400 font-medium text-xs uppercase">(CSV / XLSX)</text>
          <path d="M200 200 L290 200" stroke="#f59e0b" strokeWidth="2" markerEnd="url(#arrow-amber)" strokeDasharray="4,2" />
        </motion.g>

        {/* IPV Report (Output) */}
        <motion.g
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <rect x="600" y="160" width="150" height="80" rx="10" className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="2" />
          <text x="675" y="195" textAnchor="middle" className="fill-emerald-600 font-bold text-xs uppercase">Reporte IPV</text>
          <text x="675" y="215" textAnchor="middle" className="fill-emerald-400 font-medium text-xs uppercase">(PDF Certificado)</text>
          <path d="M500 200 L590 200" stroke="#10b981" strokeWidth="2" markerEnd="url(#arrow-emerald)" />
        </motion.g>

        {/* IndexedDB Persistence */}
        <motion.g
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1.5, duration: 1 }}
        >
          <path d="M350 350 L450 350 L470 300 L330 300 Z" className="fill-primary/5 stroke-primary/30" strokeWidth="2" />
          <text x="400" y="330" textAnchor="middle" className="fill-primary/60 font-bold text-xs uppercase">Persistencia Local</text>
          <text x="400" y="345" textAnchor="middle" className="fill-primary/40 font-medium text-xs uppercase">(IndexedDB)</text>
          <path d="M400 300 L400 250" stroke="#6366f1" strokeWidth="2" markerEnd="url(#arrow-blue)" />
        </motion.g>

        <defs>
          <marker id="arrow-amber" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#f59e0b" />
          </marker>
          <marker id="arrow-emerald" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#10b981" />
          </marker>
          <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="#3b82f6" />
          </marker>
        </defs>

        {/* Processing animation (dots) */}
        <motion.circle
          r="4"
          className="fill-blue-500"
          animate={{
            cx: [200, 300],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          cy="200"
        />
        <motion.circle
          r="4"
          className="fill-emerald-500"
          animate={{
            cx: [500, 600],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
          cy="200"
        />

      </motion.svg>
      </div>
    </div>
  );
}
