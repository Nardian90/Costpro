import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { Share2 } from 'lucide-react';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type?: string;
  layer?: string;
}

interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
}

interface GraphViewerProps {
  data: {
    nodes: Node[];
    links: Link[];
  };
  title: string;
}

export const GraphViewer: React.FC<GraphViewerProps> = ({ data, title }) => {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !data || !data.nodes || data.nodes.length === 0) return;

    const width = svgRef.current.parentElement?.clientWidth || 800;
    const height = svgRef.current.parentElement?.clientHeight || 600;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%');

    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const nodes = data.nodes.map(d => ({ ...d }));
    const links = data.links.map(d => ({ ...d }));

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('x', d3.forceX(width / 2).strength(0.1))
      .force('y', d3.forceY(height / 2).strength(0.1));

    const link = g.append('g')
      .attr('stroke', 'hsl(var(--primary))')
      .attr('stroke-opacity', 0.2)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1);

    const node = g.append('g')
      .selectAll('circle')
      .data(nodes)
      .join('circle')
      .attr('r', 6)
      .attr('fill', d => {
        if (d.layer === 'Application') return '#3fff8b';
        if (d.layer === 'UI Components') return '#aa8aff';
        if (d.layer === 'Services') return '#0d6cf2';
        return 'hsl(var(--muted-foreground))';
      })
      .attr('stroke', 'hsl(var(--background))')
      .attr('stroke-width', 2)
      .call(d3.drag<SVGCircleElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    node.append('title')
      .text(d => `${d.label}\nLayer: ${d.layer || 'Unknown'}`);

    // Labels for key nodes
    const labels = g.append('g')
      .selectAll('text')
      .data(nodes.filter(n => n.fan_in && n.fan_in > 5 || n.label.length < 15))
      .join('text')
      .text(d => d.label)
      .attr('font-size', '8px')
      .attr('font-weight', 'bold')
      .attr('fill', 'hsl(var(--muted-foreground))')
      .attr('dx', 10)
      .attr('dy', 4)
      .attr('pointer-events', 'none')
      .attr('font-family', 'Manrope');

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('cx', (d: any) => d.x)
        .attr('cy', (d: any) => d.y);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    function dragstarted(event: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event: any) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event: any) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <div className="rounded-[40px] bg-card border border-border/50 p-8 h-[600px] flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Share2 className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.2em]">{title}</h2>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Visualización de Dependencias v9.0</p>
          </div>
        </div>
        <div className="flex gap-2">
           <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20 text-[8px] font-black uppercase text-emerald-500 tracking-widest">
              {data?.nodes?.length || 0} Nodos
           </div>
           <div className="flex items-center gap-2 px-3 py-1 bg-primary/10 rounded-full border border-primary/20 text-[8px] font-black uppercase text-primary tracking-widest">
              {data?.links?.length || 0} Enlaces
           </div>
        </div>
      </div>

      <div className="flex-1 bg-muted/10 border border-border/30 rounded-[32px] relative overflow-hidden group cursor-crosshair">
         <svg ref={svgRef} className="w-full h-full" />

         <div className="absolute bottom-6 left-6 p-4 rounded-2xl bg-background/80 backdrop-blur-md border border-border/50 shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <h4 className="text-[9px] font-black uppercase tracking-widest mb-2 opacity-50">Leyenda de Capas</h4>
            <div className="space-y-1">
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#3fff8b]" />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Application</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#aa8aff]" />
                  <span className="text-[8px] font-black uppercase tracking-tighter">UI Components</span>
               </div>
               <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#0d6cf2]" />
                  <span className="text-[8px] font-black uppercase tracking-tighter">Services</span>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};
