'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, Home } from 'lucide-react';
import { NavModule } from '@/config/navigation/sidebar.structure';
import { useUIStore } from '@/store';
import { cn } from '@/lib/utils';

interface SidebarFocusModeProps {
  module: NavModule;
  renderModule: (module: NavModule, depth?: number) => React.ReactNode;
  onBack: () => void;
}

export const SidebarFocusMode: React.FC<SidebarFocusModeProps> = ({
  module,
  renderModule,
  onBack
}) => {
  const prefersReducedMotion = useReducedMotion();
  const { setCurrentView } = useUIStore();

  const handleHomeClick = () => {
    setCurrentView('occ');
    onBack();
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      animate={prefersReducedMotion ? {} : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={prefersReducedMotion ? {} : { opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1] as any
      }}
      className="flex flex-col w-full"
    >
      {/* Breadcrumb Visual con botón de INICIO */}
      <div className="px-4 py-2 mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] ml-4 border-l-2 border-primary/20">
        <button
          onClick={handleHomeClick}
          className="flex items-center gap-1.5 text-muted-foreground/70 hover:text-primary transition-colors group outline-none"
          aria-label="Volver al inicio"
        >
          <Home className="w-3 h-3 transition-transform group-hover:scale-110" />
          <span>INICIO</span>
        </button>
        <ChevronRight className="w-3 h-3 opacity-50 text-muted-foreground/70" />
        <span className="text-primary/80 truncate">{module.label}</span>
      </div>

      <div className="space-y-1">
        {module.children?.map(child => renderModule(child, 0))}
      </div>
    </motion.div>
  );
};
export default SidebarFocusMode;
