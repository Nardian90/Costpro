"use client";

import React, { useRef } from 'react';
import { motion } from 'framer-motion';
import { useAssistedModeStore } from '@/store/assisted-mode-store';
import { cn } from '@/lib/utils';

interface NodeProps {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gradient: string;
  stroke: string;
  icon: string;
  label: string;
  sub: string;
  fila: string;
  active: boolean;
  onClick: () => void;
}

const Node: React.FC<NodeProps> = ({ id, x, y, width, height, gradient, stroke, icon, label, sub, fila, active, onClick }) => {
  return (
    <motion.g
      className="cursor-pointer select-none"
      onClick={onClick}
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <rect
        x={x - 4} y={y - 4}
        width={width + 8} height={height + 8}
        rx={12}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
        className={cn("transition-opacity duration-300", active ? "opacity-100" : "opacity-0")}
      />
      <rect
        x={x} y={y}
        width={width} height={height}
        rx={8}
        fill={gradient}
        stroke={stroke}
        strokeWidth={1.5}
        className="shadow-lg"
      />
      <rect x={x} y={y} width={width} height={22} rx={8} fill={`${stroke}18`} />
      <text x={x + 9} y={y + 17} fontSize="12" fill={stroke}>{icon}</text>
      <text
        x={x + 26} y={y + 17}
        fontFamily="Rajdhani" fontSize="12" fontWeight="700"
        fill={stroke} letterSpacing="1"
      >
        {label}
      </text>
      <text
        x={x + 8} y={y + 34}
        fontFamily="Share Tech Mono" fontSize="7.5"
        fill={`${stroke}90`}
      >
        {sub}
      </text>
      <rect
        x={x + width - 46} y={y + height - 17}
        width={40} height={12} rx={3}
        fill={`${stroke}18`} stroke={`${stroke}50`} strokeWidth={1}
      />
      <text
        x={x + width - 42} y={y + height - 7}
        fontFamily="Share Tech Mono" fontSize="8" fill={stroke}
      >
        {fila}
      </text>
    </motion.g>
  );
};

export const InteractiveCostMap: React.FC = () => {
  const { mode, activeNodeId, setActiveNode, zoom, pan, setViewport } = useAssistedModeStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const renderDefs = () => (
    <defs>
      <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#122a40"/><stop offset="100%" stopColor="#061520"/></linearGradient>
      <linearGradient id="go" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#5a3208"/><stop offset="100%" stopColor="#2d1804"/></linearGradient>
      <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0a3820"/><stop offset="100%" stopColor="#041a0e"/></linearGradient>
      <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3d146e"/><stop offset="100%" stopColor="#1e0838"/></linearGradient>
      <linearGradient id="gr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4a0820"/><stop offset="100%" stopColor="#250410"/></linearGradient>
      <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#083a42"/><stop offset="100%" stopColor="#041e25"/></linearGradient>
      <marker id="arr" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3z" fill="currentColor" /></marker>
    </defs>
  );

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.min(Math.max(zoom * delta, 0.3), 4);
    setViewport(newZoom, pan);
  };

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-background/50 cursor-grab active:cursor-grabbing"
      onWheel={handleWheel}
    >
      <motion.div
        className="w-full h-full origin-center"
        animate={{ scale: zoom, x: pan.x, y: pan.y }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        drag
        dragMomentum={false}
        onDragEnd={(_, info) => setViewport(zoom, { x: pan.x + info.offset.x, y: pan.y + info.offset.y })}
      >
        <svg
          viewBox="0 0 960 480"
          xmlns="http://www.w3.org/2000/svg"
          className="w-full h-full drop-shadow-2xl p-8"
        >
          {renderDefs()}

          <line x1="272" y1="8" x2="272" y2="472" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4,6" className="text-border" />
          <line x1="690" y1="8" x2="690" y2="472" stroke="currentColor" strokeWidth="0.5" strokeDasharray="4,6" className="text-border" />

          {mode === 'prod' && (
            <g>
              <line x1="155" y1="90" x2="194" y2="205" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arr)" className="text-primary/30" />
              <line x1="155" y1="205" x2="194" y2="220" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arr)" className="text-primary/30" />
              <line x1="155" y1="315" x2="194" y2="235" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#arr)" className="text-primary/30" />
              <line x1="536" y1="252" x2="584" y2="252" stroke="#00c87a" strokeWidth="2.5" markerEnd="url(#arr)" />
              <line x1="720" y1="252" x2="780" y2="252" stroke="#00c87a" strokeWidth="2.5" markerEnd="url(#arr)" />

              <Node
                id="prod-insumos" x={12} y={55} width={140} height={72}
                gradient="url(#go)" stroke="#f5a623" icon="📦" label="ALMACÉN MP"
                sub="Insumos·Comb·Energía·Agua" fila="FILA 1"
                active={activeNodeId === 'prod-insumos'}
                onClick={() => setActiveNode('prod-insumos')}
              />
              <Node
                id="prod-salario" x={12} y={168} width={140} height={70}
                gradient="url(#gb)" stroke="#00d4ff" icon="👷" label="FUERZA TRABAJO"
                sub="Salario directo · MTSS" fila="FILA 2"
                active={activeNodeId === 'prod-salario'}
                onClick={() => setActiveNode('prod-salario')}
              />
              <Node
                id="prod-otros" x={12} y={278} width={140} height={70}
                gradient="url(#gt)" stroke="#00b8cc" icon="🔧" label="OTROS DIRECTOS"
                sub="Deprec·Amort·Mant." fila="FILA 3"
                active={activeNodeId === 'prod-otros'}
                onClick={() => setActiveNode('prod-otros')}
              />

              <motion.g
                className="cursor-pointer"
                onClick={() => setActiveNode('prod-taller')}
                whileHover={{ scale: 1.01 }}
              >
                <rect x={192} y={178} width={346} height={150} rx={11} fill="none" stroke="#00d4ff" strokeWidth={2.5} className={cn("transition-opacity duration-300", activeNodeId === 'prod-taller' ? "opacity-100" : "opacity-0")} />
                <rect x={195} y={181} width={340} height={144} rx={10} fill="url(#gb)" stroke="#00d4ff" strokeWidth={2} />
                <rect x={195} y={181} width={340} height={26} rx={10} fill="#00d4ff14" />
                <text x={212} y={200} fontFamily="Rajdhani" fontSize="14" fontWeight="700" fill="#00d4ff" letterSpacing="2">🏭 TALLER DE PRODUCCIÓN</text>
                <text x={222} y={240} fontFamily="Share Tech Mono" fontSize="9" fill="#00d4ff90">COSTO DIRECTO + GASTOS ASOCIADOS</text>
                <text x={222} y={284} fontFamily="Rajdhani" fontSize="13" fontWeight="700" fill="#00d4ff">COSTO TOTAL (F5) = F1 + F2 + F3 + F4</text>
              </motion.g>

              <Node
                id="prod-gi" x={580} y={210} width={140} height={72}
                gradient="url(#gr)" stroke="#ff4b6e" icon="📊" label="GAS.INDIRECTOS"
                sub="F6·F7·F8·F9·F10" fila="F11+F12"
                active={activeNodeId === 'prod-gi'}
                onClick={() => setActiveNode('prod-gi')}
              />

              <Node
                id="prod-comercial" x={780} y={210} width={140} height={72}
                gradient="url(#gg)" stroke="#00c87a" icon="💼" label="COMERCIAL"
                sub="Utilidad · Precio Final" fila="F14+F15"
                active={activeNodeId === 'prod-comercial'}
                onClick={() => setActiveNode('prod-comercial')}
              />
            </g>
          )}

          {mode === 'serv' && (
            <g>
               <Node
                id="serv-recursos" x={12} y={55} width={140} height={72}
                gradient="url(#go)" stroke="#f5a623" icon="📦" label="RECURSOS"
                sub="Insumos del servicio" fila="FILA 1"
                active={activeNodeId === 'serv-recursos'}
                onClick={() => setActiveNode('serv-recursos')}
              />
              <Node
                id="serv-personal" x={12} y={168} width={140} height={70}
                gradient="url(#gb)" stroke="#00d4ff" icon="👤" label="PERSONAL"
                sub="Salario directo · MTSS" fila="FILA 2"
                active={activeNodeId === 'serv-personal'}
                onClick={() => setActiveNode('serv-personal')}
              />
              <Node
                id="serv-equipos" x={12} y={278} width={140} height={70}
                gradient="url(#gt)" stroke="#00b8cc" icon="🔧" label="EQUIPOS"
                sub="Deprec·Herram·Mant." fila="FILA 3"
                active={activeNodeId === 'serv-equipos'}
                onClick={() => setActiveNode('serv-equipos')}
              />
              <Node
                id="serv-ejecucion" x={240} y={168} width={280} height={140}
                gradient="url(#gb)" stroke="#00d4ff" icon="⚡" label="EJECUCIÓN"
                sub="Costo Total del Servicio" fila="FILA 5"
                active={activeNodeId === 'serv-ejecucion'}
                onClick={() => setActiveNode('serv-ejecucion')}
              />
            </g>
          )}

          {mode === 'com' && (
            <g>
               <Node
                id="com-origen" x={12} y={168} width={140} height={72}
                gradient="url(#go)" stroke="#f5a623" icon="🏗️" label="ORIGEN"
                sub="Costo Adquisición" fila="FILA 1"
                active={activeNodeId === 'com-origen'}
                onClick={() => setActiveNode('com-origen')}
              />
               <Node
                id="com-transporte" x={200} y={168} width={140} height={72}
                gradient="url(#gt)" stroke="#00b8cc" icon="🚛" label="TRANSPORTE"
                sub="Logística y Fletes" fila="FILA 3"
                active={activeNodeId === 'com-transporte'}
                onClick={() => setActiveNode('com-transporte')}
              />
               <Node
                id="com-almacen" x={380} y={168} width={140} height={72}
                gradient="url(#gp)" stroke="#9b72ff" icon="🏪" label="ALMACÉN"
                sub="Operaciones de Stock" fila="FILA 4"
                active={activeNodeId === 'com-almacen'}
                onClick={() => setActiveNode('com-almacen')}
              />
               <Node
                id="com-venta" x={560} y={168} width={140} height={72}
                gradient="url(#gg)" stroke="#00c87a" icon="🏬" label="PTO.VENTA"
                sub="Comercialización" fila="F2·F7·F14"
                active={activeNodeId === 'com-venta'}
                onClick={() => setActiveNode('com-venta')}
              />
            </g>
          )}
        </svg>
      </motion.div>
    </div>
  );
};
