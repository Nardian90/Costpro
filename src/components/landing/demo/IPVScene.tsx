'use client';

import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ipvKpis, ipvTopClients, ipvRecentTransactions } from './demoData';

interface IPVSceneProps { elapsed: number; isPlaying: boolean }

function countUp(t: number, s: number, target: number, dur = 0.7) {
  if (t < s) return 0;
  const p = Math.min((t - s) / dur, 1);
  return (1 - (1 - p) ** 3) * target;
}

const pillColor = (type: string) =>
  type === 'good' ? 'bg-green-500/10 text-green-400'
    : type === 'tip' || type === 'info' ? 'bg-blue-500/10 text-blue-400'
    : 'bg-amber-500/10 text-amber-400';

export default function IPVScene({ elapsed }: IPVSceneProps) {
  // ── Derived visual state ──
  const showDashboard = elapsed >= 0;
  const showAlert = elapsed >= 1.5;
  const alertScale = elapsed >= 1.5 && elapsed < 3.5 ? 1.02 + Math.sin(elapsed * 4) * 0.012 : 1;
  const showClient = elapsed >= 4;
  const sharePct = countUp(elapsed, 5, 45, 1);
  const showActions = elapsed >= 7.5;
  const btnReduce = elapsed >= 8.5;
  const showDiversify = elapsed >= 9;
  const showTxnPanel = elapsed >= 12;
  const showToast = elapsed >= 17 && elapsed < 19;
  const showHealthy = elapsed >= 19;
  const showSummary = elapsed >= 24;
  const opacity = elapsed >= 26 ? Math.max(0, 1 - (elapsed - 26)) : 1;

  // Micro-validation pills
  const pills = useMemo(() => {
    const map: Record<number, { type: string; text: string }> = {
      6: { type: 'warning', text: 'Si este cliente se va, pierdes casi la mitad de tu facturación' },
      10: { type: 'tip', text: 'Meta: ningún cliente > 25% de ingresos' },
      14.5: { type: 'warning', text: 'Cargo parcial — $210 pendientes por cuadrar' },
      17.5: { type: 'good', text: 'Recordatorio enviado por WhatsApp' },
      22: { type: 'good', text: '4 clientes adicionales con riesgo bajo' },
    };
    return Object.entries(map)
      .filter(([t]) => elapsed >= +t)
      .map(([, v]) => v);
  }, [elapsed]);

  // Healthy clients (index 1-4)
  const healthyClients = useMemo(() =>
    ipvTopClients.slice(1).map((c, i) => ({
      ...c,
      visible: elapsed >= 19.5 + i * 0.5,
      barW: countUp(elapsed, 19.5 + i * 0.5, c.share, 0.6),
    })), [elapsed]);

  // Transactions
  const txns = useMemo(() =>
    ipvRecentTransactions.map((tx, i) => {
      const t = i < 3 ? 12.5 + i * 0.7 : 15.2 + (i - 3) * 0.6;
      return { ...tx, visible: elapsed >= t };
    }), [elapsed]);

  return (
    <motion.div animate={{ opacity }} className="w-full h-full flex items-center justify-center p-2">
      <div className="w-full max-w-2xl rounded-xl border border-green-500/20 bg-[#111827] shadow-2xl shadow-green-500/5 overflow-hidden"
        style={{ transform: 'scale(0.82)', transformOrigin: 'center' }}>

        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden="true" />
          <span className="text-[10px] text-white/40 font-medium tracking-wider flex items-center gap-2">CostPro — IPV Inteligente <span className="sr-only">En línea</span></span>
          <div className="ml-auto flex gap-1.5"><div className="w-2 h-2 rounded-full bg-white/10" /><div className="w-2 h-2 rounded-full bg-white/10" /></div>
        </div>

        <div className="p-3 space-y-2.5">
          {/* ── RISK ALERT — hero moment ── */}
          <AnimatePresence>
            {showAlert && elapsed < 11.5 && (
              <motion.div
                key="alert"
                initial={{ opacity: 0, scale: 0.92, y: 12 }}
                animate={{ opacity: 1, scale: alertScale, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -8 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 200 }}
                className="relative rounded-lg border-2 border-amber-500/40 bg-gradient-to-br from-amber-500/10 via-red-500/5 to-transparent p-4 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/[0.03] to-transparent animate-pulse" />
                <div className="relative flex flex-col items-center text-center gap-1.5">
                  <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.3, type: 'spring' }}
                    className="text-2xl">⚠️</motion.span>
                  <span className="text-sm font-bold text-amber-400 tracking-wide">Riesgo detectado</span>
                  <span className="text-[11px] text-white/70 leading-snug max-w-xs">
                    El 45% de tus ingresos depende de <span className="text-amber-300 font-semibold">un solo cliente</span>
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── At-risk client highlight ── */}
          <AnimatePresence>
            {showClient && elapsed < 11.5 && (
              <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }}
                className="rounded-lg border border-red-500/25 bg-red-500/5 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />
                    <span className="text-[11px] font-semibold text-white/85">{ipvTopClients[0].name}</span>
                    <span className="text-[9px] font-bold text-red-400 uppercase tracking-widest">Riesgo</span>
                  </div>
                  <span className="text-xs font-bold text-red-400 tabular-nums">${ipvTopClients[0].amount.toLocaleString()}</span>
                </div>
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${sharePct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-red-500 to-amber-500" />
                </div>
                <div className="text-right text-[10px] text-red-400/70 font-medium tabular-nums">{Math.round(sharePct)}% del total</div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Action buttons ── */}
          <AnimatePresence>
            {showActions && elapsed < 11.5 && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-1.5">
                {[
                  { label: 'Reducir Riesgo', active: btnReduce, primary: true },
                  { label: 'Ver Detalle', active: false, primary: false },
                  { label: 'Contactar', active: false, primary: false },
                ].map((b) => (
                  <div key={b.label}
                    className={`px-2.5 py-1 rounded-md text-[10px] font-medium transition-all duration-300 cursor-default
                      ${b.active ? 'bg-green-500/20 text-green-400 shadow-sm shadow-green-500/10 ring-1 ring-green-500/30' :
                        b.primary ? 'bg-green-500/15 text-green-400/60' : 'bg-white/5 text-white/30'}`}>
                    {b.label}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Diversification panel ── */}
          <AnimatePresence>
            {showDiversify && elapsed < 11.5 && (
              <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }}
                className="rounded-lg border border-green-500/20 bg-green-500/5 p-2.5 space-y-1">
                <span className="text-[10px] font-semibold text-green-400">🎯 Estrategia de diversificación</span>
                <p className="text-[10px] text-white/50 leading-relaxed">
                  Meta: ningún cliente &gt; 25% de ingresos. Necesitas al menos 3 clientes nuevos con volumen similar.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Transactions panel ── */}
          <AnimatePresence>
            {showTxnPanel && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] p-2.5 space-y-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-white/60">Últimos cobros — Cadenal de Hoteles Varadero</span>
                  {elapsed >= 16.5 && (
                    <motion.span initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                      className="text-[9px] font-medium bg-green-500/15 text-green-400 px-1.5 py-0.5 rounded cursor-default">
                      Enviar recordatorio
                    </motion.span>
                  )}
                </div>
                {txns.map((tx, i) => tx.visible && (
                  <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between py-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-white/40 tabular-nums w-10">{tx.date}</span>
                      <span className={`text-[9px] font-medium px-1.5 py-0 rounded ${
                        tx.status === 'conciliada' ? 'bg-green-500/15 text-green-400' : 'bg-amber-500/15 text-amber-400'}`}>
                        {tx.status === 'conciliada' ? 'CONCILIADA' : 'PARCIAL'}
                      </span>
                    </div>
                    <span className="text-[10px] text-white/70 font-medium tabular-nums">${tx.amount.toLocaleString()}</span>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Toast notification ── */}
          <AnimatePresence>
            {showToast && (
              <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}
                className="flex items-center gap-2 rounded-lg border border-green-500/25 bg-green-500/10 px-3 py-2">
                <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                  <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-[10px] font-medium text-green-300">Recordatorio enviado por WhatsApp</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Healthy clients overview ── */}
          <AnimatePresence>
            {showHealthy && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-1.5">
                <span className="text-[10px] font-semibold text-white/40">Otros clientes</span>
                {healthyClients.map((c, i) => c.visible && (
                  <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    className="rounded-md border border-green-500/10 bg-green-500/[0.03] px-2.5 py-1.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-400" aria-hidden="true" />
                        <span className="text-[10px] text-white/70 font-medium">{c.name}</span>
                      </div>
                      <span className="text-[10px] text-green-400/80 font-medium tabular-nums">${c.amount.toLocaleString()}</span>
                    </div>
                    <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                      <motion.div initial={{ width: 0 }} animate={{ width: `${c.barW}%` }} transition={{ duration: 0.6 }}
                        className="h-full rounded-full bg-green-500/60" />
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Micro-validation pills ── */}
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

          {/* ── Insight summary ── */}
          <AnimatePresence>
            {showSummary && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="rounded-lg bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/15 p-3 space-y-1.5">
                <span className="text-[11px] font-semibold text-green-400">Insight generado automáticamente</span>
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40">Ingresos totales</span>
                  <span className="text-white font-semibold tabular-nums">${ipvKpis.ingresos.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40">Transacciones</span>
                  <span className="text-white/70 tabular-nums">{ipvKpis.transacciones}</span>
                </div>
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/40">Conciliadas</span>
                  <span className="text-green-400 font-medium tabular-nums">{ipvKpis.conciliadas}%</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
