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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/40 backdrop-blur-md"
          style={{ backdropFilter: 'blur(8px) brightness(0.8)' }}
        >
          <div className="relative flex flex-col items-center p-12 rounded-[2.5rem] bg-white opacity-[0.98] shadow-[0_20px_60px_-15px_rgba(0,0,0,0.3)] border border-gray-100 overflow-hidden">
            {/* Floating particles for innovation */}
            <div className="absolute inset-0 pointer-events-none">
                {[...Array(6)].map((_, i) => (
                    <motion.div
                        key={i}
                        animate={{
                            y: [0, -20, 0],
                            opacity: [0.1, 0.3, 0.1],
                            scale: [1, 1.2, 1]
                        }}
                        transition={{
                            duration: 3 + i,
                            repeat: Infinity,
                            ease: "easeInOut"
                        }}
                        className="absolute w-2 h-2 rounded-full bg-primary/20"
                        style={{
                            top: `${Math.random() * 100}%`,
                            left: `${Math.random() * 100}%`
                        }}
                    />
                ))}
            </div>

            <div className="relative mb-16"> {/* Increased margin from 10 to 16 */}
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-12 rounded-full border-t-2 border-primary/30 border-dashed"
                />
                <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-6 rounded-full border-r-2 border-primary/10 border-dotted"
                />
                <CostProLogo size={140} animated={true} />
            </div>

            <div className="space-y-8 w-full max-w-xs text-center relative z-10">
                {message && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2"
                >
                    <p className="text-[11px] font-black uppercase tracking-[0.3em] text-gray-500 opacity-80">
                        Optimizando Finanzas
                    </p>
                    <p className="text-sm font-bold text-[#374151] italic">
                        {message}
                    </p>
                </motion.div>
                )}

                {progress !== undefined && (
                    <div className="space-y-6">
                        <div className="w-full h-2.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200 relative">
                            <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${progress}%` }}
                                className="h-full bg-primary shadow-[0_0_15px_#16a34a66]"
                            />
                        </div>
                        <motion.p
                            key={progress}
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-5xl font-bold text-[#374151] italic tracking-tighter"
                        >
                            {progress}<span className="text-primary text-2xl ml-1 font-black">%</span>
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
