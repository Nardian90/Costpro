'use client';

import { motion } from 'framer-motion';
import { FileSpreadsheet, Cpu, FileText, Zap } from 'lucide-react';

export default function AutomationWorkflowDiagram() {
  return (
    <div
      className="relative w-full min-h-[500px] lg:aspect-[16/9] bg-gradient-to-br from-primary/10 via-background to-violet-500/10 rounded-[2.5rem] sm:rounded-[3rem] border border-border/50 overflow-x-auto no-scrollbar flex items-center justify-center p-6 sm:p-12 shadow-2xl"
      style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
    >
      <div className="flex flex-col sm:flex-row items-center justify-between w-full min-w-[600px] max-w-4xl relative z-10 gap-8 sm:gap-4">

        {/* Excel Side */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative group shrink-0"
        >
          <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-[2rem] bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shadow-2xl group-hover:scale-110 transition-transform duration-500 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent" />
            <FileSpreadsheet className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600 relative z-10" />
            <motion.div
              className="absolute -top-1 -right-1 w-8 h-8 rounded-full bg-emerald-500 text-foreground flex items-center justify-center shadow-lg border-2 border-background z-20"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <span className="text-xs font-black">CSV</span>
            </motion.div>
          </div>
          <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-xs font-black uppercase tracking-widest text-emerald-700/60">Datos Maestros</span>
          </div>
        </motion.div>

        {/* Dynamic Connector 1 */}
        <div className="w-1 sm:flex-1 h-12 sm:h-1 px-4 relative">
          <div className="absolute inset-0 bg-emerald-500/10 rounded-full overflow-hidden">
            <motion.div
              className="hidden sm:block h-full w-20 bg-gradient-to-r from-transparent via-emerald-500 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
              className="sm:hidden w-full h-10 bg-gradient-to-b from-transparent via-emerald-500 to-transparent"
              animate={{ y: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </div>

        {/* System (The Brain) */}
        <motion.div
          animate={{
            boxShadow: [
              '0 0 0px rgba(16,185,129,0)',
              '0 0 50px rgba(16,185,129,0.25)',
              '0 0 0px rgba(16,185,129,0)'
            ]
          }}
          transition={{ duration: 3, repeat: Infinity }}
          className="relative shrink-0"
        >
          <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-[2.5rem] sm:rounded-[3rem] bg-foreground flex items-center justify-center shadow-2xl relative z-10 overflow-hidden">
             <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="absolute inset-0 opacity-30 bg-[conic-gradient(from_0deg,transparent,theme(colors.primary.DEFAULT),transparent)]"
            />
            <Cpu className="w-12 h-12 sm:w-16 sm:h-16 text-background relative z-20" />
            <motion.div
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute bottom-6 flex gap-1.5"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            </motion.div>
          </div>
          <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-xs font-black uppercase tracking-widest text-foreground">Algoritmo CostPro</span>
          </div>
        </motion.div>

        {/* Dynamic Connector 2 */}
        <div className="w-1 sm:flex-1 h-12 sm:h-1 px-4 relative">
          <div className="absolute inset-0 bg-violet-500/10 rounded-full overflow-hidden">
            <motion.div
              className="hidden sm:block h-full w-20 bg-gradient-to-r from-transparent via-violet-500 to-transparent"
              animate={{ x: ['-100%', '200%'] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "linear", delay: 0.75 }}
            />
            <motion.div
              className="sm:hidden w-full h-10 bg-gradient-to-b from-transparent via-violet-500 to-transparent"
              animate={{ y: ['-100%', '200%'] }}
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
            <span className="text-xs font-black uppercase tracking-widest text-violet-700/60">Fichas Finalizadas</span>
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
