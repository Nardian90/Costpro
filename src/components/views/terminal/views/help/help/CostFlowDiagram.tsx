'use client';

import { motion } from 'framer-motion';

export default function CostFlowDiagram() {
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
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  const arrow = {
    hidden: { pathLength: 0, opacity: 0 },
    show: { pathLength: 1, opacity: 1, transition: { duration: 0.8 } }
  };

  return (
    <div className="w-full overflow-x-auto no-scrollbar rounded-3xl border border-primary/10 bg-muted/30">
      <div className="min-w-[600px] sm:min-w-0 aspect-[16/9] md:aspect-video flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 450"
        className="w-full h-full max-w-4xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        <defs>
          <marker id="arrowhead-cost" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" fill="currentColor" className="text-primary/40" />
          </marker>
          <linearGradient id="engineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.2" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        {/* Input Layer */}
        <motion.g variants={item}>
          <rect x="50" y="50" width="180" height="60" rx="12" className="fill-background stroke-primary/20" strokeWidth="2" />
          <text x="140" y="85" textAnchor="middle" className="fill-foreground font-black text-[10px] uppercase tracking-wider">Anexos (Materiales/MO)</text>
        </motion.g>

        <motion.g variants={item}>
          <rect x="50" y="130" width="180" height="60" rx="12" className="fill-background stroke-primary/20" strokeWidth="2" />
          <text x="140" y="165" textAnchor="middle" className="fill-foreground font-black text-[10px] uppercase tracking-wider">Encabezado y Metadatos</text>
        </motion.g>

        {/* Connections to Engine */}
        <motion.path d="M230 80 L300 150" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/30" variants={arrow} markerEnd="url(#arrowhead-cost)" />
        <motion.path d="M230 160 L300 190" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/30" variants={arrow} markerEnd="url(#arrowhead-cost)" />

        {/* Calculation Engine */}
        <motion.g variants={item}>
          <rect x="310" y="120" width="180" height="150" rx="24" fill="url(#engineGradient)" className="stroke-primary" strokeWidth="2" />
          <motion.path
            d="M340 195 L460 195 M400 145 L400 245"
            stroke="currentColor"
            strokeWidth="1"
            className="text-primary/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            style={{ transformOrigin: '400px 195px' }}
          />
          <text x="400" y="185" textAnchor="middle" className="fill-primary font-black text-xs uppercase tracking-[0.2em]">Motor de</text>
          <text x="400" y="210" textAnchor="middle" className="fill-primary font-black text-xs uppercase tracking-[0.2em]">Cálculo v5</text>
          <text x="400" y="240" textAnchor="middle" className="fill-primary/60 font-bold text-[8px] uppercase">14 Secciones / 5 Anexos</text>
        </motion.g>

        {/* Output Connections */}
        <motion.path d="M490 195 L560 100" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/30" variants={arrow} markerEnd="url(#arrowhead-cost)" />
        <motion.path d="M490 195 L560 195" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/30" variants={arrow} markerEnd="url(#arrowhead-cost)" />
        <motion.path d="M490 195 L560 290" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/30" variants={arrow} markerEnd="url(#arrowhead-cost)" />

        {/* Interaction Modes */}
        <motion.g variants={item}>
          <rect x="570" y="70" width="180" height="50" rx="10" className="fill-violet-500" />
          <text x="660" y="100" textAnchor="middle" className="fill-white font-black text-[10px] uppercase">Modo Experto (Tabla)</text>
        </motion.g>

        <motion.g variants={item}>
          <rect x="570" y="170" width="180" height="50" rx="10" className="fill-emerald-500" />
          <text x="660" y="200" textAnchor="middle" className="fill-white font-black text-[10px] uppercase">Modo Asistido (Wizard)</text>
        </motion.g>

        <motion.g variants={item}>
          <rect x="570" y="270" width="180" height="50" rx="10" className="fill-amber-500" />
          <text x="660" y="300" textAnchor="middle" className="fill-white font-black text-[10px] uppercase">Modo Lectura (Narrativa)</text>
        </motion.g>

        {/* Export Layer */}
        <motion.path d="M660 320 L660 360" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary/30" variants={arrow} markerEnd="url(#arrowhead-cost)" />

        <motion.g variants={item}>
          <rect x="570" y="370" width="180" height="60" rx="30" className="fill-primary" />
          <text x="660" y="405" textAnchor="middle" className="fill-white font-black text-xs uppercase tracking-widest">Exportar PDF / CSV</text>
        </motion.g>

        {/* Legend */}
        <motion.text
          x="50"
          y="420"
          className="fill-muted-foreground/50 font-bold text-[9px] uppercase tracking-[0.3em]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2 }}
        >
          Integridad de Datos Garantizada
        </motion.text>

      </motion.svg>
      </div>
    </div>
  );
}
