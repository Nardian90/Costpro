'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Wallet, ArrowDownRight, ArrowUpRight, Landmark, CreditCard,
    Plus, Upload, Smartphone, X, Tag, Calendar, BarChart3,
    TrendingUp, TrendingDown, Building2, ChevronRight, Edit2,
    PieChart as PieChartIcon, Search, Trash2, AlertTriangle, Users, Eye,
    Download, FileSpreadsheet, Table as TableIcon, LayoutGrid, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/lib/wallet/types";
import { WalletAnalyticsView } from './WalletAnalyticsView';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const CAT_COLORS: Record<string, string> = {
    'Transferencia': '#3b82f6', 'Telecom': '#f59e0b', 'Electricidad': '#ef4444',
    'Agua': '#06b6d4', 'Gas': '#ec4899', 'Internet': '#8b5cf6',
    'Impuestos': '#dc2626', 'Servicios': '#10b981', 'Otros': '#6b7280',
    'Otros Ingresos': '#22c55e', 'Transferencia Recibida': '#16a34a',
    'Compras': '#f97316', 'Préstamos': '#6366f1',
};
const CAT_ICONS: Record<string, string> = {
    'Transferencia': '💸', 'Telecom': '📱', 'Electricidad': '⚡', 'Agua': '💧',
    'Gas': '🔥', 'Internet': '🌐', 'Impuestos': '🏛️', 'Servicios': '🧾',
    'Otros': '📦', 'Otros Ingresos': '💰', 'Transferencia Recibida': '📥',
    'Compras': '🛒', 'Préstamos': '🏦',
};

type ViewMode = 'home' | 'movimientos' | 'categorias' | 'reportes' | 'analisis';
interface WalletData {
    accounts: any[]; transactions: any[]; summary: any;
    banks: Record<string, any>; categories: Record<string, number>;
    monthly: Record<string, { income: number; expenses: number }>;
    viewer?: { is_admin: boolean; self_id: string; target_id: string; is_own: boolean };
}

export default function WalletView() {
    const [data, setData] = useState<WalletData | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('home');
    const [isImporting, setIsImporting] = useState(false);
    const [importingTrm, setImportingTrm] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterBank, setFilterBank] = useState<string>('all');
    const [editingTxId, setEditingTxId] = useState<string | null>(null);

    // FIX-IMPORT-CLICK (2026-07-06): ref directa al input de archivo para evitar
    // el problema del click cancelado cuando el input está anidado en un div onclick.
    const fileInputRef = useRef<HTMLInputElement>(null);

    // FIX-ADMIN-VIEW (2026-07-06): el admin puede ver la billetera de otros usuarios.
    // Por defecto carga la suya propia (targetUserId = null = self).
    // Si selecciona otro usuario del <select>, targetUserId cambia.
    // Los no-admin NO ven el select y siempre cargan su propia billetera.
    const [currentUser, setCurrentUser] = useState<{ id: string; role: string; roles: string[] } | null>(null);
    const [targetUserId, setTargetUserId] = useState<string | null>(null);
    const [walletUsers, setWalletUsers] = useState<Array<{ user_id: string; full_name: string; email: string; accounts_count: number; transactions_count: number }>>([]);
    const isAdmin = currentUser?.role === 'admin' || (currentUser?.roles || []).includes('admin');

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            // FIX-ADMIN-VIEW: pasar ?userId=X si el admin seleccionó otro usuario
            const url = targetUserId ? `/api/wallet/data?userId=${encodeURIComponent(targetUserId)}` : '/api/wallet/data';
            const res = await fetch(url, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (res.ok) setData(await res.json());
        } catch (e) { console.error('Fetch error', e); }
        finally { setLoading(false); }
    }, [targetUserId]);

    useEffect(() => {
        // Cargar usuario actual desde el store
        (async () => {
            const { useAuthStore } = await import('@/store');
            const u = useAuthStore.getState().user as any;
            if (u) {
                setCurrentUser({ id: u.id, role: u.role || 'user', roles: u.roles || [] });
            }
        })();
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    // FIX-ADMIN-VIEW: si es admin, cargar la lista de usuarios con billetera
    useEffect(() => {
        if (!isAdmin) { setWalletUsers([]); return; }
        (async () => {
            try {
                const { useAuthStore } = await import('@/store');
                const token = useAuthStore.getState().token;
                const res = await fetch('/api/wallet/users', {
                    headers: token ? { Authorization: `Bearer ${token}` } : {},
                });
                if (res.ok) {
                    const json = await res.json();
                    setWalletUsers(json.users || []);
                }
            } catch (e) { console.error('Fetch wallet users error', e); }
        })();
    }, [isAdmin]);

    // FIX-ADMIN-VIEW: cuando el admin cambia de usuario en el select, resetear filtros
    const handleUserChange = (uid: string) => {
        setTargetUserId(uid === 'self' ? null : uid);
        setFilterBank('all');
        setSearchQuery('');
        setViewMode('home');
    };

    // FIX-ADMIN-VIEW: bandera para saber si el admin está viendo otra billetera
    // Si true, se deshabilitan las acciones de escritura (importar, agregar, editar, eliminar, reset)
    const viewingOther = isAdmin && !!targetUserId;

    // FIX-EXCEL (2026-07-06): export/import Excel + vista tabla en Movimientos
    const [movimientosView, setMovimientosView] = useState<'tarjeta' | 'tabla'>('tarjeta');
    const [sortField, setSortField] = useState<'date' | 'amount' | 'bank' | 'service' | null>(null);
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [isExporting, setIsExporting] = useState(false);
    const excelInputRef = useRef<HTMLInputElement>(null);

    const handleExportExcel = async () => {
        setIsExporting(true);
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const url = targetUserId ? `/api/wallet/export?userId=${encodeURIComponent(targetUserId)}` : '/api/wallet/export';
            const res = await fetch(url, {
                headers: token ? { Authorization: `Bearer ${token}` } : {},
            });
            if (!res.ok) throw new Error('Error al exportar');
            const blob = await res.blob();
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `billetera-${new Date().toISOString().slice(0, 10)}.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);
            toast.success('Excel exportado correctamente');
        } catch (e: any) { toast.error('Error al exportar Excel', { description: e.message }); }
        finally { setIsExporting(false); }
    };

    const handleImportExcel = async (file: File) => {
        try {
            const content = await file.arrayBuffer();
            // base64
            const base64 = btoa(String.fromCharCode(...new Uint8Array(content)));
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/import-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ content: base64 }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error'); }
            const result = await res.json();
            toast.success(`Excel importado: ${result.transactions} transacciones`);
            fetchData();
        } catch (e: any) { toast.error('Error al importar Excel', { description: e.message }); }
    };

    const toggleSort = (field: 'date' | 'amount' | 'bank' | 'service') => {
        if (sortField === field) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDir('desc');
        }
    };

    const handleTrmFile = async (file: File) => {
        // FIX-ADMIN-VIEW: si el admin está viendo otra billetera, no puede importar .trm
        // (la importación siempre es para el propio usuario, no para otros)
        if (isAdmin && targetUserId) {
            toast.error('No puedes importar .trm a la billetera de otro usuario', {
                description: 'Vuelve a tu propia billetera para importar'
            });
            return;
        }
        setImportingTrm(true);
        try {
            const content = await file.text();
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/import-trm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ content }),
            });
            if (!res.ok) { const err = await res.json(); throw new Error(err.error || 'Error'); }
            const result = await res.json();
            toast.success(`Importado: ${result.transactions} transacciones, ${result.accounts} cuentas`);
            setIsImporting(false);
            fetchData();
        } catch (e: any) { toast.error('Error al importar .trm', { description: e.message }); }
        finally { setImportingTrm(false); }
    };

    const handleSetCategory = async (txId: string, category: string) => {
        if (viewingOther) { toast.error('No puedes modificar la billetera de otro usuario'); return; }
        setEditingTxId(null);
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/transaction', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({ id: txId, category }),
            });
            if (!res.ok) throw new Error('Error');
            toast.success(`Clasificado: ${category}`);
            fetchData();
        } catch { toast.error('Error al clasificar'); }
    };

    // FIX-PHASE4 (2026-07-06): Agregar transacción manual
    // FIX-HYDRATION (2026-07-06): No usar new Date() en useState initializer — causa
    // hydration mismatch porque server y client pueden calcular fechas distintas si
    // la petición cruza medianoche UTC. Usar string vacío y llenarlo en useEffect.
    const [showAddModal, setShowAddModal] = useState(false);
    const [addType, setAddType] = useState<'CR' | 'DB'>('DB');
    const [addForm, setAddForm] = useState({ amount: '', category: 'Otros', note: '', bank: 'BANDEC', date: '' });
    const [mounted, setMounted] = useState(false);
    useEffect(() => {
        setMounted(true);
        setAddForm(f => ({ ...f, date: new Date().toISOString().split('T')[0] }));
    }, []);

    // FIX-CONFIRM-DIALOG (2026-07-06): Diálogo custom en lugar de window.confirm()
    // window.confirm() abre una ventana nativa del navegador que rompe la UX.
    const [confirmDialog, setConfirmDialog] = useState<{
        open: boolean;
        title: string;
        message: string;
        confirmLabel: string;
        variant: 'danger' | 'default';
        onConfirm: () => void;
    }>({ open: false, title: '', message: '', confirmLabel: '', variant: 'default', onConfirm: () => {} });

    const requestConfirm = (opts: { title: string; message: string; confirmLabel?: string; variant?: 'danger' | 'default'; onConfirm: () => void }) => {
        setConfirmDialog({
            open: true,
            title: opts.title,
            message: opts.message,
            confirmLabel: opts.confirmLabel || 'Confirmar',
            variant: opts.variant || 'default',
            onConfirm: opts.onConfirm,
        });
    };

    const closeConfirm = () => setConfirmDialog(d => ({ ...d, open: false }));

    const handleAddTransaction = async () => {
        if (viewingOther) { toast.error('No puedes modificar la billetera de otro usuario'); return; }
        if (!addForm.amount || parseFloat(addForm.amount) <= 0) { toast.error('Monto inválido'); return; }
        try {
            const { useAuthStore } = await import('@/store');
            const token = useAuthStore.getState().token;
            const res = await fetch('/api/wallet/transaction', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
                body: JSON.stringify({
                    date: addForm.date,
                    bank: addForm.bank,
                    operation: addType,
                    amount: parseFloat(addForm.amount),
                    currency: 'CUP',
                    service: addType === 'CR' ? 'Ingreso manual' : 'Gasto manual',
                    category: addForm.category,
                    note: addForm.note,
                }),
            });
            if (!res.ok) throw new Error('Error');
            toast.success(addType === 'CR' ? 'Ingreso agregado' : 'Gasto agregado');
            setShowAddModal(false);
            setAddForm({ amount: '', category: 'Otros', note: '', bank: 'BANDEC', date: new Date().toISOString().split('T')[0] });
            fetchData();
        } catch { toast.error('Error al agregar'); }
    };

    // FIX-PHASE5 (2026-07-06): Eliminar transacción
    const handleDeleteTransaction = (txId: string) => {
        if (viewingOther) { toast.error('No puedes modificar la billetera de otro usuario'); return; }
        requestConfirm({
            title: 'Eliminar transacción',
            message: '¿Seguro que quieres eliminar esta transacción? Esta acción no se puede deshacer.',
            confirmLabel: 'Eliminar',
            variant: 'danger',
            onConfirm: async () => {
                closeConfirm();
                try {
                    const { useAuthStore } = await import('@/store');
                    const token = useAuthStore.getState().token;
                    const res = await fetch(`/api/wallet/transaction?id=${txId}`, {
                        method: 'DELETE',
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!res.ok) throw new Error('Error');
                    toast.success('Transacción eliminada');
                    fetchData();
                } catch { toast.error('Error al eliminar'); }
            },
        });
    };

    // FIX-PHASE6 (2026-07-06): Reiniciar/limpiar BD — ahora con diálogo custom
    const [isResetting, setIsResetting] = useState(false);
    const handleReset = () => {
        if (viewingOther) { toast.error('No puedes reiniciar la billetera de otro usuario'); return; }
        requestConfirm({
            title: 'Reiniciar billetera',
            message: 'Se borrarán TODAS las transacciones y cuentas. Esta acción no se puede deshacer. ¿Continuar?',
            confirmLabel: 'Borrar todo',
            variant: 'danger',
            onConfirm: async () => {
                closeConfirm();
                setIsResetting(true);
                try {
                    const { useAuthStore } = await import('@/store');
                    const token = useAuthStore.getState().token;
                    const res = await fetch('/api/wallet/reset', {
                        method: 'DELETE',
                        headers: token ? { Authorization: `Bearer ${token}` } : {},
                    });
                    if (!res.ok) throw new Error('Error');
                    toast.success('Datos eliminados. Importa un .trm para comenzar de nuevo.');
                    setData(null);
                } catch { toast.error('Error al reiniciar'); }
                finally { setIsResetting(false); }
            },
        });
    };

    const fmt = (v: number) => new Intl.NumberFormat('es-CU', { style: 'currency', currency: 'CUP', maximumFractionDigits: 2 }).format(v || 0);
    const fmtShort = (v: number) => Math.abs(v) >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : Math.abs(v) >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${(v||0).toFixed(0)}`;

    const bankEntries = data ? Object.entries(data.banks).sort(([a],[b]) => a.localeCompare(b)) : [];
    const bankNames = bankEntries.map(([n]) => n);

    // Categorías para el donut chart (solo gastos)
    const expenseCats = useMemo(() => {
        if (!data) return [];
        return Object.entries(data.categories)
            .filter(([name]) => !name.includes('Ingreso') && !name.includes('Recibida'))
            .map(([name, total]) => ({ name, total, color: CAT_COLORS[name] || '#6b7280', icon: CAT_ICONS[name] || '📦' }))
            .sort((a, b) => b.total - a.total);
    }, [data]);

    const totalExpenses = expenseCats.reduce((s, c) => s + c.total, 0);

    const filteredTx = useMemo(() => {
        if (!data) return [];
        let txs = [...data.transactions];
        if (filterBank !== 'all') txs = txs.filter((t: any) => t.bank === filterBank);
        if (searchQuery) { const q = searchQuery.toLowerCase(); txs = txs.filter((t: any) => (t.service||'').toLowerCase().includes(q) || (t.category||'').toLowerCase().includes(q) || (t.bank||'').toLowerCase().includes(q)); }
        // FIX-EXCEL: ordenamiento por campo seleccionado
        if (sortField) {
            txs.sort((a: any, b: any) => {
                let av: any, bv: any;
                if (sortField === 'amount') { av = parseFloat(a.amount) || 0; bv = parseFloat(b.amount) || 0; }
                else if (sortField === 'date') { av = a.date || ''; bv = b.date || ''; }
                else { av = String(a[sortField] || '').toLowerCase(); bv = String(b[sortField] || '').toLowerCase(); }
                if (av < bv) return sortDir === 'asc' ? -1 : 1;
                if (av > bv) return sortDir === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default: fecha desc
            txs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''));
        }
        return txs;
    }, [data, filterBank, searchQuery, sortField, sortDir]);



    // SVG Donut chart
    const donutSegments = expenseCats.slice(0, 8);
    let cumulativePct = 0;
    const donutPaths = donutSegments.map(cat => {
        const pct = totalExpenses > 0 ? (cat.total / totalExpenses) * 100 : 0;
        const startAngle = (cumulativePct / 100) * 360 - 90;
        const endAngle = ((cumulativePct + pct) / 100) * 360 - 90;
        cumulativePct += pct;
        const r1 = 60, r2 = 90, cx = 100, cy = 100;
        const x1 = cx + r1 * Math.cos(startAngle * Math.PI / 180);
        const y1 = cy + r1 * Math.sin(startAngle * Math.PI / 180);
        const x2 = cx + r2 * Math.cos(startAngle * Math.PI / 180);
        const y2 = cy + r2 * Math.sin(startAngle * Math.PI / 180);
        const x3 = cx + r2 * Math.cos(endAngle * Math.PI / 180);
        const y3 = cy + r2 * Math.sin(endAngle * Math.PI / 180);
        const x4 = cx + r1 * Math.cos(endAngle * Math.PI / 180);
        const y4 = cy + r1 * Math.sin(endAngle * Math.PI / 180);
        const largeArc = pct > 50 ? 1 : 0;
        return { path: `M${x1},${y1} L${x2},${y2} A${r2},${r2} 0 ${largeArc} 1 ${x3},${y3} L${x4},${y4} A${r1},${r1} 0 ${largeArc} 0 ${x1},${y1} Z`, color: cat.color, name: cat.name, pct };
    });

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="shrink-0 border-b border-border/20 bg-background/95 backdrop-blur-sm">
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                    <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center"><Wallet className="w-4.5 h-4.5 text-primary-foreground" /></div>
                        <div><h1 className="text-sm font-black leading-none">Billetera</h1><p className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider mt-0.5">Finanzas</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* FIX-EXCEL: botones export/import Excel */}
                        {data && data.transactions.length > 0 && (
                            <Button
                                onClick={handleExportExcel}
                                disabled={isExporting}
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-[10px] font-black uppercase shrink-0 gap-1"
                                title="Exportar a Excel"
                            >
                                {isExporting ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                                Excel
                            </Button>
                        )}
                        {!viewingOther && (
                            <Button
                                onClick={() => excelInputRef.current?.click()}
                                size="sm"
                                variant="outline"
                                className="h-8 px-3 text-[10px] font-black uppercase shrink-0 gap-1"
                                title="Importar desde Excel"
                            >
                                <FileSpreadsheet className="w-3.5 h-3.5" />
                                Imp
                            </Button>
                        )}
                        {/* FIX-ADMIN-VIEW: botón importar deshabilitado si el admin está viendo otra billetera */}
                        <Button
                            onClick={() => setIsImporting(true)}
                            disabled={viewingOther}
                            size="sm"
                            className="h-8 px-3 text-[10px] font-black uppercase shrink-0"
                            title={viewingOther ? 'Vuelve a tu billetera para importar' : 'Importar .trm'}
                        >
                            <Upload className="w-3.5 h-3.5 mr-1" /> .trm
                        </Button>
                        {data && data.transactions.length > 0 && !viewingOther && (
                            <Button onClick={handleReset} disabled={isResetting} variant="ghost" size="sm" className="h-8 px-3 text-[10px] font-black uppercase text-destructive hover:bg-destructive/10 gap-1" title="Reiniciar billetera">
                                {isResetting ? <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" /> : <><Trash2 className="w-3.5 h-3.5" /> Reiniciar</>}
                            </Button>
                        )}
                    </div>
                </div>

                {/* FIX-ADMIN-VIEW (2026-07-06): select de usuarios solo para admins.
                    Por defecto carga la billetera del propio admin (value="self").
                    Si selecciona otro usuario, se carga su billetera en modo lectura.
                    Los no-admin NO ven este control. */}
                {isAdmin && walletUsers.length > 0 && (
                    <div className="flex items-center gap-2 px-4 pb-2">
                        <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-muted-foreground shrink-0">
                            <Users className="w-3.5 h-3.5" />
                            <span>Viendo:</span>
                        </div>
                        <select
                            value={targetUserId || 'self'}
                            onChange={e => handleUserChange(e.target.value)}
                            className="flex-1 h-8 px-2 bg-muted/20 border border-border/30 rounded-lg text-xs font-bold"
                        >
                            <option value="self">Mi billetera ({currentUser?.id?.slice(0, 8)}...)</option>
                            {walletUsers
                                .filter(u => u.user_id !== currentUser?.id)
                                .map(u => (
                                    <option key={u.user_id} value={u.user_id}>
                                        {u.full_name} — {u.email} ({u.transactions_count} tx)
                                    </option>
                                ))}
                        </select>
                    </div>
                )}

                {/* Banner modo lectura cuando admin ve otra billetera */}
                {viewingOther && (
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-500/10 border-y border-amber-500/30 text-amber-600 dark:text-amber-400">
                        <Eye className="w-3.5 h-3.5 shrink-0" />
                        <p className="text-[10px] font-bold uppercase">
                            Modo lectura — viendo billetera de otro usuario. Las acciones de escritura están deshabilitadas.
                        </p>
                    </div>
                )}

                <div className="flex items-center gap-0.5 px-2 pb-2 overflow-x-auto no-scrollbar">
                    {([{'id':'home','l':'Inicio','i':Wallet},{'id':'movimientos','l':'Movimientos','i':BarChart3},{'id':'categorias','l':'Categorías','i':Tag},{'id':'reportes','l':'Reportes','i':Calendar},{'id':'analisis','l':'Análisis','i':PieChartIcon}] as const).map(t => (
                        <button key={t.id} onClick={() => setViewMode(t.id)} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase whitespace-nowrap shrink-0", viewMode === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50")} aria-current={viewMode === t.id ? 'page' : undefined}>
                            <t.i className="w-3.5 h-3.5" /> {t.l}
                        </button>
                    ))}
                </div>
                {/* Input oculto para import Excel */}
                <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImportExcel(f); e.target.value = ''; }}
                    className="hidden"
                />
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 pb-24 max-w-2xl mx-auto w-full">
                {/* FIX-IMPORT-MODAL (2026-07-06): estados de loading y vacío renderizados
                    inline en lugar de early return, para que el modal de importación
                    y los diálogos puedan abrirse incluso cuando data es null. */}
                {loading && (
                    <div className="flex items-center justify-center h-full py-20">
                        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
                {!loading && !data && (
                    <div className="flex flex-col items-center justify-center h-full py-20 gap-4">
                        <Building2 className="w-12 h-12 text-muted-foreground/30" />
                        <p className="text-sm text-muted-foreground text-center">Sin datos todavía.<br />Importa un respaldo <span className="font-bold">.trm</span> de Transfermóvil para empezar.</p>
                        <Button onClick={() => setIsImporting(true)}><Upload className="w-4 h-4 mr-2" /> Importar .trm</Button>
                    </div>
                )}
                {/* ═══ HOME (estilo Monefy) ═══ */}
                {viewMode === 'home' && data && (
                    <div className="space-y-4">
                        {/* Donut chart central */}
                        <Card className="rounded-3xl border-border/30 p-6 flex flex-col items-center">
                            <svg width="200" height="200" viewBox="0 0 200 200" className="mb-4">
                                {donutPaths.map((seg, i) => <path key={i} d={seg.path} fill={seg.color} className="hover:opacity-80 transition-opacity cursor-pointer" onClick={() => setViewMode('categorias')} />)}
                                {donutPaths.length === 0 && <circle cx="100" cy="100" r="75" fill="none" stroke="hsl(var(--muted))" strokeWidth="2" strokeDasharray="4 4" />}
                            </svg>
                            <div className="text-center -mt-32 mb-4 pointer-events-none">
                                <p className="text-[9px] font-bold uppercase text-muted-foreground">Patrimonio</p>
                                <p className="text-2xl font-black italic text-primary">{fmtShort(data.summary.total_real_balance || 0)}</p>
                            </div>
                            <div className="grid grid-cols-2 gap-3 w-full mt-8">
                                <div className="text-center p-3 rounded-xl bg-emerald-500/5">
                                    <TrendingUp className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                                    <p className="text-[8px] font-bold uppercase text-muted-foreground">Ingresos</p>
                                    <p className="text-sm font-black text-emerald-500">{fmtShort(data.summary.total_income)}</p>
                                </div>
                                <div className="text-center p-3 rounded-xl bg-red-500/5">
                                    <TrendingDown className="w-4 h-4 text-red-500 mx-auto mb-1" />
                                    <p className="text-[8px] font-bold uppercase text-muted-foreground">Gastos</p>
                                    <p className="text-sm font-black text-red-500">{fmtShort(data.summary.total_expenses)}</p>
                                </div>
                            </div>
                        </Card>

                        {/* Cuentas */}
                        <div className="space-y-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">Cuentas</p>
                            {bankEntries.length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin cuentas</p> :
                            bankEntries.map(([bankName, bank]) => (
                                <Card key={bankName} className="rounded-2xl border-border/30 p-4 cursor-pointer hover:shadow-md transition-all" onClick={() => { setFilterBank(bankName); setViewMode('movimientos'); }}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="w-9 h-9 rounded-xl bg-muted/40 flex items-center justify-center"><Landmark className="w-4.5 h-4.5" /></div>
                                            <div><p className="text-sm font-black uppercase">{bankName}</p>{bank.card && <p className="text-[8px] text-muted-foreground font-bold">{bank.card}</p>}</div>
                                        </div>
                                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                    <div className="flex items-end justify-between mt-2">
                                        <p className={cn("text-lg font-black italic", bank.current_balance > 0 ? "text-emerald-500" : "text-red-500")}>{fmt(bank.current_balance)}</p>
                                        <p className="text-[8px] text-muted-foreground">{bank.transaction_count} mov.</p>
                                    </div>
                                </Card>
                            ))}
                        </div>
                    </div>
                )}

                {/* ═══ MOVIMIENTOS ═══ */}
                {viewMode === 'movimientos' && data && (
                    <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="relative flex-1 min-w-[140px]">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                                <input placeholder="Buscar..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-8 h-8 bg-muted/20 border border-border/30 rounded-lg text-xs" aria-label="Buscar transacciones" />
                            </div>
                            <div className="flex items-center gap-0.5 bg-muted/20 p-0.5 rounded-lg">
                                <button onClick={() => setFilterBank('all')} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase", filterBank === 'all' ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>Todos</button>
                                {bankNames.map(b => <button key={b} onClick={() => setFilterBank(b)} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase", filterBank === b ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{b}</button>)}
                            </div>
                            {/* FIX-EXCEL: toggle tarjeta/tabla estilo Excel */}
                            <div className="flex items-center gap-0.5 bg-muted/20 p-0.5 rounded-lg" role="group" aria-label="Vista de movimientos">
                                <button onClick={() => setMovimientosView('tarjeta')} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase flex items-center gap-1", movimientosView === 'tarjeta' ? "bg-primary text-primary-foreground" : "text-muted-foreground")} title="Vista tarjeta" aria-pressed={movimientosView === 'tarjeta'}>
                                    <LayoutGrid className="w-3 h-3" /> Tarjeta
                                </button>
                                <button onClick={() => setMovimientosView('tabla')} className={cn("px-2 py-1 rounded text-[9px] font-bold uppercase flex items-center gap-1", movimientosView === 'tabla' ? "bg-primary text-primary-foreground" : "text-muted-foreground")} title="Vista tabla" aria-pressed={movimientosView === 'tabla'}>
                                    <TableIcon className="w-3 h-3" /> Tabla
                                </button>
                            </div>
                        </div>

                        {/* Vista Tarjeta (original) */}
                        {movimientosView === 'tarjeta' && (
                            <div className="space-y-1.5">
                                {filteredTx.slice(0, 150).map((tx: any) => (
                                    <Card key={tx.id} className="rounded-xl border-border/30 p-3">
                                        <div className="flex items-center gap-2.5">
                                            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", tx.operation === 'CR' ? "bg-emerald-500/10" : "bg-red-500/10")}>
                                                {tx.operation === 'CR' ? <ArrowDownRight className="w-4 h-4 text-emerald-500" /> : <ArrowUpRight className="w-4 h-4 text-red-500" />}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[10px] font-black uppercase truncate">{tx.service}</p>
                                                <p className="text-[8px] text-muted-foreground">{tx.date} · {tx.bank}{tx.card ? ` · ${tx.card}` : ''}</p>
                                            </div>
                                            <p className={cn("text-sm font-black italic shrink-0", tx.operation === 'CR' ? "text-emerald-500" : "text-red-500")}>{tx.operation === 'CR' ? '+' : '-'}{fmtShort(parseFloat(tx.amount))}</p>
                                        </div>
                                        <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-border/10">
                                            {editingTxId === tx.id ? (
                                                <select className="text-[9px] font-bold rounded border border-border bg-background px-1.5 h-6 flex-1 mr-2" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                    <option value="" disabled>...</option>
                                                    {(tx.operation === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                                </select>
                                            ) : (
                                                <Badge variant="outline" className="text-[7px] font-black uppercase cursor-pointer hover:bg-primary/10" onClick={() => setEditingTxId(tx.id)}>{tx.manual_category || tx.category}</Badge>
                                            )}
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-[8px] text-muted-foreground/60">{tx.service_type}</span>
                                                <button
                                                    onClick={() => handleDeleteTransaction(tx.id)}
                                                    className="text-muted-foreground/50 hover:text-destructive transition-colors p-0.5"
                                                    aria-label="Eliminar transacción"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 className="w-3 h-3" />
                                                </button>
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        )}

                        {/* Vista Tabla estilo Excel con filtros y ordenación */}
                        {movimientosView === 'tabla' && (
                            <Card className="rounded-xl border-border/30 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[10px]">
                                        <thead className="bg-muted/30 border-b border-border/30">
                                            <tr>
                                                <th className="text-left p-2 font-black uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => toggleSort('date')}>
                                                    <span className="flex items-center gap-1">Fecha {sortField === 'date' && (sortDir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}</span>
                                                </th>
                                                <th className="text-left p-2 font-black uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => toggleSort('bank')}>
                                                    <span className="flex items-center gap-1">Banco {sortField === 'bank' && (sortDir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}</span>
                                                </th>
                                                <th className="text-left p-2 font-black uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => toggleSort('service')}>
                                                    <span className="flex items-center gap-1">Servicio {sortField === 'service' && (sortDir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}</span>
                                                </th>
                                                <th className="text-center p-2 font-black uppercase">Op</th>
                                                <th className="text-right p-2 font-black uppercase cursor-pointer hover:bg-muted/50 select-none" onClick={() => toggleSort('amount')}>
                                                    <span className="flex items-center gap-1 justify-end">Monto {sortField === 'amount' && (sortDir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />)}</span>
                                                </th>
                                                <th className="text-left p-2 font-black uppercase">Categoría</th>
                                                <th className="text-left p-2 font-black uppercase">Tarjeta</th>
                                                {!viewingOther && <th className="text-center p-2 font-black uppercase">Acción</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTx.slice(0, 300).map((tx: any) => (
                                                <tr key={tx.id} className="border-b border-border/10 hover:bg-muted/20">
                                                    <td className="p-2 whitespace-nowrap">{tx.date}</td>
                                                    <td className="p-2 whitespace-nowrap font-bold">{tx.bank}</td>
                                                    <td className="p-2 max-w-[160px] truncate" title={tx.service}>{tx.service}</td>
                                                    <td className="p-2 text-center">
                                                        <span className={cn("inline-block px-1.5 py-0.5 rounded text-[8px] font-black", tx.operation === 'CR' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500")}>
                                                            {tx.operation === 'CR' ? 'CR' : 'DB'}
                                                        </span>
                                                    </td>
                                                    <td className={cn("p-2 text-right font-black italic tabular-nums", tx.operation === 'CR' ? "text-emerald-500" : "text-red-500")}>
                                                        {tx.operation === 'CR' ? '+' : '-'}{fmt(parseFloat(tx.amount))}
                                                    </td>
                                                    <td className="p-2">
                                                        {editingTxId === tx.id ? (
                                                            <select className="text-[8px] font-bold rounded border border-border bg-background px-1 h-5 w-full" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue="">
                                                                <option value="" disabled>...</option>
                                                                {(tx.operation === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                                            </select>
                                                        ) : (
                                                            <button onClick={() => setEditingTxId(tx.id)} className="text-[8px] font-bold uppercase hover:text-primary">
                                                                {tx.manual_category || tx.category}
                                                            </button>
                                                        )}
                                                    </td>
                                                    <td className="p-2 text-muted-foreground tabular-nums">{tx.card || '—'}</td>
                                                    {!viewingOther && (
                                                        <td className="p-2 text-center">
                                                            <button onClick={() => handleDeleteTransaction(tx.id)} className="text-muted-foreground/50 hover:text-destructive" aria-label={`Eliminar transacción ${tx.service}`}>
                                                                <Trash2 className="w-3 h-3" />
                                                            </button>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                        <tfoot className="bg-muted/30 border-t border-border/30">
                                            <tr className="font-black">
                                                <td colSpan={4} className="p-2 text-right uppercase">Total ({filteredTx.length} txs):</td>
                                                <td className={cn("p-2 text-right italic tabular-nums", filteredTx.reduce((s:number, t:any) => s + (t.operation === 'CR' ? parseFloat(t.amount) : -parseFloat(t.amount)), 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                                                    {fmt(filteredTx.reduce((s:number, t:any) => s + (t.operation === 'CR' ? parseFloat(t.amount) : -parseFloat(t.amount)), 0))}
                                                </td>
                                                <td colSpan={viewingOther ? 2 : 3}></td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                                {filteredTx.length > 300 && (
                                    <p className="text-[9px] text-muted-foreground text-center p-2">Mostrando 300 de {filteredTx.length} transacciones. Usa el buscador para filtrar.</p>
                                )}
                            </Card>
                        )}
                    </div>
                )}

                {/* ═══ CATEGORÍAS ═══ */}
                {viewMode === 'categorias' && data && (
                    <div className="space-y-4">
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-3"><TrendingDown className="w-4 h-4 text-red-500" /> Gastos</h2>
                            <div className="space-y-2">
                                {expenseCats.map(cat => (
                                    <div key={cat.name} className="space-y-0.5">
                                        <div className="flex items-center justify-between text-[10px]">
                                            <span className="font-bold flex items-center gap-1"><span>{cat.icon}</span> {cat.name}</span>
                                            <span className="font-black text-red-500">{fmt(cat.total)} <span className="text-muted-foreground font-normal">({totalExpenses > 0 ? ((cat.total/totalExpenses)*100).toFixed(0) : 0}%)</span></span>
                                        </div>
                                        <div className="h-3 rounded-full bg-muted/30 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${totalExpenses > 0 ? Math.max((cat.total/totalExpenses)*100, 2) : 0}%`, backgroundColor: cat.color }} /></div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2 mb-2"><Edit2 className="w-4 h-4 text-primary" /> Sin Clasificar</h2>
                            <div className="space-y-1.5 max-h-60 overflow-y-auto no-scrollbar">
                                {data.transactions.filter((t: any) => { const c = t.manual_category || t.category; return c === 'Otros' || c === 'Otros Ingresos'; }).slice(0, 30).map((tx: any) => (
                                    <div key={tx.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                                        <div className="flex-1 min-w-0"><p className="text-[9px] font-bold truncate">{tx.service}</p><p className="text-[7px] text-muted-foreground">{tx.date} · {fmt(parseFloat(tx.amount))}</p></div>
                                        {editingTxId === tx.id ? (
                                            <select className="text-[8px] font-bold rounded border border-border bg-background px-1 h-5" onChange={e => handleSetCategory(tx.id, e.target.value)} defaultValue=""><option value="" disabled>...</option>{(tx.operation === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}</select>
                                        ) : <button onClick={() => setEditingTxId(tx.id)} className="text-muted-foreground hover:text-primary shrink-0"><Edit2 className="w-3 h-3" /></button>}
                                    </div>
                                ))}
                                {data.transactions.filter((t: any) => { const c = t.manual_category || t.category; return c === 'Otros' || c === 'Otros Ingresos'; }).length === 0 && <p className="text-[9px] text-muted-foreground text-center py-2">✓ Todo clasificado</p>}
                            </div>
                        </Card>
                    </div>
                )}

                {/* ═══ REPORTES ═══ */}
                {viewMode === 'reportes' && data && (
                    <div className="space-y-4">
                        <Card className="rounded-2xl border-border/30 p-4">
                            <h2 className="text-xs font-black uppercase tracking-widest mb-3">Mensual</h2>
                            {Object.keys(data.monthly).length === 0 ? <p className="text-xs text-muted-foreground text-center py-4">Sin datos</p> :
                            <div className="space-y-3">
                                {Object.entries(data.monthly).sort(([a],[b]) => b.localeCompare(a)).map(([month, m]) => {
                                    const max = Math.max(m.income, m.expenses, 1);
                                    const mi = parseInt(month.split('-')[1]) - 1;
                                    return (
                                        <div key={month}>
                                            <div className="flex justify-between text-[10px] mb-1"><span className="font-bold">{MONTH_NAMES[mi] || month} {month.split('-')[0]}</span><span className={cn("font-black", m.income-m.expenses >= 0 ? "text-emerald-500" : "text-red-500")}>{m.income-m.expenses >= 0 ? '+' : ''}{fmtShort(m.income-m.expenses)}</span></div>
                                            <div className="flex gap-1 h-10 items-end">
                                                <div className="flex-1 flex flex-col items-center"><div className="w-full bg-emerald-500/70 rounded-t" style={{height: `${(m.income/max)*100}%`}} /><span className="text-[6px] font-bold text-emerald-500">{fmtShort(m.income)}</span></div>
                                                <div className="flex-1 flex flex-col items-center"><div className="w-full bg-red-500/70 rounded-t" style={{height: `${(m.expenses/max)*100}%`}} /><span className="text-[6px] font-bold text-red-500">{fmtShort(m.expenses)}</span></div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>}
                        </Card>
                    </div>
                )}

                {/* ═══ ANÁLISIS (tabla dinámica reutilizada de multi-tienda) ═══ */}
                {viewMode === 'analisis' && data && (
                    <WalletAnalyticsView transactions={data.transactions} banks={bankNames} />
                )}
            </div>

            {/* Import Modal */}
            {isImporting && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm" onClick={() => setIsImporting(false)}>
                    <Card className="w-full max-w-lg rounded-3xl border-border/30 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-3">
                            <h2 className="text-sm font-black uppercase">Importar archivo</h2>
                            <button onClick={() => setIsImporting(false)} className="text-muted-foreground hover:text-foreground" aria-label="Cerrar"><X className="w-4 h-4" /></button>
                        </div>
                        {/* FIX-IMPORT-CLICK: input fuera del div clickable */}
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".trm,.xlsx,.xls"
                            onChange={e => {
                                const f = e.target.files?.[0];
                                if (!f) { e.target.value = ''; return; }
                                if (f.name.endsWith('.trm')) handleTrmFile(f);
                                else if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) handleImportExcel(f);
                                else toast.error('Formato no soportado. Usa .trm o .xlsx');
                                e.target.value = '';
                            }}
                            className="hidden"
                        />
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={e => {
                                e.preventDefault();
                                setIsDragging(false);
                                const f = e.dataTransfer.files?.[0];
                                if (!f) return;
                                if (f.name.endsWith('.trm')) handleTrmFile(f);
                                else if (f.name.endsWith('.xlsx') || f.name.endsWith('.xls')) handleImportExcel(f);
                                else toast.error('Formato no soportado. Usa .trm o .xlsx');
                            }}
                            className={cn(
                                "border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer",
                                isDragging ? "border-primary bg-primary/10" : "border-border/40 hover:border-primary/40"
                            )}
                            onClick={() => fileInputRef.current?.click()}
                            role="button"
                            tabIndex={0}
                            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                        >
                            {importingTrm ? (
                                <div className="space-y-2">
                                    <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                                    <p className="text-xs font-bold uppercase text-muted-foreground">Procesando...</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Smartphone className="w-8 h-8 mx-auto text-muted-foreground/50" />
                                    <p className="text-xs font-bold uppercase">Arrastra tu archivo aquí</p>
                                    <p className="text-[10px] text-muted-foreground">Formatos soportados: <span className="font-bold">.trm</span> (Transfermóvil) o <span className="font-bold">.xlsx</span> (Excel)</p>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* FIX-PHASE4: Botones flotantes + y - estilo Monefy Pro
                FIX-EMPTY-STATE: solo mostrar cuando hay data, para que no se solapen
                con el botón "Importar .trm" del estado vacío.
                FIX-ADMIN-VIEW: ocultar cuando el admin está viendo otra billetera (modo lectura). */}
            {data && !viewingOther && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
                <button onClick={() => { setAddType('DB'); setShowAddModal(true); }}
                    className="w-14 h-14 rounded-full bg-red-500 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label="Agregar gasto">
                    <span className="text-2xl font-black">−</span>
                </button>
                <div className="px-4 py-2 rounded-full bg-card border border-border/30 shadow-lg">
                    <p className="text-[8px] font-bold uppercase text-muted-foreground text-center">Balance</p>
                    <p className={cn("text-sm font-black italic text-center", (data?.summary?.balance || 0) >= 0 ? "text-emerald-500" : "text-red-500")}>
                        {fmtShort(data?.summary?.balance || 0)}
                    </p>
                </div>
                <button onClick={() => { setAddType('CR'); setShowAddModal(true); }}
                    className="w-14 h-14 rounded-full bg-emerald-500 text-white shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
                    aria-label="Agregar ingreso">
                    <span className="text-2xl font-black">+</span>
                </button>
            </div>
            )}

            {/* FIX-PHASE4: Modal agregar transacción */}
            {showAddModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
                    <Card className="w-full max-w-sm rounded-3xl border-border/30 shadow-2xl p-5" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-sm font-black uppercase">{addType === 'CR' ? '🟢 Nuevo Ingreso' : '🔴 Nuevo Gasto'}</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-3">
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Monto</label>
                                <input type="number" step="0.01" value={addForm.amount} onChange={e => setAddForm({...addForm, amount: e.target.value})}
                                    placeholder="0.00" className="w-full h-10 px-3 bg-muted/20 rounded-xl text-lg font-black text-center border border-border/30" autoFocus />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Categoría</label>
                                <select value={addForm.category} onChange={e => setAddForm({...addForm, category: e.target.value})}
                                    className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs font-bold border border-border/30">
                                    {(addType === 'CR' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Banco</label>
                                <select value={addForm.bank} onChange={e => setAddForm({...addForm, bank: e.target.value})}
                                    className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs font-bold border border-border/30">
                                    <option value="BANDEC">BANDEC</option><option value="BPA">BPA</option><option value="METRO">METRO</option><option value="MANUAL">Efectivo</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Fecha</label>
                                <input type="date" value={addForm.date} onChange={e => setAddForm({...addForm, date: e.target.value})}
                                    className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs font-bold border border-border/30" />
                            </div>
                            <div>
                                <label className="text-[9px] font-bold uppercase text-muted-foreground">Nota</label>
                                <input type="text" value={addForm.note} onChange={e => setAddForm({...addForm, note: e.target.value})}
                                    placeholder="Descripción opcional..." className="w-full h-10 px-3 bg-muted/20 rounded-xl text-xs border border-border/30" />
                            </div>
                            <Button onClick={handleAddTransaction} className={cn("w-full h-11 rounded-xl font-black uppercase text-xs", addType === 'CR' ? "bg-emerald-500" : "bg-red-500")}>
                                {addType === 'CR' ? 'Agregar Ingreso' : 'Agregar Gasto'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}

            {/* FIX-CONFIRM-DIALOG (2026-07-06): Diálogo de confirmación custom
                en lugar de window.confirm(). Estilizado, accesible y con botones claros. */}
            {confirmDialog.open && (
                <div
                    className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-background/90 backdrop-blur-sm"
                    onClick={closeConfirm}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="confirm-title"
                >
                    <Card
                        className="w-full max-w-sm rounded-3xl border-border/30 shadow-2xl p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex flex-col items-center text-center gap-3">
                            <div className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center",
                                confirmDialog.variant === 'danger' ? "bg-destructive/15" : "bg-primary/15"
                            )}>
                                <AlertTriangle className={cn(
                                    "w-6 h-6",
                                    confirmDialog.variant === 'danger' ? "text-destructive" : "text-primary"
                                )} />
                            </div>
                            <h2 id="confirm-title" className="text-sm font-black uppercase">
                                {confirmDialog.title}
                            </h2>
                            <p className="text-xs text-muted-foreground">
                                {confirmDialog.message}
                            </p>
                            <div className="flex gap-2 w-full mt-2">
                                <Button
                                    variant="outline"
                                    onClick={closeConfirm}
                                    className="flex-1 h-10 rounded-xl text-xs font-black uppercase"
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={() => { confirmDialog.onConfirm(); }}
                                    className={cn(
                                        "flex-1 h-10 rounded-xl text-xs font-black uppercase",
                                        confirmDialog.variant === 'danger'
                                            ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                                            : "bg-primary hover:bg-primary/90"
                                    )}
                                >
                                    {confirmDialog.confirmLabel}
                                </Button>
                            </div>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
}
