'use client';

import React from 'react';
import { motion } from 'framer-motion';

const MobileOptimizedFlowDiagram: React.FC = () => {
  return (
    <div className="w-full aspect-video bg-slate-900 rounded-3xl overflow-hidden relative border border-white/10 shadow-2xl">
      <svg viewBox="0 0 800 450" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
        {/* Background Grid */}
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="800" height="450" fill="url(#grid)" />

        {/* Zones Labels */}
        <text x="400" y="40" textAnchor="middle" fill="rgba(255,255,255,0.4)" className="text-[10px] font-black uppercase tracking-[0.5em]">
          Ecosistema Móvil Optimizado v5.8
        </text>

        {/* Mobile Device Silhouette */}
        <rect x="280" y="60" width="240" height="360" rx="30" fill="#1e293b" stroke="#334155" strokeWidth="4" />
        <rect x="295" y="80" width="210" height="320" rx="10" fill="#0f172a" />

        {/* Notch */}
        <rect x="360" y="65" width="80" height="20" rx="10" fill="#334155" />

        {/* Ergonomic Zones */}
        {/* Upper Zone - Informational */}
        <motion.rect
          x="300" y="90" width="200" height="60" rx="8"
          fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.3)"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        />
        <text x="400" y="125" textAnchor="middle" fill="#60a5fa" className="text-[8px] font-bold uppercase">Zona Informativa</text>

        {/* Middle Zone - Browsing */}
        <motion.rect
          x="300" y="160" width="200" height="140" rx="8"
          fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255, 255, 255, 0.1)"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }}
        />
        <text x="400" y="235" textAnchor="middle" fill="rgba(255,255,255,0.3)" className="text-[8px] font-bold uppercase">Navegación y Selección</text>

        {/* Lower Zone - THUMB ZONE (Critical) */}
        <motion.rect
          x="300" y="310" width="200" height="80" rx="8"
          fill="rgba(34, 197, 94, 0.1)" stroke="rgba(34, 197, 94, 0.5)" strokeWidth="2"
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 1, type: 'spring' }}
        />
        <text x="400" y="355" textAnchor="middle" fill="#4ade80" className="text-[10px] font-black uppercase tracking-widest">Zona del Pulgar</text>
        <text x="400" y="375" textAnchor="middle" fill="#4ade80" className="text-[7px] font-bold opacity-60 uppercase">Acciones Críticas (TPV / Carrito)</text>

        {/* Features Callouts */}
        {/* 1. Real-time Feedback */}
        <g transform="translate(50, 100)">
          <line x1="100" y1="20" x2="250" y2="20" stroke="#3b82f6" strokeDasharray="4 2" />
          <circle cx="100" cy="20" r="4" fill="#3b82f6" />
          <text x="0" y="15" fill="#3b82f6" className="text-[10px] font-black uppercase">Feedback Inmediato</text>
          <text x="0" y="30" fill="rgba(255,255,255,0.5)" className="text-[8px]">Toasts y Badges Reactivos</text>
        </g>

        {/* 2. Optimized Targets */}
        <g transform="translate(50, 200)">
          <line x1="100" y1="20" x2="250" y2="40" stroke="#f59e0b" strokeDasharray="4 2" />
          <circle cx="100" cy="20" r="4" fill="#f59e0b" />
          <text x="0" y="15" fill="#f59e0b" className="text-[10px] font-black uppercase">Targets ≥44px</text>
          <text x="0" y="30" fill="rgba(255,255,255,0.5)" className="text-[8px]">Cero Errores Táctiles</text>
        </g>

        {/* 3. Real-time Cart */}
        <g transform="translate(550, 320)">
          <line x1="0" y1="40" x2="-150" y2="40" stroke="#22c55e" strokeDasharray="4 2" />
          <circle cx="0" cy="40" r="4" fill="#22c55e" />
          <text x="10" y="35" fill="#22c55e" className="text-[10px] font-black uppercase">TPV Dinámico</text>
          <text x="10" y="50" fill="rgba(255,255,255,0.5)" className="text-[8px]">Totales en vivo en FAB</text>
        </g>

        {/* Interaction Indicator */}
        <motion.circle
          cx="400" cy="350" r="15" fill="rgba(34, 197, 94, 0.4)"
          animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
          transition={{ repeat: Infinity, duration: 2 }}
        />
      </svg>
    </div>
  );
};

export default MobileOptimizedFlowDiagram;
