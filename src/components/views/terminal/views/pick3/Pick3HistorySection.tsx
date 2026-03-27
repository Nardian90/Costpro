"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Pick3Result } from '@/types/pick3';
import {
  Card, CardContent
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search, List, LayoutGrid, Calendar as CalendarIcon, Clock, ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Pick3HistorySectionProps {
  history: Pick3Result[];
}

export function Pick3HistorySection({ history }: Pick3HistorySectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [displayLimit, setDisplayLimit] = useState(20);

  // Filter history based on search term
  const filteredHistory = useMemo(() => {
    if (!searchTerm) return history;
    return history.filter(item => {
      const resultStr = item.result.join('');
      return resultStr.includes(searchTerm) ||
             item.date.includes(searchTerm) ||
             (item.draw_time === 'midday' ? 'mediodia' : 'noche').includes(searchTerm.toLowerCase());
    });
  }, [history, searchTerm]);

  // Handle infinite scroll simulation (increasing display limit)
  const visibleHistory = useMemo(() => {
    return filteredHistory.slice(0, displayLimit);
  }, [filteredHistory, displayLimit]);

  const hasMore = displayLimit < filteredHistory.length;

  const loadMore = () => {
    setDisplayLimit(prev => prev + 20);
  };

  // Result Card Component
  const ResultCard = ({ item }: { item: Pick3Result }) => (
    <Card className="rounded-2xl border-border bg-card/50 shadow-sm overflow-hidden mb-3">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
            <CalendarIcon className="w-3 h-3" />
            {format(new Date(item.date), 'dd MMM yyyy', { locale: es })}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={cn(
              "text-[8px] font-black uppercase px-1.5 py-0 rounded-full",
              item.draw_time === 'midday' ? "border-orange-500/30 text-orange-500" : "border-blue-500/30 text-blue-500"
            )}>
              <Clock className="w-2 h-2 mr-1" />
              {item.draw_time === 'midday' ? 'Mediodía' : 'Noche'}
            </Badge>
          </div>
        </div>
        <div className="flex gap-1.5">
          {item.result.map((digit, i) => (
            <div key={i} className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-black italic text-primary">
              {digit}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Search & Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between sticky top-0 z-10 bg-background/80 backdrop-blur-md py-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar número o fecha..."
            className="pl-9 rounded-full bg-muted/50 border-none h-10 text-xs font-bold"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-full w-full sm:w-auto">
          <Button
            variant={viewMode === 'card' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-full flex-1 sm:flex-none h-8 font-bold text-[10px] uppercase"
            onClick={() => setViewMode('card')}
          >
            <LayoutGrid className="w-3 h-3 mr-1" /> Tarjetas
          </Button>
          <Button
            variant={viewMode === 'table' ? 'default' : 'ghost'}
            size="sm"
            className="rounded-full flex-1 sm:flex-none h-8 font-bold text-[10px] uppercase"
            onClick={() => setViewMode('table')}
          >
            <List className="w-3 h-3 mr-1" /> Tabla
          </Button>
        </div>
      </div>

      {/* Content */}
      {viewMode === 'card' ? (
        <div className="grid grid-cols-1 gap-1">
          {visibleHistory.map((item, i) => (
            <ResultCard key={i} item={item} />
          ))}
        </div>
      ) : (
        <Card className="rounded-[24px] border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Fecha</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Turno</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleHistory.map((item, i) => (
                <TableRow key={i} className="border-border/50">
                  <TableCell className="text-xs font-bold py-3">
                    {format(new Date(item.date), 'dd/MM/yyyy')}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={cn(
                      "text-[8px] font-black uppercase px-1.5 py-0",
                      item.draw_time === 'midday' ? "text-orange-500 border-orange-500/20" : "text-blue-500 border-blue-500/20"
                    )}>
                      {item.draw_time === 'midday' ? 'Mediodía' : 'Noche'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-black italic text-primary">
                    {item.result.join(' ')}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Infinite Scroll Load More Button */}
      {hasMore && (
        <div className="flex justify-center py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={loadMore}
            className="rounded-full font-bold text-xs px-6 border-primary/20 text-primary hover:bg-primary/5"
          >
            Ver más resultados <ChevronDown className="w-3 h-3 ml-2" />
          </Button>
        </div>
      )}

      {filteredHistory.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-muted-foreground font-bold italic">No se encontraron resultados para "{searchTerm}"</p>
        </div>
      )}
    </div>
  );
}
