'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const GraphViewer = dynamic(
  () => import('./GraphViewer').then(mod => mod.GraphViewer),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[750px] flex items-center justify-center">
        <Skeleton className="w-full h-full rounded-[40px]" />
      </div>
    ),
  }
);

export { GraphViewer };
