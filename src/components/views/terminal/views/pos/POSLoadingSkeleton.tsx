'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface POSLoadingSkeletonProps {
  layoutMode: 'grid' | 'table';
}

export default function POSLoadingSkeleton({ layoutMode }: POSLoadingSkeletonProps) {
  return (
    <div
      className={cn(
        layoutMode === 'grid'
          ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6"
          : "space-y-3"
      )}
      aria-hidden="true"
      role="status"
    >
      {[...Array(8)].map((_, i) => (
        <div
          key={i}
          className={cn(
            "rounded-xl sm:rounded-2xl bg-muted/50 animate-pulse",
            layoutMode === 'grid'
              ? "h-64 flex flex-col sm:flex-row items-center gap-3 sm:gap-4 p-3"
              : "h-16 w-full"
          )}
        >
          {layoutMode === 'grid' && (
            <>
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl bg-muted shrink-0" />
              <div className="flex-1 w-full space-y-2">
                <div className="h-3 bg-muted rounded-full w-3/4" />
                <div className="h-4 bg-muted rounded-full w-1/3" />
              </div>
            </>
          )}
        </div>
      ))}
      <span className="sr-only">Cargando productos...</span>
    </div>
  );
}