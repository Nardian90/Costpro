import React from 'react';
import ReactMarkdown from 'react-markdown';
import { sanitizeHtml } from '@/lib/sanitize';

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export const MarkdownViewer: React.FC<MarkdownViewerProps> = ({ content, className }) => {
  return (
    <div className={className}>
      <div className="prose prose-invert prose-sm max-w-none
        prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tighter
        prose-p:text-muted-foreground prose-p:leading-relaxed
        prose-strong:text-foreground prose-strong:font-black
        prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none
        prose-pre:bg-muted/30 prose-pre:border prose-pre:border-border/50 prose-pre:rounded-2xl
        prose-li:text-muted-foreground">
        <ReactMarkdown>{sanitizeHtml(content)}</ReactMarkdown>
      </div>
    </div>
  );
};
