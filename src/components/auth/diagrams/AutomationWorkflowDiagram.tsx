'use client';

import { motion } from 'framer-motion';
import { FileSpreadsheet, Cpu, FileText, Zap } from 'lucide-react';

export default function AutomationWorkflowDiagram() {
  return (
    <div
      className="relative w-full aspect-[16/9] bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 rounded-[3rem] border border-border/50 overflow-hidden flex items-center justify-center p-8 shadow-2xl"
      style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
    >
      <div className="flex items-center justify-between w-full max-w-3xl relative z-10">

        {/* Excel Side */}
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          className="relative group"
        >
          <div className="w-20 h-20 rounded-3xl bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-xl group-hover:scale-110 transition-transform duration-500">
            <FileSpreadsheet className="w-10 h-10 text-emerald-600" />
            <motion.div
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-[10px] font-black">CSV</span>
            </motion.div>
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700/60">Datos Maestros</span>
          </div>
        </motion.div>

        {/* Dynamic Connector 1 */}
        <div className="flex-1 px-4 relative h-1">
          <div className="absolute inset-0 bg-emerald-500/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full w-20 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>

        {/* System (The Brain) */}
        <motion.div
          animate={{
            boxShadow: [
              '0 0 0px rgba(16,185,129,0)',
              '0 0 40px rgba(16,185,129,0.2)',
              '0 0 0px rgba(16,185,129,0)'
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="relative"
        >
          <div className="w-28 h-28 rounded-[2.5rem] bg-foreground flex items-center justify-center shadow-2xl relative z-10 overflow-hidden">
             <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 opacity-20 bg-[conic-gradient(from_0deg,transparent,theme(colors.primary.DEFAULT),transparent)]"
            />
            <Cpu className="w-12 h-12 text-background relative z-20" />
            <motion.div
              animate={{ opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute bottom-4 flex gap-1"
            >
              <div className="w-1 h-1 rounded-full bg-primary" />
              <div className="w-1 h-1 rounded-full bg-primary" />
              <div className="w-1 h-1 rounded-full bg-primary" />
            </motion.div>
          </div>
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-foreground">Algoritmo CostPro</span>
          </div>
        </motion.div>

        {/* Dynamic Connector 2 */}
        <div className="flex-1 px-4 relative h-1">
          <div className="absolute inset-0 bg-violet-500/10 rounded-full overflow-hidden">
            <motion.div
              className="h-full w-20 bg-gradient-to-r from-transparent via-violet-500 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: 0.75 }}
            />
          </div>
        </div>

        {/* Cost Sheets Output Grid */}
        <div className="relative">
          <div className="grid grid-cols-2 gap-2 w-24">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, scale: 0 }}
                animate={{
                  opacity: [0, 1, 1, 0],
                  scale: [0.8, 1, 1, 0.8],
                  y: [10, 0, -10, -20]
                }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: "easeInOut"
                }}
                className="aspect-[3/4] rounded-lg bg-background border border-violet-500/20 shadow-sm flex items-center justify-center flex-col p-1"
              >
                <FileText className="w-6 h-6 text-violet-600 mb-1" />
                <div className="w-full h-1 bg-violet-500/10 rounded-full" />
              </motion.div>
            ))}
          </div>
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[10px] font-black uppercase tracking-widest text-violet-700/60">Fichas Finalizadas</span>
          </div>

          <motion.div
            className="absolute -top-6 -right-6"
            animate={{ y: [0, -5, 0] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <Zap className="w-5 h-5 text-amber-500 fill-amber-500" />
          </motion.div>
        </div>

      </div>

      {/* Background Decorative Elements */}
      <div className="absolute inset-0 opacity-[0.05] pointer-events-none"
           style={{ backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

      <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-transparent via-transparent to-background/20" />
    </div>
  );
}
