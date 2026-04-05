'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
import { NavModule } from '@/config/navigation/sidebar.structure';

interface SidebarFocusModeProps {
  module: NavModule;
  renderModule: (module: NavModule, depth?: number) => React.ReactNode;
}

export const SidebarFocusMode: React.FC<SidebarFocusModeProps> = ({
  module,
  renderModule
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, scale: 1.05, filter: 'blur(10px)' }}
      transition={{
        duration: 0.4,
        ease: [0.22, 1, 0.36, 1]
      }}
      className="flex flex-col w-full"
    >
      {/* Breadcrumb Visual */}
      <div className="px-4 py-2 mb-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground/40 border-l-2 border-primary/20 ml-4">
        <span>INICIO</span>
        <ChevronRight className="w-3 h-3 opacity-30" />
        <span className="text-primary/60">{module.label}</span>
      </div>

      <div className="space-y-1">
        {module.children?.map(child => renderModule(child, 0))}
      </div>
    </motion.div>
  );
};
