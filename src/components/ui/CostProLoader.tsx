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
 * CostProLoader - Componente de carga minimalista de la marca CostPro.
 * Basado en el isotipo refinado con efecto neon y persecución técnica.
 */
export const CostProLoader: React.FC<CostProLoaderProps> = ({
  size = 160,
  text,
  subtext,
  showText = !!text,
  showSubtext = !!subtext,
  className
}) => {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-4", className)}
    >
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{ overflow: 'visible' }}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
        >
            <defs>
                {/* Filtro de resplandor para visibilidad en cualquier fondo */}
                <filter id="neon-glow-loader" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
                    <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                    </feMerge>
                </filter>

                {/* Degradado Verde Fosforescente Pro */}
                <linearGradient id="greenGradLoader" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4ade80" />
                    <stop offset="100%" stopColor="#22c55e" />
                </linearGradient>

                <style>{`
                    @keyframes chase-new {
                        0% { stroke-dasharray: 1, 300; stroke-dashoffset: 0; }
                        50% { stroke-dasharray: 100, 300; stroke-dashoffset: -60; }
                        100% { stroke-dasharray: 1, 300; stroke-dashoffset: -280; }
                    }

                    @keyframes rotate-new {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }

                    @keyframes breathe-new {
                        0%, 100% { transform: scale(1); opacity: 0.85; }
                        50% { transform: scale(1.05); opacity: 1; }
                    }

                    .chaser-new {
                        transform-origin: center;
                        animation: rotate-new 2.5s linear infinite, chase-new 2.2s ease-in-out infinite;
                        stroke-linecap: round;
                        filter: url(#neon-glow-loader);
                    }

                    .core-new {
                        transform-origin: center;
                        animation: breathe-new 3s ease-in-out infinite;
                        filter: url(#neon-glow-loader);
                    }

                    .brand-text-new {
                        font-family: 'Segoe UI', Roboto, Helvetica, sans-serif;
                        text-transform: uppercase;
                        letter-spacing: 0.3em;
                    }
                `}</style>
            </defs>

            {/* Guía circular técnica muy tenue */}
            <circle cx="50" cy="50" r="42" stroke="currentColor" className="text-gray-400 opacity-5" strokeWidth="0.5" />

            {/* El Chaser: La carga animada exterior */}
            <circle className="chaser-new" cx="50" cy="50" r="42" stroke="url(#greenGradLoader)" strokeWidth="3" />

            {/* El Núcleo: La "C" de CostPro refinada */}
            <g className="core-new">
                <path
                    d="M58 42 A12 12 0 1 0 58 58"
                    stroke="#22c55e"
                    strokeWidth="6.5"
                    strokeLinecap="round"
                />
            </g>
        </svg>
      </div>

      {(showText || showSubtext) && (
        <div className="flex flex-col items-center gap-1">
            {showText && (
                <span className="brand-text-new text-sm font-black text-green-600 dark:text-green-500">
                    {text}
                </span>
            )}
            {showSubtext && (
                <span className="brand-text-new text-[8px] font-bold text-slate-400">
                    {subtext}
                </span>
            )}
        </div>
      )}
    </div>
  );
};
