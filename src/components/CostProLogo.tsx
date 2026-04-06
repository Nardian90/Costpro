'use client';

import React from 'react';
import { motion, Variants } from 'framer-motion';

interface CostProLogoProps {
  size?: number;
  animated?: boolean;
  className?: string;
  showTagline?: boolean;
}

/**
 * Componente CostProLogo
 * Un isotipo minimalista basado en una "C" perfecta e invertida.
 * Enfocado en la pureza geométrica y un diseño de vanguardia.
 */
const CostProLogo: React.FC<CostProLogoProps> = ({ size = 120, animated = true, className = "", showTagline = true }) => {
  // Animación de dibujo de la C invertida
  const pathVariants: Variants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 0.8, // Mantiene la apertura característica de la letra C
      opacity: 1,
      transition: {
        duration: animated ? 1 : 0,
        ease: "easeInOut",
        repeat: 0
      }
    }
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-6 ${className}`} translate="no">
      <div className="relative" style={{ width: size, height: size }}>
        {/* Resplandor sutil (Glow) de fondo para profundidad */}
        <div className="absolute inset-0 bg-green-500/10 dark:bg-green-400/10 blur-[40px] rounded-full" />

        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="relative z-10 w-full h-full"
          style={{ transform: 'rotate(135deg)' }} // Rotación invertida para cambiar la orientación de la apertura
        >
          <defs>
            <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" className="logo-stop-start" />
              <stop offset="100%" className="logo-stop-end" />
            </linearGradient>

            <filter id="pure-glow">
              <feGaussianBlur stdDeviation="1" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* El trazo de la C pura, minimalista e invertida */}
          <motion.path
            d="M 50, 50 m -35, 0 a 35,35 0 1,0 70,0 a 35,35 0 1,0 -70,0"
            stroke="url(#logo-gradient)"
            strokeWidth="8"
            strokeLinecap="round"
            variants={pathVariants}
            initial="hidden"
            animate="visible"
            filter="url(#pure-glow)"
          />
        </svg>
      </div>

      {/* Tipografía de la marca optimizada */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.5 }}
        className="text-center px-4"
      >
        <h2 className="text-foreground font-black text-[clamp(1.5rem,8vw,1.875rem)] uppercase tracking-tighter leading-none">
          COST<span className="text-green-500 dark:text-green-400">PRO</span>
        </h2>
        {showTagline && (
          <p className="text-muted-foreground text-[clamp(0.6rem,2vw,0.75rem)] tracking-[0.2em] uppercase mt-2 font-bold opacity-80">
            Protege tus costos y precios
          </p>
        )}
      </motion.div>
      <style>{`
        .logo-stop-start {
          stop-color: #22c55e;
        }
        .logo-stop-end {
          stop-color: #10b981;
        }
        .dark .logo-stop-start {
          stop-color: #4ade80;
        }
        .dark .logo-stop-end {
          stop-color: #2dd4bf;
        }
      `}</style>
    </div>
  );
};

export default CostProLogo;
