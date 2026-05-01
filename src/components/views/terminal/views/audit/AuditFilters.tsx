import React, { useState } from 'react';
import { Search, Filter, X, Calendar } from 'lucide-react';
import { format, subDays, startOfDay, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { AuditCategory } from './AuditEventIcon';

interface AuditFiltersProps {
  searchTerm: string;
  onSearchChange: (val: string) => void;
  dateRange: { from: string; to: string };
  onDateRangeChange: (range: { from: string; to: string }) => void;
  selectedCategory: AuditCategory | 'all';
  onCategoryChange: (cat: AuditCategory | 'all') => void;
  availableUsers: string[];
  selectedUser: string;
  onUserChange: (user: string) => void;
  availableStores: string[];
  selectedStore: string;
  onStoreChange: (store: string) => void;
}

export default function AuditFilters({
  searchTerm,
  onSearchChange,
  dateRange,
  onDateRangeChange,
  selectedCategory,
  onCategoryChange,
  availableUsers,
  selectedUser,
  onUserChange,
  availableStores,
  selectedStore,
  onStoreChange
}: AuditFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const categories: { id: AuditCategory | 'all'; label: string; color: string }[] = [
    { id: 'all', label: 'Todo', color: 'bg-slate-500' },
    { id: 'inventory', label: 'Inventario', color: 'bg-green-500' },
    { id: 'sales', label: 'Ventas', color: 'bg-green-500' },
    { id: 'users', label: 'Usuarios', color: 'bg-purple-500' },
    { id: 'stores', label: 'Tiendas', color: 'bg-orange-500' },
    { id: 'adjustments', label: 'Ajustes', color: 'bg-red-500' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Buscar por usuario, producto, acción..."
            className="w-full pl-10 pr-4 py-3 rounded-xl border border-border bg-card text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none transition-all"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Buscar en auditoría"
          />
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "flex items-center justify-center gap-2 px-6 h-11 rounded-xl border font-black uppercase text-xs tracking-widest transition-all",
            isExpanded ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-border hover:bg-muted"
          )}
        >
          <Filter size={14} />
          Filtros {isExpanded ? 'Cerrar' : 'Abrir'}
        </button>
      </div>

      {isExpanded && (
        <div className="p-6 rounded-2xl border border-border bg-card shadow-xl animate-in fade-in slide-in-from-top-4 duration-300">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Categorías */}
            <div className="space-y-3">
              <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Categoría</span>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => onCategoryChange(cat.id)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-black uppercase transition-all border",
                      selectedCategory === cat.id
                        ? `${cat.color} text-foreground border-transparent shadow-lg scale-105`
                        : "bg-muted/50 text-muted-foreground border-border hover:border-muted-foreground/30"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Rango de Fechas */}
            <div className="space-y-3">
              <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Rango de Fechas</span>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {[
                  { label: 'Hoy', getValue: () => ({ from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
                  { label: 'Ayer', getValue: () => {
                    const yesterday = subDays(new Date(), 1);
                    return { from: format(yesterday, 'yyyy-MM-dd'), to: format(yesterday, 'yyyy-MM-dd') };
                  }},
                  { label: '7 Días', getValue: () => ({ from: format(subDays(new Date(), 7), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') }) },
                ].map(preset => (
                  <button
                    key={preset.label}
                    onClick={() => onDateRangeChange(preset.getValue())}
                    className="px-2 py-1 rounded bg-muted/50 hover:bg-primary/10 hover:text-primary text-xs font-black uppercase border border-border/50 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase ml-1">Desde</span>
                  <input
                    type="date"
                    className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                    value={dateRange.from}
                    onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
                    aria-label="Fecha desde"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-xs font-bold text-muted-foreground uppercase ml-1">Hasta</span>
                  <input
                    type="date"
                    className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                    value={dateRange.to}
                    onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
                    aria-label="Fecha hasta"
                  />
                </div>
              </div>
            </div>

            {/* Contexto: Usuario y Tienda */}
            <div className="space-y-3">
              <label htmlFor="audit-context" className="text-xs font-black uppercase text-muted-foreground tracking-widest">Contexto</label>
              <div className="space-y-2">
                <select
                  id="audit-context"
                  className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                  value={selectedUser}
                  onChange={(e) => onUserChange(e.target.value)}
                >
                  <option value="all">TODOS LOS USUARIOS</option>
                  {availableUsers.map(u => (
                    <option key={u} value={u}>{u.toUpperCase()}</option>
                  ))}
                </select>
                <select
                  className="w-full p-2 rounded-lg border border-border bg-background text-xs font-bold outline-none focus:ring-1 focus:ring-primary"
                  value={selectedStore}
                  onChange={(e) => onStoreChange(e.target.value)}
                >
                  <option value="all">TODAS LAS TIENDAS</option>
                  {availableStores.map(s => (
                    <option key={s} value={s}>{s.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex justify-end">
             <button
                onClick={() => {
                  onSearchChange('');
                  onCategoryChange('all');
                  onDateRangeChange({ from: '', to: '' });
                  onUserChange('all');
                  onStoreChange('all');
                }}
                className="text-xs font-black uppercase text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
             >
               <X size={12} /> Limpiar Filtros
             </button>
          </div>
        </div>
      )}
    </div>
  );
}
