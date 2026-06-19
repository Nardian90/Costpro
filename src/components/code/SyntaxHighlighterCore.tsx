'use client';

import SyntaxHighlighter from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// react-syntax-highlighter default export lacks proper JSX construct signatures
const SyntaxHighlighterComponent = SyntaxHighlighter as any;

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
    <SyntaxHighlighterComponent
      language={language}
      style={vscDarkPlus}
      className={className}
      customStyle={{ borderRadius: '12px', padding: '16px', fontSize: '12px' }}
    >
      {children}
    </SyntaxHighlighterComponent>
  );
}
