"use client";

import React, { useState, useMemo, useSyncExternalStore, useEffect } from 'react';
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
  Search, List, LayoutGrid, Calendar as CalendarIcon, Clock, ChevronDown, Plus, AlertTriangle, Edit2, Trash2, RefreshCw, Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DataIntegrityService, GapInfo } from '@/services/pick3/DataIntegrityService';
import { Pick3Storage } from '@/services/pick3/storage';
import { toast } from 'sonner';

const noopSubscribe = () => () => {};

interface Pick3HistorySectionProps {
  history: Pick3Result[];
  onRefresh: () => void;
}

export function Pick3HistorySection({ history, onRefresh }: Pick3HistorySectionProps) {
  const clientTodayISO = useSyncExternalStore(noopSubscribe, () => format(new Date(), 'yyyy-MM-dd'), () => '');
  const [searchTerm, setSearchTerm] = useState('');
  const [forceRefreshing, setForceRefreshing] = useState(false);

  // FIX-PERSIST+MOBILE (2026-07-04): viewMode default = tabla en desktop, tarjeta en mobile
  // Persistir preferencia del usuario en localStorage
  const [viewMode, setViewMode] = useState<'card' | 'table'>(() => {
    if (typeof window === 'undefined') return 'table';
    const saved = localStorage.getItem('pick3-history-viewmode');
    if (saved === 'card' || saved === 'table') return saved;
    // Default: tabla en desktop, tarjeta en mobile
    return window.innerWidth >= 768 ? 'table' : 'card';
  });

  // Persistir viewMode cuando cambie
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pick3-history-viewmode', viewMode);
    }
  }, [viewMode]);

  // FIX-PERSIST: displayLimit persistido
  // FIX-DISPLAY (2026-07-05): default 100 para mostrar ~50 días (2 sorteos × 50 = 100)
  const [displayLimit, setDisplayLimit] = useState(() => {
    if (typeof window === 'undefined') return 100;
    const saved = parseInt(localStorage.getItem('pick3-display-limit') || '100', 10);
    return isNaN(saved) ? 100 : saved;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('pick3-display-limit', String(displayLimit));
    }
  }, [displayLimit]);

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingResult, setEditingResult] = useState<Pick3Result | null>(null);

  const gaps = useMemo(() => DataIntegrityService.findGaps(history), [history]);

  // Form State
  const [formData, setFormData] = useState({
    date: '',
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

  // FIX-DEBUG (2026-07-05): log para ver qué history recibe el componente
  useEffect(() => {
    if (history.length > 0) {
      console.log('[Pick3HistorySection] history received:', {
        total: history.length,
        firstDate: history[0]?.date,
        firstDrawTime: history[0]?.draw_time,
        lastDate: history[history.length - 1]?.date,
        has_04_07: history.some(h => h.date === '2026-07-04'),
        has_03_07: history.some(h => h.date === '2026-07-03'),
      });
    }
  }, [history]);

  // FIX-COLUMNS (2026-07-05): separar por turno para mostrar en 2 columnas
  // Mediodía y Noche en columnas separadas (modo tarjeta y modo tabla)
  const { middayHistory, eveningHistory } = useMemo(() => {
    const midday = filteredHistory.filter(item => item.draw_time === 'midday');
    const evening = filteredHistory.filter(item => item.draw_time === 'evening');
    return { middayHistory: midday, eveningHistory: evening };
  }, [filteredHistory]);

  // Para el modo tabla de 2 columnas, necesitamos emparejar por fecha
  // Crear un mapa fecha → { midday, evening }
  const pairedByDate = useMemo(() => {
    const map = new Map<string, { date: string; midday?: Pick3Result; evening?: Pick3Result }>();
    for (const item of filteredHistory) {
      if (!map.has(item.date)) {
        map.set(item.date, { date: item.date });
      }
      const entry = map.get(item.date)!;
      if (item.draw_time === 'midday') {
        entry.midday = item;
      } else {
        entry.evening = item;
      }
    }
    // Convertir a array y ordenar por fecha descendente
    return Array.from(map.values()).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredHistory]);

  const visiblePaired = useMemo(() => {
    return pairedByDate.slice(0, Math.ceil(displayLimit / 2));
  }, [pairedByDate, displayLimit]);

  const visibleMidday = useMemo(() => {
    return middayHistory.slice(0, displayLimit);
  }, [middayHistory, displayLimit]);

  const visibleEvening = useMemo(() => {
    return eveningHistory.slice(0, displayLimit);
  }, [eveningHistory, displayLimit]);

  const hasMore = displayLimit < filteredHistory.length;

  const loadMore = () => {
    setDisplayLimit(prev => prev + 20);
  };

  // FIX-FORCE-REFRESH (2026-07-05): botón Actualizar que limpia cache y fuerza fetch fresco
  const handleForceRefresh = async () => {
    setForceRefreshing(true);
    try {
      // Limpiar localStorage ANTES de hacer el fetch
      if (typeof window !== 'undefined') {
        localStorage.removeItem('pick3-display-limit');
        localStorage.removeItem('pick3_draw_history');
      }
      // Resetear displayLimit al default alto
      setDisplayLimit(100);
      const result = await Pick3Storage.forceRefreshHistory();
      if (result.records.length > 0) {
        toast.success(`Datos actualizados: ${result.records.length} registros. Último sorteo: ${result.latestDate}`);
        onRefresh(); // Trigger fetchData en el parent para refrescar toda la UI
      } else {
        toast.error("No se pudieron cargar datos. Verifica tu sesión.");
      }
    } catch (err) {
      toast.error("Error al actualizar: " + (err instanceof Error ? err.message : 'desconocido'));
    } finally {
      setForceRefreshing(false);
    }
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
    <Card className="rounded-2xl border-border bg-card/50 shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
      <CardContent className="p-3 flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-muted-foreground">
            <CalendarIcon className="w-2.5 h-2.5" />
            {format(new Date(item.date), 'dd MMM', { locale: es })}
            {item.sync_method === 'manual' && (
              <Badge variant="secondary" className="bg-warning/10 text-warning text-[7px] border-none px-1 h-3.5">MANUAL</Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Badge variant="outline" className={cn(
              "text-[7px] font-black uppercase px-1 py-0 rounded-full",
              item.draw_time === 'midday' ? "border-warning/30 text-warning" : "border-primary/30 text-primary"
            )}>
              <Clock className="w-2 h-2 mr-0.5" />
              {item.draw_time === 'midday' ? 'M' : 'N'}
            </Badge>
            {item.fireball != null && item.fireball !== 0 && (
              <Badge variant="outline" className={cn(
                "text-[7px] font-black uppercase px-1 py-0",
                item.draw_time === 'midday' ? "border-warning/30 text-warning" : "border-primary/30 text-primary"
              )}>
                FB {item.fireball}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {item.result.map((digit, i) => (
              <div key={i} className={cn(
                "w-8 h-8 rounded-full border flex items-center justify-center text-base font-black italic",
                item.draw_time === 'midday'
                  ? "bg-warning/10 border-warning/20 text-warning"
                  : "bg-primary/10 border-primary/20 text-primary"
              )}>
                {digit}
              </div>
            ))}
          </div>
          {item.sync_method === 'manual' && (
            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => openEdit(item)}>
                <Edit2 className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full text-destructive" onClick={() => handleDelete(item)}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4">
      {/* FIX-INDICATOR (2026-07-05): indicador visible de última fecha y total */}
      <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/30 border border-border/30 text-[10px] font-bold uppercase flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <CalendarIcon className="w-3 h-3 text-primary" />
          <span className="opacity-60">Última:</span>
          <span className="text-primary font-black">
            {history[0]?.date ? format(new Date(history[0].date), 'dd/MM/yyyy', { locale: es }) : '—'}
          </span>
          <span className="opacity-40">·</span>
          <span className="opacity-60">Total BD:</span>
          <span className="font-black">{history.length}</span>
          <span className="opacity-40">·</span>
          <span className="opacity-60">displayLimit:</span>
          <span className="font-black text-amber-500">{displayLimit}</span>
          <span className="opacity-40">·</span>
          <span className="opacity-60">Midday:</span>
          <span className="font-black text-warning">{visibleMidday.length}</span>
          <span className="opacity-40">·</span>
          <span className="opacity-60">Noche:</span>
          <span className="font-black text-primary">{visibleEvening.length}</span>
        </div>
        <div className="flex items-center gap-1">
          {history.some(h => h.date === '2026-07-04') ? (
            <Badge className="bg-emerald-500/20 text-emerald-600 border-emerald-500/30 text-[8px]">
              ✓ 04/07 en BD
            </Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-600 border-amber-500/30 text-[8px]">
              ⚠ 04/07 no en BD
            </Badge>
          )}
        </div>
      </div>

      {/* FIX-DEBUG (2026-07-05): mostrar primeros 3 registros de cada columna inline */}
      {visibleMidday.length > 0 && (
        <div className="text-[9px] font-mono opacity-50 px-3 py-1 bg-muted/20 rounded">
          DEBUG Midday[0-2]: {visibleMidday.slice(0, 3).map(r => `${r.date}=${r.result.join('')}`).join(' | ')}
        </div>
      )}
      {visibleEvening.length > 0 && (
        <div className="text-[9px] font-mono opacity-50 px-3 py-1 bg-muted/20 rounded">
          DEBUG Noche[0-2]: {visibleEvening.slice(0, 3).map(r => `${r.date}=${r.result.join('')}`).join(' | ')}
        </div>
      )}

      {/* Gaps Alert */}
      {gaps.length > 0 && (
        <Card className="border-warning/20 bg-warning/[0.03] rounded-2xl overflow-hidden">
          <CardHeader className="py-3 px-4 flex-row items-center justify-between border-b border-warning/10">
            <CardTitle className="text-[10px] font-black uppercase text-warning flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" /> Días Faltantes Detectados ({gaps.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            <div className="flex flex-wrap gap-2 p-2">
              {gaps.slice(0, 8).map((gap, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="cursor-pointer hover:bg-warning/10 border-warning/20 text-warning font-bold uppercase text-[9px] py-1 gap-2"
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
            disabled={forceRefreshing}
            className="rounded-full h-8 font-bold text-[10px] uppercase bg-emerald-500/10 text-emerald-600 mr-2 disabled:opacity-50"
            onClick={handleForceRefresh}
            title="Limpiar cache y forzar recarga desde Supabase"
          >
            {forceRefreshing ? (
              <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Actualizando...</>
            ) : (
              <><RefreshCw className="w-3 h-3 mr-1" /> Actualizar</>
            )}
          </Button>
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
        // FIX-COLUMNS (2026-07-05): 2 columnas — Mediodía | Noche
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Columna Mediodía */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2 py-1 sticky top-12 z-10 bg-background/80 backdrop-blur-md">
              <Clock className="w-3.5 h-3.5 text-warning" />
              <span className="text-[10px] font-black uppercase tracking-widest text-warning">Mediodía</span>
              <Badge variant="outline" className="text-[8px] font-black uppercase border-warning/30 text-warning">
                {middayHistory.length}
              </Badge>
            </div>
            {visibleMidday.length === 0 ? (
              <p className="text-[10px] font-bold uppercase opacity-40 text-center py-8">Sin sorteos de mediodía</p>
            ) : (
              visibleMidday.map((item, i) => (
                <ResultCard key={`midday-${i}`} item={item} />
              ))
            )}
          </div>

          {/* Columna Noche */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-2 py-1 sticky top-12 z-10 bg-background/80 backdrop-blur-md">
              <Clock className="w-3.5 h-3.5 text-primary" />
              <span className="text-[10px] font-black uppercase tracking-widest text-primary">Noche</span>
              <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/30 text-primary">
                {eveningHistory.length}
              </Badge>
            </div>
            {visibleEvening.length === 0 ? (
              <p className="text-[10px] font-bold uppercase opacity-40 text-center py-8">Sin sorteos de noche</p>
            ) : (
              visibleEvening.map((item, i) => (
                <ResultCard key={`evening-${i}`} item={item} />
              ))
            )}
          </div>
        </div>
      ) : (
        // FIX-COLUMNS (2026-07-05): tabla con 2 columnas (Mediodía | Noche) emparejadas por fecha
        <Card className="rounded-[24px] border-border bg-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border/50">
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-muted-foreground w-[120px]">Fecha</TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-warning border-l border-warning/20">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Mediodía
                  </div>
                </TableHead>
                <TableHead className="text-[10px] font-black uppercase tracking-widest text-primary border-l border-primary/20">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" /> Noche
                  </div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visiblePaired.map((row, i) => (
                <TableRow key={i} className="border-border/50 group">
                  <TableCell className="text-xs font-bold py-3 align-top">
                    <div className="flex flex-col">
                      <span>{format(new Date(row.date), 'dd/MM/yyyy')}</span>
                      <span className="text-[9px] font-bold uppercase opacity-50">
                        {format(new Date(row.date), 'EEE', { locale: es })}
                      </span>
                    </div>
                  </TableCell>
                  {/* Mediodía */}
                  <TableCell className="py-3 align-top border-l border-warning/10">
                    {row.midday ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black italic text-warning text-base tracking-wider">
                            {row.midday.result.join(' ')}
                          </span>
                          {row.midday.fireball != null && row.midday.fireball !== 0 && (
                            <Badge variant="outline" className="text-[8px] font-black uppercase border-warning/30 text-warning px-1 py-0">
                              FB {row.midday.fireball}
                            </Badge>
                          )}
                        </div>
                        {row.midday.sync_method === 'manual' && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(row.midday!)}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(row.midday!)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold opacity-20 uppercase">—</span>
                    )}
                  </TableCell>
                  {/* Noche */}
                  <TableCell className="py-3 align-top border-l border-primary/10">
                    {row.evening ? (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-black italic text-primary text-base tracking-wider">
                            {row.evening.result.join(' ')}
                          </span>
                          {row.evening.fireball != null && row.evening.fireball !== 0 && (
                            <Badge variant="outline" className="text-[8px] font-black uppercase border-primary/30 text-primary px-1 py-0">
                              FB {row.evening.fireball}
                            </Badge>
                          )}
                        </div>
                        {row.evening.sync_method === 'manual' && (
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(row.evening!)}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(row.evening!)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-[10px] font-bold opacity-20 uppercase">—</span>
                    )}
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
                  value={formData.date || clientTodayISO}
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
