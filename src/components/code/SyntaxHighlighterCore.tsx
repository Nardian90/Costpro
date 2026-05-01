'use client';

import SyntaxHighlighter from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

export function SyntaxHighlighterCore({
  language,
  children,
  className,
}: {
  language: string;
  children: string;
  className?: string;
}) {
  return (
    <SyntaxHighlighter
      language={language}
      style={vscDarkPlus}
      className={className}
      customStyle={{ borderRadius: '12px', padding: '16px', fontSize: '12px' }}
    >
      {children}
    </SyntaxHighlighter>
  );
}
