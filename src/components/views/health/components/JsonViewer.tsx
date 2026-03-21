import React from 'react';

interface JsonViewerProps {
  data: any;
  title?: string;
}

export const JsonViewer: React.FC<JsonViewerProps> = ({ data, title }) => {
  return (
    <div className="rounded-[24px] bg-muted/30 border border-border/50 overflow-hidden">
      {title && (
        <div className="px-6 py-4 border-b border-border/50 bg-muted/20">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{title}</h4>
        </div>
      )}
      <div className="p-6 overflow-auto max-h-[500px]">
        <pre className="text-[11px] font-mono leading-relaxed text-foreground/80">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </div>
  );
};
