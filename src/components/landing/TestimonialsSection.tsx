'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Share2, Link, MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { slideRight, StarRating, AvatarInitials } from './animations';
import { testimonials } from './data';

export interface TestimonialsSectionProps {
  testimonialsInView: boolean;
  currentTestimonial: number;
  setCurrentTestimonial: (v: number) => void;
  testimonialProgress: number;
  setTestimonialProgress: (v: number) => void;
  testimonialTilt: { x: number; y: number };
  setTestimonialTilt: (v: { x: number; y: number }) => void;
  testimonialsRef: React.RefObject<HTMLDivElement | null>;
}

export default function TestimonialsSection({
  testimonialsInView,
  currentTestimonial,
  setCurrentTestimonial,
  testimonialProgress,
  setTestimonialProgress,
  testimonialTilt,
  setTestimonialTilt,
  testimonialsRef,
}: TestimonialsSectionProps) {
  const handleCopyLink = (testimonialIndex: number) => {
    const fakeUrl = `https://costpro.io/testimonios/${testimonialIndex + 1}`;
    navigator.clipboard.writeText(fakeUrl).then(() => {
      toast.success('Enlace copiado');
    }).catch(() => {
      toast.success('Enlace copiado');
    });
  };

  const handleShareTwitter = () => {
    const text = encodeURIComponent(`"${testimonials[currentTestimonial].text}" — ${testimonials[currentTestimonial].name}, ${testimonials[currentTestimonial].role}`);
    window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareLinkedIn = () => {
    const text = encodeURIComponent(testimonials[currentTestimonial].text);
    window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent('https://costpro.onrender.com')}&summary=${text}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <motion.div
      ref={testimonialsRef}
      id="testimonials-section"
      variants={slideRight(0.2)}
      initial="hidden"
      animate={testimonialsInView ? "visible" : "hidden"}
      className="mt-6 max-w-2xl mx-auto w-full"
    >
      <div
        className="testimonial-card-animated bg-gradient-to-br from-white/[0.06] via-white/[0.04] to-white/[0.02] backdrop-blur-sm border border-white/[0.08] rounded-xl p-5 border-l-[3px] border-l-[#22c55e]/60 testimonial-card-hover testimonial-3d"
        style={{ backgroundSize: '400% 400%', transform: `perspective(800px) rotateY(${testimonialTilt.x}deg) rotateX(${testimonialTilt.y}deg)`, transition: 'transform 0.15s ease-out' }}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          setTestimonialTilt({ x: x * 4, y: -y * 4 });
        }}
        onMouseLeave={() => setTestimonialTilt({ x: 0, y: 0 })}
      >
        {/* Decorative Testimonial Quote Mark */}
        <span className="testimonial-quote" aria-hidden="true">&ldquo;</span>

        {/* Progress bar */}
        <div className="w-full h-0.5 rounded-full bg-white/[0.06] mb-4 overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-[#22c55e] to-[#10b981] rounded-full"
            initial={{ width: '0%' }}
            animate={{ width: `${testimonialProgress}%` }}
            transition={{ duration: 0.1, ease: 'linear' }}
          />
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={currentTestimonial}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: 'easeInOut' }}
          >
            <motion.span className="text-5xl text-[#22c55e]/80 leading-none font-serif select-none quote-breathe" aria-hidden="true">&ldquo;</motion.span>
            <div className="flex items-center gap-3 mb-3">
              <AvatarInitials name={testimonials[currentTestimonial].name} />
              <div className="flex items-center gap-2">
                <div>
                  <p className="text-sm font-semibold text-white">{testimonials[currentTestimonial].name}</p>
                  <p className="text-xs text-white/40">{testimonials[currentTestimonial].role}</p>
                </div>
                <span className="verified-badge verified-badge-pulse" title="Verificado">
                  <Check className="w-3 h-3" strokeWidth={3} />
                  <span>Verificado</span>
                </span>
              </div>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              {testimonials[currentTestimonial].text}
            </p>
            <div className="mt-3">
              <StarRating rating={testimonials[currentTestimonial].rating} />
            </div>

            {/* Share on Social Buttons */}
            <div className="flex items-center gap-2 mt-3">
              <span className="text-[10px] text-white/25 mr-1">Compartir</span>
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleShareTwitter}
                className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-[#1DA1F2] hover:border-[#1DA1F2]/30 hover:bg-[#1DA1F2]/10 transition-all duration-200"
                aria-label="Compartir en Twitter"
              >
                <Share2 className="w-3 h-3" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleShareLinkedIn}
                className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-[#0A66C2] hover:border-[#0A66C2]/30 hover:bg-[#0A66C2]/10 transition-all duration-200"
                aria-label="Compartir en LinkedIn"
              >
                <MessageCircle className="w-3 h-3" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.15 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => handleCopyLink(currentTestimonial)}
                className="w-6 h-6 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-white/30 hover:text-[#22c55e] hover:border-[#22c55e]/30 hover:bg-[#22c55e]/10 transition-all duration-200"
                aria-label="Copiar enlace"
              >
                <Link className="w-3 h-3" />
              </motion.button>
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-[9px] text-white/20 text-center mt-2 italic">
          Testimonios basados en experiencias reales de usuarios de CostPro
        </p>

        {/* Enhanced Pagination Dots */}
        <div className="flex items-center justify-center gap-3 mt-4">
          {testimonials.map((_, i) => (
            <button
              key={i}
              onClick={() => { setCurrentTestimonial(i); setTestimonialProgress(0); }}
              className={`relative h-2 rounded-full transition-all duration-500 min-h-[44px] min-w-[44px] flex items-center justify-center`}
              aria-label={`Testimonial ${i + 1}`}
            >
              <span className={`block rounded-full transition-all duration-500 ${
                i === currentTestimonial
                  ? 'w-8 h-2 bg-[#22c55e] shadow-lg shadow-[#22c55e]/40'
                  : 'w-2 h-2 bg-white/20 hover:bg-white/40 hover:w-3'
              }`} />
              {i === currentTestimonial && (
                <motion.div
                  layoutId="testimonial-glow"
                  className="absolute inset-0 rounded-full bg-[#22c55e]/30"
                  transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
        {/* Swipe indicator - visible on mobile only */}
        <div className="flex items-center justify-center gap-2 mt-2 sm:hidden">
          <motion.div
            animate={{ x: [-4, 4, -4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            className="flex items-center gap-2"
          >
            <span className="text-[9px] text-white/25">← Desliza para navegar →</span>
          </motion.div>
        </div>

      </div>
    </motion.div>
  );
}
