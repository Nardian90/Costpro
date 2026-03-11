'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import CostProLogo from './CostProLogo';

interface SplashScreenProps {
  onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [isVisible, setIsVisible] = useState(true);
  const finishedRef = useRef(false);

  const handleFinish = React.useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsVisible(false);
    // Give time for exit animation
    setTimeout(onFinish, 400);
  }, [onFinish]);

  useEffect(() => {
    // Optimized timing: 1.2s for logo + brief pause
    const timer = setTimeout(handleFinish, 1200);

    // Failsafe for mobile/low-end devices: ensure splash closes after 3s max
    const failsafe = setTimeout(handleFinish, 3000);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafe);
    };
  }, [handleFinish]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          key="splash"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background allow-animations"
        >
          {/* Background grid from CyberShell to match the application background */}
          <div className="absolute inset-0 z-0 opacity-10">
            <div
              className="absolute inset-0 bg-grid-white/[0.2]"
              style={{
                maskImage: 'linear-gradient(to bottom, white, transparent)',
              }}
            />
          </div>

          <div className="relative z-10">
            <CostProLogo size={160} animated={true} />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
