'use client';

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

const SyntaxHighlighterCore = dynamic(
  () => import('./SyntaxHighlighterCore').then(m => m.SyntaxHighlighterCore),
  {
    ssr: false,
    loading: () => <Skeleton className="w-full h-32 rounded-xl font-mono" />,
  }
);

export function SyntaxHighlighterLazy(props: { language: string; children: string; className?: string }) {
  return <SyntaxHighlighterCore {...props} />;
}
