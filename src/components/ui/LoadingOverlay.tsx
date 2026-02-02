'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CostProLogo from '../CostProLogo';

interface LoadingOverlayProps {
  isVisible: boolean;
  message?: string;
  progress?: number;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ isVisible, message, progress }) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/20 backdrop-blur-xl"
        >
          <div className="relative flex flex-col items-center p-12 rounded-[3rem] bg-white/5 border border-white/10 shadow-2xl overflow-hidden">
            {/* Floating particles for innovation */}
            <div className="absolute inset-0 pointer-events-none">
                {[...Array(6)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            y: [0, -20, 0],
                            opacity: [0.2, 0.5, 0.2],
                            scale: [1, 1.2, 1]
                        }}
                        transition={{
                            duration: 3 + i,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="absolute w-2 h-2 rounded-full bg-primary/30"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`
                        }}
                    />
                ))}
            </div>

            <div className="relative mb-10">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-12 rounded-full border-t-2 border-primary/40 border-dashed"
                />
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-6 rounded-full border-r-2 border-white/20 border-dotted"
                />
                <CostProLogo size={140} animated={true} />
            </div>

            <div className="space-y-6 w-full max-w-xs text-center relative z-10">
                {message && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                >
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-white drop-shadow-lg opacity-80">
                        Optimizando Finanzas
                    </p>
                    <p className="text-sm font-bold text-primary/90 italic">
                        {message}
                    </p>
                </motion.div>
                )}

                {progress !== undefined && (
                    <div className="space-y-4">
                        <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden border border-white/5 relative">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-gradient-to-r from-primary/50 to-primary shadow-[0_0_20px_rgba(var(--primary),0.6)]"
                            />
                        </div>
                        <motion.p
                            key={progress}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-4xl font-black text-white italic tracking-tighter"
                        >
                            {progress}<span className="text-primary text-xl ml-1">%</span>
                        </motion.p>
                    </div>
                )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
