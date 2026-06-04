import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';

interface JsonViewerProps {
  data: any;
  title?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, title }) => {
  const [expanded, setExpanded] = useState(false);

  const content = useMemo(() => {
    if (!data) return 'null';
    if (typeof data === 'string') return data;
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, [data]);

  const lineCount = content.split('\n').length;
  const isLarge = lineCount > 200;

  return (
    <div className="rounded-[24px] bg-muted/20 border border-border/50 overflow-hidden">
      {title && (
        <div className="px-6 py-3 border-b border-border/50 bg-muted/30 flex items-center justify-between">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</h4>
          <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">{lineCount} líneas</span>
        </div>
      )}
      <div className={cn(
        "overflow-auto transition-all duration-300 font-mono",
        isLarge && !expanded ? "max-h-[400px]" : "max-h-[600px]"
      )}>
        <pre className="text-[10px] leading-relaxed text-foreground/70 p-6 whitespace-pre-wrap break-all">
          {isLarge && !expanded ? content.split('\n').slice(0, 200).join('\n') : content}
        </pre>
      </div>
      {isLarge && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-6 py-3 border-t border-border/50 bg-muted/20 text-[9px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors flex items-center justify-center gap-2"
        >
          {expanded ? 'Colapsar' : `Mostrar todo (${lineCount} líneas)`}
        </button>
      )}
    </div>
  );
};


