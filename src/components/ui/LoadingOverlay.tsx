'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ViewLoadingSplash } from './ViewLoadingSplash';

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
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          <ViewLoadingSplash
            overlay
            label={progress !== undefined ? `${Math.round(progress)}%` : (message || 'PROCESANDO')}
            showTips={false}
          />

          {progress !== undefined && (
              <div className="absolute bottom-[30%] w-48 h-1 bg-muted rounded-full overflow-hidden">
                  <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-primary"
                  />
              </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
