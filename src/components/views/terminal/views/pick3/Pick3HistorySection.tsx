"use client";

import React, { useState, useMemo, useEffect } from 'react';
import { Pick3Result, DrawTime } from '@/types/pick3';
import {
  Card, CardContent, CardHeader, CardTitle
} from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Search, List, LayoutGrid, Calendar as CalendarIcon, Clock, ChevronDown, Plus, AlertTriangle, Edit2, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DataIntegrityService, GapInfo } from '@/services/pick3/DataIntegrityService';
import { Pick3Storage } from '@/services/pick3/storage';
import { toast } from 'sonner';

interface Pick3HistorySectionProps {
  history: Pick3Result[];
  onRefresh: () => void;
}

export function Pick3HistorySection({ history, onRefresh }: Pick3HistorySectionProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'card' | 'table'>('card');
  const [displayLimit, setDisplayLimit] = useState(20);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingResult, setEditingResult] = useState<Pick3Result | null>(null);

  const gaps = useMemo(() => DataIntegrityService.findGaps(history), [history]);

  // Form State
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    draw_time: 'midday' as DrawTime,
    result: ['', '', '']
  });

  const filteredHistory = useMemo(() => {
    if (!searchTerm) return history;
    return history.filter(item => {
      const resultStr = item.result.join('');
      return resultStr.includes(searchTerm) ||
             item.date.includes(searchTerm) ||
             (item.draw_time === 'midday' ? 'mediodia' : 'noche').includes(searchTerm.toLowerCase());
    });
  }, [history, searchTerm]);

  const visibleHistory = useMemo(() => {
    return filteredHistory.slice(0, displayLimit);
  }, [filteredHistory, displayLimit]);

  const hasMore = displayLimit < filteredHistory.length;

  const loadMore = () => {
    setDisplayLimit(prev => prev + 20);
  };

  const handleSave = async () => {
    try {
      const resArray = formData.result.map(Number);
      if (resArray.some(isNaN) || resArray.length < 3) {
        toast.error("Resultado inválido");
        return;
      }

      await Pick3Storage.saveHistory([{
        date: formData.date,
        draw_time: formData.draw_time,
        result: resArray as [number, number, number],
        sync_method: 'manual'
      }]);

      toast.success("Resultado guardado");
      setShowAddDialog(false);
      setEditingResult(null);
      onRefresh();
    } catch (err) {
      toast.error("Error al guardar");
    }
  };

  const handleDelete = async (item: Pick3Result) => {
    if (!window.confirm("¿Eliminar este registro manual?")) return;
    try {
      await Pick3Storage.deleteHistoryEntry(item.date, item.draw_time);
      toast.success("Registro eliminado");
      onRefresh();
    } catch (err) {
      toast.error("Error al eliminar");
    }
  };

  const openEdit = (item: Pick3Result) => {
    setEditingResult(item);
    setFormData({
      date: item.date,
      draw_time: item.draw_time,
      result: item.result.map(String)
    });
    setShowAddDialog(true);
  };

  const openAddGap = (gap: GapInfo) => {
    setFormData({
      date: gap.date,
      draw_time: gap.drawTime,
      result: ['', '', '']
    });
    setShowAddDialog(true);
  };

  const ResultCard = ({ item }: { item: Pick3Result }) => (
    <Card className="rounded-2xl border-border bg-card/50 shadow-sm overflow-hidden mb-3 group">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-muted-foreground">
            <CalendarIcon className="w-3 h-3" />
            {format(new Date(item.date), 'dd MMM yyyy', { locale: es })}
            {item.sync_method === 'manual' && (
              <Badge variant="secondary" className="bg-orange-500/10 text-orange-500 text-[8px] border-none px-1.5 h-4">MANUAL</Badge>
            )}
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
        <div className="flex items-center gap-4">
          <div className="flex gap-1.5">
            {item.result.map((digit, i) => (
              <div key={i} className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-lg font-black italic text-primary">
                {digit}
              </div>
            ))}
          </div>
          {item.sync_method === 'manual' && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => openEdit(item)}>
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-red-500" onClick={() => handleDelete(item)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* Gaps Alert */}
      {gaps.length > 0 && (
        <Card className="border-orange-500/20 bg-orange-500/[0.03] rounded-2xl overflow-hidden">
          <CardHeader className="py-3 px-4 flex-row items-center justify-between border-b border-orange-500/10">
            <CardTitle className="text-[10px] font-black uppercase text-orange-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Días Faltantes Detectados ({gaps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="flex flex-wrap gap-2 p-2">
              {gaps.slice(0, 8).map((gap, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-orange-500/10 border-orange-500/20 text-orange-600 font-bold uppercase text-[9px] py-1 gap-2"
                  onClick={() => openAddGap(gap)}
                >
                  {format(new Date(gap.date), 'dd/MM')} {gap.drawTime === 'midday' ? 'M' : 'N'}
                  <Plus className="w-3 h-3" />
                </Badge>
              ))}
              {gaps.length > 8 && <span className="text-[9px] font-bold opacity-40 px-2 self-center">+{gaps.length - 8} más...</span>}
            </div>
          </CardContent>
        </Card>
      )}

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
            variant="ghost"
            size="sm"
            className="rounded-full h-8 font-bold text-[10px] uppercase bg-primary/10 text-primary mr-2"
            onClick={() => {
              setEditingResult(null);
              setFormData({ date: format(new Date(), 'yyyy-MM-dd'), draw_time: 'midday', result: ['', '', ''] });
              setShowAddDialog(true);
            }}
          >
            <Plus className="w-3 h-3 mr-1" /> Nuevo
          </Button>
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
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center">Modo</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Resultado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleHistory.map((item, i) => (
                <TableRow key={i} className="border-border/50 group">
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
                  <TableCell className="text-center">
                    {item.sync_method === 'manual' ? (
                      <Badge className="bg-orange-500/10 text-orange-500 text-[8px] border-none">Manual</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[8px] opacity-40 border-none">{item.sync_method || 'Web'}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-3">
                       <span className="font-black italic text-primary">{item.result.join(' ')}</span>
                       {item.sync_method === 'manual' && (
                         <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(item)}>
                                <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleDelete(item)}>
                                <Trash2 className="w-3 h-3" />
                            </Button>
                         </div>
                       )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="rounded-[32px] max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-lg font-black uppercase italic tracking-tighter">
              {editingResult ? 'Editar Resultado' : 'Ingreso Manual'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="pick3-date" className="text-[10px] font-black uppercase opacity-60">Fecha</label>
                <Input
                  id="pick3-date"
                  type="date"
                  className="font-bold"
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pick3-draw-time" className="text-[10px] font-black uppercase opacity-60">Turno</label>
                <select
                  id="pick3-draw-time"
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm font-bold"
                  value={formData.draw_time}
                  onChange={e => setFormData({...formData, draw_time: e.target.value as DrawTime})}
                >
                  <option value="midday">Mediodía</option>
                  <option value="evening">Noche</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
               <span className="text-[10px] font-black uppercase opacity-60 text-center block">Resultado (3 Dígitos)</span>
               <div className="flex justify-center gap-3">
                  {[0, 1, 2].map(i => (
                    <Input
                      key={i}
                      type="number"
                      min="0"
                      max="9"
                      className="w-14 h-14 text-center text-2xl font-black rounded-2xl"
                      value={formData.result[i]}
                      onChange={e => {
                        const newRes = [...formData.result];
                        newRes[i] = e.target.value.slice(-1);
                        setFormData({...formData, result: newRes});
                        // Auto-focus next
                        if (e.target.value && i < 2) {
                           (e.target.nextElementSibling as HTMLInputElement)?.focus();
                        }
                      }}
                    />
                  ))}
               </div>
            </div>

            <Button className="w-full h-12 rounded-full font-black uppercase italic" onClick={handleSave}>
               <CheckCircle2 className="w-4 h-4 mr-2" /> Guardar Resultado
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
}

function CheckCircle2(props: any) {
    return (
      <svg
        {...props}
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    )
  }
