'use client';

import { motion } from 'framer-motion';

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
    <div className="w-full aspect-video bg-slate-950 rounded-[2.5rem] border border-white/10 flex items-center justify-center p-8 overflow-hidden relative group">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-primary/20 via-transparent to-transparent opacity-50" />

      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl relative z-10"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Connection Lines from central Eli */}
        {[
          [200, 120], [600, 120], [200, 280], [600, 280]
        ].map((pos, i) => (
          <motion.line
            key={`line-${i}`}
            x1="400" y1="200"
            x2={pos[0]} y2={pos[1]}
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="5 5"
            className="text-primary/30"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 1, duration: 1 }}
          />
        ))}

        {/* Central Intelligence Core */}
        <motion.g transform="translate(400, 200)" variants={item}>
          <circle r="80" className="fill-primary/10 stroke-primary/30" strokeWidth="2" strokeDasharray="10 5">
            <animateTransform attributeName="transform" type="rotate" from="0 0 0" to="360 0 0" dur="20s" repeatCount="indefinite" />
          </circle>
          <motion.circle
            r="55"
            className="fill-primary"
            animate={{ scale: [1, 1.05, 1], filter: ['blur(0px)', 'blur(2px)', 'blur(0px)'] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <text textAnchor="middle" y="10" className="fill-white font-black text-3xl uppercase tracking-tighter shadow-2xl">ELI</text>
        </motion.g>

        {/* Distributed Intelligence Nodes */}
        {[
          { label: "Predictivo", pos: [200, 120], color: "fill-blue-500" },
          { label: "Operativo", pos: [600, 120], color: "fill-emerald-500" },
          { label: "Seguridad", pos: [200, 280], color: "fill-rose-500" },
          { label: "Offline", pos: [600, 280], color: "fill-amber-500" }
        ].map((node, i) => (
          <motion.g key={i} transform={`translate(${node.pos[0]}, ${node.pos[1]})`} variants={item}>
             <circle r="40" className={`${node.color} opacity-90`} />
             <text textAnchor="middle" y="5" className="fill-white font-black text-[9px] uppercase tracking-widest">{node.label}</text>
             <circle r="48" className="fill-none stroke-white/10" strokeWidth="1" />
          </motion.g>
        ))}

        {/* Floating Data Particles */}
        {[...Array(12)].map((_, i) => (
          <motion.circle
            key={`particle-${i}`}
            r="2"
            className="fill-primary"
            animate={{
              x: [Math.random() * 800, Math.random() * 800],
              y: [Math.random() * 400, Math.random() * 400],
              opacity: [0, 0.7, 0]
            }}
            transition={{ duration: 4 + Math.random() * 4, repeat: Infinity, delay: i * 0.5 }}
          />
        ))}
      </motion.svg>
    </div>
  );
}
