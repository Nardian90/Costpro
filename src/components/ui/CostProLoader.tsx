'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface CostProLoaderProps {
  size?: number;
  text?: string;
  subtext?: string;
  showText?: boolean;
  showSubtext?: boolean;
  className?: string;
}

/**
 * CostProLoader - Componente de carga oficial de la marca CostPro.
 * Implementa la animación de "chaser" y rotación usando SMIL nativo para
 * garantizar el funcionamiento en todos los navegadores y entornos de ejecución.
 */
export const CostProLoader: React.FC<CostProLoaderProps> = ({
  size = 180,
  text,
  subtext,
  showText = !!text,
  showSubtext = !!subtext,
  className
}) => {
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={cn("flex flex-col items-center justify-center gap-4", className)}>
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
            width="100%"
            height="100%"
            viewBox="0 0 240 240"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="overflow-visible"
        >
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>

            <filter id={`glow-${id}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Anillo de Guía Técnico (Background) */}
          <circle cx="120" cy="120" r="70" stroke="#f1f5f9" strokeWidth="2" fill="none" />

          {/* El Chaser: Anillo activo con animación de persistencia y rotación */}
          <circle
            cx="120" cy="120" r="70"
            stroke={`url(#grad-${id})`}
            strokeWidth="6"
            strokeLinecap="round"
            filter={`url(#glow-${id})`}
            fill="none"
          >
            {/* Animación: Rotación continua */}
            <animateTransform
                attributeName="transform"
                type="rotate"
                from="0 120 120"
                to="360 120 120"
                dur="2s"
                repeatCount="indefinite"
            />
            {/* Animación: Efecto de estiramiento y contracción (Chase) */}
            <animate
                attributeName="stroke-dasharray"
                values="1,300; 150,300; 1,300"
                dur="1.5s"
                repeatCount="indefinite"
            />
            {/* Animación: Desplazamiento del trazo */}
            <animate
                attributeName="stroke-dashoffset"
                values="0; -100; -280"
                dur="1.5s"
                repeatCount="indefinite"
            />
          </circle>

          {/* Núcleo de Identidad: La "C" de CostPro con efecto de respiración */}
          <g>
             <path
                d="M132 108 A18 18 0 1 0 132 132"
                fill="none"
                stroke="#059669"
                strokeWidth="10"
                strokeLinecap="round"
                filter={`url(#glow-${id})`}
            />
            <animate
                attributeName="opacity"
                values="0.6; 1; 0.6"
                dur="3s"
                repeatCount="indefinite"
            />
          </g>
        </svg>
      </div>

      {(showText || showSubtext) && (
        <div className="flex flex-col items-center gap-1">
            {showText && (
                <span className="text-sm font-black text-green-700 dark:text-green-500 uppercase tracking-[0.2em] font-sans">
                    {text}
                </span>
            )}
            {showSubtext && (
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] font-sans">
                    {subtext}
                </span>
            )}
        </div>
      )}
    </div>
  );
};
