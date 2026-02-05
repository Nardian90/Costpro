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
 * CostProLoader - "Ultra-Fluid International" Edition
 * Diseñado para ser visualmente impresionante y técnicamente invulnerable al lag.
 * Emplea capas de composición separadas (Hardware Acceleration).
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
    <div className={cn("flex flex-col items-center justify-center gap-8", className)}>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes cp-orbit-${id} {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @keyframes cp-inner-spin-${id} {
          0% { transform: rotate(0deg) scale(1); }
          50% { transform: rotate(-180deg) scale(1.1); }
          100% { transform: rotate(-360deg) scale(1); }
        }

        @keyframes cp-breathe-${id} {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.1); opacity: 1; }
        }

        @keyframes cp-glow-pulse-${id} {
          0%, 100% { box-shadow: 0 0 20px rgba(34, 197, 94, 0.2); }
          50% { box-shadow: 0 0 40px rgba(34, 197, 94, 0.4); }
        }

        .cp-viewport-${id} {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          isolation: isolate;
        }

        .cp-layer-main-${id} {
          position: absolute;
          width: 100%;
          height: 100%;
          animation: cp-orbit-${id} 1.8s cubic-bezier(0.65, 0, 0.35, 1) infinite;
          will-change: transform;
        }

        .cp-layer-secondary-${id} {
          position: absolute;
          width: 90%;
          height: 90%;
          animation: cp-inner-spin-${id} 4s cubic-bezier(0.45, 0.05, 0.55, 0.95) infinite;
          opacity: 0.3;
          will-change: transform;
        }

        .cp-core-identity-${id} {
          position: relative;
          z-index: 10;
          animation: cp-breathe-${id} 2s ease-in-out infinite;
          filter: drop-shadow(0 0 15px rgba(34, 197, 94, 0.5));
          will-change: transform, opacity;
        }

        .cp-text-wrap-${id} {
          text-align: center;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          perspective: 1000px;
        }

        .cp-brand-h1-${id} {
          font-family: 'Segoe UI', system-ui, sans-serif;
          font-weight: 950;
          font-size: 1.1rem;
          letter-spacing: 0.5em;
          text-transform: uppercase;
          background: linear-gradient(135deg, #059669 0%, #10b981 50%, #059669 100%);
          background-size: 200% auto;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: cp-shimmer-${id} 3s linear infinite;
        }

        @keyframes cp-shimmer-${id} {
          to { background-position: 200% center; }
        }

        .cp-sub-info-${id} {
          font-size: 10px;
          font-weight: 800;
          color: #94a3b8;
          text-transform: uppercase;
          letter-spacing: 0.3em;
          opacity: 0.6;
        }
      `}} />

      <div className={`cp-viewport-${id}`} style={{ width: size, height: size }}>
        {/* Capa de composición 1: El Chaser de alto contraste */}
        <div className={`cp-layer-main-${id}`}>
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
            <defs>
              <linearGradient id={`grad1-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22c55e" stopOpacity="0" />
                <stop offset="50%" stopColor="#22c55e" stopOpacity="0.5" />
                <stop offset="100%" stopColor="#22c55e" />
              </linearGradient>
            </defs>
            <circle
              cx="50" cy="50" r="45"
              stroke={`url(#grad1-${id})`}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray="140 140"
            />
          </svg>
        </div>

        {/* Capa de composición 2: Geometría técnica sutil */}
        <div className={`cp-layer-secondary-${id}`}>
          <svg viewBox="0 0 100 100" fill="none" className="w-full h-full">
            <circle cx="50" cy="50" r="48" stroke="#10b981" strokeWidth="0.5" strokeDasharray="1 6" />
            <circle cx="50" cy="50" r="40" stroke="#10b981" strokeWidth="0.5" strokeDasharray="4 8" />
          </svg>
        </div>

        {/* Identidad Central: La "C" Premium */}
        <div className={`cp-core-identity-${id}`} style={{ width: size * 0.35 }}>
            <svg viewBox="0 0 100 100" fill="none">
                <path
                    d="M68 32 A25 25 0 1 0 68 68"
                    fill="none"
                    stroke="#047857"
                    strokeWidth="14"
                    strokeLinecap="round"
                />
            </svg>
        </div>
      </div>

      {(showText || showSubtext) && (
        <div className="flex flex-col items-center gap-2">
          {showText && <div className={`cp-brand-h1-${id}`}>{text}</div>}
          {showSubtext && <div className={`cp-sub-info-${id}`}>{subtext}</div>}
        </div>
      )}
    </div>
  );
};
