'use client';

import React, { useEffect, useRef, useCallback } from 'react';

// ── Enterprise-grade confetti celebration ──
// Uses canvas-confetti library for realistic particle physics
interface ConfettiProps {
  active: boolean;
  duration?: number; // ms, default 3500
}

const Confetti: React.FC<ConfettiProps> = ({ active, duration = 3500 }) => {
  const firedRef = useRef(false);

  const fire = useCallback(async () => {
    if (firedRef.current) return;
    firedRef.current = true;

    try {
      const confetti = (await import('canvas-confetti')).default;

      // Burst 1: center
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#06b6d4', '#3b82f6', '#f59e0b', '#8b5cf6'],
      });

      // Burst 2: left cannon
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 60,
          spread: 55,
          origin: { x: 0 },
        });
      }, 200);

      // Burst 3: right cannon
      setTimeout(() => {
        confetti({
          particleCount: 50,
          angle: 120,
          spread: 55,
          origin: { x: 1 },
        });
      }, 400);

      // Final celebration shower
      setTimeout(() => {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.4, x: 0.5 },
          colors: ['#10b981', '#06b6d4', '#3b82f6', '#f59e0b', '#8b5cf6', '#f43f5e'],
          startVelocity: 35,
          gravity: 0.8,
          ticks: 200,
          shapes: ['circle', 'square'],
        });
      }, 700);

    } catch {
      // canvas-confetti not available — silent fallback
    }
  }, []);

  useEffect(() => {
    if (active) {
      firedRef.current = false;
      fire();
    } else {
      firedRef.current = false;
    }
  }, [active, fire]);

  return null; // Canvas is managed by canvas-confetti globally
};

export default React.memo(Confetti);
