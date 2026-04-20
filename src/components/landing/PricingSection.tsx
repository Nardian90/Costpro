'use client';

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Minus, Sparkles, Percent, Calculator, ChevronDown, TrendingDown } from 'lucide-react';
import { pricingPlans, comparisonRows } from './data';
import { ConfettiBurst } from './animations';

export interface PricingSectionProps {
  pricingInView: boolean;
  isAnnual: boolean;
  setIsAnnual: (v: boolean) => void;
  pricingRef: React.RefObject<HTMLDivElement | null>;
  setShowContactModal: (v: boolean) => void;
}

function PricingCalculator({ visible }: { visible: boolean }) {
  const [products, setProducts] = useState(100);
  const [branches, setBranches] = useState(2);

  // Cost calculation: manual tracking base cost per product + per branch
  const manualCost = (products * 2.5 + branches * 50).toFixed(0);
  const costProCost = Math.max(0, 29 + Math.floor((products - 100) / 500) * 15 + (branches - 1) * 10).toFixed(0);
  const savings = Math.max(0, 100 - (Number(costProCost) / Number(manualCost)) * 100).toFixed(0);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
      className="overflow-hidden"
    >
      <div className="rounded-xl bg-gradient-to-br from-[#22c55e]/[0.06] via-transparent to-teal-500/[0.04] border border-[#22c55e]/15 p-4 mt-4">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="w-4 h-4 text-[#22c55e]" />
          <span className="text-xs font-bold text-white/90">Calculadora de ahorro</span>
        </div>

        <div className="space-y-4">
          {/* Products slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-white/60">Número de productos</label>
              <span className="text-[11px] font-bold text-[#22c55e] tabular-nums">{products}</span>
            </div>
            <input
              type="range"
              min={1}
              max={1000}
              value={products}
              onChange={(e) => setProducts(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#22c55e] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[#22c55e]/30 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20"
              aria-label="Número de productos"
            />
          </div>

          {/* Branches slider */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-medium text-white/60">Sucursales</label>
              <span className="text-[11px] font-bold text-[#22c55e] tabular-nums">{branches}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={branches}
              onChange={(e) => setBranches(Number(e.target.value))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-white/[0.08] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#22c55e] [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-[#22c55e]/30 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white/20"
              aria-label="Número de sucursales"
            />
          </div>
        </div>

        {/* Result card */}
        <div className="mt-4 p-3 rounded-lg bg-gradient-to-r from-[#22c55e]/15 to-emerald-500/10 border border-[#22c55e]/20">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Manual</p>
              <p className="text-sm font-extrabold text-white/60 tabular-nums">${Number(manualCost).toLocaleString()}</p>
              <p className="text-[9px] text-white/30">/mes</p>
            </div>
            <div>
              <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">CostPro</p>
              <p className="text-sm font-extrabold text-[#22c55e] tabular-nums">${Number(costProCost).toLocaleString()}</p>
              <p className="text-[9px] text-white/30">/mes</p>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-[#22c55e]/20 flex items-center justify-center mb-0.5">
                <TrendingDown className="w-4 h-4 text-[#22c55e]" />
              </div>
              <p className="text-lg font-extrabold text-[#22c55e] tabular-nums">-{savings}%</p>
              <p className="text-[9px] text-[#22c55e]/60 font-semibold">de ahorro</p>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function PricingSection({
  pricingInView,
  isAnnual,
  setIsAnnual,
  pricingRef,
  setShowContactModal,
}: PricingSectionProps) {
  const [showCalculator, setShowCalculator] = useState(false);
  const [confettiActive, setConfettiActive] = useState(false);
  const confettiTriggered = useRef(false);

  // Trigger confetti once when pricing comes into view
  useEffect(() => {
    if (pricingInView && !confettiTriggered.current) {
      confettiTriggered.current = true;
      // Small delay for visual effect
      const timer = setTimeout(() => {
        setConfettiActive(true);
        setTimeout(() => setConfettiActive(false), 1200);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [pricingInView]);

  return (
    <div ref={pricingRef} id="pricing-section" className="relative">
      <ConfettiBurst active={confettiActive} />
      <motion.div className="max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={pricingInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-6"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)] section-heading-accent">
            Planes para cada negocio
          </h2>
          <p className="mt-2 text-sm text-white/50">
            Comienza gratis y escala cuando estés listo
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <span className={`text-xs font-medium transition-colors ${!isAnnual ? 'text-white' : 'text-white/40'}`}>Mensual</span>
            <button
              onClick={() => setIsAnnual(!isAnnual)}
              className={`relative w-11 h-6 rounded-full transition-colors duration-300 ${
                isAnnual ? 'bg-[#22c55e]' : 'bg-white/20'
              }`}
              role="switch"
              aria-checked={isAnnual}
              aria-label="Cambiar entre plan mensual y anual"
            >
              <motion.span
                animate={{ x: isAnnual ? 20 : 2 }}
                transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                className="absolute top-1 w-4 h-4 rounded-full bg-white shadow-md"
              />
            </button>
            <div className="flex items-center gap-1.5">
              <span className={`text-xs font-medium transition-colors ${isAnnual ? 'text-white' : 'text-white/40'}`}>Anual</span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20">
                <Percent className="w-3 h-3 text-[#22c55e]" />
                <span className="text-[10px] font-bold text-[#22c55e]">Ahorrás 20%</span>
              </span>
            </div>
          </div>

          {/* Savings Calculator Toggle */}
          <button
            onClick={() => setShowCalculator(!showCalculator)}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-[10px] font-semibold text-white/50 hover:text-[#22c55e] hover:bg-[#22c55e]/10 hover:border-[#22c55e]/20 transition-all duration-200"
            aria-expanded={showCalculator}
            aria-controls="pricing-calculator"
          >
            <Calculator className="w-3 h-3" />
            <span>Calculadora de ahorro</span>
            <motion.span
              animate={{ rotate: showCalculator ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-3 h-3" />
            </motion.span>
          </button>
        </motion.div>

        {/* Pricing Calculator */}
        <AnimatePresence>
          {showCalculator && <PricingCalculator visible={pricingInView} />}
        </AnimatePresence>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {pricingPlans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              animate={pricingInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className={`relative p-5 rounded-xl backdrop-blur-md transition-all duration-300 group pricing-card-hover pricing-shimmer ${
                plan.popular
                  ? 'bg-white/[0.08] border-2 border-[#22c55e]/40 shadow-[0_0_40px_rgba(34,197,94,0.15),0_0_80px_rgba(34,197,94,0.08)] animate-border-rotate pricing-popular-hover pricing-popular-border -translate-y-2 shimmer-border border-gradient-animate'
                  : plan.name === 'Enterprise'
                    ? 'enterprise-gold-border'
                    : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-[#22c55e]/20'
              } hover:-translate-y-[4px] hover:shadow-[0_16px_48px_rgba(34,197,94,0.18)] hover:backdrop-blur-lg`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 rounded-full bg-gradient-to-r from-[#22c55e] to-emerald-400 text-[10px] font-bold text-white uppercase tracking-[0.15em] shadow-lg shadow-[#22c55e]/40 popular-badge-glow ribbon-wobble badge-shine">
                  <Sparkles className="w-3 h-3" />
                  <span>POPULAR</span>
                  <Sparkles className="w-3 h-3" />
                </div>
              )}
              <h3 className="text-sm font-bold text-white">{plan.name}</h3>
              <div className="mt-2 flex items-baseline gap-1">
                {plan.name === 'Enterprise' ? (
                  <span className="text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] text-white">Custom</span>
                ) : plan.priceMonthly === 0 ? (
                  <span className="text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] text-white">Gratis</span>
                ) : (
                  <div className="flex items-baseline gap-1.5" key={isAnnual ? 'annual' : 'monthly'}>
                    {isAnnual && (
                      <span className="text-sm text-white/30 line-through">${plan.priceMonthly}</span>
                    )}
                    <motion.span
                      className={`text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] ${plan.popular ? 'text-[#22c55e]' : 'text-white'} price-glow-animate`}
                    >
                      ${isAnnual ? plan.priceAnnual : plan.priceMonthly}
                    </motion.span>
                  </div>
                )}
                {plan.period && plan.priceMonthly > 0 && (
                  <span className="text-xs text-white/40">/{isAnnual ? 'mes' : 'mes'}</span>
                )}
              </div>
              <p className="mt-1 text-[11px] text-white/40">{plan.desc}</p>
              <ul className="mt-4 space-y-2">
                {plan.features.slice(0, 4).map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-xs text-white/60">
                    <Check className="w-3.5 h-3.5 text-[#22c55e] shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              {plan.name === 'Enterprise' && (
                <div className="mt-3 space-y-1.5">
                  {['✓ Soporte dedicado', '✓ SLA garantizado', '✓ Onboarding personalizado'].map((badge) => (
                    <span key={badge} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/15 text-[9px] font-semibold text-[#22c55e]/80 mr-1">
                      {badge}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => {
                  if (plan.name === 'Enterprise') {
                    setShowContactModal(true);
                  }
                }}
                className={`mt-4 w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 relative overflow-hidden glow-pulse-interactive ${
                  plan.popular
                    ? 'bg-[#22c55e] text-white hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20'
                    : plan.name === 'Enterprise'
                      ? 'bg-gradient-to-r from-amber-500/90 to-yellow-500/90 text-white border border-amber-400/40 hover:from-amber-500 hover:to-yellow-500 shadow-[0_0_20px_rgba(245,158,11,0.3)] hover:shadow-[0_0_30px_rgba(245,158,11,0.5)] enterprise-cta-pulse'
                      : 'bg-white/[0.08] text-white border border-white/10 hover:bg-white/[0.12]'
                }`}
              >
                {plan.name === 'Enterprise' && (
                  <span className="absolute -top-1 -right-1 flex items-center gap-0.5 px-1.5 py-0.5 rounded-bl-lg rounded-tr-lg bg-gradient-to-r from-amber-400 to-yellow-400 text-[7px] font-bold text-white shadow-lg">
                    <Sparkles className="w-2 h-2" />
                    Custom
                  </span>
                )}
                {plan.cta}
              </button>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Pricing Comparison Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={pricingInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
      >
        <div className="mt-6 max-w-2xl mx-auto w-full">
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
            <table className="w-full text-[10px] sm:text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2.5 px-3 text-white/50 font-medium">Función</th>
                  <th className="py-2.5 px-2 text-white/40 font-medium text-center">Starter</th>
                  <th className="py-2.5 px-2 text-[#22c55e] font-bold text-center bg-[#22c55e]/[0.06]">Pro ✓</th>
                  <th className="py-2.5 px-2 text-white/40 font-medium text-center">Enterprise</th>
                </tr>
              </thead>
              <tbody>
                {comparisonRows.map((row, idx) => (
                  <tr key={row.feature} className={`border-b border-white/[0.03] last:border-b-0 transition-colors duration-200 hover:bg-[#22c55e]/[0.06] ${idx % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                    <td className="py-2.5 px-3 text-white/60 font-medium">{row.feature}</td>
                    <td className="py-2.5 px-2 text-center">
                      {typeof row.starter === 'boolean' ? (
                        row.starter
                          ? <motion.span initial={pricingInView ? { scale: 0 } : {}} animate={pricingInView ? { scale: 1 } : {}} transition={{ delay: 0.6 + idx * 0.08, type: 'spring', stiffness: 400, damping: 15 }} className="inline-flex"><Check className="w-3.5 h-3.5 text-[#22c55e]" /></motion.span>
                          : <Minus className="w-3.5 h-3.5 text-white/15 mx-auto" />
                      ) : (
                        <span className="text-white/50">{row.starter}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center bg-[#22c55e]/[0.06]">
                      {typeof row.pro === 'boolean' ? (
                        row.pro
                          ? <motion.span initial={pricingInView ? { scale: 0 } : {}} animate={pricingInView ? { scale: 1 } : {}} transition={{ delay: 0.6 + idx * 0.08, type: 'spring', stiffness: 400, damping: 15 }} className="inline-flex"><Check className="w-3.5 h-3.5 text-[#22c55e]" /></motion.span>
                          : <Minus className="w-3.5 h-3.5 text-white/15 mx-auto" />
                      ) : (
                        <span className="text-white/70 font-semibold">{row.pro}</span>
                      )}
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      {typeof row.enterprise === 'boolean' ? (
                        row.enterprise
                          ? <motion.span initial={pricingInView ? { scale: 0 } : {}} animate={pricingInView ? { scale: 1 } : {}} transition={{ delay: 0.6 + idx * 0.08, type: 'spring', stiffness: 400, damping: 15 }} className="inline-flex"><Check className="w-3.5 h-3.5 text-[#22c55e]" /></motion.span>
                          : <Minus className="w-3.5 h-3.5 text-white/15 mx-auto" />
                      ) : (
                        <span className="text-white/50">{row.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
