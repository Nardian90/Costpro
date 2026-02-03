
'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface HorizontalScrollProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
  showFade?: boolean;
}

export const HorizontalScroll: React.FC<HorizontalScrollProps> = ({
  children,
  className,
  containerClassName,
  showFade = true
}) => {
  return (
    <div className={cn("relative w-full overflow-hidden", containerClassName)}>
      <div className={cn(
        "w-full overflow-x-auto no-scrollbar flex flex-row flex-nowrap items-center gap-3 p-1 pr-12 sm:pr-1",
        className
      )}>
        {children}
      </div>

      {showFade && (
        <div className="sm:hidden absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
      )}
    </div>
  );
};
