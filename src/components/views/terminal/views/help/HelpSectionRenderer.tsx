'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import { sanitizeHtml } from '@/lib/sanitize';
import { cn } from '@/lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertTriangle,
  Info,
  CheckCircle2,
  Lightbulb,
  AlertCircle,
  XCircle,
  ChevronRight,
  Copy,
  ArrowRight,
} from 'lucide-react';

interface HelpSectionRendererProps {
  content: string;
  glossary?: Record<string, string>;
}

/**
 * Detects blockquote type from the text content.
 * Supports: tip, warning, important, note, info, danger
 */
function detectCallout(text: string): { type: string; label: string; icon: React.ElementType; color: string } | null {
  const lower = text.trimStart().toLowerCase();
  if (lower.startsWith('**tip:**') || lower.startsWith('**💡 tip:**')) {
    return { type: 'tip', label: 'Consejo', icon: Lightbulb, color: 'text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5' };
  }
  if (lower.startsWith('**importante:**') || lower.startsWith('**⚠️ importante:**') || lower.startsWith('**⚠ importante:**')) {
    return { type: 'important', label: 'Importante', icon: AlertTriangle, color: 'text-rose-600 dark:text-rose-400 border-rose-500/30 bg-rose-500/5' };
  }
  if (lower.startsWith('**nota:**') || lower.startsWith('**ℹ️ nota:**')) {
    return { type: 'note', label: 'Nota', icon: Info, color: 'text-blue-600 dark:text-blue-400 border-blue-500/30 bg-blue-500/5' };
  }
  if (lower.startsWith('**danger:**') || lower.startsWith('**❌ danger:**') || lower.startsWith('**🚫 danger:**')) {
    return { type: 'danger', label: 'Peligro', icon: XCircle, color: 'text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5' };
  }
  if (lower.startsWith('**success:**') || lower.startsWith('**✅ success:**') || lower.startsWith('**check:**')) {
    return { type: 'success', label: 'Completado', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5' };
  }
  return null;
}

/**
 * Clean the callout prefix from blockquote text
 */
function cleanCalloutText(text: string): string {
  return text
    .replace(/^\*\*(?:💡|⚠️|⚠|ℹ️|❌|🚫|✅)\s*/i, '**')
    .replace(/^\*\*Tip:\*\*\s*/i, '')
    .replace(/^\*\*Importante:\*\*\s*/i, '')
    .replace(/^\*\*Nota:\*\*\s*/i, '')
    .replace(/^\*\*Danger:\*\*\s*/i, '')
    .replace(/^\*\*Success:\*\*\s*/i, '')
    .replace(/^\*\*Check:\*\*\s*/i, '');
}

export default function HelpSectionRenderer({ content, glossary }: HelpSectionRendererProps) {

  const renderTextWithGlossary = (text: string) => {
    if (!glossary || Object.keys(glossary).length === 0) return text;

    const sortedTerms = Object.keys(glossary).sort((a, b) => b.length - a.length);
    const escapedTerms = sortedTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const pattern = new RegExp(`\\b(${escapedTerms.join('|')})\\b`, 'gi');

    const parts = text.split(pattern);
    if (parts.length === 1) return text;

    const result: React.ReactNode[] = [];

    parts.forEach((part, i) => {
      const lowerPart = part.toLowerCase();
      if (glossary[lowerPart]) {
        result.push(
          <TooltipProvider key={i}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-help border-b border-primary/30 text-primary font-semibold hover:bg-primary/5 transition-colors px-0.5 rounded">
                  {part}
                </span>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs p-4 rounded-xl bg-card border border-primary/15 shadow-xl">
                <div className="space-y-1.5">
                  <p className="text-[9px] font-black uppercase tracking-widest text-primary">Glosario</p>
                  <p className="text-xs font-medium text-foreground leading-relaxed">{glossary[lowerPart]}</p>
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
    <article className="prose prose-sm dark:prose-invert max-w-none
      prose-headings:font-black prose-headings:tracking-tight
      prose-h1:text-3xl md:prose-h1:text-4xl prose-h1:mb-10 prose-h1:border-b prose-h1:border-border/30 prose-h1:pb-6
      prose-h2:text-xl md:prose-h2:text-2xl prose-h2:mt-14 prose-h2:mb-6 prose-h2:pt-6 prose-h2:border-t prose-h2:border-dashed prose-h2:border-border/40
      prose-h3:text-lg prose-h3:mt-8 prose-h3:mb-4 prose-h3:font-bold
      prose-p:text-sm prose-p:leading-[1.85] prose-p:font-medium prose-p:text-muted-foreground
      prose-strong:text-foreground prose-strong:font-bold
      prose-a:text-primary prose-a:no-underline hover:prose-a:underline
      prose-code:text-xs prose-code:font-bold prose-code:text-primary
      prose-pre:rounded-xl prose-pre:border prose-pre:border-border/40 prose-pre:shadow-sm
    ">
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return <h1 id={text} {...props} />;
          },
          h2: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return (
              <h2 id={text} className="group flex items-center gap-3" {...props}>
                <div className="w-1 h-6 rounded-full bg-primary/20 group-hover:bg-primary/40 transition-colors shrink-0" />
                <span>{props.children}</span>
              </h2>
            );
          },
          h3: ({ node, ...props }) => {
            const text = props.children?.toString().toLowerCase().replace(/[^\w\s-áéíóúñü]/g, '').replace(/\s+/g, '-') || '';
            return <h3 id={text} {...props} />;
          },
          table: ({ node, ...props }) => (
            <div className="overflow-x-auto my-8 rounded-xl border border-border/40 shadow-sm">
              <table className="w-full text-left" {...props} />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className="bg-muted/40 border-b border-border/40 uppercase text-[9px] font-black tracking-widest text-muted-foreground" {...props} />
          ),
          th: ({ node, ...props }) => <th className="px-5 py-3.5 font-black" {...props} />,
          td: ({ node, ...props }) => <td className="px-5 py-3 border-b border-border/20 text-xs font-medium" {...props} />,
          blockquote: ({ node, children, ...props }: any) => {
            // Get text content to detect callout type
            const textContent = React.Children.toArray(children)
              .map(c => typeof c === 'string' ? c : '')
              .join('');
            const callout = detectCallout(textContent);

            if (callout) {
              const IconComp = callout.icon;
              return (
                <div className={cn(
                  "my-8 rounded-xl border-l-4 px-6 py-4",
                  callout.color
                )} {...props}>
                  <div className="flex items-start gap-3">
                    <IconComp className="w-4 h-4 mt-0.5 shrink-0" />
                    <div className="flex-1 text-sm font-medium leading-relaxed italic text-foreground/80">
                      {children}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <blockquote className="border-l-4 border-primary/30 bg-primary/3 rounded-r-xl px-6 py-5 my-8 not-italic" {...props}>
                <div className="text-sm font-medium leading-relaxed italic text-muted-foreground/80">
                  {children}
                </div>
              </blockquote>
            );
          },
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline || !className) {
              return (
                <code className="px-1.5 py-0.5 rounded-md bg-muted/60 border border-border/30 font-bold text-xs text-primary" {...props}>
                  {children}
                </code>
              );
            }
            return (
              <code className={cn("rounded-lg font-mono text-xs", className)} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ node, children, ...props }) => (
            <div className="relative group my-8">
              <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    const codeEl = document.querySelector('.prose pre code');
                    if (codeEl) navigator.clipboard.writeText(codeEl.textContent || '');
                  }}
                  className="w-7 h-7 rounded-md bg-muted/80 border border-border/50 flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <pre className="rounded-xl bg-muted/50 border border-border/40 p-5 overflow-x-auto shadow-sm" {...props}>
                {children}
              </pre>
            </div>
          ),
          ul: ({ node, ...props }) => (
            <ul className="space-y-3 my-6 list-none pl-0" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="space-y-3 my-6 list-none pl-0" {...props} />
          ),
          li: ({ node, children, ...props }: any) => {
            const isOrdered = node?.position?.start?.line !== undefined;
            return (
              <li className="flex items-start gap-3" {...props}>
                <div className="mt-1.5 w-2 h-2 rounded-full bg-primary/40 shrink-0" />
                <span className="text-sm font-medium leading-[1.85] text-muted-foreground">{children}</span>
              </li>
            );
          },
          p: ({ node, children, ...props }) => {
            const processedChildren = React.Children.map(children, child => {
              if (typeof child === 'string') {
                return renderTextWithGlossary(child);
              }
              return child;
            });
            return <p {...props}>{processedChildren}</p>;
          },
          hr: ({ node, ...props }) => (
            <hr className="my-10 border-border/20" {...props} />
          ),
          a: ({ node, children, ...props }) => (
            <a className="text-primary font-semibold hover:underline inline-flex items-center gap-1 transition-colors" {...props}>
              {children}
              <ArrowRight className="w-3 h-3" />
            </a>
          ),
        }}
      >
        {sanitizeHtml(content)}
      </ReactMarkdown>
    </article>
  );
}
