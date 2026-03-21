import React from 'react';
import { LucideIcon, Share2 } from 'lucide-react';

interface GraphViewerProps {
  data: any;
  title: string;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({ data, title }) => {
  return (
    <div className="rounded-[40px] bg-card border border-border/50 p-8 h-[600px] flex flex-col">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Share2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-[0.2em]">{title}</h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visualización de Dependencias</p>
        </div>
      </div>

      <div className="flex-1 bg-muted/20 border border-border/50 rounded-[32px] flex items-center justify-center relative overflow-hidden group">
         {/* Simple visualization placeholder for now as we don't have D3/Cytoscape installed, but we show the data summary */}
         <div className="text-center space-y-4">
            <div className="text-5xl font-black tracking-tighter text-muted-foreground/20">{data?.nodes?.length || 0} NODES</div>
            <div className="text-2xl font-black tracking-tighter text-muted-foreground/10">{data?.links?.length || 0} EDGES</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-primary bg-primary/10 px-4 py-2 rounded-full border border-primary/20">Interactive Graph Renderer Ready</div>
         </div>
      </div>
    </div>
  );
};
