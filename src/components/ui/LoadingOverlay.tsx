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
        >
          <div className="relative flex flex-col items-center">
            <div className="relative mb-8">
                <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
                    className="absolute -inset-8 rounded-full border-t-2 border-primary/30 border-dashed"
                />
                <CostProLogo size={120} animated={true} />
            </div>

            {progress !== undefined && progress > 0 && (
                <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden mb-4 border border-white/5">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        className="h-full bg-primary shadow-[0_0_15px_rgba(var(--primary),0.5)]"
                    />
                </div>
            )}

            {message && (
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[10px] font-black uppercase tracking-[0.2em] text-white drop-shadow-md text-center"
              >
                {message}
              </motion.p>
            )}

            {progress !== undefined && progress > 0 && (
                <p className="mt-2 text-2xl font-black text-primary italic">
                    {progress}%
                </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
