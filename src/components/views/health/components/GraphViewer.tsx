import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Share2, MousePointer2, Info, Maximize2, Layers } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Node extends d3.SimulationNodeDatum {
  id: string;
  label: string;
  type?: string;
  layer?: string;
  fan_in?: number;
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
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [stats, setStats] = useState({ nodes: 0, links: 0 });

  useEffect(() => {
    if (!svgRef.current || !data || !data.nodes || data.nodes.length === 0) return;

    setStats({ nodes: data.nodes.length, links: data.links.length });

    const width = svgRef.current.parentElement?.clientWidth || 800;
    const height = svgRef.current.parentElement?.clientHeight || 600;

    const svg = d3.select(svgRef.current)
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('width', '100%')
      .attr('height', '100%');

    svg.selectAll('*').remove();

    // Defs for arrows
    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '-0 -5 10 10')
      .attr('refX', 20)
      .attr('refY', 0)
      .attr('orient', 'auto')
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('xoverflow', 'visible')
      .append('svg:path')
      .attr('d', 'M 0,-5 L 10 ,0 L 0,5')
      .attr('fill', 'hsl(var(--primary))')
      .style('stroke', 'none');

    const g = svg.append('g');

    // Zoom behavior
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    const nodes: Node[] = data.nodes.map(d => ({ ...d }));
    const links: Link[] = data.links.map(d => ({ ...d }));

    const simulation = d3.forceSimulation<Node>(nodes)
      .force('link', d3.forceLink<Node, Link>(links).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide().radius(40))
      .force('x', d3.forceX(width / 2).strength(0.05))
      .force('y', d3.forceY(height / 2).strength(0.05));

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', 'hsl(var(--primary))')
      .attr('stroke-opacity', 0.15)
      .attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#arrowhead)');

    const node = g.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        setSelectedNode(d);
        highlightDependencies(d);
        event.stopPropagation();
      })
      .call(d3.drag<SVGGElement, Node>()
        .on('start', dragstarted)
        .on('drag', dragged)
        .on('end', dragended) as any);

    // Node Background
    node.append('circle')
      .attr('r', d => (d.fan_in || 1) > 10 ? 12 : 8)
      .attr('fill', 'hsl(var(--background))')
      .attr('stroke', d => {
        if (d.layer === 'Application' || d.type === 'ACTION') return '#3fff8b';
        if (d.layer === 'UI Components' || d.type === 'VIEW') return '#aa8aff';
        if (d.layer === 'Services' || d.type === 'SERVICE') return '#0d6cf2';
        return 'hsl(var(--muted-foreground))';
      })
      .attr('stroke-width', 3)
      .attr('class', 'node-circle shadow-lg shadow-primary/20');

    // Node Glow/Indicator
    node.append('circle')
      .attr('r', d => (d.fan_in || 1) > 10 ? 4 : 2)
      .attr('fill', d => {
        if (d.layer === 'Application') return '#3fff8b';
        if (d.layer === 'UI Components') return '#aa8aff';
        if (d.layer === 'Services') return '#0d6cf2';
        return 'hsl(var(--muted-foreground))';
      })
      .attr('opacity', 0.8);

    const labels = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.label)
      .attr('font-size', '9px')
      .attr('font-weight', '900')
      .attr('fill', 'hsl(var(--muted-foreground))')
      .attr('dx', 16)
      .attr('dy', 4)
      .attr('pointer-events', 'none')
      .attr('font-family', 'Manrope')
      .attr('opacity', d => (d.fan_in || 0) > 3 ? 1 : 0.4);

    simulation.on('tick', () => {
      link
        .attr('x1', (d: any) => d.source.x)
        .attr('y1', (d: any) => d.source.y)
        .attr('x2', (d: any) => d.target.x)
        .attr('y2', (d: any) => d.target.y);

      node
        .attr('transform', (d: any) => `translate(${d.x},${d.y})`);

      labels
        .attr('x', (d: any) => d.x)
        .attr('y', (d: any) => d.y);
    });

    svg.on('click', () => {
      setSelectedNode(null);
      resetHighlight();
    });

    function highlightDependencies(d: Node) {
      const neighbors = new Set<string>();
      neighbors.add(d.id);

      links.forEach(l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;

        if (sourceId === d.id) neighbors.add(targetId);
        if (targetId === d.id) neighbors.add(sourceId);
      });

      node.style('opacity', n => neighbors.has(n.id) ? 1 : 0.15);
      link.style('stroke-opacity', l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        return (sourceId === d.id || targetId === d.id) ? 0.8 : 0.05;
      }).style('stroke-width', l => {
        const sourceId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
        const targetId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
        return (sourceId === d.id || targetId === d.id) ? 3 : 1.5;
      });
      labels.style('opacity', n => neighbors.has(n.id) ? 1 : 0.1);
    }

    function resetHighlight() {
      node.style('opacity', 1);
      link.style('stroke-opacity', 0.15).style('stroke-width', 1.5);
      labels.style('opacity', d => (d.fan_in || 0) > 3 ? 1 : 0.4);
    }

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
    <div className="rounded-[40px] bg-card border border-border/50 p-10 h-[750px] flex flex-col shadow-2xl relative overflow-hidden group/main">
      <div className="flex items-center justify-between mb-10 relative z-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 rounded-[24px] bg-primary/10 flex items-center justify-center border border-primary/20 shadow-inner group-hover/main:rotate-12 transition-transform duration-500">
            <Share2 className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase tracking-tighter italic leading-none mb-1">{title}</h2>
            <div className="flex items-center gap-2">
               <MousePointer2 className="w-3 h-3 text-muted-foreground" />
               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest italic opacity-60">Interactivo: Haz clic en un nodo para ver dependencias</p>
            </div>
          </div>
        </div>
        <div className="flex gap-4">
           <div className="px-6 py-2 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 flex flex-col items-center justify-center">
              <span className="text-sm font-black italic text-emerald-500">{stats.nodes}</span>
              <span className="text-[7px] font-black uppercase tracking-widest text-emerald-500 opacity-60">Nodos</span>
           </div>
           <div className="px-6 py-2 bg-primary/10 rounded-2xl border border-primary/20 flex flex-col items-center justify-center">
              <span className="text-sm font-black italic text-primary">{stats.links}</span>
              <span className="text-[7px] font-black uppercase tracking-widest text-primary opacity-60">Enlaces</span>
           </div>
           <button className="w-12 h-12 rounded-2xl bg-muted/30 border border-border/50 flex items-center justify-center hover:bg-muted/50 transition-all">
              <Maximize2 className="w-5 h-5 text-muted-foreground" />
           </button>
        </div>
      </div>

      <div className="flex-1 bg-muted/10 border border-border/30 rounded-[48px] relative overflow-hidden group cursor-crosshair shadow-inner">
         <svg ref={svgRef} className="w-full h-full" />

         {/* Legend Overlay */}
         <div className="absolute top-10 right-10 p-8 rounded-[32px] bg-background/60 backdrop-blur-xl border border-white/20 shadow-2xl space-y-6">
            <div className="flex items-center gap-3">
               <Layers className="w-4 h-4 text-primary" />
               <h4 className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80">Tipología</h4>
            </div>
            <div className="space-y-4">
               {[
                  { color: '#3fff8b', label: 'Aplicación / Acción', desc: 'Lógica de negocio núcleo' },
                  { color: '#aa8aff', label: 'Interfaz / Vista', desc: 'Componentes UI y flujo visual' },
                  { color: '#0d6cf2', label: 'Servicios / Infra', desc: 'Persistencia y APIs externas' },
                  { color: 'hsl(var(--muted-foreground))', label: 'Desconocido', desc: 'Artefactos sin capa definida' }
               ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                     <div className="w-2 h-2 rounded-full mt-1 shrink-0" style={{ backgroundColor: item.color }} />
                     <div>
                        <div className="text-[9px] font-black uppercase tracking-tight leading-none mb-1">{item.label}</div>
                        <div className="text-[7px] font-bold text-muted-foreground uppercase tracking-widest opacity-60">{item.desc}</div>
                     </div>
                  </div>
               ))}
            </div>
         </div>

         {/* Info/Detail Overlay */}
         {selectedNode ? (
            <div className="absolute bottom-4 left-4 p-4 sm:p-8 rounded-[24px] sm:rounded-[40px] bg-primary text-primary-foreground shadow-2xl w-[200px] sm:w-[300px] graph-info-card animate-in slide-in-from-left-4 duration-500">
               <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                     <Info className="w-6 h-6 text-white" />
                  </div>
                  <button onClick={() => setSelectedNode(null)} className="text-[8px] font-black uppercase tracking-widest opacity-60 hover:opacity-100">Cerrar</button>
               </div>
               <h3 className="text-xl font-black uppercase tracking-tighter leading-tight mb-2 italic">{selectedNode.label}</h3>
               <div className="flex items-center gap-2 mb-6">
                  <div className="px-3 py-1 bg-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/20">
                     {selectedNode.layer || 'SISTEMA'}
                  </div>
                  <div className="px-3 py-1 bg-white/10 rounded-lg text-[8px] font-black uppercase tracking-widest border border-white/20">
                     {selectedNode.type || 'ARTEFACTO'}
                  </div>
               </div>
               <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                  <div className="flex justify-between items-center">
                     <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Criticidad</span>
                     <span className="text-xs font-black italic">{(selectedNode.fan_in || 0) > 10 ? 'ALTA' : 'MEDIA'}</span>
                  </div>
                  <div className="flex justify-between items-center">
                     <span className="text-[8px] font-black uppercase tracking-widest opacity-60">Dependencias</span>
                     <span className="text-xs font-black italic">{selectedNode.fan_in || 0} Entrantes</span>
                  </div>
               </div>
            </div>
         ) : (
            <div className="absolute bottom-10 left-10 p-6 rounded-3xl bg-background/40 backdrop-blur-md border border-border/50 text-muted-foreground opacity-60 flex items-center gap-3">
               <MousePointer2 className="w-4 h-4" />
               <span className="text-[9px] font-black uppercase tracking-[0.2em]">Selecciona un componente para inspeccionar</span>
            </div>
         )}
      </div>
    </div>
  );
};
