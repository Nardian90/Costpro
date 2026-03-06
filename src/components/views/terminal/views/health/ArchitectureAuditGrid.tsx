'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, ShieldCheck, AlertTriangle, AlertCircle, FileCode, ExternalLink, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface AuditItem {
  id: string;
  name: string;
  type: string;
  path: string;
  health: number;
  status: string;
  lastAudit: string;
  metrics: {
    inDegree: number;
    outDegree: number;
    lines: number;
    cyclomaticComplexity: number;
    couplingScore: number;
  };
  dependencies: string[];
}

export function ArchitectureAuditGrid() {
  const [data, setData] = useState<AuditItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetch('/system_architecture.json')
      .then(res => res.json())
      .then(json => {
        setData(json.architecture || []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading architecture audit:', err);
        setLoading(false);
      });
  }, []);

  const filteredData = data.filter(item => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase()) ||
                         item.path.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || item.type === filter;
    return matchesSearch && matchesFilter;
  });

  const getHealthColor = (score: number) => {
    if (score >= 9.5) return "text-emerald-500 bg-emerald-500/10 border-emerald-500/20";
    if (score >= 8.0) return "text-blue-500 bg-blue-500/10 border-blue-500/20";
    if (score >= 6.0) return "text-amber-500 bg-amber-500/10 border-amber-500/20";
    return "text-rose-500 bg-rose-500/10 border-rose-500/20";
  };

  const getHealthIcon = (score: number) => {
    if (score >= 9.5) return <ShieldCheck className="w-3.5 h-3.5" />;
    if (score >= 6.0) return <AlertTriangle className="w-3.5 h-3.5" />;
    return <AlertCircle className="w-3.5 h-3.5" />;
  };

  if (loading) {
    return <div className="h-48 flex items-center justify-center font-black uppercase tracking-widest opacity-40">Cargando Auditoría...</div>;
  }

  return (
    <div className="space-y-6 bg-card/30 p-8 rounded-[40px] border border-border/50">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tighter">Inventario de Componentes & Vistas</h3>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mapa detallado generado por Audit Agent</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="BUSCAR COMPONENTE..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-background/50 border border-border/50 rounded-xl px-9 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-primary/50 w-64"
            />
          </div>

          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-background/50 border border-border/50 rounded-xl px-4 py-2 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-primary/50"
          >
            <option value="all">TODOS</option>
            <option value="view">VISTAS</option>
            <option value="component">COMPONENTES</option>
            <option value="hook">HOOKS</option>
            <option value="service">SERVICIOS</option>
            <option value="utility">UTILIDADES</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
        {filteredData.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.01 }}
            className="group bg-background/40 border border-border/50 rounded-3xl p-5 hover:border-primary/30 transition-all hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <FileCode className="w-4 h-4 text-primary opacity-50" />
                <span className="text-[11px] font-black uppercase tracking-tight truncate max-w-[150px]">{item.name}</span>
              </div>
              <Badge className={cn("text-[8px] font-black uppercase flex items-center gap-1", getHealthColor(item.health))}>
                {getHealthIcon(item.health)}
                {item.health.toFixed(1)}
              </Badge>
            </div>

            <div className="text-[9px] font-mono text-muted-foreground mb-4 truncate opacity-60">
              {item.path}
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-card/50 p-2 rounded-xl border border-border/30">
                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Acoplamiento</div>
                <div className="text-xs font-black text-primary">{item.metrics.couplingScore}</div>
              </div>
              <div className="bg-card/50 p-2 rounded-xl border border-border/30">
                <div className="text-[8px] font-black text-muted-foreground uppercase tracking-widest mb-0.5">Complejidad</div>
                <div className="text-xs font-black text-primary">{item.metrics.cyclomaticComplexity}</div>
              </div>
            </div>

            <div className="flex items-center justify-between mt-auto pt-3 border-t border-border/30">
              <div className="flex -space-x-1.5 overflow-hidden">
                {item.dependencies.slice(0, 5).map((dep, i) => (
                  <div key={i} title={dep} className="w-5 h-5 rounded-full bg-primary/20 border border-background flex items-center justify-center">
                    <span className="text-[7px] font-black uppercase">{dep[0]}</span>
                  </div>
                ))}
                {item.dependencies.length > 5 && (
                  <div className="w-5 h-5 rounded-full bg-muted border border-background flex items-center justify-center">
                    <span className="text-[7px] font-black">+{item.dependencies.length - 5}</span>
                  </div>
                )}
              </div>
              <span className="text-[8px] font-bold text-muted-foreground uppercase">{item.lastAudit}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
