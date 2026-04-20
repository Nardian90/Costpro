'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Eye } from 'lucide-react';
import { fadeUp } from './animations';
import { features, featureTooltips, integrationPartners } from './data';

export interface FeaturesSectionProps {
  featuresInView: boolean;
  expandedTooltip: number | null;
  setExpandedTooltip: (v: number | null) => void;
  featuresRef: React.RefObject<HTMLDivElement | null>;
  setShowDemoModal: (v: boolean) => void;
}

function FeaturePreviewPopover({
  feature,
  index,
  onClose,
}: {
  feature: typeof features[number];
  index: number;
  onClose: () => void;
}) {
  const tipBullets = feature.tip.split('.').filter(Boolean).map((s) => s.trim());

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -6, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -6, scale: 0.95 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="absolute left-0 right-0 top-full mt-2 z-40 mx-2"
      >
        <div className="relative rounded-xl bg-[#111827]/95 backdrop-blur-xl border border-white/[0.12] shadow-xl shadow-black/40 p-4">
          {/* Arrow pointing up */}
          <div className="absolute -top-1.5 left-6 w-3 h-3 rotate-45 bg-[#111827]/95 border-l border-t border-white/[0.12]" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-6 h-6 rounded-md bg-[#22c55e]/15 flex items-center justify-center">
              <feature.icon className="w-3.5 h-3.5 text-[#22c55e]" />
            </div>
            <span className="text-xs font-bold text-white/90">{feature.title}</span>
          </div>
          <ul className="space-y-1.5">
            {tipBullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-white/60 leading-relaxed">
                <span className="w-1 h-1 rounded-full bg-[#22c55e] mt-1.5 shrink-0" />
                <span>{bullet.endsWith('.') ? bullet : bullet + '.'}</span>
              </li>
            ))}
          </ul>
        </div>
      </motion.div>
    </>
  );
}

export default function FeaturesSection({
  featuresInView,
  expandedTooltip,
  setExpandedTooltip,
  featuresRef,
  setShowDemoModal,
}: FeaturesSectionProps) {
  const [previewFeature, setPreviewFeature] = useState<number | null>(null);

  return (
    <>
      {/* ── FEATURES SECTION ── */}
      <div ref={featuresRef} id="features">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto w-full">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className={`group relative flex items-start gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/20 hover:shadow-[0_0_20px_rgba(34,197,94,0.08)] hover:scale-[1.02] tilt-card transition-all duration-300 feature-card-underline feature-accent-hover feature-accent-${i} feature-card-shine hover-lift-shadow card-spotlight`}
            >
              {/* Number badge top-right */}
              <span className="absolute top-2 right-3 text-[10px] font-mono font-bold text-white/15 select-none pointer-events-none">
                {String(i + 1).padStart(2, '0')}
              </span>
              {/* "?" tooltip toggle button for mobile */}
              <button
                onClick={() => setExpandedTooltip(expandedTooltip === i ? null : i)}
                className={`absolute top-2 right-9 w-4 h-4 rounded-full flex items-center justify-center transition-all duration-200 z-10 ${
                  expandedTooltip === i
                    ? 'bg-[#22c55e] text-white'
                    : 'bg-white/[0.08] text-white/30 hover:bg-[#22c55e]/20 hover:text-[#22c55e]/60'
                }`}
                aria-label="Más información"
              >
                <span className="text-[9px] font-bold leading-none">?</span>
              </button>
              {/* Tooltip info - ABOVE card (hover + click toggle) */}
              <div className={`absolute -top-12 left-1/2 -translate-x-1/2 z-20 pointer-events-none transition-all duration-200 delay-100 ${
                expandedTooltip === i ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
              }`}>
                <div className="w-56 px-3 py-2 rounded-lg bg-[#111827]/95 backdrop-blur-xl border border-white/15 text-[11px] text-white/80 leading-relaxed shadow-xl shadow-black/30 glass-tooltip">
                  {featureTooltips[feature.title] || ''}
                </div>
                {/* Arrow pointing down */}
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#111827]/95 border-r border-b border-white/15" />
              </div>
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 feature-icon-rotate animate-glow-pulse-subtle feature-icon-float ${i % 2 === 0 ? 'bg-[#22c55e]/10' : 'bg-[#14b8a6]/10'} group-hover:bg-[#22c55e]/20`} style={{ '--float-delay': `${i * 0.2}s` } as React.CSSProperties}>
                <feature.icon className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-white/90 mb-0.5 slide-in-underline">{feature.title}</h3>
                <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{feature.desc}</p>
                {/* Quick Preview Button */}
                <button
                  onClick={() => setPreviewFeature(previewFeature === i ? null : i)}
                  className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.08] text-[9px] font-semibold text-white/40 hover:text-[#22c55e] hover:bg-[#22c55e]/10 hover:border-[#22c55e]/20 transition-all duration-200 group/btn"
                  aria-label={`Vista rápida de ${feature.title}`}
                >
                  <Eye className="w-2.5 h-2.5" />
                  <span>Vista rápida</span>
                </button>
                {/* Quick Preview Popover */}
                <AnimatePresence>
                  {previewFeature === i && (
                    <FeaturePreviewPopover
                      feature={feature}
                      index={i}
                      onClose={() => setPreviewFeature(null)}
                    />
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Integration Partners */}
      <div className="mt-12 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={featuresInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-center mb-4"
        >
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={featuresInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-[11px] uppercase tracking-[0.15em] font-semibold text-white/25"
          >
            Integraciones disponibles
          </motion.p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={featuresInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-wrap items-center justify-center gap-3"
        >
          {integrationPartners.map((partner) => (
            <motion.div
              key={partner.name}
              whileHover={{ scale: 1.1, y: -2 }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] hover:border-[#22c55e]/30 hover:bg-white/[0.08] transition-all duration-300 cursor-default"
            >
              <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center text-[9px] font-bold text-[#22c55e]">
                {partner.letter}
              </div>
              <span className="text-[10px] font-medium text-white/40">{partner.name}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── INTERACTIVE VIDEO DEMO PLACEHOLDER ── */}
      <div className="mt-8 max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <button
            onClick={() => setShowDemoModal(true)}
            className="group relative w-full aspect-video rounded-xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-[#0a1628] via-[#0d2137] to-[#0a0f1a] cursor-pointer transition-all duration-300 hover:border-[#22c55e]/30 hover:shadow-[0_0_40px_rgba(34,197,94,0.1)]"
            aria-label="Ver demo de CostPro"
          >
            {/* Play button with pulsing icon */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative">
                <motion.div
                  animate={{ scale: [1, 1.4, 1], opacity: [0.4, 0, 0.4] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="absolute inset-0 rounded-full bg-[#22c55e]/30"
                />
                <motion.div
                  animate={{ scale: [1, 1.2, 1], opacity: [0.2, 0, 0.2] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                  className="absolute -inset-2 rounded-full bg-[#22c55e]/15"
                />
                <div className="relative w-16 h-16 rounded-full bg-[#22c55e]/20 border-2 border-[#22c55e]/40 flex items-center justify-center group-hover:bg-[#22c55e]/30 group-hover:scale-110 group-hover:border-[#22c55e]/60 transition-all duration-300">
                  <motion.div
                    animate={{ x: [0, 2, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Play className="w-6 h-6 text-[#22c55e] ml-0.5" fill="currentColor" />
                  </motion.div>
                </div>
              </div>
            </div>
            {/* Duration badge */}
            <div className="absolute bottom-3 left-3 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm text-[10px] text-white/70 font-medium">
              2:00
            </div>
          </button>
          <p className="mt-2.5 text-center text-xs text-white/40">
            Mira cómo CostPro transforma tu negocio en 2 minutos
          </p>
        </motion.div>
      </div>
    </>
  );
}
