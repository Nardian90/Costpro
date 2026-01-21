'use client';

import React from 'react';
import { motion } from 'framer-motion';

/**
 * Componente CostProLogo
 * Un isotipo minimalista basado en una "C" perfecta e invertida.
 * Enfocado en la pureza geométrica y un diseño de vanguardia.
 */
const CostProLogo = ({ size = 120, animated = true }) => {
  // Animación de dibujo de la C invertida
  const pathVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: {
      pathLength: 0.8, // Mantiene la apertura característica de la letra C
      opacity: 1,
      transition: {
        duration: animated ? 2 : 0,
        ease: "easeInOut",
        repeat: 0
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6">
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
              <stop offset="0%" className="stop-color-start" />
              <stop offset="100%" className="stop-color-end" />
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
        className="text-center"
      >
        <h2 className="text-foreground font-black text-4xl uppercase tracking-tighter">
          COST<span className="text-green-500 dark:text-green-400">PRO</span>
        </h2>
        <p className="text-muted-foreground text-[10px] tracking-[0.2em] uppercase mt-2 font-bold">
          Protege tus costos y precios
        </p>
      </motion.div>
      <style jsx>{`
        .stop-color-start {
          stop-color: #22c55e;
        }
        .stop-color-end {
          stop-color: #10b981;
        }
        .dark .stop-color-start {
          stop-color: #4ade80;
        }
        .dark .stop-color-end {
          stop-color: #2dd4bf;
        }
      `}</style>
    </div>
  );
};

export default CostProLogo;
