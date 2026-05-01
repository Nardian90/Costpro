'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const IPVInstitutionalDashboard = dynamic(
  () => import('./IPVInstitutionalDashboard').then(mod => mod.IPVInstitutionalDashboard),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-96 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28 rounded-3xl" />)}
        </div>
        <Skeleton className="h-[450px] rounded-[32px]" />
      </div>
    ),
  }
);

export { IPVInstitutionalDashboard };
