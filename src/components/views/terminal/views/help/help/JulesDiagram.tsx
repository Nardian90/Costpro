'use client';

import { motion } from 'framer-motion';

export default function JulesDiagram() {
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
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <div className="w-full aspect-video bg-muted/30 rounded-3xl border border-primary/10 flex items-center justify-center p-4">
      <motion.svg
        width="100%"
        height="100%"
        preserveAspectRatio="xMidYMid meet"
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Brain/Core Circle */}
        <motion.circle
          cx="400"
          cy="200"
          r="80"
          className="fill-primary/10 stroke-primary/20"
          strokeWidth="2"
          strokeDasharray="10 5"
          animate={{ rotate: 360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
        />

        {/* Nodes around the core */}
        <g transform="translate(400, 100)">
          <motion.g variants={item}>
            <circle r="40" className="fill-emerald-600" />
            <text textAnchor="middle" y="5" className="fill-white font-black text-[8px] uppercase">Pregunta</text>
          </motion.g>
        </g>

        <g transform="translate(600, 200)">
          <motion.g variants={item}>
            <circle r="40" className="fill-emerald-500" />
            <text textAnchor="middle" y="5" className="fill-white font-black text-[8px] uppercase">Contexto</text>
          </motion.g>
        </g>

        <g transform="translate(400, 300)">
          <motion.g variants={item}>
            <circle r="40" className="fill-amber-500" />
            <text textAnchor="middle" y="5" className="fill-white font-black text-[8px] uppercase">Respuesta</text>
          </motion.g>
        </g>

        <g transform="translate(200, 200)">
          <motion.g variants={item}>
            <circle r="40" className="fill-violet-500" />
            <text textAnchor="middle" y="5" className="fill-white font-black text-[8px] uppercase">Modelos</text>
          </motion.g>
        </g>

        {/* Jules Center */}
        <g transform="translate(400, 200)">
          <motion.g variants={item}>
            <text textAnchor="middle" y="8" className="fill-primary font-black text-xl uppercase tracking-widest">JULES</text>
          </motion.g>
        </g>

        {/* Lines connecting to center */}
        {[0, 90, 180, 270].map((angle, i) => (
          <motion.line
            key={i}
            x1={400 + Math.cos(angle * Math.PI / 180) * 40}
            y1={200 + Math.sin(angle * Math.PI / 180) * 40}
            x2={400 + Math.cos(angle * Math.PI / 180) * 120}
            y2={200 + Math.sin(angle * Math.PI / 180) * 120}
            stroke="currentColor"
            strokeWidth="2"
            className="text-primary/20"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 1, duration: 1 }}
          />
        ))}

        {/* Floating Sparks */}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <motion.circle
            key={i}
            r="2"
            className="fill-primary"
            animate={{
              x: [Math.random() * 800, Math.random() * 800],
              y: [Math.random() * 400, Math.random() * 400],
              opacity: [0, 1, 0]
            }}
            transition={{
              duration: 3 + Math.random() * 2,
              repeat: Infinity,
              delay: i * 0.5
            }}
          />
        ))}

      </motion.svg>
    </div>
  );
}
