'use client';

import { motion } from 'framer-motion';

/**
 * Building3D — Three stacked rectangles representing a company/building.
 *
 * This is a decorative 3D element shown only in Enhanced mode (when the
 * <html> element has class 'mode-enhanced'). It uses CSS 3D transforms
 * with perspective to create a subtle floating building animation.
 *
 * The three rectangles represent:
 * - Top:    Strategic level (management, planning)
 * - Middle: Operational level (production, sales)
 * - Bottom: Foundation level (inventory, resources)
 *
 * Colors are derived from the theme's primary color via CSS variables,
 * so it adapts to light/dark mode automatically.
 *
 * Performance: Uses transform-only animations (GPU-accelerated).
 * Respects prefers-reduced-motion via the .mode-performance class
 * (when performance mode is active, this component is not rendered at all).
 */
export function Building3D() {
  return (
    <div
      className="relative w-24 h-24 sm:w-32 sm:h-32"
      style={{
        perspective: '400px',
      }}
      aria-hidden="true"
    >
      <motion.div
        className="relative w-full h-full"
        style={{
          transformStyle: 'preserve-3d',
        }}
        animate={{
          rotateY: [0, 15, 0, -15, 0],
          rotateX: [0, 5, 0, -5, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      >
        {/* Top rectangle — Strategic level */}
        <motion.div
          className="absolute left-1/2 top-2 w-12 h-5 sm:w-16 sm:h-6 -translate-x-1/2 rounded-md shadow-lg"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.8), hsl(var(--primary) / 0.5))',
            transform: 'translateZ(20px)',
            boxShadow: '0 4px 12px hsl(var(--primary) / 0.3), inset 0 1px 0 hsl(var(--primary-foreground) / 0.2)',
          }}
          animate={{
            y: [0, -3, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          {/* Windows row */}
          <div className="flex justify-around items-center h-full px-1">
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
          </div>
        </motion.div>

        {/* Middle rectangle — Operational level */}
        <motion.div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-6 sm:w-20 sm:h-8 rounded-md shadow-lg"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.6), hsl(var(--primary) / 0.35))',
            transform: 'translateZ(10px)',
            boxShadow: '0 4px 12px hsl(var(--primary) / 0.25), inset 0 1px 0 hsl(var(--primary-foreground) / 0.15)',
          }}
          animate={{
            y: [0, -2, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
        >
          {/* Windows row */}
          <div className="flex justify-around items-center h-full px-1.5">
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/40" />
          </div>
        </motion.div>

        {/* Bottom rectangle — Foundation level */}
        <motion.div
          className="absolute left-1/2 bottom-2 -translate-x-1/2 w-20 h-7 sm:w-24 sm:h-9 rounded-md shadow-lg"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--primary) / 0.4), hsl(var(--primary) / 0.2))',
            transform: 'translateZ(0px)',
            boxShadow: '0 6px 16px hsl(var(--primary) / 0.2), inset 0 1px 0 hsl(var(--primary-foreground) / 0.1)',
          }}
          animate={{
            y: [0, -1, 0],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 1,
          }}
        >
          {/* Door */}
          <div className="absolute left-1/2 bottom-0 -translate-x-1/2 w-3 h-4 sm:w-4 sm:h-5 rounded-t-sm bg-primary-foreground/20" />
          {/* Windows */}
          <div className="flex justify-around items-start h-3 px-2 pt-1">
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/30" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/30" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/30" />
            <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-primary-foreground/30" />
          </div>
        </motion.div>

        {/* Ground shadow */}
        <div
          className="absolute left-1/2 bottom-0 -translate-x-1/2 w-24 h-2 sm:w-28 sm:h-2.5 rounded-full blur-md"
          style={{
            background: 'radial-gradient(ellipse, hsl(var(--primary) / 0.2), transparent)',
          }}
        />
      </motion.div>
    </div>
  );
}
