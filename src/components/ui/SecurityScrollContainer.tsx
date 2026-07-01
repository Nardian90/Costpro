'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SecurityScrollContainerProps {
  children: React.ReactNode;
  className?: string;
  minWidth?: string;
}

/**
 * SecurityScrollContainer (Plan B)
 * Wraps critical content to ensure it never gets cut off on narrow screens.
 * Uses horizontal scroll as a safety mechanism.
 */
export const SecurityScrollContainer: React.FC<SecurityScrollContainerProps> = ({
  children,
  className,
  minWidth = '100%'
}) => {
  return (
    <div className="w-full overflow-x-auto overflow-y-hidden no-scrollbar" style={{ WebkitOverflowScrolling: 'touch' }}>
      <div
        className={cn("w-full", className)}
        style={{ minWidth }}
      >
        {children}
      </div>
    </div>
  );
};
