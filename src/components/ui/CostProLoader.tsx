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
 * CostProLoader - "Minimalist Splash" Edition
 * Basado únicamente en la identidad "C" con su efecto característico.
 */
export const CostProLoader: React.FC<CostProLoaderProps> = ({
  size = 120,
  text,
  subtext,
  showText = !!text,
  showSubtext = !!subtext,
  className
}) => {
  const id = React.useId().replace(/:/g, '');

  return (
    <div className={cn("flex flex-col items-center justify-center gap-6", className)}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cp-breathe-${id} {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.05); opacity: 1; filter: drop-shadow(0 0 20px rgba(34, 197, 94, 0.4)); }
        }

        @keyframes cp-spin-slow-${id} {
          from { transform: rotate(135deg); }
          to { transform: rotate(495deg); }
        }

        @keyframes cp-shimmer-${id} {
          to { background-position: 200% center; }
        }

        .cp-viewport-${id} {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          animation: cp-breathe-${id} 2.5s ease-in-out infinite;
          will-change: transform, opacity;
        }

        .cp-logo-c-${id} {
          transform: rotate(135deg);
          /* animation: cp-spin-slow-${id} 3s linear infinite; */ /* Descomentar si se prefiere rotación */
        }

        .cp-brand-text-${id} {
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-weight: 950;
          font-size: 1rem;
          letter-spacing: 0.4em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #059669 0%, #10b981 50%, #059669 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: cp-shimmer-${id} 3s linear infinite;
        }

        .cp-sub-info-${id} {
          font-size: 9px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.3em;
          opacity: 0.6;
        }
      `}} />

      <div className={`cp-viewport-${id}`} style={{ width: size, height: size }}>
        {/* Resplandor sutil (Glow) de fondo */}
        <div className="absolute inset-0 bg-green-500/10 dark:bg-green-400/10 blur-[30px] rounded-full" />

        <svg
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={`relative z-10 w-full h-full cp-logo-c-${id}`}
        >
          <defs>
            <linearGradient id={`grad-${id}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#22c55e" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>

            <filter id={`glow-${id}`}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* El trazo de la C pura, minimalista e invertida */}
          <path
            d="M 50, 50 m -35, 0 a 35,35 0 1,0 70,0 a 35,35 0 1,0 -70,0"
            stroke={`url(#grad-${id})`}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray="175 220" /* Mantiene la apertura característica (aprox 80%) */
            filter={`url(#glow-${id})`}
          />
        </svg>
      </div>

      {(showText || showSubtext) && (
        <div className="flex flex-col items-center gap-1.5">
          {showText && <div className={`cp-brand-text-${id}`}>{text}</div>}
          {showSubtext && <div className={`cp-sub-info-${id}`}>{subtext}</div>}
        </div>
      )}
    </div>
  );
};
