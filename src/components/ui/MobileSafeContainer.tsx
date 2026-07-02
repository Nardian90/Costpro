'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface MobileSafeContainerProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * MobileSafeContainer
 * A resilient container that prevents layout breaks by providing
 * failsafe overflow handling on mobile devices.
 *
 * Fix header: añadimos h-full para que las vistas de chat (conversaciones)
 * que usan h-full tengan una cadena de alturas completa hasta el main.
 * Sin esto, el contenedor tiene altura auto y la vista crece más del
 * viewport, empujando el header fuera de la pantalla.
 */
export const MobileSafeContainer: React.FC<MobileSafeContainerProps> = ({ children, className }) => {
  return (
    <div
      className={cn(
        "w-full max-w-full h-full overflow-x-auto overflow-y-auto touch-pan-x touch-pan-y relative",
        className
      )}
      style={{
        WebkitOverflowScrolling: 'touch',
        minHeight: '100%'
      }}
    >
      {children}
    </div>
  );
};
export default MobileSafeContainer;
