'use client';

import React, { useState } from 'react';
import { Brain, Search, FileDown, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntelligenceMapProps {
  components: any[];
}

export const IntelligenceMap: React.FC<IntelligenceMapProps> = ({ components }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('ALL');

  const filtered = components.filter(c => {
    const matchesSearch = c.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filter === 'ALL' || c.type.toUpperCase() === filter;
    return matchesSearch && matchesFilter;
  });

  const getHealthColor = (h: number) => {
    if (h >= 8.0) return 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20';
    if (h >= 5.0) return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
    return 'text-rose-500 bg-rose-500/10 border-rose-500/20';
  };

  return (
    <section className="bg-card/30 p-8 rounded-[40px] border border-border/50">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-8">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3">
            <Brain className="w-6 h-6 text-primary" />
            Mapa de Inteligencia del Sistema
          </h2>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-1">11 artefactos de conocimiento registrados</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="BUSCAR EN EL CEREBRO DEL..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 rounded-xl bg-background/50 border border-border/50 text-xs font-bold focus:outline-none focus:border-primary/50 w-64"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 text-white text-[10px] font-black uppercase hover:scale-105 transition-transform">
            <FileDown className="w-4 h-4" />
            EXCEL
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {['ALL', 'COMPONENT', 'VIEW', 'HOOK', 'SERVICE'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all",
              filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-background/50 border-border/50 text-muted-foreground hover:border-primary/30"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-blue-500/5 text-left">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest opacity-40">Nombre & Ruta</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest opacity-40">Tipo</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest opacity-40">Salud</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest opacity-40">Acoplamiento</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest opacity-40">Open Questions</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-widest opacity-40">Lógica</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/30">
            {filtered.map((c, i) => (
              <tr key={i} className="hover:bg-primary/5 transition-colors group">
                <td className="px-6 py-4">
                  <div className="text-[11px] font-black uppercase">{c.name || c.id.split('_').pop()}</div>
                  <div className="text-[9px] font-bold text-muted-foreground opacity-50 truncate max-w-xs">{c.filePath || c.id}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 rounded-md bg-background border border-border/50 text-[9px] font-black uppercase opacity-60">
                    {c.type}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-[11px] font-black border",
                    getHealthColor(c.health)
                  )}>
                    {c.health?.toFixed(1)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "text-[11px] font-black",
                    c.couplingScore > 7 ? "text-rose-500" : (c.couplingScore > 3 ? "text-amber-500" : "text-emerald-500")
                  )}>
                    {c.couplingScore?.toFixed(1)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className={cn(
                    "px-2 py-1 rounded-md text-[9px] font-black uppercase border",
                    c.openQuestions?.length > 0 ? "text-amber-500 bg-amber-500/10 border-amber-500/20" : "text-emerald-500 bg-emerald-500/10 border-emerald-500/20"
                  )}>
                    {c.openQuestions?.length > 0 ? c.openQuestions.length : 'CLEAN'}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2 py-1 rounded-md text-[9px] font-black uppercase border",
                      c.hasLogic ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" : "text-muted-foreground bg-muted/10 border-border/20"
                    )}>
                      {c.hasLogic ? 'EXTRAÍDA' : 'PENDIENTE'}
                    </span>
                    <ChevronRight className="w-3 h-3 opacity-20 group-hover:opacity-100 transition-opacity" />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};
