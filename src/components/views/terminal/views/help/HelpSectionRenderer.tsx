'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface HelpSectionRendererProps {
  content: string;
  glossary?: Record<string, string>;
}

export default function HelpSectionRenderer({ content, glossary = {} }: HelpSectionRendererProps) {
  // Function to highlight glossary terms
  const renderContentWithGlossary = (text: string) => {
    if (!text || Object.keys(glossary).length === 0) return text;

    // Create a regex to match all glossary terms
    // We sort terms by length descending to match longer phrases first
    const terms = Object.keys(glossary).sort((a, b) => b.length - a.length);
    const escapedTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

    const parts = text.split(pattern);

    return parts.map((part, i) => {
      const lowerPart = part.toLowerCase();
      if (glossary[lowerPart]) {
        return (
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-dotted border-primary/50 text-primary font-bold hover:bg-primary/5 px-0.5 rounded transition-colors">
                  {part}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs bg-card border-primary/20 text-foreground p-4 rounded-xl shadow-2xl">
                <div className="space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-primary">Glosario CostPro</p>
                  <p className="text-xs leading-relaxed">{glossary[lowerPart]}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      }
      return part;
    });
  };

  return (
    <div className="prose prose-neutral dark:prose-invert max-w-none
      prose-h1:text-4xl prose-h1:font-black prose-h1:uppercase prose-h1:tracking-tighter prose-h1:mb-8
      prose-h2:text-2xl prose-h2:font-black prose-h2:uppercase prose-h2:tracking-tight prose-h2:mt-12 prose-h2:mb-6 prose-h2:border-b prose-h2:pb-2
      prose-h3:text-lg prose-h3:font-bold prose-h3:uppercase prose-h3:mt-8 prose-h3:mb-4
      prose-p:text-base prose-p:leading-relaxed prose-p:text-muted-foreground prose-p:mb-6
      prose-li:text-muted-foreground prose-li:mb-2
      prose-strong:text-foreground prose-strong:font-bold
      prose-code:text-primary prose-code:bg-primary/5 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded-md prose-code:before:content-none prose-code:after:content-none
      prose-table:border prose-table:rounded-xl prose-table:overflow-hidden
      prose-th:bg-secondary/50 prose-th:px-4 prose-th:py-3 prose-th:text-[10px] prose-th:font-black prose-th:uppercase prose-th:tracking-widest
      prose-td:px-4 prose-td:py-3 prose-td:text-sm
    ">
      <ReactMarkdown
        components={{
          p: ({ children }) => {
            if (typeof children === 'string') {
               return <p>{renderContentWithGlossary(children)}</p>;
            }
            // For children that are already react elements (like a link inside a p)
            return <p>{children}</p>;
          },
          // You can extend more components here to support glossary highlighting in lists, etc.
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
