'use client';

import { motion } from 'framer-motion';

export default function AcademyFlowDiagram() {
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
      <div className="min-w-[600px] aspect-video flex items-center justify-center p-4">
      <motion.svg
        viewBox="0 0 800 400"
        className="w-full h-full max-w-3xl"
        variants={container}
        initial="hidden"
        animate="show"
      >
        {/* Input: PDF Manual */}
        <motion.g
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <rect x="50" y="80" width="160" height="80" rx="15" className="fill-blue-500/10 stroke-blue-500" strokeWidth="3" />
          <text x="130" y="120" textAnchor="middle" className="fill-blue-600 font-black text-[10px] uppercase">Manual Técnico</text>
          <text x="130" y="140" textAnchor="middle" className="fill-blue-400 font-bold text-[9px] uppercase">(Documento PDF)</text>
          <path d="M210 120 L320 180" className="stroke-blue-500" strokeWidth="2" markerEnd="url(#arrow-blue)" strokeDasharray="4,2" />
        </motion.g>

        {/* Input: Companion JSON */}
        <motion.g
          initial={{ x: -100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        >
          <rect x="50" y="240" width="160" height="80" rx="15" className="fill-amber-500/10 stroke-amber-500" strokeWidth="3" />
          <text x="130" y="280" textAnchor="middle" className="fill-amber-600 font-black text-[10px] uppercase">Archivo JSON</text>
          <text x="130" y="300" textAnchor="middle" className="fill-amber-400 font-bold text-[9px] uppercase">(Contexto Estructurado)</text>
          <path d="M210 280 L320 220" className="stroke-amber-500" strokeWidth="2" markerEnd="url(#arrow-amber)" strokeDasharray="4,2" />
        </motion.g>

        {/* Process: Gemini 2.5 Flash */}
        <motion.g
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.8 }}
        >
          <circle cx="400" cy="200" r="70" className="fill-violet-500/10 stroke-violet-500" strokeWidth="3" />
          <text x="400" y="195" textAnchor="middle" className="fill-violet-600 font-black text-xs uppercase">Gemini 1.5 Flash</text>
          <text x="400" y="215" textAnchor="middle" className="fill-violet-400 font-bold text-[10px] uppercase">Motor de IA</text>

          {/* Orbital animation */}
          <motion.circle
            r="5"
            className="fill-violet-500"
            animate={{
                cx: [
                  400 + 70 * Math.cos(0),
                  400 + 70 * Math.cos(Math.PI / 2),
                  400 + 70 * Math.cos(Math.PI),
                  400 + 70 * Math.cos(3 * Math.PI / 2),
                  400 + 70 * Math.cos(2 * Math.PI)
                ],
                cy: [
                  200 + 70 * Math.sin(0),
                  200 + 70 * Math.sin(Math.PI / 2),
                  200 + 70 * Math.sin(Math.PI),
                  200 + 70 * Math.sin(3 * Math.PI / 2),
                  200 + 70 * Math.sin(2 * Math.PI)
                ]
            }}
            transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
          />
        </motion.g>

        {/* Output: Flashcards */}
        <motion.g
          initial={{ x: 100, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
        >
          <rect x="590" y="150" width="160" height="100" rx="20" className="fill-emerald-500/10 stroke-emerald-500" strokeWidth="3" />
          <text x="670" y="195" textAnchor="middle" className="fill-emerald-600 font-black text-xs uppercase">Flashcards</text>
          <text x="670" y="220" textAnchor="middle" className="fill-emerald-400 font-bold text-[10px] uppercase">(Dominio Técnico)</text>
          <path d="M470 200 L580 200" className="stroke-emerald-500" strokeWidth="2" markerEnd="url(#arrow-emerald)" />
        </motion.g>

        {/* Connecting Arrows Decor */}
        <defs>
          <marker id="arrow-blue" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" className="fill-blue-500" />
          </marker>
          <marker id="arrow-amber" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" className="fill-amber-500" />
          </marker>
          <marker id="arrow-emerald" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
            <polygon points="0 0, 10 3.5, 0 7" className="fill-emerald-500" />
          </marker>
        </defs>

        {/* Data flow dots */}
        <motion.circle
          r="3"
          className="fill-blue-500"
          animate={{
            cx: [130, 400],
            cy: [120, 200],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
        <motion.circle
          r="3"
          className="fill-amber-500"
          animate={{
            cx: [130, 400],
            cy: [280, 200],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 0.5 }}
        />
        <motion.circle
          r="4"
          className="fill-emerald-500"
          animate={{
            cx: [400, 670],
            opacity: [0, 1, 0]
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1.2 }}
          cy="200"
        />

      </motion.svg>
      </div>
    </div>
  );
}
