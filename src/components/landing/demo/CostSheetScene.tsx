'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { costSheetIngredients, costSheetLabor, costSheetEvents } from './demoData';

interface CostSheetSceneProps { elapsed: number; isPlaying: boolean }

function typingText(t: number, s: number, text: string, speed: number) {
  if (t < s) return '';
  return text.slice(0, Math.floor((t - s) * 1000 / speed));
}

function countUp(t: number, s: number, target: number, dur = 0.7) {
  if (t < s) return 0;
  const p = Math.min((t - s) / dur, 1);
  return (1 - (1 - p) ** 3) * target;
}

const EV = costSheetEvents;
const ev = (target: string) => EV.find((e) => e.payload.target === target);
const acEv = (row: number) => EV.find((e) => e.action === 'autocomplete' && e.payload.row === row);

function Cur({ s }: { s?: boolean }) {
  return <span className={`inline-block w-[1.5px] ${s ? 'h-2.5' : 'h-3.5'} bg-green-400 ml-px align-middle animate-pulse`} />;
}

const pillColor = (type: string) =>
  type === 'good' ? 'bg-green-500/10 text-green-400'
  : type === 'tip' || type === 'info' ? 'bg-blue-500/10 text-blue-400'
  : 'bg-amber-500/10 text-amber-400';

export default function CostSheetScene({ elapsed }: CostSheetSceneProps) {
  const productName = typingText(elapsed, 0.5, 'Pan Francés Premium', 65);
  const presentation = typingText(elapsed, 3.2, '1 kg', 80);
  const tab = elapsed >= 23 ? 'labor' : elapsed >= 4.5 ? 'ingredients' : null;

  // Which cell has the green active-border
  let active: { r: number; f: string } | null = null;
  for (const e of EV) {
    if (e.action === 'autocomplete' && elapsed >= e.time) {
      const r = e.payload.row as number, nx = ev(`input-qty-${r}`);
      if (nx && elapsed < nx.time) { active = { r, f: 'name' }; break; }
    }
  }
  if (!active) {
    for (const e of EV) {
      if (e.action !== 'type') continue;
      const t = e.payload.target as string;
      if (!t.startsWith('input-')) continue;
      const d = ((e.payload.text as string).length * (e.payload.speed as number)) / 1000;
      if (elapsed >= e.time && elapsed < e.time + d + 0.2) {
        const m = t.match(/input-(name|qty|price)-(\d)/);
        if (m) { active = { r: +m[2], f: m[1] }; break; }
      }
    }
  }

  // Ingredient rows derived from events
  const rows = costSheetIngredients.map((ing, i) => {
    const ne = ev(`input-name-${i}`), qe = ev(`input-qty-${i}`), pe = ev(`input-price-${i}`), te = ev(`total-${i}`);
    const ac = acEv(i), acT = ac?.time ?? 99;
    const partial = typingText(elapsed, ne?.time ?? 99, (ne?.payload.text as string) ?? '', (ne?.payload.speed as number) ?? 100);
    return {
      name: elapsed >= acT ? ((ac?.payload.suggestion as string) ?? ing.name) : partial,
      qty: typingText(elapsed, qe?.time ?? 99, (qe?.payload.text as string) ?? '', (qe?.payload.speed as number) ?? 80),
      price: typingText(elapsed, pe?.time ?? 99, (pe?.payload.text as string) ?? '', (pe?.payload.speed as number) ?? 85),
      total: countUp(elapsed, te?.time ?? 99, (te?.payload.value as number) ?? 0),
      showAc: elapsed >= acT && elapsed < acT + 0.7,
      suggestion: ac?.payload.suggestion as string,
      visible: elapsed >= (ne?.time ?? 99),
      nameFocused: (() => { const n = ev(`input-name-${i}`); return n && elapsed >= n.time && elapsed < (ev(`input-qty-${i}`)?.time ?? 99) - 0.05; })(),
    };
  });

  const labRows = costSheetLabor.map((l, i) => ({
    ...l, visible: elapsed >= (ev(`labor-row-${i}`)?.time ?? 99), total: l.hours * l.rate * l.count,
  }));

  const subMP = countUp(elapsed, 21, 3.92), subLab = countUp(elapsed, 26, 862.4, 1);
  const costo = countUp(elapsed, 29, 4.78, 0.8), precio = countUp(elapsed, 30, 12, 0.8);

  const pills = EV.filter((e) => e.action === 'micro-validate' && elapsed >= e.time)
    .map((e) => ({ type: e.payload.type as string, text: e.payload.text as string }));

  const opacity = elapsed >= 35 ? Math.max(0, 1 - (elapsed - 35)) : 1;
  const al = (i: number, f: string) => active?.r === i && active.f === f;

  return (
    <motion.div animate={{ opacity }} className="w-full h-full flex items-center justify-center p-2">
      <div className="w-full max-w-2xl rounded-xl border border-green-500/20 bg-[#111827] shadow-2xl shadow-green-500/5 overflow-hidden"
        style={{ transform: 'scale(0.82)', transformOrigin: 'center' }}>

        {/* Header bar */}
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/5 bg-white/[0.02]">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-[10px] text-white/40 font-medium tracking-wider">CostPro — Ficha de Costo</span>
          <div className="ml-auto flex gap-1.5"><div className="w-2 h-2 rounded-full bg-white/10" /><div className="w-2 h-2 rounded-full bg-white/10" /></div>
        </div>

        <div className="p-3 space-y-2.5">
          {/* Product name */}
          <div className="flex items-baseline gap-2">
            <span className="text-base font-semibold text-white/90">
              {productName}{elapsed >= 0.5 && productName.length < 20 && <Cur />}
            </span>
            {presentation && (
              <span className="text-[11px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                {presentation}{presentation.length < 3 && <Cur s />}
              </span>
            )}
          </div>

          {/* Tabs */}
          {tab && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-1 bg-white/[0.03] rounded-md p-0.5">
              {(['ingredients', 'labor'] as const).map((k) => (
                <div key={k} className={`px-2.5 py-1 text-[10px] font-medium rounded transition-colors duration-300 ${tab === k ? 'bg-green-500/20 text-green-400' : 'text-white/25'}`}>
                  {k === 'ingredients' ? 'Materias Primas' : 'Mano de Obra'}
                </div>
              ))}
            </motion.div>
          )}

          {/* Animated table content */}
          <AnimatePresence mode="wait">
            {tab === 'ingredients' && (
              <motion.div key="mp" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.3 }}>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-white/25 text-[10px]">
                    <th className="text-left py-1 font-medium">Ingrediente</th>
                    <th className="text-left py-1 font-medium w-14">Cantidad</th>
                    <th className="text-left py-1 font-medium w-14">Precio</th>
                    <th className="text-right py-1 font-medium w-14">Total</th>
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => r.visible && (
                      <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={i % 2 ? 'bg-white/[0.015]' : ''}>
                        <td className={`py-1 relative ${al(i, 'name') ? 'border-l-2 border-green-500 pl-1.5' : 'pl-2.5'}`}>
                          <span className="text-white/75">{r.name}</span>
                          {r.nameFocused && <Cur />}
                          {r.showAc && (
                            <motion.div initial={{ opacity: 0, y: -2 }} animate={{ opacity: 1, y: 0 }}
                              className="absolute top-full left-0 z-10 mt-0.5 bg-[#1e293b] border border-green-500/30 rounded shadow-xl py-0.5 px-2 text-green-300 text-[10px] whitespace-nowrap">
                              {r.suggestion}
                            </motion.div>
                          )}
                        </td>
                        <td className={`py-1 ${al(i, 'qty') ? 'border-l-2 border-green-500 pl-1' : ''}`}><span className="text-white/50">{r.qty}</span></td>
                        <td className={`py-1 ${al(i, 'price') ? 'border-l-2 border-green-500 pl-1' : ''}`}><span className="text-white/50">{r.price}</span></td>
                        <td className="py-1 text-right">{r.total > 0.01 && <span className="text-green-400 font-medium tabular-nums">${r.total.toFixed(2)}</span>}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                {elapsed >= 21 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-right pt-1.5 mt-0.5 border-t border-white/5">
                    <span className="text-[10px] text-white/40">Subtotal MP: <span className="text-green-400 font-semibold">${subMP.toFixed(2)}</span></span>
                  </motion.div>
                )}
              </motion.div>
            )}

            {tab === 'labor' && (
              <motion.div key="lab" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.3 }}>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-white/25 text-[10px]">
                    <th className="text-left py-1 font-medium">Puesto</th>
                    <th className="text-left py-1 font-medium w-12">Horas</th>
                    <th className="text-left py-1 font-medium w-12">Tarifa</th>
                    <th className="text-left py-1 font-medium w-12">Obreros</th>
                    <th className="text-right py-1 font-medium w-14">Total</th>
                  </tr></thead>
                  <tbody>
                    {labRows.map((r, i) => r.visible && (
                      <motion.tr key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className={i % 2 ? 'bg-white/[0.015]' : ''}>
                        <td className="py-1 text-white/75">{r.role}</td>
                        <td className="py-1 text-white/50">{r.hours}</td>
                        <td className="py-1 text-white/50">${r.rate.toFixed(2)}</td>
                        <td className="py-1 text-white/50">{r.count}</td>
                        <td className="py-1 text-right text-green-400 font-medium tabular-nums">${r.total.toFixed(2)}</td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
                {elapsed >= 26 && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-right pt-1.5 mt-0.5 border-t border-white/5">
                    <span className="text-[10px] text-white/40">Subtotal MO: <span className="text-green-400 font-semibold">${subLab.toFixed(2)}</span></span>
                  </motion.div>
                )}
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

          {/* Summary card */}
          {elapsed >= 28.5 && (
            <motion.div initial={{ opacity: 0, y: 8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.4 }}
              className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/15 rounded-lg p-3 space-y-1.5">
              <div className="flex justify-between text-[11px]">
                <span className="text-white/40">Costo Unitario</span>
                <span className="text-white font-semibold tabular-nums">${costo.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-[11px]">
                <span className="text-white/40">Precio Venta</span>
                <span className="text-green-400 font-bold text-sm tabular-nums">${precio.toFixed(2)}</span>
              </div>
              {elapsed >= 31 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-center pt-1">
                  <span className="text-[10px] font-semibold bg-green-500/20 text-green-400 px-2.5 py-0.5 rounded-full">Margen 60% — saludable ✓</span>
                </motion.div>
              )}
            </motion.div>
          )}

          {/* Success badge */}
          <AnimatePresence>
            {elapsed >= 33 && (
              <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }} className="flex items-center justify-center gap-2 pt-1">
                <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-green-400">Ficha creada exitosamente</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}
