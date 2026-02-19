'use client';

import { motion } from 'framer-motion';
import { Cpu, Wifi, Database, TrendingUp, Shield } from 'lucide-react';

export default function EliDiagram() {
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
    hidden: { opacity: 0, scale: 0.8 },
    show: { opacity: 1, scale: 1 }
  };

  return (
    <div className="w-full aspect-video bg-slate-950 rounded-[3rem] border border-white/10 flex items-center justify-center p-8 overflow-hidden relative">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/10 via-transparent to-transparent opacity-50" />

      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl relative z-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Central Intelligence Core */}
        <motion.g transform="translate(400, 200)" variants={item}>
          <circle r="70" className="fill-primary/20 stroke-primary/40" strokeWidth="2" strokeDasharray="10 5" />
          <motion.circle
            r="50"
            className="fill-primary shadow-2xl shadow-primary/50"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
          <text textAnchor="middle" y="8" className="fill-white font-black text-2xl uppercase tracking-tighter">ELI</text>
        </motion.g>

        {/* Peripheral Nodes */}
        {[
          { label: "Análisis Real-time", icon: TrendingUp, color: "fill-emerald-500", pos: [150, 100] },
          { label: "Sincro Offline", icon: Wifi, color: "fill-blue-500", pos: [650, 100] },
          { label: "Protección RLS", icon: Shield, color: "fill-rose-500", pos: [150, 300] },
          { label: "Predicción Stock", icon: Database, color: "fill-amber-500", pos: [650, 300] }
        ].map((node, i) => (
          <motion.g key={i} transform={`translate(${node.pos[0]}, ${node.pos[1]})`} variants={item}>
             <circle r="45" className={node.color} />
             <text textAnchor="middle" y="65" className="fill-white/60 font-black text-[10px] uppercase tracking-widest">{node.label}</text>

             {/* Connection Line to Core */}
             <motion.line
               x1={0} y1={0}
               x2={node.pos[0] > 400 ? -200 : 200}
               y2={node.pos[1] > 200 ? -70 : 70}
               stroke="currentColor"
               strokeWidth="1"
               className="text-white/20"
               initial={{ pathLength: 0 }}
               animate={{ pathLength: 1 }}
               transition={{ delay: 1, duration: 1 }}
             />
          </motion.g>
        ))}

        {/* Floating Data Particles */}
        {[...Array(10)].map((_, i) => (
          <motion.circle
            key={i}
            r="1.5"
            className="fill-primary"
            animate={{
              x: [Math.random() * 800, Math.random() * 800],
              y: [Math.random() * 400, Math.random() * 400],
              opacity: [0, 0.8, 0]
            }}
            transition={{ duration: 3 + Math.random() * 4, repeat: Infinity }}
          />
        ))}
      </motion.svg>
    </div>
  );
}
