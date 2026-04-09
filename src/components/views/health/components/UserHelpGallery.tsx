import React, { useState } from 'react';
import { Search, Book, HelpCircle, ChevronRight, Layout, Database, GitPullRequest } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UserHelpItem {
  id: string;
  name: string;
  descripcion_usuario: string;
  domain?: string;
  type?: string;
  category?: string;
}

interface UserHelpGalleryProps {
  data: UserHelpItem[];
}

export const UserHelpGallery: React.FC<UserHelpGalleryProps> = ({ data }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const categories = [
    { id: 'all', name: 'Todo', icon: Book },
    { id: 'IPV', name: 'Módulo IPV', icon: Layout },
    { id: 'Accounting', name: 'Contabilidad', icon: Database },
    { id: 'Workflows', name: 'Procesos', icon: GitPullRequest },
  ];

  const filteredData = data.filter(item => {
    const matchesSearch = (item.name + item.descripcion_usuario + (item.domain || '')).toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = activeCategory === 'all' || item.domain === activeCategory || item.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground opacity-40" />
          <input
            type="text"
            placeholder="Buscar ayuda, guías o funciones..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-muted/20 border border-border/50 rounded-2xl pl-12 pr-6 py-4 text-xs font-black uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:opacity-30"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 w-full md:w-auto">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap border",
                activeCategory === cat.id
                  ? "bg-primary text-primary-foreground border-primary shadow-lg"
                  : "bg-background text-muted-foreground border-border/50 hover:bg-muted/50"
              )}
            >
              <cat.icon className="w-3.5 h-3.5" />
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredData.map((item, idx) => (
          <div
            key={item.id || idx}
            className="group p-8 rounded-[32px] bg-card border border-border/50 hover:border-primary/30 hover:shadow-2xl transition-all duration-500 relative overflow-hidden flex flex-col h-full"
          >
            <div className="absolute top-0 right-0 p-8 opacity-[0.03] group-hover:scale-125 group-hover:opacity-[0.07] transition-all duration-700 pointer-events-none">
              <HelpCircle className="w-32 h-32" />
            </div>

            <div className="flex items-center justify-between mb-6">
              <div className="px-3 py-1 rounded-lg bg-primary/10 border border-primary/20 text-[8px] font-black uppercase tracking-widest text-primary">
                {item.domain || item.category || 'GENERAL'}
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground opacity-20 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
            </div>

            <h3 className="text-sm font-black uppercase tracking-tight mb-4 group-hover:text-primary transition-colors">
              {item.name}
            </h3>

            <p className="text-[11px] font-bold text-muted-foreground uppercase leading-relaxed tracking-widest opacity-80 flex-1">
              {item.descripcion_usuario}
            </p>

            <div className="mt-8 pt-6 border-t border-border/50 flex items-center justify-between">
               <span className="text-[8px] font-black uppercase tracking-widest opacity-40 italic">ID: {item.id}</span>
               <button className="text-[9px] font-black uppercase tracking-widest text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  Ver guía detallada
               </button>
            </div>
          </div>
        ))}

        {filteredData.length === 0 && (
          <div className="col-span-full p-20 text-center rounded-[40px] bg-muted/10 border border-dashed border-border/50">
             <HelpCircle className="w-12 h-12 text-muted-foreground mx-auto mb-6 opacity-20" />
             <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground">No se encontraron resultados</h4>
             <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-2">Intenta con otros términos o categorías</p>
          </div>
        )}
      </div>
    </div>
  );
};
