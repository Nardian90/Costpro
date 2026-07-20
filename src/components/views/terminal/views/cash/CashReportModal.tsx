'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Download, DollarSign, TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronRight, Eye, Trash2, Save, RotateCcw, Settings, Sparkles, FileText, CheckSquare, Square } from 'lucide-react';
import { cn, formatCurrency } from '@/lib/utils';
import { apiFetch } from '@/lib/api-fetch';
import { useAuthStore, useUIStore } from '@/store';
import { toast } from 'sonner';
import type { CashReport } from '@/types';
import jsPDF from 'jspdf';

interface CashReportModalProps { open: boolean; onClose: () => void; }
interface StoreInfo { name: string; logo_url: string | null; address: string | null; phone: string | null; email: string | null; reeup: string | null; nit: string | null; }
interface SavedBreakdown { id: string; label: string; date: string; breakdown: Record<number, string>; deliveredBy: string; recipientName: string; total: number; }

const ALL_DENOMS = [1000, 500, 200, 100, 50, 20, 10, 5, 1];
const USD_DENOMS = [100, 50, 20, 10, 5, 1];
const SK_DEL = 'costpro_cash_delivered_by';
const SK_REC = 'costpro_cash_recipient';
const SK_DENOMS = 'costpro_cash_denoms_cup';
const SK_HIST = 'costpro_cash_breakdown_history';

function safeParse<T>(raw: string | null, fallback: T): T { if (!raw) return fallback; try { return JSON.parse(raw) as T; } catch { return fallback; } }

type PdfTemplate = 'estandar' | 'simple';
const TEMPLATES: { id: PdfTemplate; label: string; desc: string }[] = [
  { id: 'estandar', label: 'Estándar', desc: 'Cuadre CUP+USD con desglose de billetes' },
  { id: 'simple', label: 'Simple', desc: 'Resumen básico sin desglose' },
];

export function CashReportModal({ open, onClose }: CashReportModalProps) {
  const { user } = useAuthStore();
  const { setCurrentView } = useUIStore();
  const [report, setReport] = useState<CashReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [deliveredBy, setDeliveredBy] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem(SK_DEL) || '');
  const [recipientName, setRecipientName] = useState(() => typeof window === 'undefined' ? '' : localStorage.getItem(SK_REC) || '');
  useEffect(() => { if (deliveredBy) localStorage.setItem(SK_DEL, deliveredBy); }, [deliveredBy]);
  useEffect(() => { if (recipientName) localStorage.setItem(SK_REC, recipientName); }, [recipientName]);

  const [cupBreakdown, setCupBreakdown] = useState<Record<number, string>>({});
  const [usdBreakdown, setUsdBreakdown] = useState<Record<number, string>>({});
  const [cupDenoms, setCupDenoms] = useState<number[]>(() => typeof window === 'undefined' ? ALL_DENOMS : safeParse(localStorage.getItem(SK_DENOMS), ALL_DENOMS));
  const [showConfig, setShowConfig] = useState(false);
  const [savedHistory, setSavedHistory] = useState<SavedBreakdown[]>(() => typeof window === 'undefined' ? [] : safeParse(localStorage.getItem(SK_HIST), []));
  const [showHistory, setShowHistory] = useState(false);

  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const [itemDetails, setItemDetails] = useState<Record<string, any[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<Set<string>>(new Set());

  const [storeInfo, setStoreInfo] = useState<StoreInfo | null>(null);
  const [showSuggested, setShowSuggested] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any | null>(null);

  // Filtros
  const [filterCurrency, setFilterCurrency] = useState<string>('');
  const [filterMethod, setFilterMethod] = useState<string>('');

  // Plantilla PDF
  const [pdfTemplate, setPdfTemplate] = useState<PdfTemplate>('estandar');
  const [showTemplateSelector, setShowTemplateSelector] = useState(false);

  // FIX (2026-07-15): Toggles para incluir detalle por sección en el PDF.
  // Cuando están activos, el PDF incluye páginas anexas con el listado de documentos.
  const [pdfOptions, setPdfOptions] = useState({
    detailSales: false,        // detalle de productos vendidos por método
    detailPayments: false,     // detalle de pagos a proveedores
    detailCommissions: false,  // detalle de comisiones pagadas
    detailProduction: false,   // detalle de órdenes de producción/servicios
    includeBreakdown: true,    // desglose de billetes CUP
    includeUsd: true,          // cuadre USD si hay
    includeSignature: true,    // líneas de firma
  });
  const togglePdfOption = (key: keyof typeof pdfOptions) =>
    setPdfOptions(prev => ({ ...prev, [key]: !prev[key] }));

  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEscape);
    modalRef.current?.focus();
    return () => document.removeEventListener('keydown', handleEscape);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !user?.activeStoreId) return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const data = await apiFetch(`/api/stores?status=all`);
        const stores = data?.data || data || [];
        const store = Array.isArray(stores) ? stores.find((s: any) => s.id === user.activeStoreId) : null;
        if (store && !ctrl.signal.aborted) {
          setStoreInfo({ name: store.name || 'Tienda', logo_url: store.logo_url || null, address: store.address || null, phone: store.phone || null, email: store.email || null, reeup: store.reeup || null, nit: store.nit || null });
        }
      } catch {}
    })();
    return () => ctrl.abort();
  }, [open, user?.activeStoreId]);

  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    (async () => {
      setLoading(true);
      try {
        const s = new Date(startDate + 'T00:00:00').toISOString();
        const e = new Date(endDate + 'T23:59:59').toISOString();
        const data = await apiFetch(`/api/cash-report?start_date=${encodeURIComponent(s)}&end_date=${encodeURIComponent(e)}`);
        if (!ctrl.signal.aborted) setReport(data);
      } catch (e: any) { if (!ctrl.signal.aborted) toast.error(e.message || 'Error'); }
      finally { if (!ctrl.signal.aborted) setLoading(false); }
    })();
    return () => ctrl.abort();
  }, [open, startDate, endDate]);

  // FIX: limpiar cache del accordion cuando cambian las fechas
  useEffect(() => {
    setExpandedItems(new Set());
    setItemDetails({});
    setLoadingDetails(new Set());
  }, [startDate, endDate]);

  const cupTotal = Object.entries(cupBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const usdTotal = Object.entries(usdBreakdown).reduce((s, [d, c]) => s + Number(d) * (Number(c) || 0), 0);
  const expectedCup = report?.cash_balance_cup ?? report?.totals?.balance_cup ?? 0;
  const cupDifference = cupTotal - expectedCup;

  const handleSuggest = () => {
    if (expectedCup <= 0) {
      // Cuando el balance es negativo o cero, no hay efectivo para desglosar.
      // Mostrar mensaje informativo al usuario.
      toast.info(`No hay efectivo para desglosar. El balance CUP es ${formatCurrency(expectedCup)}.`, {
        description: expectedCup < 0
          ? 'Las salidas superan a los ingresos en efectivo.'
          : 'Los ingresos en efectivo igualan exactamente a las salidas.',
        duration: 5000,
      });
      setCupBreakdown({});
      return;
    }
    const s: Record<number, string> = {};
    let r = Math.max(0, expectedCup);
    for (const d of cupDenoms) {
      const c = Math.floor(r / d);
      if (c > 0) { s[d] = String(c); r -= c * d; }
    }
    setCupBreakdown(s);
    toast.success(`Desglose sugerido aplicado: ${formatCurrency(expectedCup)}`);
  };
  const handleClear = () => { setCupBreakdown({}); setUsdBreakdown({}); };
  const handleSave = () => { const e: SavedBreakdown = { id: Date.now().toString(), label: `${new Date().toLocaleDateString('es-CU')} ${deliveredBy || ''}`, date: new Date().toISOString(), breakdown: cupBreakdown, deliveredBy, recipientName, total: cupTotal }; const u = [e, ...savedHistory].slice(0, 10); setSavedHistory(u); localStorage.setItem(SK_HIST, JSON.stringify(u)); toast.success(`Guardado (${u.length}/10)`); };
  const handleRestore = (e: SavedBreakdown) => { setCupBreakdown(e.breakdown); setDeliveredBy(e.deliveredBy); setRecipientName(e.recipientName); setShowHistory(false); toast.success('Restaurado'); };
  const toggleDenom = (d: number) => { const u = cupDenoms.includes(d) ? cupDenoms.filter(x => x !== d) : [...cupDenoms, d].sort((a, b) => b - a); setCupDenoms(u); localStorage.setItem(SK_DENOMS, JSON.stringify(u)); };

  const toggleAccordion = async (key: string, type: 'sale' | 'payment', method: string, currency: string, refType?: string) => {
    const n = new Set(expandedItems);
    if (n.has(key)) { n.delete(key); setExpandedItems(n); return; }
    n.add(key); setExpandedItems(n);
    if (!itemDetails[key]) {
      const nl = new Set(loadingDetails); nl.add(key); setLoadingDetails(nl);
      try {
        const s = new Date(startDate + 'T00:00:00').toISOString();
        const e = new Date(endDate + 'T23:59:59').toISOString();
        let url = `/api/cash-report/details?type=${type}&method=${method}&currency=${currency}&start_date=${s}&end_date=${e}`;
        if (refType) url += `&ref_type=${refType}`;
        const data = await apiFetch(url);
        setItemDetails(prev => ({ ...prev, [key]: Array.isArray(data) ? data : (data?.data || []) }));
      } catch { setItemDetails(prev => ({ ...prev, [key]: [] })); toast.error('Error al cargar documentos'); }
      finally { const nl2 = new Set(loadingDetails); nl2.delete(key); setLoadingDetails(nl2); }
    }
  };

  // ===== PDF PLANTILLA ESTÁNDAR (refactor 2026-07-20) =====
  // Estructura profesional tipo flujo de caja:
  //   P1: Header tienda + periodo + RESUMEN EJECUTIVO (dinero a entregar)
  //   P2: TABLA DE PRODUCTOS VENDIDOS (qty, precio, CUP, transfer, zelle, comisión)
  //   P3: COMISIONES A TRABAJADORES (por trabajador, periodos, método)
  //   P4: ÓRDENES DE PRODUCCIÓN/SERVICIO (anticipos + liquidaciones)
  //   P5: SALIDAS DE DINERO (pagos a proveedores, recepciones, servicios)
  //   P6: DESGLOSE DE BILLETES + FIRMAS
  const handleExportPDF = async () => {
    if (!report) return;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const m = 12; let y = 18;
    const sn = storeInfo?.name || 'Tienda';
    const es = (need: number) => { if (y + need > ph - m) { doc.addPage(); y = m; } };
    const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;

    // Colores corporativos
    const C_PRIMARY: [number, number, number] = [22, 163, 74];     // green-600
    const C_DARK: [number, number, number] = [17, 24, 39];         // gray-900
    const C_MUTED: [number, number, number] = [107, 114, 128];     // gray-500
    const C_LIGHT: [number, number, number] = [243, 244, 246];     // gray-100
    const C_BORDER: [number, number, number] = [229, 231, 235];    // gray-200
    const C_SUCCESS: [number, number, number] = [22, 163, 74];
    const C_DANGER: [number, number, number] = [220, 38, 38];
    const C_WARN: [number, number, number] = [217, 119, 6];

    // Helpers
    const setFill = (c: [number, number, number]) => { doc.setFillColor(c[0], c[1], c[2]); };
    const setText = (c: [number, number, number]) => { doc.setTextColor(c[0], c[1], c[2]); };
    const setDraw = (c: [number, number, number]) => { doc.setDrawColor(c[0], c[1], c[2]); };

    // Línea horizontal con color
    const hr = (color: [number, number, number] = C_BORDER, w: number = 0.3) => {
      setDraw(color); doc.setLineWidth(w); doc.line(m, y, pw - m, y); y += 3;
    };

    // Sección título con fondo
    const sectionTitle = (title: string, subtitle?: string) => {
      es(12);
      setFill(C_DARK);
      doc.rect(m, y - 1, pw - 2 * m, 7, 'F');
      setText([255, 255, 255]);
      doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text(title, m + 2, y + 4);
      if (subtitle) {
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.text(subtitle, pw - m - 2, y + 4, { align: 'right' });
      }
      y += 8;
      setText(C_DARK);
    };

    // Tabla genérica con headers y filas
    const renderTable = (
      headers: string[],
      rows: (string | number)[][],
      colWidths: number[],
      options: { align?: ('left' | 'right' | 'center')[]; totalsRow?: (string | number)[] } = {}
    ) => {
      const rowH = 6;
      const headerH = 7;
      const tableW = colWidths.reduce((s, w) => s + w, 0);
      const startX = m;

      // Verificar espacio, si no cabe añadir página
      if (y + headerH + rows.length * rowH > ph - m - 10) {
        doc.addPage(); y = m;
      }

      // Header
      setFill(C_DARK);
      doc.rect(startX, y, tableW, headerH, 'F');
      setText([255, 255, 255]);
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
      let cx = startX;
      headers.forEach((h, i) => {
        const align = options.align?.[i] || 'left';
        if (align === 'right') doc.text(h, cx + colWidths[i] - 1, y + 5, { align: 'right' });
        else if (align === 'center') doc.text(h, cx + colWidths[i] / 2, y + 5, { align: 'center' });
        else doc.text(h, cx + 1, y + 5);
        cx += colWidths[i];
      });
      y += headerH;

      // Filas
      doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
      rows.forEach((row, ri) => {
        if (y + rowH > ph - m - 5) {
          doc.addPage(); y = m;
          // Repetir header
          setFill(C_DARK);
          doc.rect(startX, y, tableW, headerH, 'F');
          setText([255, 255, 255]);
          doc.setFontSize(7.5); doc.setFont('helvetica', 'bold');
          cx = startX;
          headers.forEach((h, i) => {
            const align = options.align?.[i] || 'left';
            if (align === 'right') doc.text(h, cx + colWidths[i] - 1, y + 5, { align: 'right' });
            else if (align === 'center') doc.text(h, cx + colWidths[i] / 2, y + 5, { align: 'center' });
            else doc.text(h, cx + 1, y + 5);
            cx += colWidths[i];
          });
          y += headerH;
          doc.setFontSize(7.5); doc.setFont('helvetica', 'normal');
        }
        // Background alternado
        if (ri % 2 === 0) {
          setFill(C_LIGHT);
          doc.rect(startX, y, tableW, rowH, 'F');
        }
        setText(C_DARK);
        cx = startX;
        row.forEach((cell, i) => {
          const align = options.align?.[i] || 'left';
          const txt = String(cell);
          if (align === 'right') doc.text(txt, cx + colWidths[i] - 1, y + 4.5, { align: 'right' });
          else if (align === 'center') doc.text(txt, cx + colWidths[i] / 2, y + 4.5, { align: 'center' });
          else doc.text(txt, cx + 1, y + 4.5);
          cx += colWidths[i];
        });
        y += rowH;
      });

      // Fila de totales
      if (options.totalsRow && options.totalsRow.length === headers.length) {
        setFill(C_PRIMARY);
        doc.rect(startX, y, tableW, rowH + 1, 'F');
        setText([255, 255, 255]);
        doc.setFont('helvetica', 'bold');
        cx = startX;
        options.totalsRow.forEach((cell, i) => {
          const align = options.align?.[i] || 'left';
          const txt = String(cell);
          if (align === 'right') doc.text(txt, cx + colWidths[i] - 1, y + 5, { align: 'right' });
          else if (align === 'center') doc.text(txt, cx + colWidths[i] / 2, y + 5, { align: 'center' });
          else doc.text(txt, cx + 1, y + 5);
          cx += colWidths[i];
        });
        y += rowH + 1 + 3;
      } else {
        y += 2;
      }
      setText(C_DARK);
    };

    // ═══════════════════════════════════════════════════════════════
    // PÁGINA 1: HEADER + RESUMEN EJECUTIVO
    // ═══════════════════════════════════════════════════════════════

    // Logo (si existe)
    if (storeInfo?.logo_url) {
      try {
        const r = await fetch(storeInfo.logo_url);
        const b = await r.blob();
        const du = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(b); });
        doc.addImage(du, 'PNG', m, y - 4, 18, 18);
      } catch {}
    }

    setText(C_DARK);
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(sn, m + (storeInfo?.logo_url ? 22 : 0), y + 2);
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
    let addrY = y + 6;
    if (storeInfo?.address) { doc.text(storeInfo.address, m + (storeInfo?.logo_url ? 22 : 0), addrY); addrY += 3; }
    if (storeInfo?.phone) { doc.text(`Tel: ${storeInfo.phone}`, m + (storeInfo?.logo_url ? 22 : 0), addrY); addrY += 3; }
    if (storeInfo?.reeup) { doc.text(`REEUP: ${storeInfo.reeup}  ·  NIT: ${storeInfo?.nit || '—'}`, m + (storeInfo?.logo_url ? 22 : 0), addrY); addrY += 3; }
    y = Math.max(y + 18, addrY);
    hr(C_BORDER, 0.5);

    es(8);
    setText(C_DARK);
    doc.setFontSize(13); doc.setFont('helvetica', 'bold');
    doc.text('REPORTE DE CAJA — ENTREGA DE DINERO', m, y); y += 5;
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
    doc.text(`Periodo: ${startDate} → ${endDate}`, m, y); y += 3.5;
    if (deliveredBy || recipientName) {
      doc.text(`Entrega: ${deliveredBy || '—'}    Recibe: ${recipientName || '—'}`, m, y); y += 3.5;
    }
    doc.text(`Generado: ${new Date().toLocaleString('es-CU')}`, m, y); y += 6;
    hr(C_BORDER, 0.3);

    // Fetch paralelo de datos detallados
    const sISO = new Date(startDate + 'T00:00:00').toISOString();
    const eISO = new Date(endDate + 'T23:59:59').toISOString();
    const [itemsSummary, commissionsSummary] = await Promise.all([
      apiFetch(`/api/cash-report/items-summary?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ items: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 })),
      apiFetch(`/api/cash-report/commissions-summary?start_date=${encodeURIComponent(sISO)}&end_date=${encodeURIComponent(eISO)}`).catch(() => ({ workers: [], total_cup: 0, total_cash: 0, total_transfer: 0, total_zelle: 0 })),
    ]);

    // Cálculos del flujo de caja
    const sales = report.sales || [];
    const payments = report.payments || [];
    const commissions = report.commissions || [];
    const production = (report as any).production || [];

    const cupCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
    const cupTransferSales = sales.filter((s: any) => s.payment_method === 'transfer' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
    const cupZelleSales = sales.filter((s: any) => s.payment_method === 'zelle' && s.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
    const cupCashPayments = payments.filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
    const cupTransferPayments = payments.filter((p: any) => p.payment_method === 'transfer' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
    const cupCashCommissions = commissions.filter((c: any) => c.payment_method === 'cash' && c.currency === 'CUP').reduce((s: number, x: any) => s + Number(c.total), 0);
    const cupCashProduction = production.filter((p: any) => p.payment_method === 'cash' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);
    const cupTransferProduction = production.filter((p: any) => p.payment_method === 'transfer' && p.currency === 'CUP').reduce((s: number, x: any) => s + Number(x.total), 0);

    // Flujo de caja resumen
    sectionTitle('RESUMEN — FLUJO DE CAJA CUP', `${sales.length} grupos de ventas · ${payments.length} grupos de pagos`);

    // Construir tabla resumen tipo flujo de caja
    const summaryRows: (string | number)[][] = [
      ['INGRESOS', '', '', ''],
      ['  Ventas en Efectivo', `${sales.filter((s:any)=>s.payment_method==='cash'&&s.currency==='CUP').reduce((s:number,x:any)=>s+x.transaction_count,0)} txs`, '', fmt(cupCashSales)],
      ['  Ventas por Transferencia', `${sales.filter((s:any)=>s.payment_method==='transfer'&&s.currency==='CUP').reduce((s:number,x:any)=>s+x.transaction_count,0)} txs`, '', fmt(cupTransferSales)],
      ...(cupZelleSales > 0 ? [['  Ventas por Zelle', `${sales.filter((s:any)=>s.payment_method==='zelle'&&s.currency==='CUP').reduce((s:number,x:any)=>s+x.transaction_count,0)} txs`, '', fmt(cupZelleSales)] as (string|number)[][]] : []),
      ['  Anticipos/Liquidaciones de Órdenes', `${production.reduce((s:number,x:any)=>s+x.payment_count,0)} pagos`, '', fmt(cupCashProduction + cupTransferProduction)],
      ['SUBTOTAL INGRESOS', '', '', fmt(cupCashSales + cupTransferSales + cupZelleSales + cupCashProduction + cupTransferProduction)],
      ['', '', '', ''],
      ['EGRESOS (−)', '', '', ''],
      ['  Pagos a Proveedores (Recepciones)', `${payments.filter((p:any)=>p.ref_type==='receipt').reduce((s:number,x:any)=>s+x.payment_count,0)} pagos`, '', fmt(payments.filter((p:any)=>p.ref_type==='receipt').reduce((s:number,x:any)=>s+Number(x.total),0))],
      ['  Pagos por Servicios Recibidos', `${payments.filter((p:any)=>p.ref_type==='service').reduce((s:number,x:any)=>s+x.payment_count,0)} pagos`, '', fmt(payments.filter((p:any)=>p.ref_type==='service').reduce((s:number,x:any)=>s+Number(x.total),0))],
      ['  Comisiones a Trabajadores', `${commissions.reduce((s:number,x:any)=>s+x.commission_count,0)} pagos`, '', fmt(commissions.reduce((s:number,x:any)=>s+Number(x.total),0))],
      ['SUBTOTAL EGRESOS', '', '', fmt(cupCashPayments + cupTransferPayments + cupCashCommissions)],
      ['', '', '', ''],
      ['(−) Transferencias (no se entregan en efectivo)', '', '', fmt(cupTransferSales + cupTransferProduction)],
    ];

    const dineroEntregar = cupCashSales + cupCashProduction - cupCashPayments - cupCashCommissions;
    renderTable(
      ['Concepto', 'Documentos', '', 'Monto CUP'],
      summaryRows,
      [85, 30, 25, 40],
      {
        align: ['left', 'left', 'right', 'right'],
        totalsRow: ['DINERO A ENTREGAR EN EFECTIVO', '', '', fmt(dineroEntregar)],
      }
    );

    y += 4;

    // ═══════════════════════════════════════════════════════════════
    // PÁGINA 2: TABLA DE PRODUCTOS VENDIDOS
    // ═══════════════════════════════════════════════════════════════
    doc.addPage(); y = m;
    sectionTitle('PRODUCTOS VENDIDOS', `${itemsSummary?.count || 0} productos · ${itemsSummary?.items?.reduce((s:number,i:any)=>s+i.transactions_count,0) || 0} transacciones`);

    if (itemsSummary?.items?.length > 0) {
      const productRows: (string | number)[][] = itemsSummary.items.map((it: any) => [
        it.product_name.length > 30 ? it.product_name.substring(0, 28) + '…' : it.product_name,
        it.sku || '—',
        Number(it.total_quantity).toFixed(2),
        fmt(Number(it.unit_price)),
        fmt(Number(it.total_cup)),
        fmt(Number(it.cash_paid)),
        fmt(Number(it.transfer_paid)),
        fmt(Number(it.zelle_paid)),
      ]);
      renderTable(
        ['Producto', 'SKU', 'Cant.', 'P.Unit', 'Total CUP', 'Efectivo', 'Transfer', 'Zelle'],
        productRows,
        [44, 28, 14, 20, 26, 22, 22, 18],
        {
          align: ['left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'],
          totalsRow: ['TOTALES', '', '', '', fmt(itemsSummary.total_cup), fmt(itemsSummary.total_cash), fmt(itemsSummary.total_transfer), fmt(itemsSummary.total_zelle)],
        }
      );
    } else {
      doc.setFontSize(9); setText(C_MUTED); doc.setFont('helvetica', 'italic');
      doc.text('No se vendieron productos en el periodo seleccionado.', m, y + 4); y += 8;
    }

    y += 4;

    // ═══════════════════════════════════════════════════════════════
    // PÁGINA 3: COMISIONES A TRABAJADORES
    // ═══════════════════════════════════════════════════════════════
    if (commissionsSummary?.workers?.length > 0) {
      doc.addPage(); y = m;
      sectionTitle('COMISIONES A TRABAJADORES', `${commissionsSummary.count} trabajadores · ${commissionsSummary.workers.reduce((s:number,w:any)=>s+w.count,0)} pagos`);

      const workerRows: (string | number)[][] = commissionsSummary.workers.map((w: any) => [
        w.worker_name,
        w.ci,
        String(w.count),
        w.periods[0] || '—',
        fmt(w.cash_paid),
        fmt(w.transfer_paid),
        fmt(w.zelle_paid),
        fmt(w.total_amount_cup),
      ]);
      renderTable(
        ['Trabajador', 'CI', 'Pagos', 'Periodo', 'Efectivo', 'Transfer', 'Zelle', 'Total CUP'],
        workerRows,
        [40, 22, 12, 35, 22, 22, 18, 26],
        {
          align: ['left', 'left', 'center', 'left', 'right', 'right', 'right', 'right'],
          totalsRow: ['TOTALES', '', '', '', fmt(commissionsSummary.total_cash), fmt(commissionsSummary.total_transfer), fmt(commissionsSummary.total_zelle), fmt(commissionsSummary.total_cup)],
        }
      );
      y += 4;
    }

    // ═══════════════════════════════════════════════════════════════
    // PÁGINA 4: ÓRDENES DE PRODUCCIÓN/SERVICIO (anticipos + liquidaciones)
    // ═══════════════════════════════════════════════════════════════
    if (pdfOptions.detailProduction && production.length > 0) {
      doc.addPage(); y = m;
      sectionTitle('ÓRDENES DE PRODUCCIÓN/SERVICIO', 'Anticipos + Liquidaciones recibidas (INGRESOS)');

      // Agrupar por método + ref_type
      for (const p of production) {
        es(8);
        setText(C_DARK);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(`${methodLabel(p.payment_method)} (${p.currency}) · ${p.ref_type === 'production_order' ? 'Producción' : 'Trabajo'}`, m, y); y += 4;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
        doc.text(`${p.payment_count} pagos · Total: ${fmt(Number(p.total), p.currency)}`, m, y); y += 5;

        // Fetch detalle
        try {
          const items = await (async () => {
            const s = new Date(startDate + 'T00:00:00').toISOString();
            const e = new Date(endDate + 'T23:59:59').toISOString();
            let url = `/api/cash-report/details?type=payment&method=${p.payment_method}&currency=${p.currency}&start_date=${s}&end_date=${e}`;
            url += `&ref_type=${p.ref_type}`;
            const data = await apiFetch(url);
            return Array.isArray(data) ? data : (data?.data || []);
          })();

          if (items.length > 0) {
            const prodRows: (string | number)[][] = items.map((it: any) => {
              const date = (it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
              const amt = Number(it.amount_cup || it.amount || 0);
              const ref = it.reference || it.notes || '';
              return [date, ref.substring(0, 35), fmt(amt)];
            });
            renderTable(
              ['Fecha', 'Referencia', 'Monto CUP'],
              prodRows,
              [35, 95, 35],
              { align: ['left', 'left', 'right'] }
            );
          }
        } catch {}
        y += 3;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PÁGINA 5: SALIDAS DE DINERO (pagos a proveedores)
    // ═══════════════════════════════════════════════════════════════
    if (pdfOptions.detailPayments && payments.length > 0) {
      doc.addPage(); y = m;
      sectionTitle('SALIDAS DE DINERO', 'Pagos a proveedores, recepciones y servicios');

      for (const p of payments) {
        es(8);
        setText(C_DARK);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(`${methodLabel(p.payment_method)} (${p.currency}) · ${p.ref_type === 'receipt' ? 'Recepción de Mercancía' : 'Servicio Recibido'}`, m, y); y += 4;
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); setText(C_DANGER);
        doc.text(`${p.payment_count} pagos · Total: −${fmt(Number(p.total), p.currency)}`, m, y); y += 5;

        try {
          const items = await (async () => {
            const s = new Date(startDate + 'T00:00:00').toISOString();
            const e = new Date(endDate + 'T23:59:59').toISOString();
            let url = `/api/cash-report/details?type=payment&method=${p.payment_method}&currency=${p.currency}&start_date=${s}&end_date=${e}`;
            url += `&ref_type=${p.ref_type}`;
            const data = await apiFetch(url);
            return Array.isArray(data) ? data : (data?.data || []);
          })();

          if (items.length > 0) {
            const payRows: (string | number)[][] = items.map((it: any) => {
              const date = (it.payment_date || it.created_at || '').slice(0, 16).replace('T', ' ');
              const amt = Number(it.amount_cup || it.amount || 0);
              const ref = it.reference || it.notes || '';
              return [date, ref.substring(0, 35), `−${fmt(amt)}`];
            });
            renderTable(
              ['Fecha', 'Referencia', 'Monto CUP'],
              payRows,
              [35, 95, 35],
              { align: ['left', 'left', 'right'] }
            );
          }
        } catch {}
        y += 3;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // PÁGINA FINAL: DESGLOSE DE BILLETES + FIRMAS
    // ═══════════════════════════════════════════════════════════════
    doc.addPage(); y = m;
    sectionTitle('DESGLOSE DE BILLETES PARA ENTREGA', 'Conteo físico de efectivo');

    // Desglose CUP
    if (pdfOptions.includeBreakdown) {
      es(8);
      setText(C_DARK); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
      doc.text('Desglose CUP', m, y); y += 5;

      const cupEntries = Object.entries(cupBreakdown).filter(([, c]) => Number(c) > 0);
      if (cupEntries.length > 0) {
        const cupRows: (string | number)[][] = cupEntries.map(([d, c]) => [`$${d}`, String(c), fmt(Number(d) * Number(c))]);
        renderTable(
          ['Denominación', 'Cantidad', 'Subtotal'],
          cupRows,
          [50, 50, 65],
          {
            align: ['left', 'center', 'right'],
            totalsRow: ['TOTAL CONTADO', '', fmt(cupTotal)],
          }
        );
        es(6);
        setText(cupDifference === 0 ? C_SUCCESS : cupDifference > 0 ? C_WARN : C_DANGER);
        doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        const dl = cupDifference === 0 ? '(cuadrado)' : cupDifference > 0 ? '(sobrante)' : '(faltante)';
        doc.text(`Diferencia: ${fmt(Math.abs(cupDifference))} ${dl}`, m, y); y += 8;
      } else {
        setText(C_MUTED); doc.setFont('helvetica', 'italic'); doc.setFontSize(9);
        doc.text('(Sin desglose ingresado — use el botón "Sugerir" en la UI)', m, y); y += 6;
      }
    }

    // Desglose USD si aplica
    if (pdfOptions.includeUsd) {
      const usdCashSales = sales.filter((s: any) => s.payment_method === 'cash' && s.currency === 'USD').reduce((s: number, x: any) => s + Number(x.total), 0);
      if (usdCashSales > 0 || usdTotal > 0) {
        es(8);
        setText(C_DARK); doc.setFontSize(10); doc.setFont('helvetica', 'bold');
        doc.text('Desglose USD', m, y); y += 5;
        const usdEntries = Object.entries(usdBreakdown).filter(([, c]) => Number(c) > 0);
        if (usdEntries.length > 0) {
          const usdRows: (string | number)[][] = usdEntries.map(([d, c]) => [`$${d}`, String(c), `$${(Number(d) * Number(c)).toFixed(2)}`]);
          renderTable(
            ['Denominación', 'Cantidad', 'Subtotal USD'],
            usdRows,
            [50, 50, 65],
            {
              align: ['left', 'center', 'right'],
              totalsRow: ['TOTAL CONTADO USD', '', `$${usdTotal.toFixed(2)}`],
            }
          );
        }
      }
    }

    // Firmas
    if (pdfOptions.includeSignature) {
      es(30);
      setDraw(C_MUTED); doc.setLineWidth(0.3);
      const sigY = Math.max(y + 15, ph - 35);
      doc.line(m, sigY, m + 80, sigY);
      doc.line(pw - m - 80, sigY, pw - m, sigY);
      doc.setFontSize(8); doc.setFont('helvetica', 'normal'); setText(C_MUTED);
      doc.text(deliveredBy || 'Entrega', m, sigY + 5);
      doc.text(recipientName || 'Recibe', pw - m - 80, sigY + 5);
      doc.setFontSize(6); setText(C_MUTED);
      doc.text('Firma', m, sigY + 9);
      doc.text('Firma', pw - m - 80, sigY + 9);
    }

    // Footer en cada página
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(6); setText(C_MUTED); doc.setFont('helvetica', 'normal');
      doc.text(`CostPro — Reporte de Caja · ${sn} · Página ${i} de ${pageCount}`, pw / 2, ph - 5, { align: 'center' });
    }

    doc.save(`reporte_caja_${sn.replace(/\s+/g, '_')}_${startDate}.pdf`);
    setShowTemplateSelector(false);
    toast.success(`PDF generado: ${pageCount} página(s)`);
  };

  if (!open) return null;

  const methodIcon = (m: string) => m === 'cash' ? '💵' : m === 'transfer' ? '📱' : '💳';
  const methodLabel = (m: string) => m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Zelle';
  const fmt = (n: number, cur: string = 'CUP') => cur === 'CUP' ? formatCurrency(n) : `$${n.toFixed(2)}`;
  const touch = 'min-h-[44px]';
  const btnIcn = `p-2 rounded-lg border border-border/40 hover:bg-muted ${touch} flex items-center justify-center`;

  // FIX: pasar payment_method real al accordion (no label traducido)
  const renderAccordionItem = (key: string, pm: string, currency: string, sublabel: string, amount: number, isNeg: boolean = false, refType?: string) => (
    <div key={key} className="rounded-lg border border-border/30 overflow-hidden">
      <button onClick={() => toggleAccordion(key, isNeg ? 'payment' : 'sale', pm, currency, refType)}
        aria-expanded={expandedItems.has(key)} aria-controls={`p-${key}`}
        className={`w-full flex items-center justify-between p-3 bg-muted/10 hover:bg-muted/20 transition-colors ${touch}`}>
        <div className="flex items-center gap-2">
          <span className="text-lg">{methodIcon(pm)}</span>
          <div className="text-left">
            <p className="text-xs font-bold">{methodLabel(pm)} ({currency}){refType ? ` · ${refType}` : ''}</p>
            <p className="text-[10px] text-muted-foreground">{sublabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <p className={`text-sm font-mono font-black tabular-nums ${isNeg ? 'text-destructive' : ''}`}>{isNeg ? '−' : ''}{fmt(amount, currency)}</p>
          {expandedItems.has(key) ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {expandedItems.has(key) && (
        <div id={`p-${key}`} role="region" className="border-t border-border/20 p-2 bg-background">
          {loadingDetails.has(key) ? <p className="text-xs text-muted-foreground text-center py-2">Cargando documentos...</p>
          : (itemDetails[key]?.length ?? 0) === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin documentos</p>
          : <div className="space-y-1 max-h-56 overflow-y-auto">
              {itemDetails[key]?.map((doc: any, i: number) => {
                const date = doc.created_at?.slice(0,16).replace('T',' ') || doc.payment_date?.slice(0,16).replace('T',' ') || '—';
                const amount = Number(doc.amount || doc.total || doc.total_amount || doc.amount_cup || 0);
                const ref = doc.reference || doc.reference_doc || doc.notes || '';
                const customer = doc.customer_name || '';
                const refType = doc.ref_type || '';
                const docId = doc.id || '';
                return (
                  <div key={i} className="flex items-center justify-between text-[11px] py-2 px-2 rounded hover:bg-muted/30 gap-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <button
                        onClick={() => setSelectedDoc({ ...doc, _type: isNeg ? 'payment' : 'sale', _refType: refType, _currency: currency, _method: pm })}
                        aria-label="Ver documento"
                        className="p-1 rounded hover:bg-primary/10 shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] shrink-0">{date}</span>
                          {customer && <span className="text-[10px] font-bold truncate">{customer}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                          {refType && <span className="px-1 rounded bg-muted/40">{refType}</span>}
                          {ref && <span className="truncate">{ref}</span>}
                          {doc.payment_method && <span className="px-1 rounded bg-muted/40">{methodLabel(doc.payment_method)}</span>}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono tabular-nums font-bold shrink-0">{fmt(amount, currency)}</span>
                  </div>
                );
              })}
            </div>}
        </div>
      )}
    </div>
  );

  // Filtrar items por moneda/método
  const filterSales = (s: any) => (!filterCurrency || s.currency === filterCurrency) && (!filterMethod || s.payment_method === filterMethod);
  const filterPayments = (p: any) => (!filterCurrency || p.currency === filterCurrency) && (!filterMethod || p.payment_method === filterMethod);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-sm" onClick={onClose}>
      <div ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="cash-title" tabIndex={-1}
        className="w-full max-w-2xl max-h-[95vh] overflow-y-auto bg-card border border-border/50 rounded-2xl shadow-2xl focus:outline-none"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-card border-b border-border/30 p-4 z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <h2 id="cash-title" className="text-sm font-black uppercase tracking-widest">Reporte de Caja — Entrega</h2>
            </div>
            <button onClick={onClose} aria-label="Cerrar" className={`p-2 rounded-lg hover:bg-muted ${touch} flex items-center justify-center`}><span className="text-lg">✕</span></button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <label htmlFor="sd" className="text-[10px] font-black uppercase text-muted-foreground">Desde:</label>
              <input id="sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`} />
            </div>
            <div className="flex items-center gap-1.5">
              <label htmlFor="ed" className="text-[10px] font-black uppercase text-muted-foreground">Hasta:</label>
              <input id="ed" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`} />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Cargando reporte...</p>
          </div>
        ) : !report ? (
          <div className="p-8 text-center text-muted-foreground">Sin datos</div>
        ) : (
          <div className="p-3 sm:p-4 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-success/20 bg-success/5 p-3 text-center">
                <TrendingUp className="w-4 h-4 mx-auto text-success mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Ingresos</p>
                <p className="text-base sm:text-lg font-mono font-black tabular-nums text-success">{formatCurrency(report?.totals?.sales_total_cup ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-3 text-center">
                <TrendingDown className="w-4 h-4 mx-auto text-destructive mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Egresos</p>
                <p className="text-base sm:text-lg font-mono font-black tabular-nums text-destructive">{formatCurrency(report?.totals?.payments_total_cup ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-center">
                <DollarSign className="w-4 h-4 mx-auto text-primary mb-1" />
                <p className="text-[9px] font-black uppercase text-muted-foreground">Balance</p>
                <p className="text-base sm:text-lg font-mono font-black tabular-nums text-primary">{formatCurrency(expectedCup)}</p>
              </div>
            </div>

            {/* Filtros */}
            <div className="flex flex-wrap items-center gap-2">
              <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`}>
                <option value="">Todas las monedas</option>
                <option value="CUP">CUP</option>
                <option value="USD">USD</option>
                <option value="MLC">MLC</option>
              </select>
              <select value={filterMethod} onChange={(e) => setFilterMethod(e.target.value)} className={`px-3 py-2 rounded-lg border border-border/40 bg-background text-xs ${touch}`}>
                <option value="">Todos los métodos</option>
                <option value="cash">Efectivo</option>
                <option value="transfer">Transferencia</option>
                <option value="zelle">Zelle</option>
              </select>
            </div>

            {/* Ventas */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Ventas por Método</h3>
              <div className="space-y-1">
                {(report.sales || []).filter(filterSales).length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin ventas</p> :
                  (report.sales || []).filter(filterSales).map((s, i) => renderAccordionItem(`s-${s.payment_method}-${s.currency}-${i}`, s.payment_method, s.currency, `${s.transaction_count} transacciones`, s.total))
                }
              </div>
            </div>

            {/* Pagos */}
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Pagos a Proveedores</h3>
              <div className="space-y-1">
                {(report.payments || []).filter(filterPayments).length === 0 ? <p className="text-xs text-muted-foreground text-center py-2">Sin pagos</p> :
                  (report.payments || []).filter(filterPayments).map((p, i) => renderAccordionItem(`p-${p.payment_method}-${p.currency}-${p.ref_type}-${i}`, p.payment_method, p.currency, `${p.payment_count} pagos`, p.total, true, p.ref_type))
                }
              </div>
            </div>

            {/* Comisiones */}
            {report.commissions && report.commissions.length > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2 flex items-center gap-2">
                  <span>Comisiones a Trabajadores</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
                    {report.commissions.reduce((s: number, c: any) => s + c.commission_count, 0)} pagos · {formatCurrency(report.commissions.reduce((s: number, c: any) => s + Number(c.total), 0))}
                  </span>
                </h3>
                <div className="space-y-1">
                  {/* FIX (2026-07-15): pasar refType='commission' para que "Ver en Módulo" funcione */}
                  {report.commissions.filter(filterSales).length === 0 ? (
                    <p className="text-[10px] text-muted-foreground italic py-2 text-center">
                      Las comisiones existen pero están filtradas por la selección de moneda/método.
                    </p>
                  ) : (
                    report.commissions.filter(filterSales).map((c, i) => renderAccordionItem(`c-${c.payment_method}-${c.currency}-${i}`, c.payment_method, c.currency, `${c.commission_count} comisiones`, c.total, true, 'commission'))
                  )}
                </div>
              </div>
            )}

            {/* Órdenes de Producción/Servicios — anticipos + pagos recibidos (INGRESOS) */}
            {(report as any).production && (report as any).production.length > 0 && (
              <div>
                <h3 className="text-[11px] font-black uppercase text-success mb-2">
                  Órdenes de Producción/Servicios (Anticipos + Pagos recibidos)
                </h3>
                <div className="space-y-1">
                  {/* isNeg=false porque son INGRESOS (dinero que entra al cliente) */}
                  {(report as any).production.filter(filterPayments).map((p: any, i: number) =>
                    renderAccordionItem(`po-${p.payment_method}-${p.currency}-${p.ref_type}-${i}`,
                      p.payment_method, p.currency,
                      `${p.payment_count} pagos · ${p.ref_type === 'production_order' ? 'Producción' : 'Trabajo'}`,
                      p.total, false, p.ref_type)
                  )}
                </div>
              </div>
            )}

            {/* Desglose Sugerido colapsable — siempre visible cuando hay reporte */}
            {report && (
              <div>
                <button onClick={() => setShowSuggested(!showSuggested)} aria-expanded={showSuggested} className="w-full flex items-center gap-2 text-[11px] font-black uppercase text-muted-foreground hover:text-foreground transition-colors py-2">
                  {showSuggested ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />} Desglose Sugerido (CUP)
                  <span className="ml-auto text-[10px] font-mono tabular-nums text-muted-foreground">{formatCurrency(expectedCup)}</span>
                </button>
                {showSuggested && (
                  <div className="mt-2 rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-1">
                    {(report?.cash_breakdown ?? []).length > 0 ? (
                      <>
                        {(report?.cash_breakdown ?? []).map((d: any) => (
                          <div key={d.denom} className="flex items-center justify-between text-sm">
                            <span className="font-bold">${d.denom} × {d.count}</span>
                            <span className="font-mono tabular-nums text-muted-foreground">{formatCurrency(d.total)}</span>
                          </div>
                        ))}
                        <div className="border-t border-primary/20 pt-2 flex items-center justify-between">
                          <span className="text-xs font-black uppercase">Total sugerido:</span>
                          <span className="font-mono font-black text-primary">{formatCurrency(expectedCup)}</span>
                        </div>
                        <p className="text-[9px] text-muted-foreground pt-1">
                          💡 Usa el botón <Sparkles className="w-2.5 h-2.5 inline" /> (Sugerir) para aplicar este desglose automáticamente al formulario de billetes.
                        </p>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <p className="text-[10px] text-muted-foreground italic">
                          {expectedCup < 0
                            ? `⚠️ El balance es negativo (${formatCurrency(expectedCup)}). Las salidas superan a los ingresos en efectivo.`
                            : expectedCup === 0
                            ? 'El balance es cero. No hay efectivo para desglosar.'
                            : 'Haz clic en el botón ✨ (Sugerir) abajo para calcular el desglose óptimo de billetes.'}
                        </p>
                        <div className="border-t border-primary/20 pt-2 flex items-center justify-between">
                          <span className="text-xs font-black uppercase">Balance a entregar:</span>
                          <span className={`font-mono font-black ${expectedCup < 0 ? 'text-destructive' : 'text-primary'}`}>{formatCurrency(expectedCup)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Desglose CUP — ocultar si filtro de moneda es USD/MLC */}
            {(!filterCurrency || filterCurrency === 'CUP') && (
            <>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <h3 className="text-[11px] font-black uppercase text-muted-foreground">Desglose para Entrega — CUP</h3>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button onClick={handleSuggest} aria-label="Sugerir" className={btnIcn}><Sparkles className="w-4 h-4 text-primary" /></button>
                  <button onClick={handleClear} aria-label="Limpiar" className={btnIcn}><Trash2 className="w-4 h-4 text-destructive" /></button>
                  <button onClick={() => setShowConfig(!showConfig)} aria-label="Configurar" aria-expanded={showConfig} className={btnIcn}><Settings className="w-4 h-4" /></button>
                  <button onClick={handleSave} aria-label="Guardar" className={btnIcn}><Save className="w-4 h-4 text-primary" /></button>
                  <button onClick={() => setShowHistory(!showHistory)} aria-label="Restaurar" aria-expanded={showHistory} className={btnIcn}><RotateCcw className="w-4 h-4" /></button>
                </div>
              </div>
              {showConfig && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Denominaciones:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_DENOMS.map(d => (
                      <button key={d} onClick={() => toggleDenom(d)} aria-label={`$${d}`} aria-pressed={cupDenoms.includes(d)} className={`px-3 py-2 rounded-lg text-[10px] font-bold border min-h-[36px] ${cupDenoms.includes(d) ? 'border-primary bg-primary/10 text-primary' : 'border-border/40 text-muted-foreground'}`}>${d}</button>
                    ))}
                  </div>
                </div>
              )}
              {showHistory && (
                <div className="mb-2 p-3 rounded-xl border border-border/30 bg-muted/10 max-h-40 overflow-y-auto">
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Historial ({savedHistory.length}/10):</p>
                  {savedHistory.length === 0 ? <p className="text-xs text-muted-foreground">Sin guardados</p> :
                    savedHistory.map(h => (
                      <button key={h.id} onClick={() => handleRestore(h)} className="w-full flex items-center justify-between p-2 rounded hover:bg-muted/30 text-left min-h-[36px]">
                        <span className="text-[10px]">{h.label}</span><span className="text-[10px] font-mono">{formatCurrency(h.total)}</span>
                      </button>
                    ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div>
                  <label htmlFor="db" className="text-[9px] font-black uppercase text-muted-foreground">Entrega</label>
                  <input id="db" type="text" value={deliveredBy} onChange={(e) => setDeliveredBy(e.target.value)} className={`w-full px-3 py-2 rounded border border-border/40 bg-background text-xs ${touch}`} placeholder="Quien entrega" />
                </div>
                <div>
                  <label htmlFor="rn" className="text-[9px] font-black uppercase text-muted-foreground">Recibe</label>
                  <input id="rn" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} className={`w-full px-3 py-2 rounded border border-border/40 bg-background text-xs ${touch}`} placeholder="Quien recibe" />
                </div>
              </div>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {cupDenoms.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-10">${denom}</span><span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={cupBreakdown[denom] || ''} aria-label={`$${denom} CUP`} onChange={(e) => setCupBreakdown(p => ({ ...p, [denom]: e.target.value }))} className={`w-full px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono ${touch}`} placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2 space-y-1">
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total CUP:</span><span className="font-mono font-black">{formatCurrency(cupTotal)}</span></div>
                  <div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Esperado:</span><span className="font-mono font-black text-primary">{formatCurrency(expectedCup)}</span></div>
                  <div className={cn("flex items-center justify-between rounded-lg px-2 py-1.5", cupDifference === 0 ? "bg-success/10" : "bg-destructive/10")}>
                    <span className="text-xs font-black uppercase">{cupDifference === 0 ? 'Cuadrado' : cupDifference > 0 ? 'Sobrante' : 'Faltante'}:</span>
                    <span className={cn("font-mono font-black", cupDifference === 0 ? "text-success" : "text-destructive")}>{formatCurrency(Math.abs(cupDifference))}</span>
                  </div>
                </div>
              </div>
            </div>
            </>
            )}

            {/* Desglose USD — ocultar si filtro de moneda es CUP/MLC */}
            {(!filterCurrency || filterCurrency === 'USD') && (
            <div>
              <h3 className="text-[11px] font-black uppercase text-muted-foreground mb-2">Desglose para Entrega — USD</h3>
              <div className="rounded-xl border border-border/40 p-3 space-y-2">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  {USD_DENOMS.map(denom => (
                    <div key={denom} className="flex items-center gap-1">
                      <span className="text-[10px] font-bold w-10">${denom}</span><span className="text-[10px] text-muted-foreground">×</span>
                      <input type="number" min="0" value={usdBreakdown[denom] || ''} aria-label={`$${denom} USD`} onChange={(e) => setUsdBreakdown(p => ({ ...p, [denom]: e.target.value }))} className={`w-full px-2 py-2 rounded border border-border/40 bg-background text-xs font-mono ${touch}`} placeholder="0" />
                    </div>
                  ))}
                </div>
                <div className="border-t border-border/40 pt-2"><div className="flex items-center justify-between"><span className="text-xs font-black uppercase">Total USD:</span><span className="font-mono font-black">${usdTotal.toFixed(2)}</span></div></div>
              </div>
            </div>
            )}

            {/* Selector de plantilla + Exportar */}
            {showTemplateSelector && (
              <div className="p-3 rounded-xl border border-border/30 bg-muted/10 space-y-3">
                <div>
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Plantilla PDF:</p>
                  {TEMPLATES.map(t => (
                    <button key={t.id} onClick={() => setPdfTemplate(t.id)} className={cn("w-full flex items-center gap-2 p-2 rounded-lg border text-left mb-1", pdfTemplate === t.id ? "border-primary bg-primary/10" : "border-border/40")}>
                      <FileText className="w-4 h-4" />
                      <div><p className="text-xs font-bold">{t.label}</p><p className="text-[10px] text-muted-foreground">{t.desc}</p></div>
                    </button>
                  ))}
                </div>

                {/* FIX (2026-07-15): Toggles para incluir páginas anexas con detalle por sección */}
                <div>
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Incluir detalle en PDF (páginas anexas):</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => togglePdfOption('detailSales')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs", pdfOptions.detailSales ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.detailSales ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Ventas</span>
                    </button>
                    <button onClick={() => togglePdfOption('detailPayments')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs", pdfOptions.detailPayments ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.detailPayments ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Pagos Proveedor</span>
                    </button>
                    <button onClick={() => togglePdfOption('detailCommissions')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs", pdfOptions.detailCommissions ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.detailCommissions ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Comisiones</span>
                    </button>
                    <button onClick={() => togglePdfOption('detailProduction')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs", pdfOptions.detailProduction ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.detailProduction ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Producción</span>
                    </button>
                  </div>
                </div>

                {/* Toggles para secciones del PDF */}
                <div>
                  <p className="text-[10px] font-black uppercase text-muted-foreground mb-2">Secciones del PDF:</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => togglePdfOption('includeBreakdown')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs", pdfOptions.includeBreakdown ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.includeBreakdown ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Desglose billetes</span>
                    </button>
                    <button onClick={() => togglePdfOption('includeUsd')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs", pdfOptions.includeUsd ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.includeUsd ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Cuadre USD</span>
                    </button>
                    <button onClick={() => togglePdfOption('includeSignature')} className={cn("flex items-center gap-2 p-2 rounded-lg border text-left text-xs col-span-2", pdfOptions.includeSignature ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground")}>
                      {pdfOptions.includeSignature ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
                      <span className="font-bold">Líneas de firma</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => setShowTemplateSelector(!showTemplateSelector)} className={`px-3 rounded-xl border border-border/40 text-xs font-black uppercase hover:bg-muted flex items-center gap-1.5 ${touch}`}>
                <FileText className="w-4 h-4" /> {TEMPLATES.find(t => t.id === pdfTemplate)?.label}
              </button>
              <button onClick={handleExportPDF} className={`flex-1 rounded-xl bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-2 ${touch}`}>
                <Download className="w-4 h-4" /> Exportar PDF
              </button>
            </div>
          </div>
        )}

        {/* Modal de detalle de documento (ojo) */}
        {selectedDoc && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm" onClick={() => setSelectedDoc(null)}>
            <div className="w-full max-w-md bg-card border border-border/50 rounded-2xl shadow-2xl p-4 space-y-3" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase">Detalle de Documento</h3>
                <button onClick={() => setSelectedDoc(null)} aria-label="Cerrar" className="p-2 rounded-lg hover:bg-muted"><span className="text-lg">✕</span></button>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-bold">{selectedDoc._type === 'sale' ? 'Venta' : 'Pago a Proveedor'}</span></div>
                {selectedDoc._refType && <div className="flex justify-between"><span className="text-muted-foreground">Ref. Tipo:</span><span className="font-bold capitalize">{selectedDoc._refType}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">Fecha:</span><span className="font-mono">{selectedDoc.created_at?.slice(0,16).replace('T',' ') || selectedDoc.payment_date?.slice(0,16).replace('T',' ') || '—'}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Monto:</span><span className="font-mono font-black">{fmt(Number(selectedDoc.amount || selectedDoc.total || selectedDoc.total_amount || selectedDoc.amount_cup || 0), selectedDoc._currency)}</span></div>
                {selectedDoc.payment_method && <div className="flex justify-between"><span className="text-muted-foreground">Método:</span><span className="font-bold">{methodLabel(selectedDoc.payment_method)}</span></div>}
                {selectedDoc.customer_name && <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-bold">{selectedDoc.customer_name}</span></div>}
                {selectedDoc.reference && <div className="flex justify-between"><span className="text-muted-foreground">Referencia:</span><span className="font-mono">{selectedDoc.reference}</span></div>}
                {selectedDoc.notes && <div className="flex justify-between"><span className="text-muted-foreground">Notas:</span><span className="text-right">{selectedDoc.notes}</span></div>}
                {selectedDoc.cash_amount != null && Number(selectedDoc.cash_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Efectivo:</span><span className="font-mono">{formatCurrency(Number(selectedDoc.cash_amount))}</span></div>}
                {selectedDoc.transfer_amount != null && Number(selectedDoc.transfer_amount) > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Transferencia:</span><span className="font-mono">{formatCurrency(Number(selectedDoc.transfer_amount))}</span></div>}
                {selectedDoc.status && <div className="flex justify-between"><span className="text-muted-foreground">Estado:</span><span className="font-bold">{selectedDoc.status}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">ID:</span><span className="font-mono text-[9px] text-muted-foreground">{selectedDoc.id}</span></div>
              </div>
              <div className="flex gap-2 pt-2 border-t border-border/30">
                <button
                  onClick={() => {
                    // FIX (2026-07-15): usar setCurrentView del store Zustand en vez de
                    // window.open('/terminal?view=...') que llevaba a 404 (no existe /terminal).
                    if (selectedDoc._type === 'sale') {
                      setCurrentView('sales');
                    } else if (selectedDoc._refType === 'receipt') {
                      setCurrentView('reception_list');
                    } else if (selectedDoc._refType === 'service') {
                      setCurrentView('received-services');
                    } else if (selectedDoc._refType === 'commission') {
                      setCurrentView('workers');
                    } else if (selectedDoc._refType === 'production_order' || selectedDoc._refType === 'work') {
                      setCurrentView('production-orders');
                    }
                    setSelectedDoc(null);
                    onClose();
                  }}
                  className={`flex-1 rounded-lg bg-primary text-primary-foreground text-xs font-black uppercase hover:opacity-90 flex items-center justify-center gap-1.5 ${touch}`}
                >
                  <Eye className="w-3.5 h-3.5" /> Ver en módulo
                </button>
                <button onClick={() => setSelectedDoc(null)} className={`flex-1 rounded-lg border border-border/40 text-xs font-black uppercase hover:bg-muted ${touch}`}>Cerrar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
