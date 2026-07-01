'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { storeKpis } from './demoData';

interface MultiStoreSceneProps { elapsed: number; isPlaying: boolean }

function countUp(t: number, s: number, target: number, dur = 0.7) {
  if (t < s) return 0;
  const p = Math.min((t - s) / dur, 1);
  return (1 - (1 - p) ** 3) * target;
}

const pillColor = (type: string) =>
  type === 'good' ? 'bg-green-500/10 text-green-400'
    : type === 'tip' || type === 'info' ? 'bg-blue-500/10 text-blue-400'
    : 'bg-amber-500/10 text-amber-400';

const detailRows = [
  { name: 'Pan Francés', sold: 45, normal: 80, stock: 0, status: 'low' as const },
  { name: 'Croissant', sold: 12, normal: 0, stock: 4, status: 'out' as const },
  { name: 'Tarta de Guayaba', sold: 18, normal: 0, stock: 0, status: 'ok' as const },
];

export default function MultiStoreScene({ elapsed }: MultiStoreSceneProps) {
  const [centro, norte] = storeKpis;
  const showCards = elapsed >= 1;
  const showNorte = elapsed >= 3;
  const showCompare = elapsed >= 16 && elapsed < 19.5;
  const ventasC = countUp(elapsed, 1.5, centro.ventasHoy, 0.8);
  const ticketsC = countUp(elapsed, 2.2, centro.tickets, 0.5);
  const ventasN = countUp(elapsed, 3.5, norte.ventasHoy, 0.8);
  const ticketsN = countUp(elapsed, 4.2, norte.tickets, 0.5);
  const showAlert = elapsed >= 5 && elapsed < 9;
  const alertPulse = showAlert && elapsed < 7 ? 1.01 + Math.sin(elapsed * 5) * 0.008 : 1;
  const showDetail = elapsed >= 9.5 && elapsed < 16;
  const visibleDetails = useMemo(() => detailRows.map((r, i) => ({
    ...r, visible: elapsed >= 10.5 + i * 0.7,
  })), [elapsed]);
  const showRestockBtn = elapsed >= 13.5 && elapsed < 14.5;
  const showToast = elapsed >= 14 && elapsed < 16;
  const barC = countUp(elapsed, 16.5, centro.ventasHoy, 0.8);
  const barN = countUp(elapsed, 16.5, norte.ventasHoy, 0.8);
  const total = countUp(elapsed, 17, 2130, 1);
  const opacity = elapsed >= 21 ? Math.max(0, 1 - (elapsed - 21)) : 1;
  const showSummary = elapsed >= 19.5;

  const pills = useMemo(() => {
    const map: Record<number, { type: string; text: string }> = {
      7.5: { type: 'warning', text: 'Ayer a esta hora llevabas $1,270 — hoy solo $890' },
      12.5: { type: 'info', text: 'Panadería principal: stock bajo en Croissant — podrían perder ventas' },
      14.5: { type: 'good', text: 'Alerta de reposición enviada a Sucursal Norte' },
      18: { type: 'good', text: '$2,130 consolidado entre ambas sucursales' },
    };
    return Object.entries(map).filter(([t]) => elapsed >= +t).map(([, v]) => v);
  }, [elapsed]);
  const storeCard = (store: typeof centro, ventas: number, tickets: number, idx: number) => {
    const isAlert = store.status === 'alert';
    const clicked = idx === 1 && elapsed >= 9 && elapsed < 16;
    return (
      <motion.div
        key={store.name}
        initial={{ opacity: 0, y: 12, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0 }}
        className={`rounded-lg border p-2.5 space-y-1.5 transition-colors duration-300 ${
          clicked ? 'border-amber-500/40 bg-amber-500/5' :
          isAlert && elapsed >= 5 ? 'border-amber-500/25 bg-amber-500/[0.03]' :
          'border-white/5 bg-white/[0.02]'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${isAlert ? 'bg-amber-400 animate-pulse' : 'bg-green-400'}`} />
            <span className="text-[11px] font-semibold text-white/80">{store.name}</span>
          </div>
          <span className={`text-[10px] font-medium tabular-nums ${store.trend >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {store.trend >= 0 ? '↑' : '↓'}{Math.abs(store.trend)}%
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold text-white tabular-nums">${Math.round(ventas).toLocaleString()}</span>
          <span className="text-[9px] text-white/30">ventas hoy</span>
        </div>
        <span className="text-[10px] text-white/40">{Math.round(tickets)} tickets · Prom $<span className="tabular-nums">{store.ticketProm}</span></span>
        {clicked && (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 translate-y-full w-1.5 h-1.5 rounded-full bg-amber-400 shadow-lg shadow-amber-400/50" />
        )}
      </motion.div>
    );
  };

  return (
    <motion.div animate={{ opacity }} className="w-full h-full flex items-center justify-center p-2">
      <div className="w-full max-w-2xl rounded-xl border border-green-500/20 bg-[#111827] shadow-2xl shadow-green-500/5 overflow-hidden"
        style={{ transform: 'scale(0.82)', transformOrigin: 'center' }}>

        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-white/40 font-medium tracking-wider">CostPro — Multi-Tienda</span>
          <div className="ml-auto flex gap-1.5"><div className="w-2 h-2 rounded-full bg-white/10" /><div className="w-2 h-2 rounded-full bg-white/10" /></div>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Store Cards */}
          <AnimatePresence>
            {showCards && !showCompare && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}
                className="grid grid-cols-2 gap-2">
                {storeCard(centro, ventasC, ticketsC, 0)}
                {showNorte && storeCard(norte, ventasN, ticketsN, 1)}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Alert Banner */}
          <AnimatePresence>
            {showAlert && (
              <motion.div
                key="store-alert"
                initial={{ opacity: 0, scale: 0.95, y: 8 }}
                animate={{ opacity: 1, scale: alertPulse, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.4, type: 'spring', stiffness: 200 }}
                className="rounded-lg border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-red-500/5 to-transparent p-3">
                <div className="flex items-start gap-2">
                  <span className="text-lg leading-none">📉</span>
                  <div>
                    <span className="text-[11px] font-bold text-amber-400">Sucursal Norte vendiendo 30% menos</span>
                    <p className="text-[10px] text-white/60 mt-0.5">Ayer a esta hora: <span className="text-white/80 font-medium tabular-nums">$1,270</span> → Hoy: <span className="text-red-400 font-medium tabular-nums">$890</span></p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Detail Panel */}
          <AnimatePresence>
            {showDetail && (
              <motion.div initial={{ opacity: 0, y: 10, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }}
                className="rounded-lg border border-amber-500/20 bg-amber-500/[0.03] overflow-hidden">
                <div className="px-2.5 py-1.5 border-b border-white/5">
                  <span className="text-[10px] font-semibold text-white/50">Detalle — Sucursal Norte</span>
                </div>
                <div className="p-2 space-y-0.5">
                  {visibleDetails.map((r, i) => r.visible && (
                    <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between py-1 px-1 rounded">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${r.status === 'out' ? 'bg-red-500/15 text-red-400' : r.status === 'low' ? 'bg-amber-500/15 text-amber-400' : 'bg-green-500/15 text-green-400'}`}>
                          {r.status === 'out' ? '⚠️' : r.status === 'low' ? '↓' : '✓'}
                        </span>
                        <span className="text-[10px] text-white/75">{r.name}</span>
                      </div>
                      <span className="text-[10px] text-white/50 tabular-nums">{r.sold} vendidos{r.normal > 0 ? ` (normal: ${r.normal})` : r.stock > 0 ? ` (stock: ${r.stock})` : ' (normal)'}</span>
                    </motion.div>
                  ))}
                </div>
                {/* Restock */}
                {showRestockBtn && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="px-2.5 pb-2 pt-1">
                    <div className="bg-green-500/20 text-green-400 border border-green-500/30 text-[10px] font-medium px-3 py-1 rounded-md text-center cursor-default shadow-sm shadow-green-500/10">
                      Enviar alerta reposición
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {/* Toast */}
          <AnimatePresence>
            {showToast && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                className="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[10px] font-medium text-green-300">Alerta de reposición enviada a Sucursal Norte</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Consolidated Comparison */}
          <AnimatePresence>
            {showCompare && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-3 space-y-2">
                <span className="text-[10px] font-semibold text-white/50">Comparativo consolidado</span>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: centro.name, val: barC, color: 'from-green-500 to-emerald-400', pct: 100 },
                    { label: norte.name, val: barN, color: 'from-amber-500 to-orange-400', pct: 72 }].map((s) => (
                    <div key={s.label} className="space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] text-white/50">{s.label}</span>
                        <span className="text-[11px] font-bold text-white tabular-nums">${Math.round(s.val).toLocaleString()}</span>
                      </div>
                      <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                        <motion.div initial={{ width: 0 }} animate={{ width: `${s.pct}%` }} transition={{ duration: 0.8 }}
                          className={`h-full rounded-full bg-gradient-to-r ${s.color}`} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="pt-1 border-t border-white/5 text-center">
                  <span className="text-[9px] text-white/40">Total consolidado</span>
                  <div className="text-base font-bold text-green-400 tabular-nums">${Math.round(total).toLocaleString()}</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Micro-validation pills */}
          <div className="flex flex-wrap gap-1.5 min-h-[18px]">
            <AnimatePresence>
              {pills.map((p, i) => (
                <motion.div key={`${p.text}-${i}`} initial={{ opacity: 0, y: 4, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                  className={`text-[9px] font-medium px-2 py-0.5 rounded-full ${pillColor(p.type)}`}>
                  {p.text}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          {/* Summary */}
          <AnimatePresence>
            {showSummary && (
              <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
                className="rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/15 p-3 flex items-center justify-center gap-2">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold text-green-400">2 sucursales controladas en tiempo real</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
