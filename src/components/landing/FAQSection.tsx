'use client';

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ThumbsUp, ThumbsDown, Search, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { faqItems, faqIcons, faqCategories } from './data';

export interface FAQSectionProps {
  faqInViewState: boolean;
  openFaq: number | null;
  toggleFaq: (index: number) => void;
  faqFeedback: Record<number, 'up' | 'down' | null>;
  setFaqFeedback: React.Dispatch<React.SetStateAction<Record<number, 'up' | 'down' | null>>>;
  faqRef: React.RefObject<HTMLDivElement | null>;
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;

  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-[#22c55e]/25 text-[#22c55e] rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function FAQSection({
  faqInViewState,
  openFaq,
  toggleFaq,
  faqFeedback,
  setFaqFeedback,
  faqRef,
}: FAQSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('General');

  const categoryLabels: Record<string, { emoji: string }> = {
    General: { emoji: '💡' },
    Precios: { emoji: '💰' },
    Técnico: { emoji: '🛠️' },
  };

  // Compute category counts dynamically
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    faqItems.forEach((item) => {
      counts[item.category] = (counts[item.category] || 0) + 1;
    });
    return counts;
  }, []);

  const filteredFaqs = useMemo(() => {
    let items = faqItems.map((item, i) => ({ ...item, originalIndex: i }));
    // Filter by category first
    if (activeCategory) {
      items = items.filter((item) => item.category === activeCategory);
    }
    // Then filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((item) => item.q.toLowerCase().includes(q) || item.a.toLowerCase().includes(q));
    }
    return items;
  }, [searchQuery, activeCategory]);

  return (
    <div ref={faqRef} id="faq">
      <motion.div className="max-w-2xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={faqInViewState ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          <h2 className="text-xl sm:text-2xl font-bold text-white text-center font-[family-name:var(--font-space-grotesk)] mb-6 section-heading-accent">
            Preguntas frecuentes
          </h2>

          {/* FAQ Category Tabs */}
          <div className="flex items-center gap-1 mb-6 relative">
            {faqCategories.map((cat) => {
              const isActive = activeCategory === cat;
              const count = categoryCounts[cat] || 0;
              return (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all duration-200 min-h-[44px] ${
                    isActive
                      ? 'text-[#22c55e] bg-[#22c55e]/10'
                      : 'text-white/50 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  <span>{categoryLabels[cat]?.emoji}</span>
                  <span>{cat}</span>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    isActive ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'bg-white/[0.06] text-white/30'
                  }`}>{count}</span>
                  {isActive && (
                    <motion.div
                      layoutId="faq-tab-indicator"
                      className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#22c55e] rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 35 }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={faqInViewState ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="relative mb-4"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              placeholder="Buscar en preguntas frecuentes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm text-white placeholder:text-white/25 focus:outline-none focus:border-[#22c55e]/40 focus:ring-2 focus:ring-[#22c55e]/15 transition-all duration-300 glass-input"
              aria-label="Buscar en preguntas frecuentes"
            />
          </motion.div>

          {/* Results counter */}
          <AnimatePresence>
            {(searchQuery.trim() || activeCategory !== 'General') && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.2 }}
                className="text-[10px] text-white/30 mb-3 px-1"
              >
                {filteredFaqs.length} de {faqItems.length} resultados
                {activeCategory !== 'General' && <span> en {activeCategory}</span>}
              </motion.p>
            )}
          </AnimatePresence>

          {/* FAQ Items */}
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredFaqs.map((item) => {
                const i = item.originalIndex;
                const FaqIcon = faqIcons[i] || HelpCircle;
                return (
                  <motion.div
                    key={`${activeCategory}-${i}`}
                    layout
                    initial={{ opacity: 0, y: 10, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.3, ease: 'easeOut' }}
                    className={`faq-item rounded-xl border overflow-hidden backdrop-blur-sm transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${
                      openFaq === i
                        ? 'border-l-[3px] border-l-[#22c55e] border-t-white/[0.08] border-r-white/[0.08] border-b-white/[0.08] bg-white/[0.06] shadow-[0_0_24px_rgba(34,197,94,0.1)] faq-open-glow'
                        : 'border-l-[3px] border-l-transparent border-white/[0.06] bg-white/[0.03] hover:border-l-[#22c55e]/40 hover:border-t-[#22c55e]/15 hover:border-r-[#22c55e]/15 hover:border-b-[#22c55e]/15 hover:bg-white/[0.05] hover:shadow-[0_2px_16px_rgba(34,197,94,0.06)]'
                    }`}
                  >
                    <button
                      onClick={() => toggleFaq(i)}
                      className="flex items-center justify-between w-full p-4 text-left gap-3 group/faq"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-mono font-bold shrink-0 transition-all duration-500 ${
                          openFaq === i
                            ? 'bg-[#22c55e]/20 text-[#22c55e] faq-number-pulse ring-2 ring-[#22c55e]/20 faq-number-expanded faq-number-ping'
                            : 'bg-[#22c55e]/10 text-[#22c55e]/70 group-hover/faq:bg-[#22c55e]/15'
                        }`}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span className={`text-sm font-semibold transition-colors duration-300 pr-2 ${
                          openFaq === i ? 'text-white' : 'text-white/90 group-hover/faq:text-white'
                        }`}>
                          <HighlightedText text={item.q} query={searchQuery} />
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <FaqIcon className={`w-4 h-4 transition-colors duration-300 ${openFaq === i ? 'text-[#22c55e]/40' : 'text-white/20'}`} />
                        <ChevronDown className={`w-4 h-4 text-[#22c55e] transition-transform duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${openFaq === i ? 'rotate-180' : ''}`} />
                      </div>
                    </button>
                    <AnimatePresence mode="wait">
                      {openFaq === i && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] as any }}
                          className="overflow-hidden"
                        >
                          <div className="border-l border-[#22c55e]/15 ml-7 pl-3 mb-2" />
                          <motion.p
                            initial={{ opacity: 0, x: -12 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
                            className="px-4 pb-3 pl-14 text-xs text-white/50 leading-relaxed"
                          >
                            <HighlightedText text={item.a} query={searchQuery} />
                          </motion.p>
                          <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: 0.2 }}
                            className="px-4 pb-4 pl-14 flex items-center gap-3 mt-1"
                          >
                            <span className="text-[10px] text-white/30">¿Te fue útil?</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); setFaqFeedback(prev => ({ ...prev, [i]: prev[i] === 'up' ? null : 'up' })); if (!faqFeedback[i]) toast.success('¡Gracias por tu feedback!'); }}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 thumb-bounce ${faqFeedback[i] === 'up' ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'text-white/30 hover:text-[#22c55e]/60 hover:bg-white/[0.04]'}`}
                              aria-label="Útil"
                            >
                              <ThumbsUp className="w-3 h-3" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setFaqFeedback(prev => ({ ...prev, [i]: prev[i] === 'down' ? null : 'down' })); if (!faqFeedback[i]) toast.success('¡Gracias por tu feedback!'); }}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 thumb-bounce ${faqFeedback[i] === 'down' ? 'bg-red-500/15 text-red-400' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'}`}
                              aria-label="No útil"
                            >
                              <ThumbsDown className="w-3 h-3" />
                            </button>
                          </motion.div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {/* No results state */}
            <AnimatePresence>
              {(searchQuery.trim() || activeCategory !== 'General') && filteredFaqs.length === 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="py-8 text-center"
                >
                  <HelpCircle className="w-8 h-8 text-white/15 mx-auto mb-2" />
                  <p className="text-sm text-white/30">No se encontraron resultados para &quot;{searchQuery}&quot;</p>
                  <p className="text-[11px] text-white/20 mt-1">Intenta con otros términos de búsqueda</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
