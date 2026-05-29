'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { fadeUp } from './animations';
import { features, integrationPartners } from './data';

interface FeaturesSectionProps {
  featuresInView: boolean;
  featuresRef: React.RefObject<HTMLDivElement | null>;
}

export default function FeaturesSection({
  featuresInView,
  featuresRef,
}: FeaturesSectionProps) {
  return (
    <>
      {/* ── FEATURES SECTION ── */}
      <div ref={featuresRef} id="features">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={featuresInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="mb-8"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center">
            Todo lo que necesitas para saber cuánto te cuesta y cuánto te queda
          </h2>
          <p className="text-sm text-white/50 text-center mt-2 max-w-xl mx-auto">
            CostPro calcula cada componente de tu ficha de costo según la norma oficial — con tus datos reales, no con estimaciones.
          </p>
        </motion.div>

        {/* Feature Cards Grid */}
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
            </motion.div>
          ))}
        </div>
      </div>

      {/* Integration Partners */}
      <div className="mt-12 max-w-2xl mx-auto w-full">
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
