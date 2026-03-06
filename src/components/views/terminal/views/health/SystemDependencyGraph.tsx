'use client';

import React from 'react';
import { motion, Variants } from 'framer-motion';
import { Database, Cpu, Cloud, Smartphone, ShieldCheck, Share2 } from 'lucide-react';

export function SystemDependencyGraph() {
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
    hidden: { opacity: 0, scale: 0.8, y: 20 },
    show: { opacity: 1, scale: 1, y: 0 }
  };

  const lineVariants: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    show: {
      pathLength: 1,
      opacity: 1,
      transition: { duration: 1.5, ease: "easeInOut" }
    }
  };

  return (
    <div className="space-y-6 bg-card/50 p-6 rounded-[32px] border border-border/50 relative overflow-hidden">
      <div className="flex items-center gap-3 px-2 mb-4">
        <Share2 className="w-5 h-5 text-primary" />
        <h3 className="text-sm font-black uppercase tracking-widest text-foreground">Grafo de Dependencias</h3>
      </div>

      <div className="relative aspect-video w-full max-w-2xl mx-auto flex items-center justify-center p-4">
        <motion.svg
          viewBox="0 0 600 400"
          className="w-full h-full"
          variants={container}
          initial="hidden"
          animate="show"
        >
          {/* Connection Lines */}
          <motion.g variants={lineVariants}>
            {/* Core to others */}
            <path d="M300 200 L150 100" className="stroke-primary/20" strokeWidth="1" fill="none" strokeDasharray="4 4" />
            <path d="M300 200 L450 100" className="stroke-primary/20" strokeWidth="1" fill="none" strokeDasharray="4 4" />
            <path d="M300 200 L150 300" className="stroke-primary/20" strokeWidth="1" fill="none" strokeDasharray="4 4" />
            <path d="M300 200 L450 300" className="stroke-primary/20" strokeWidth="1" fill="none" strokeDasharray="4 4" />
          </motion.g>

          {/* Core System */}
          <g transform="translate(300, 200)">
            <motion.g variants={item}>
              <circle r="45" className="fill-primary/10 stroke-primary/30 shadow-2xl" strokeWidth="2" />
              <circle r="35" className="fill-primary shadow-xl shadow-primary/40" />
              <Cpu className="w-8 h-8 text-white -translate-x-4 -translate-y-4" />
              <text y="55" textAnchor="middle" className="fill-foreground font-black text-[9px] uppercase tracking-widest">Orquestador AI</text>
            </motion.g>
          </g>

          {/* Supabase / Cloud */}
          <g transform="translate(150, 100)">
            <motion.g variants={item}>
              <rect x="-40" y="-30" width="80" height="60" rx="16" className="fill-background stroke-primary/20" strokeWidth="1" />
              <Cloud className="w-6 h-6 text-blue-500 -translate-x-3 -translate-y-4" />
              <text y="45" textAnchor="middle" className="fill-foreground font-black text-[8px] uppercase tracking-widest">Cloud Services</text>
            </motion.g>
          </g>

          {/* Database / Supabase */}
          <g transform="translate(450, 100)">
            <motion.g variants={item}>
              <rect x="-40" y="-30" width="80" height="60" rx="16" className="fill-background stroke-primary/20" strokeWidth="1" />
              <Database className="w-6 h-6 text-emerald-500 -translate-x-3 -translate-y-4" />
              <text y="45" textAnchor="middle" className="fill-foreground font-black text-[8px] uppercase tracking-widest">Supabase DB</text>
            </motion.g>
          </g>

          {/* Client / Dexie */}
          <g transform="translate(150, 300)">
            <motion.g variants={item}>
              <rect x="-40" y="-30" width="80" height="60" rx="16" className="fill-background stroke-primary/20" strokeWidth="1" />
              <Smartphone className="w-6 h-6 text-amber-500 -translate-x-3 -translate-y-4" />
              <text y="45" textAnchor="middle" className="fill-foreground font-black text-[8px] uppercase tracking-widest">Client Cache</text>
            </motion.g>
          </g>

          {/* Security / GRC */}
          <g transform="translate(450, 300)">
            <motion.g variants={item}>
              <rect x="-40" y="-30" width="80" height="60" rx="16" className="fill-background stroke-primary/20" strokeWidth="1" />
              <ShieldCheck className="w-6 h-6 text-rose-500 -translate-x-3 -translate-y-4" />
              <text y="45" textAnchor="middle" className="fill-foreground font-black text-[8px] uppercase tracking-widest">Governance</text>
            </motion.g>
          </g>

          {/* Pulse animation on core */}
          <motion.circle
            cx="300" cy="200" r="50"
            className="stroke-primary/40"
            strokeWidth="1"
            fill="none"
            animate={{ scale: [1, 1.5], opacity: [0.5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </motion.svg>

        {/* Floating Scan Bar */}
        <motion.div
          className="absolute left-0 w-full h-px bg-primary/20 shadow-[0_0_15px_rgba(var(--primary),0.5)] z-20 pointer-events-none"
          animate={{ top: ['10%', '90%', '10%'] }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
      </div>

      <div className="mt-4 p-4 rounded-2xl bg-background/40 border border-border/30">
        <p className="text-[9px] font-bold text-muted-foreground leading-relaxed uppercase tracking-wider text-center">
          Visualización dinámica de la arquitectura de <span className="text-primary font-black">COSTPRO ENTERPRISE</span>.
          Los nodos representan subsistemas críticos y las líneas el flujo de datos sincronizado.
        </p>
      </div>
    </div>
  );
}
