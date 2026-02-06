'use client';

import { motion } from 'framer-motion';
import { FileSpreadsheet, Cpu, FileText } from 'lucide-react';

export default function AutomationWorkflowDiagram() {
  return (
    <div className="relative w-full aspect-[16/9] bg-primary/5 rounded-3xl border border-primary/10 overflow-hidden flex items-center justify-center p-8">
      <div className="flex items-center justify-between w-full max-w-2xl relative z-10">

        {/* Excel Side */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-lg">
            <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Excel Data</span>
        </motion.div>

        {/* Connection Arrows (Particles) */}
        <div className="flex-1 relative h-2 mx-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary"
              animate={{
                x: ['0%', '400%'],
                opacity: [0, 1, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.6,
                ease: "linear"
              }}
            />
          ))}
        </div>

        {/* System (Core) */}
        <motion.div
          animate={{
            scale: [1, 1.05, 1],
            rotate: [0, 5, -5, 0]
          }}
          transition={{ duration: 4, repeat: Infinity }}
          className="flex flex-col items-center gap-2"
        >
          <div className="w-24 h-24 rounded-[2rem] bg-primary flex items-center justify-center shadow-2xl relative">
            <Cpu className="w-12 h-12 text-white" />
            <motion.div
              className="absolute inset-0 rounded-[2rem] border-4 border-primary/30"
              animate={{ scale: [1, 1.4], opacity: [0.5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            />
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">CostPro Engine</span>
        </motion.div>

        {/* Connection Arrows (Output) */}
        <div className="flex-1 relative h-2 mx-4">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-violet-500"
              animate={{
                x: ['0%', '400%'],
                opacity: [0, 1, 0]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                delay: i * 0.6 + 1,
                ease: "linear"
              }}
            />
          ))}
        </div>

        {/* Cost Sheets Output */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative w-16 h-16">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  y: [20, 0, -20, -40],
                  scale: [0.8, 1, 1, 0.8],
                  rotate: i * 15 - 15
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: "easeOut"
                }}
                className="absolute inset-0 rounded-xl bg-violet-500/10 flex items-center justify-center border border-violet-500/20 shadow-md backdrop-blur-sm"
              >
                <FileText className="w-8 h-8 text-violet-600" />
              </motion.div>
            ))}
          </div>
          <span className="text-[10px] font-black uppercase tracking-widest text-violet-700 mt-2">Fichas Generadas</span>
        </div>

      </div>

      {/* Decorative background grid */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
    </div>
  );
}
