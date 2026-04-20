'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';

/* ── Animated Counter Hook ── */
export function useAnimatedCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const start = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
      else setCompleted(true);
    };

    requestAnimationFrame(animate);
  }, [target, duration, hasStarted]);

  return { count, hasStarted, completed, start };
}

/* ── Spring-based Animated Counter Component ── */
export function AnimatedStatCounter({ value, prefix, decimals, isVisible }: {
  value: number;
  prefix: string;
  decimals: number;
  isVisible: boolean;
}) {
  const spring = useSpring(0, { stiffness: 100, damping: 30, duration: 2500 });
  const display = useTransform(spring, (latest) => {
    if (decimals > 0) return latest.toFixed(decimals);
    return Math.floor(latest).toLocaleString();
  });

  useEffect(() => {
    if (isVisible) {
      spring.set(value);
    }
  }, [isVisible, value, spring]);

  return (
    <motion.span className="tabular-nums counter-glow">{prefix}<motion.span>{display}</motion.span></motion.span>
  );
}
