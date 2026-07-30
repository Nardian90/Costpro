'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Minus, Sparkles, MessageCircle } from 'lucide-react';
import { pricingPlans, comparisonRows } from './data';

interface PricingSectionProps {
  pricingInView: boolean;
  pricingRef: React.RefObject<HTMLDivElement | null>;
  onSignup?: () => void;
}

export default function PricingSection({
  pricingInView,
  pricingRef,
  onSignup,
}: PricingSectionProps) {
  return (
    <div ref={pricingRef} id="precios" className="relative">
      <div className="max-w-5xl mx-auto w-full">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={pricingInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
            Planes para cada negocio
          </h2>
          <p className="mt-2 text-sm text-white/50">
            Comienza gratis y escala cuando estés listo
          </p>
        </motion.div>

        {/* Pricing Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          {pricingPlans.map((plan, i) => {
            const isGratis = plan.name === 'Gratis';
            const isMultitienda = plan.name === 'Multitienda';
            const isPopular = plan.popular;

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={pricingInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className={`relative p-6 rounded-xl backdrop-blur-md transition-all duration-300 group ${
                  isPopular
                    ? 'bg-white/[0.08] border-2 border-[#22c55e]/40 shadow-[0_0_40px_rgba(34,197,94,0.15),0_0_80px_rgba(34,197,94,0.08)] -translate-y-2 hover:-translate-y-[4px] hover:shadow-[0_16px_48px_rgba(34,197,94,0.18)]'
                    : isMultitienda
                      ? 'enterprise-gold-border bg-white/[0.06] border-2 border-amber-400/30 hover:border-amber-400/50 hover:-translate-y-[4px] hover:shadow-[0_16px_48px_rgba(245,158,11,0.12)]'
                      : 'bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.07] hover:border-[#22c55e]/20 hover:-translate-y-[4px]'
                }`}
              >
                {/* Popular Badge */}
                {isPopular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-4 py-1 rounded-full bg-gradient-to-r from-[#22c55e] to-emerald-400 text-[10px] font-bold text-white uppercase tracking-[0.15em] shadow-lg shadow-[#22c55e]/40">
                    <Sparkles className="w-3 h-3" />
                    <span>RECOMENDADO</span>
                    <Sparkles className="w-3 h-3" />
                  </div>
                )}

                {/* Plan Name */}
                <h3 className="text-sm font-bold text-white">{plan.name}</h3>

                {/* Price */}
                <div className="mt-3 flex items-baseline gap-1">
                  {isGratis ? (
                    <span className="text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] text-white">
                      Siempre gratis
                    </span>
                  ) : (
                    <span className="text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] text-white">
                      A convenir
                    </span>
                  )}
                </div>

                {/* Note for Gratis */}
                {isGratis && (
                  <p className="mt-1 text-[11px] text-white/30">
                    Sin tarjeta · Sin fecha de expiración
                  </p>
                )}

                {/* Description */}
                {!isGratis && (
                  <p className="mt-1 text-[11px] text-white/40">{plan.desc}</p>
                )}

                {/* Features */}
                <ul className="mt-5 space-y-2.5">
                  {plan.features.map((feat) => (
                    <li key={feat} className="flex items-start gap-2 text-xs text-white/60">
                      <Check className="w-3.5 h-3.5 text-[#22c55e] shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA Button */}
                {plan.ctaType === 'signup' ? (
                  <button
                    onClick={onSignup}
                    className="mt-6 w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-gradient-to-r from-[#22c55e] to-emerald-400 text-white hover:from-[#16a34a] hover:to-emerald-500 shadow-lg shadow-[#22c55e]/20 transition-all duration-300"
                  >
                    {plan.cta}
                  </button>
                ) : (
                  <>
                    <a
                      href="https://wa.me/5353183215"
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`mt-6 w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 inline-flex items-center justify-center gap-2 ${
                        isMultitienda
                          ? 'border-2 border-amber-400/40 text-amber-300 hover:bg-amber-400/10 hover:border-amber-400/60'
                          : 'border border-white/10 text-white hover:bg-white/[0.08]'
                      } bg-transparent`}
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      {plan.cta}
                    </a>
                    <p className="mt-2 text-[10px] text-white/30 text-center">
                      Respondemos en menos de 24h · Lunes a sábado
                    </p>
                  </>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Bottom CTA for unsure users */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={pricingInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="mt-8 text-center"
        >
          <p className="text-sm text-white/50">
            ¿No sabes qué plan necesitas?{' '}
            <a
              href="https://wa.me/5353183215"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#22c55e] hover:text-[#22c55e]/80 underline underline-offset-2 transition-colors"
            >
              Cuéntanos cómo es tu negocio
            </a>
          </p>
        </motion.div>
      </div>

      {/* Pricing Comparison Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={pricingInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6 }}
        className="mt-10"
      >
        <div className="max-w-4xl mx-auto w-full">
          <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
            <table className="w-full text-[10px] sm:text-[11px]">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left py-2.5 px-3 text-white/50 font-medium">Función</th>
                  <th className="py-2.5 px-2 text-white/40 font-medium text-center">Gratis</th>
                  <th className="py-2.5 px-2 text-[#22c55e] font-bold text-center bg-[#22c55e]/[0.06]">Fichas Pro ✓</th>
                  <th className="py-2.5 px-2 text-white/40 font-medium text-center">Multitienda</th>
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
