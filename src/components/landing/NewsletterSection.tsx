'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, ExternalLink } from 'lucide-react';

export interface NewsletterSectionProps {
  newsletterInView: boolean;
}

const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/DgXS8OFmT9bCJKFQg8BOHm';

export default function NewsletterSection({
  newsletterInView,
}: NewsletterSectionProps) {
  return (
    <div id="newsletter-section" className="relative rounded-xl p-5 bg-gradient-to-br from-[#22c55e]/10 via-[#10b981]/8 to-teal-500/10 border border-[#22c55e]/15 overflow-hidden max-w-2xl mx-auto w-full">
      <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-emerald-500/20 via-green-500/10 to-emerald-500/20 -z-10 blur-sm" />

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col sm:flex-row items-center gap-4"
      >
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <h3 className="text-sm font-bold text-white flex items-center gap-2 justify-center sm:justify-start">
            <MessageCircle className="w-4 h-4 text-[#22c55e]" />
            Únete a nuestra comunidad en WhatsApp
          </h3>
          <p className="text-[11px] text-white/40 mt-1.5">Recibe novedades, tips de gestión y soporte directo.</p>
        </div>
        <a
          href={WHATSAPP_GROUP_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 hover:shadow-[#22c55e]/40 transition-all shrink-0 newsletter-btn-glow newsletter-glow-ring group min-h-[44px]"
        >
          <MessageCircle className="w-4 h-4 group-hover:scale-110 transition-transform" />
          Unirme al grupo
          <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
        </a>
      </motion.div>

      <p className="text-[9px] text-white/25 mt-2 text-center sm:text-left">Grupo gratuito · Respuesta rápida · Sin spam.</p>
    </div>
  );
}
