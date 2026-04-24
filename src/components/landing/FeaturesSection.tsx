'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Eye } from 'lucide-react';
import { fadeUp } from './animations';
import { features, integrationPartners } from './data';

export interface FeaturesSectionProps {
  featuresInView: boolean;
  featuresRef: React.RefObject<HTMLDivElement | null>;
  setShowDemoModal: (v: boolean) => void;
}

export default function FeaturesSection({
  featuresInView,
  featuresRef,
  setShowDemoModal,
}: FeaturesSectionProps) {
  return (
    <>
      {/* ── FEATURES SECTION ── */}
      <div ref={featuresRef} id="features">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto w-full">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="group p-5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-[#22c55e]/20 transition-all duration-300"
            >
              <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center mb-3">
                <feature.icon className="w-5 h-5 text-[#22c55e]" />
              </div>
              <h3 className="text-sm font-semibold text-white/90 mb-1">{feature.title}</h3>
              <p className="text-xs text-white/40 leading-relaxed">{feature.desc}</p>
              <button
                onClick={() => {
                  const el = document.querySelector('[aria-label="Ver demo de CostPro"]');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.06] text-[10px] font-medium text-white/40 hover:text-[#22c55e] hover:bg-[#22c55e]/10 hover:border-[#22c55e]/20 transition-all duration-200"
              >
                <Eye className="w-3 h-3" />
                <span>Vista rápida</span>
              </button>
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


    </>
  );
}
