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
 */
export const MobileSafeContainer: React.FC<MobileSafeContainerProps> = ({ children, className }) => {
  return (
    <div
      className={cn(
        "w-full max-w-full overflow-x-auto overflow-y-auto touch-pan-x touch-pan-y relative",
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
