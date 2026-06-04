'use client';

import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { Share2, ZoomIn, ZoomOut, RotateCcw, Eye, EyeOff, Layers, Crosshair, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Node {
  id: string;
  label: string;
  type?: string;
  layer?: string;
  group?: string;
  fan_in?: number;
  fan_out?: number;
  x: number;
  y: number;
}

interface Link {
  source: string | Node;
  target: string | Node;
}

interface GraphViewerProps {
  data: {
    nodes: Node[];
    links?: Link[];
    edges?: Link[];
  };
  title: string;
}

const LAYER_COLORS: Record<string, { stroke: string; glow: string; bg: string }> = {
  'Application':       { stroke: '#3fff8b', glow: 'rgba(63,255,139,0.25)', bg: 'rgba(63,255,139,0.06)' },
  'Business Logic':    { stroke: '#fbbf24', glow: 'rgba(251,191,36,0.25)', bg: 'rgba(251,191,36,0.06)' },
  'UI Components':     { stroke: '#c084fc', glow: 'rgba(192,132,252,0.25)', bg: 'rgba(192,132,252,0.06)' },
  'Services':          { stroke: '#60a5fa', glow: 'rgba(96,165,250,0.25)', bg: 'rgba(96,165,250,0.06)' },
  'Hooks':             { stroke: '#22d3ee', glow: 'rgba(34,211,238,0.25)', bg: 'rgba(34,211,238,0.06)' },
  'Types':             { stroke: '#f472b6', glow: 'rgba(244,114,182,0.25)', bg: 'rgba(244,114,182,0.06)' },
  'Infrastructure':    { stroke: '#818cf8', glow: 'rgba(129,140,248,0.25)', bg: 'rgba(129,140,248,0.06)' },
  'State Management':  { stroke: '#f87171', glow: 'rgba(248,113,113,0.25)', bg: 'rgba(248,113,113,0.06)' },
  'State':             { stroke: '#f87171', glow: 'rgba(248,113,113,0.25)', bg: 'rgba(248,113,113,0.06)' },
  'workflow':          { stroke: '#fb923c', glow: 'rgba(251,146,60,0.3)', bg: 'rgba(251,146,60,0.08)' },
  'component':         { stroke: '#94a3b8', glow: 'rgba(148,163,184,0.15)', bg: 'rgba(148,163,184,0.04)' },
  'Components':        { stroke: '#c084fc', glow: 'rgba(192,132,252,0.15)', bg: 'rgba(192,132,252,0.04)' },
  'service':           { stroke: '#60a5fa', glow: 'rgba(96,165,250,0.25)', bg: 'rgba(96,165,250,0.06)' },
  'model':             { stroke: '#3fff8b', glow: 'rgba(63,255,139,0.25)', bg: 'rgba(63,255,139,0.06)' },
  'hook':              { stroke: '#22d3ee', glow: 'rgba(34,211,238,0.25)', bg: 'rgba(34,211,238,0.06)' },
  'Views':             { stroke: '#c084fc', glow: 'rgba(192,132,252,0.25)', bg: 'rgba(192,132,252,0.06)' },
};

const DEFAULT_COLOR = { stroke: '#64748b', glow: 'rgba(100,116,139,0.12)', bg: 'rgba(100,116,139,0.04)' };
const getColor = (layer?: string) => LAYER_COLORS[layer || ''] || DEFAULT_COLOR;

// ─── Derive layer from node path ─────────────────────────────────────────
function deriveLayer(node: { id: string; group?: string; layer?: string }): string {
  if (node.layer) return node.layer;
  if (node.group) return node.group;

  const id = node.id.toLowerCase();
  if (id.includes('services/') || id.includes('/api/') || id.includes('service')) return 'Services';
  if (id.includes('hooks/') || id.includes('hook')) return 'Hooks';
  if (id.includes('/app/') && id.includes('page')) return 'Views';
  if (id.includes('store') || id.includes('state')) return 'State';
  return 'Components';
}

// ─── Static Layout Engine ──────────────────────────────────────────────────
function computeStaticLayout(
  rawNodes: Node[],
  rawLinks: Link[],
  width: number,
  height: number
): { nodes: Node[]; links: Link[] } {
  // Cap to avoid performance issues with 400+ nodes
  const MAX_NODES = 200;
  const MAX_LINKS = 400;

  const nodes = rawNodes.slice(0, MAX_NODES).map(n => ({
    ...n,
    layer: deriveLayer(n),
  }));
  const nodeIds = new Set(nodes.map(n => n.id));
  const links = rawLinks
    .filter(l => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return nodeIds.has(sId) && nodeIds.has(tId);
    })
    .slice(0, MAX_LINKS);

  // Group by layer
  const layers: Record<string, Node[]> = {};
  for (const n of nodes) {
    const l = n.layer || 'Unknown';
    if (!layers[l]) layers[l] = [];
    layers[l].push(n);
  }

  const layerNames = Object.keys(layers).sort();
  const numLayers = layerNames.length;
  const layerSpacing = width / (numLayers + 1);
  const padding = 50;

  // Position nodes in columns per layer, stacked vertically
  for (let li = 0; li < numLayers; li++) {
    const layerNodes = layers[layerNames[li]];
    const cx = layerSpacing * (li + 1);
    const usableHeight = height - padding * 2;
    const nodeSpacing = Math.min(usableHeight / (layerNodes.length + 1), 28);

    const totalH = nodeSpacing * (layerNodes.length - 1);
    const startY = (height - totalH) / 2;

    for (let ni = 0; ni < layerNodes.length; ni++) {
      layerNodes[ni].x = cx + (Math.random() - 0.5) * 12;
      layerNodes[ni].y = startY + ni * nodeSpacing;
    }
  }

  return { nodes, links };
}

export const GraphViewer: React.FC<GraphViewerProps> = ({ data, title }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showLabels, setShowLabels] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);

  const graphData = useMemo(() => ({
    nodes: data?.nodes || [],
    links: data?.links || data?.edges || [],
  }), [data]);

  // Layer stats
  const layerStats = useMemo(() => {
    const dist: Record<string, number> = {};
    for (const n of graphData.nodes) {
      const l = deriveLayer(n);
      dist[l] = (dist[l] || 0) + 1;
    }
    return Object.entries(dist).sort((a, b) => b[1] - a[1]);
  }, [graphData.nodes]);

  // Stats for display
  const stats = useMemo(() => {
    const filtered = activeFilter
      ? graphData.nodes.filter(n => deriveLayer(n) === activeFilter)
      : graphData.nodes;
    const filteredIds = new Set(filtered.map(n => n.id));
    const filteredLinks = graphData.links.filter(l => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return filteredIds.has(sId) && filteredIds.has(tId);
    });
    return {
      nodes: filtered.length,
      links: filteredLinks.length,
      totalNodes: graphData.nodes.length,
      totalLinks: graphData.links.length,
      capped: graphData.nodes.length > 200,
    };
  }, [graphData, activeFilter]);

  // Selected node neighbors
  const selectedNodeNeighbors = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const neighbors = new Set<string>();
    neighbors.add(selectedNode.id);
    for (const l of graphData.links) {
      const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      if (sId === selectedNode.id) neighbors.add(tId);
      if (tId === selectedNode.id) neighbors.add(sId);
    }
    return neighbors;
  }, [selectedNode, graphData.links]);

  // Selected node dependency counts
  const selectedNodeDeps = useMemo(() => {
    if (!selectedNode) return { in: 0, out: 0 };
    let i = 0, o = 0;
    for (const l of graphData.links) {
      const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      if (sId === selectedNode.id) o++;
      if (tId === selectedNode.id) i++;
    }
    return { in: i, out: o };
  }, [selectedNode, graphData.links]);

  // Reset view
  const resetView = useCallback(() => {
    if (!svgRef.current) return;
    d3.select(svgRef.current).transition().duration(600).call(
      (svgRef.current as any).__zoom.transform, d3.zoomIdentity
    );
    setZoomLevel(1);
    setSelectedNode(null);
  }, []);

  // Fit all nodes to view
  const fitToView = useCallback(() => {
    if (!svgRef.current || !layoutCache.current) return;
    const svg = d3.select(svgRef.current);
    const width = svgRef.current.parentElement?.clientWidth || 800;
    const height = svgRef.current.parentElement?.clientHeight || 600;
    const { nodes } = layoutCache.current;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    const padding = 80;
    const dataW = (maxX - minX) || 1;
    const dataH = (maxY - minY) || 1;
    const scale = Math.min((width - padding * 2) / dataW, (height - padding * 2) / dataH, 3);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    svg.transition().duration(600).call(
      (svgRef.current as any).__zoom.transform,
      d3.zoomIdentity.translate(width / 2, height / 2).scale(scale).translate(-cx, -cy)
    );
  }, []);

  // ─── Static SVG Render ────────────────────────────────────────────────────
  const layoutCache = useRef<{ nodes: Node[]; links: Link[] } | null>(null);

  useEffect(() => {
    if (!svgRef.current || graphData.nodes.length === 0) return;

    const container = svgRef.current.parentElement;
    const width = container?.clientWidth || 800;
    const height = container?.clientHeight || 600;

    const svg = d3.select(svgRef.current).attr('viewBox', `0 0 ${width} ${height}`);
    svg.selectAll('*').remove();

    // Defs: glow filter
    const defs = svg.append('defs');
    const filter = defs.append('filter').attr('id', 'node-glow').attr('x', '-100%').attr('y', '-100%').attr('width', '300%').attr('height', '300%');
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    filter.append('feMerge').html('<feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/>');

    // Subtle grid dots
    const gridGroup = svg.append('g').attr('class', 'grid-dots').attr('opacity', 0.08);
    for (let x = 0; x < width; x += 40) {
      for (let y = 0; y < height; y += 40) {
        gridGroup.append('circle').attr('cx', x).attr('cy', y).attr('r', 0.4).attr('fill', 'currentColor');
      }
    }

    // Compute static layout
    const { nodes: layoutNodes, links: layoutLinks } = computeStaticLayout(graphData.nodes, graphData.links, width, height);
    layoutCache.current = { nodes: layoutNodes, links: layoutLinks };

    // Apply filter if active
    const visibleNodes = activeFilter
      ? layoutNodes.filter(n => deriveLayer(n) === activeFilter)
      : layoutNodes;
    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleLinks = layoutLinks.filter(l => {
      const sId = typeof l.source === 'string' ? l.source : (l.source as Node).id;
      const tId = typeof l.target === 'string' ? l.target : (l.target as Node).id;
      return visibleIds.has(sId) && visibleIds.has(tId);
    });

    const g = svg.append('g').attr('class', 'graph-layer');

    // Zoom behavior (pan & zoom only, no simulation)
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.05, 10])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        setZoomLevel(event.transform.k);
      });
    svg.call(zoom);
    (svgRef.current as any).__zoom = zoom;

    // ── Draw Links ──
    const linkGroup = g.append('g').attr('class', 'links');
    linkGroup.selectAll('line')
      .data(visibleLinks).join('line')
      .attr('x1', (d: any) => {
        const src = visibleNodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
        return src ? src.x : 0;
      })
      .attr('y1', (d: any) => {
        const src = visibleNodes.find(n => n.id === (typeof d.source === 'string' ? d.source : d.source.id));
        return src ? src.y : 0;
      })
      .attr('x2', (d: any) => {
        const tgt = visibleNodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
        return tgt ? tgt.x : 0;
      })
      .attr('y2', (d: any) => {
        const tgt = visibleNodes.find(n => n.id === (typeof d.target === 'string' ? d.target : d.target.id));
        return tgt ? tgt.y : 0;
      })
      .attr('stroke', 'currentColor')
      .attr('stroke-opacity', 0.06)
      .attr('stroke-width', 0.5);

    // ── Draw Nodes ──
    const nodeGroup = g.append('g').attr('class', 'nodes');
    nodeGroup.selectAll('g')
      .data(visibleNodes).join('g')
      .attr('transform', (d: Node) => `translate(${d.x},${d.y})`)
      .attr('cursor', 'pointer')
      .attr('class', 'node-g')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(prev => prev?.id === d.id ? null : d);
      });

    // Outer glow
    nodeGroup.selectAll('g.node-g').insert('circle', ':first-child')
      .attr('r', 5)
      .attr('fill', (d: Node) => getColor(deriveLayer(d)).bg)
      .attr('stroke', 'none');

    // Inner core
    nodeGroup.selectAll('g.node-g')
      .append('circle')
      .attr('cx', 0)
      .attr('cy', 0)
      .attr('r', 1.8)
      .attr('fill', (d: Node) => getColor(deriveLayer(d)).stroke)
      .attr('filter', 'url(#node-glow)');

    // ── Draw Labels ──
    const labelGroup = g.append('g').attr('class', 'labels');
    labelGroup.selectAll('text')
      .data(visibleNodes).join('text')
      .text((d: Node) => {
        const label = d.label || d.id;
        // Show only last path segment for long IDs
        if (label.includes('/') || label.includes('\\')) {
          const parts = label.split(/[/\\]/);
          return parts[parts.length - 1];
        }
        return label;
      })
      .attr('x', (d: Node) => d.x + 8)
      .attr('y', (d: Node) => d.y + 2)
      .attr('font-size', zoomLevel > 1.5 ? '5px' : '4px')
      .attr('font-weight', '500')
      .attr('fill', 'currentColor')
      .attr('fill-opacity', 0.3)
      .attr('pointer-events', 'none')
      .style('display', showLabels ? 'block' : 'none');

    // Click background to deselect
    svg.on('click', () => setSelectedNode(null));
  }, [graphData, showLabels, activeFilter]);

  // ─── Highlight on selection ──────────────────────────────────────────────
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const hasSel = !!selectedNode;

    svg.select('.nodes').selectAll('g')
      .transition().duration(200)
      .attr('opacity', (d: any) => {
        if (!hasSel) return 1;
        return selectedNodeNeighbors.has(d.id) ? 1 : 0.04;
      });

    svg.select('.links').selectAll('line')
      .transition().duration(200)
      .attr('stroke-opacity', (d: any) => {
        if (!hasSel) return 0.06;
        const sId = typeof d.source === 'string' ? d.source : (d.source as any).id;
        const tId = typeof d.target === 'string' ? d.target : (d.target as any).id;
        return (sId === selectedNode!.id || tId === selectedNode!.id) ? 0.7 : 0.01;
      })
      .attr('stroke-width', (d: any) => {
        if (!hasSel) return 0.5;
        const sId = typeof d.source === 'string' ? d.source : (d.source as any).id;
        const tId = typeof d.target === 'string' ? d.target : (d.target as any).id;
        return (sId === selectedNode!.id || tId === selectedNode!.id) ? 1.5 : 0.3;
      });

    svg.select('.labels').selectAll('text')
      .transition().duration(200)
      .attr('fill-opacity', (d: any) => {
        if (!hasSel) return 0.3;
        return selectedNodeNeighbors.has(d.id) ? 0.8 : 0.02;
      });
  }, [selectedNode, selectedNodeNeighbors]);

  // ─── Empty state ────────────────────────────────────────────────────────
  if (graphData.nodes.length === 0) {
    return (
      <div className="rounded-[32px] bg-card border border-border/50 p-10 h-[500px] flex items-center justify-center shadow-2xl">
        <div className="text-center space-y-4">
          <Share2 className="w-12 h-12 text-muted-foreground/20 mx-auto" />
          <p className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest">Sin datos de grafo disponibles</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[32px] bg-[#080810] border border-white/[0.06] h-[750px] flex flex-col shadow-2xl relative overflow-hidden">
      {/* ── Header bar ── */}
      <div className="px-6 py-4 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between relative z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/[0.08] flex items-center justify-center shrink-0">
            <Share2 className="w-5 h-5 text-purple-400/80" />
          </div>
          <div>
            <h2 className="text-xs font-black uppercase tracking-wider text-white/80 leading-none mb-0.5">{title}</h2>
            <p className="text-[8px] font-bold text-white/25 uppercase tracking-widest">
              {stats.nodes}{activeFilter ? ` filtrados` : ''} nodos · {stats.links} enlaces
              {stats.capped && <span className="ml-2 text-amber-400/50">(top 200 de {stats.totalNodes})</span>}
            </p>
          </div>
        </div>

        {/* ── Controls ── */}
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowLabels(!showLabels)} className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all" title={showLabels ? 'Ocultar etiquetas' : 'Mostrar etiquetas'}>
            {showLabels ? <Eye className="w-3 h-3 text-white/40" /> : <EyeOff className="w-3 h-3 text-white/40" />}
          </button>
          <button onClick={() => setShowLegend(!showLegend)} className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all" title="Capas">
            <Layers className="w-3 h-3 text-white/40" />
          </button>
          <div className="w-px h-5 bg-white/[0.06]" />
          <div className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[8px] font-mono font-bold text-white/30 min-w-[40px] text-center">
            {Math.round(zoomLevel * 100)}%
          </div>
          <button onClick={() => { svgRef.current && d3.select(svgRef.current).transition().duration(400).call((svgRef.current as any).__zoom.scaleBy, 1.8); }} className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all" title="Zoom +">
            <ZoomIn className="w-3 h-3 text-white/40" />
          </button>
          <button onClick={() => { svgRef.current && d3.select(svgRef.current).transition().duration(400).call((svgRef.current as any).__zoom.scaleBy, 0.55); }} className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all" title="Zoom -">
            <ZoomOut className="w-3 h-3 text-white/40" />
          </button>
          <button onClick={fitToView} className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all" title="Ajustar a vista">
            <Maximize2 className="w-3 h-3 text-white/40" />
          </button>
          <button onClick={resetView} className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-all" title="Restablecer">
            <RotateCcw className="w-3 h-3 text-white/40" />
          </button>
        </div>
      </div>

      {/* ── Graph Area ── */}
      <div className="flex-1 relative overflow-hidden" ref={containerRef}>
        <svg ref={svgRef} className="w-full h-full cursor-crosshair" style={{ background: 'radial-gradient(ellipse at center, #0d0d1a 0%, #080810 70%, #050508 100%)' }} />

        {/* ── Layer filter legend ── */}
        {showLegend && (
          <div className="absolute top-3 left-3 p-3 rounded-xl bg-black/60 backdrop-blur-xl border border-white/[0.08] shadow-2xl w-[180px]">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-1.5">
                <Layers className="w-2.5 h-2.5 text-purple-400/60" />
                <span className="text-[7px] font-black uppercase tracking-widest text-white/40">Capas</span>
              </div>
              <button onClick={() => setActiveFilter(null)} className={cn("text-[6px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded", !activeFilter ? "bg-white/10 text-white/60" : "text-white/20 hover:text-white/40")}>Todas</button>
            </div>
            <div className="space-y-1">
              {layerStats.map(([layer, count]) => {
                const c = getColor(layer);
                const isActive = activeFilter === layer;
                return (
                  <button key={layer} onClick={() => setActiveFilter(isActive ? null : layer)}
                    className={cn("w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left",
                      isActive ? "bg-white/[0.08] border border-white/[0.12]" : "hover:bg-white/[0.03] border border-transparent"
                    )}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.stroke, boxShadow: isActive ? `0 0 8px ${c.stroke}` : 'none' }} />
                    <span className="text-[7px] font-bold uppercase tracking-wider text-white/50 truncate flex-1">{layer}</span>
                    <span className={cn("text-[7px] font-mono font-bold", isActive ? "text-white/60" : "text-white/20")}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Crosshair ── */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-[0.03]">
          <Crosshair className="w-6 h-6 text-white" />
        </div>

        {/* ── Selected node detail panel ── */}
        {selectedNode && (
          <div className="absolute bottom-3 left-3 p-4 rounded-xl bg-black/80 backdrop-blur-xl border border-white/[0.08] shadow-2xl w-[260px] animate-in slide-in-from-left-4 duration-300">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getColor(deriveLayer(selectedNode)).stroke, boxShadow: `0 0 10px ${getColor(deriveLayer(selectedNode)).stroke}` }} />
                <h3 className="text-[10px] font-black uppercase tracking-tight leading-tight truncate text-white/90">{selectedNode.label}</h3>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-[7px] font-bold uppercase text-white/20 hover:text-white/50 ml-1 shrink-0">✕</button>
            </div>
            <div className="space-y-1.5 mb-3">
              <div className="flex items-center justify-between">
                <span className="text-[7px] font-bold uppercase tracking-widest text-white/25">Capa</span>
                <span className="text-[8px] font-bold uppercase text-white/50">{deriveLayer(selectedNode)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[7px] font-bold uppercase tracking-widest text-white/25">Grupo</span>
                <span className="text-[8px] font-bold uppercase text-white/50">{selectedNode.group || '—'}</span>
              </div>
            </div>
            <div className="p-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] grid grid-cols-2 gap-2">
              <div className="text-center">
                <div className="text-xs font-black text-blue-400">{selectedNodeDeps.in}</div>
                <div className="text-[6px] font-bold uppercase tracking-widest text-white/25">Dependencias</div>
              </div>
              <div className="text-center">
                <div className="text-xs font-black text-emerald-400">{selectedNodeDeps.out}</div>
                <div className="text-[6px] font-bold uppercase tracking-widest text-white/25">Dependientes</div>
              </div>
            </div>
            <div className="mt-1.5 text-[6px] font-mono text-white/15 truncate">{selectedNode.id}</div>
          </div>
        )}

        {/* ── Status hint ── */}
        {!selectedNode && (
          <div className="absolute bottom-3 left-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur border border-white/[0.06]">
            <Crosshair className="w-2.5 h-2.5 text-white/20" />
            <span className="text-[7px] font-bold uppercase tracking-widest text-white/20">Grafo estático · Clic para inspeccionar nodo</span>
          </div>
        )}
      </div>
    </div>
  );
};
