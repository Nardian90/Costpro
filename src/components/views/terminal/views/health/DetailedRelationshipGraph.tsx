'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Share2, Search, Filter, Info, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Node {
  id: string;
  name: string;
  type: string;
  health: number;
}

interface Edge {
  from: string;
  to: string;
}

export function DetailedRelationshipGraph() {
  const [data, setData] = useState<{ nodes: Node[], edges: Edge[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetch('/architecture_graph.json')
      .then(res => res.json())
      .then(json => {
        setData({
          nodes: json.nodes.map((n: any) => ({ id: n.id, name: n.name, type: n.type, health: n.health })),
          edges: json.edges
        });
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading architecture graph:', err);
        setLoading(false);
      });
  }, []);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    return data.nodes.filter(n =>
      n.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 50); // Limit for performance
  }, [data, searchTerm]);

  const relatedEdges = useMemo(() => {
    if (!data || !selectedNode) return [];
    return data.edges.filter(e => e.from === selectedNode || e.to === selectedNode);
  }, [data, selectedNode]);

  const dependencies = useMemo(() => {
    if (!data || !selectedNode) return [];
    const deps = data.edges.filter(e => e.from === selectedNode).map(e => e.to);
    return data.nodes.filter(n => deps.includes(n.id));
  }, [data, selectedNode]);

  const dependents = useMemo(() => {
    if (!data || !selectedNode) return [];
    const deps = data.edges.filter(e => e.to === selectedNode).map(e => e.from);
    return data.nodes.filter(n => deps.includes(n.id));
  }, [data, selectedNode]);

  const selectedNodeData = useMemo(() => {
    return data?.nodes.find(n => n.id === selectedNode);
  }, [data, selectedNode]);

  if (loading) return <div className="h-48 flex items-center justify-center font-black opacity-40 uppercase tracking-widest">Explorando Grafo...</div>;

  return (
    <div className="space-y-6 bg-card/30 p-8 rounded-[40px] border border-border/50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Share2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tighter">Explorador de Relaciones Dinámico</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Análisis de acoplamiento y dependencias vivas</p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="ENCONTRAR NODO..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="bg-background/50 border border-border/50 rounded-xl px-9 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-primary/50 w-64"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Node Grid */}
        <div className="space-y-4">
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-4">Nodos del Sistema ({filteredNodes.length})</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
            {filteredNodes.map(node => (
              <button
                key={node.id}
                onClick={() => setSelectedNode(node.id)}
                className={cn(
                  "p-3 rounded-2xl border transition-all text-left group relative overflow-hidden",
                  selectedNode === node.id
                    ? "bg-primary text-white border-primary shadow-lg shadow-primary/20"
                    : "bg-background/40 border-border/50 hover:border-primary/40 hover:bg-card/50"
                )}
              >
                <div className={cn(
                  "text-[9px] font-black uppercase tracking-tight truncate",
                  selectedNode === node.id ? "text-white/90" : "text-primary/70"
                )}>
                  {node.type}
                </div>
                <div className="text-[10px] font-black uppercase truncate group-hover:scale-105 transition-transform origin-left">
                  {node.name}
                </div>
                <div className={cn(
                  "mt-2 w-full h-1 rounded-full bg-black/10 overflow-hidden",
                  selectedNode === node.id ? "bg-white/20" : "bg-muted"
                )}>
                  <div
                    className={cn(
                      "h-full rounded-full",
                      node.health >= 9.5 ? "bg-emerald-500" :
                      node.health >= 8.0 ? "bg-blue-500" :
                      node.health >= 6.0 ? "bg-amber-500" : "bg-rose-500"
                    )}
                    style={{ width: `${node.health * 10}%` }}
                  />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Details / Relationships */}
        <div className="bg-background/30 rounded-[32px] border border-border/50 p-6 flex flex-col min-h-[400px]">
          <AnimatePresence mode="wait">
            {selectedNode ? (
              <motion.div
                key={selectedNode}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6 flex-1"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-lg font-black uppercase tracking-tighter text-primary">{selectedNodeData?.name}</h4>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase">{selectedNodeData?.path}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] font-black uppercase border-primary/20 bg-primary/5 text-primary">
                    SALUD: {selectedNodeData?.health.toFixed(1)}
                  </Badge>
                </div>

                <div className="space-y-6">
                  {/* Dependencies (Out) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRight className="w-3.5 h-3.5 text-blue-500" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dependencias (Salida)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dependencies.length > 0 ? dependencies.map(dep => (
                        <button
                          key={dep.id}
                          onClick={() => setSelectedNode(dep.id)}
                          className="px-3 py-1.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[9px] font-black uppercase hover:bg-blue-500/20 transition-colors"
                        >
                          {dep.name}
                        </button>
                      )) : <span className="text-[9px] font-bold uppercase opacity-30 italic">Sin dependencias detectadas</span>}
                    </div>
                  </div>

                  {/* Dependents (In) */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-500 rotate-180" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Dependientes (Entrada)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {dependents.length > 0 ? dependents.map(dep => (
                        <button
                          key={dep.id}
                          onClick={() => setSelectedNode(dep.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[9px] font-black uppercase hover:bg-emerald-500/20 transition-colors"
                        >
                          {dep.name}
                        </button>
                      )) : <span className="text-[9px] font-bold uppercase opacity-30 italic">Sin dependientes detectados</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-auto pt-6 border-t border-border/30">
                  <div className="flex items-center gap-2 text-[9px] font-bold text-muted-foreground uppercase leading-relaxed">
                    <Info className="w-3 h-3 shrink-0" />
                    Este componente tiene un índice de acoplamiento de entrada de {dependents.length} y salida de {dependencies.length}.
                  </div>
                </div>
              </motion.div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center opacity-40 text-center">
                <Share2 className="w-12 h-12 mb-4 text-primary animate-pulse" />
                <h4 className="text-xs font-black uppercase tracking-widest mb-2">Seleccione un Nodo</h4>
                <p className="text-[10px] font-bold uppercase max-w-[200px]">Para visualizar su impacto en el ecosistema y sus relaciones de dependencia.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
