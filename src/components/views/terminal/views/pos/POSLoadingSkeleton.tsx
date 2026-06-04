'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

interface POSLoadingSkeletonProps {
  layoutMode: 'grid' | 'table';
}

/**
 * POSLoadingSkeleton: Skeleton loader matching the POS product grid or table layout.
 */
export default function POSLoadingSkeleton({ layoutMode }: POSLoadingSkeletonProps) {
  return (
    <div
      className={cn(
        layoutMode === 'grid'
          ? "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6"
          : "space-y-3"
      )}
      aria-hidden="true"
    >
      {[...Array(8)].map((_, i) => (
        <Skeleton
          key={i}
          className={cn("rounded-2xl", layoutMode === 'grid' ? "h-64" : "h-16")}
        />
      ))}
    </div>
  );
}
