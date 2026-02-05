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
 * CostProLoader - Componente de carga premium de la marca CostPro.
 * Implementa una animación fluida con el núcleo de identidad de la marca.
 */
export const CostProLoader: React.FC<CostProLoaderProps> = ({
  size = 240,
  text = "COSTPRO",
  subtext = "Sincronizando Motor de Costos",
  showText = true,
  showSubtext = true,
  className
}) => {
  return (
    <div
      className={cn("flex flex-col items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 240 240"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="overflow-visible"
      >
        <defs>
          <linearGradient id="brand-grad-loader" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>

          <filter id="glow-loader" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <style>{`
            @keyframes chase {
              0% { stroke-dasharray: 1, 300; stroke-dashoffset: 0; }
              50% { stroke-dasharray: 150, 300; stroke-dashoffset: -100; }
              100% { stroke-dasharray: 1, 300; stroke-dashoffset: -280; }
            }

            @keyframes breathe {
              0%, 100% { transform: scale(1); opacity: 0.8; }
              50% { transform: scale(1.1); opacity: 1; }
            }

            @keyframes rotate {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }

            .chaser {
              transform-origin: center;
              animation: rotate 2s linear infinite, chase 1.5s ease-in-out infinite;
              stroke-linecap: round;
            }

            .core-loader {
              transform-origin: 120px 120px;
              animation: breathe 3s ease-in-out infinite;
            }

            .brand-ui-text-loader {
              font-family: 'Segoe UI', Roboto, Helvetica, sans-serif;
              text-transform: uppercase;
              letter-spacing: 0.2em;
            }
          `}</style>
        </defs>

        {/* Anillo de Guía (Background) */}
        <circle cx="120" cy="120" r="70" stroke="#f1f5f9" strokeWidth="2" />

        {/* Anillos Activos (Efecto Jules/Gemini) */}
        <circle className="chaser" cx="120" cy="120" r="70" stroke="url(#brand-grad-loader)" strokeWidth="6" filter="url(#glow-loader)" />

        {/* Núcleo de Identidad: La C de CostPro */}
        <g className="core-loader">
           <path
            d="M 120, 120 m -35, 0 a 35,35 0 1,0 70,0 a 35,35 0 1,0 -70,0"
            stroke="url(#brand-grad-loader)"
            strokeWidth="8"
            strokeLinecap="round"
            style={{ transform: 'rotate(135deg)', transformOrigin: '120px 120px' }}
            strokeDasharray="175 220"
          />
          {/* Sutil checkmark de validación */}
          <path d="M116 120 L119 123 L125 117" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </g>

        {/* Marca Centralizada */}
        {showText && (
          <text x="120" y="175" className="brand-ui-text-loader" textAnchor="middle" fontSize="16" fill="#065f46" fontWeight="800">
            {text}
          </text>
        )}

        {/* Subtexto Inferior de Sistema */}
        {showSubtext && (
          <text x="120" y="215" className="brand-ui-text-loader" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="600">
            {subtext}
          </text>
        )}
      </svg>
    </div>
  );
};
