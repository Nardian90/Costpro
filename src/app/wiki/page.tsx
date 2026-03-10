'use client';

import dynamic from 'next/dynamic';
import React from 'react';
import { Loader2 } from 'lucide-react';

const WikiView = dynamic(
  () => import('@/components/views/terminal/views/wiki/WikiView'),
  {
    ssr: false,
    loading: () => (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
         <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm font-black uppercase tracking-widest text-muted-foreground">Iniciando Wiki Contable...</p>
        </div>
      </div>
    ),
  }
);

const WikiPage = () => {
  return <WikiView />;
};

export default WikiPage;
