'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpSectionRendererProps {
  content: string;
  glossary?: Record<string, string>;
}

export default function HelpSectionRenderer({ content, glossary }: HelpSectionRendererProps) {

  // Custom renderer for text to handle glossary highlights
  const renderTextWithGlossary = (text: string) => {
    if (!glossary || Object.keys(glossary).length === 0) return text;

    // Sort terms by length (desc) to avoid partial matching of longer terms
    const sortedTerms = Object.keys(glossary).sort((a, b) => b.length - a.length);
    const escapedTerms = sortedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

    const parts = text.split(pattern);
    if (parts.length === 1) return text;

    const result: React.ReactNode[] = [];

    // split with capture group in RegExp will include the matched terms in the array
    // but the split pattern above doesn't have capture group?
    // Wait, the RegExp above DOES have capture group: ( ... )

    parts.forEach((part, i) => {
      const lowerPart = part.toLowerCase();
      if (glossary[lowerPart]) {
        result.push(
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-primary/40 text-primary font-black hover:bg-primary/5 transition-colors">
                  {part}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4 rounded-xl bg-card border border-primary/20 shadow-2xl">
                <div className="space-y-2">
                   <p className="text-[10px] font-black uppercase tracking-widest text-primary">Glosario ISO/IEC 26514</p>
                   <p className="text-xs font-bold text-foreground leading-relaxed">{glossary[lowerPart]}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      } else {
        result.push(part);
      }
    });

    return <>{result}</>;
  };

  return (
    <article className="prose prose-sm dark:prose-invert max-w-none prose-headings:font-black prose-headings:uppercase prose-headings:tracking-tighter prose-h1:text-5xl prose-h2:text-3xl prose-h3:text-xl prose-p:text-base prose-p:leading-loose prose-p:font-medium prose-p:text-muted-foreground prose-strong:text-foreground prose-strong:font-black">
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 id={props.children?.toString().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')} className="mb-12 border-b pb-6" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 id={props.children?.toString().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')} className="mt-16 mb-8 pt-8 border-t border-dashed" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 id={props.children?.toString().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-')} className="mt-8 mb-4 font-black" {...props} />
          ),
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-12 rounded-3xl border border-border shadow-sm">
              <table className="w-full text-left" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-secondary/30 border-b border-border uppercase text-[10px] font-black tracking-widest" {...props} />
          ),
          th: ({ node, ...props }) => <th className="px-6 py-4" {...props} />,
          td: ({ node, ...props }) => <td className="px-6 py-4 border-b border-border/50 text-sm font-medium" {...props} />,
          blockquote: ({ node, ...props }) => (
             <blockquote className="border-l-4 border-primary bg-primary/5 rounded-r-3xl px-8 py-6 my-10 not-italic italic font-medium" {...props} />
          ),
          code: ({ node, inline, className, children, ...props }: any) => {
            return (
              <code className={cn(
                "px-2 py-0.5 rounded bg-secondary/50 font-bold text-xs text-primary",
                className
              )} {...props}>
                {children}
              </code>
            );
          },
          ul: ({ node, ...props }) => <ul className="space-y-4 my-8 list-none pl-0" {...props} />,
          li: ({ node, ...props }: any) => (
             <li className="flex items-start gap-4">
                <div className="w-2 h-2 rounded-full bg-primary mt-2.5 shrink-0" />
                <span className="text-base font-medium leading-relaxed">{props.children}</span>
             </li>
          ),
          p: ({ node, children, ...props }) => {
            const processedChildren = React.Children.map(children, child => {
              if (typeof child === 'string') {
                return renderTextWithGlossary(child);
              }
              return child;
            });
            return <p {...props}>{processedChildren}</p>;
          }
        }}
      >
        {content}
      </ReactMarkdown>
    </article>
  );
}
