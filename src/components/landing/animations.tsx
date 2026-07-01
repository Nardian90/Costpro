'use client';

import { motion } from 'framer-motion';
import { Star } from 'lucide-react';

/* ── Animation Variants ── */
export const fadeInLeft = (delay = 0) => ({
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: { delay, duration: 0.5, ease: 'easeOut' as any } },
});

export const scaleUp = (delay = 0) => ({
  hidden: { opacity: 0, scale: 0.9 },
  visible: { opacity: 1, scale: 1, transition: { delay, duration: 0.4, ease: 'easeOut' as any } },
});

export const slideInLeft = {
  hidden: { opacity: 0, x: -24 },
  visible: (i: number) => ({
    opacity: 1, x: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as any },
  }),
};

export const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as any },
  }),
};

export const fadeIn = (delay = 0) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delay, duration: 0.6 } },
});

export const slideRight = (delay = 0) => ({
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { delay, duration: 0.5, ease: 'easeOut' as any } },
});

/* ── Confetti Burst Component ── */
export function ConfettiBurst({ active }: { active: boolean }) {
  if (!active) return null;
  const particles = Array.from({ length: 12 });
  const colors = ['#22c55e', '#10b981', '#fbbf24', '#f59e0b', '#34d399', '#6ee7b7'];
  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
      {particles.map((_, i) => {
        const angle = (i / 12) * 360;
        const rad = (angle * Math.PI) / 180;
        const x = Math.cos(rad) * (60 + Math.random() * 40);
        const y = Math.sin(rad) * (60 + Math.random() * 40) - 20;
        const color = colors[i % colors.length];
        const size = 4 + Math.random() * 4;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
            animate={{ opacity: 0, x, y, scale: 0, rotate: Math.random() * 720 }}
            transition={{ duration: 0.8 + Math.random() * 0.4, ease: 'easeOut' }}
            className="absolute rounded-sm"
            style={{
              width: size,
              height: size,
              backgroundColor: color,
              left: '50%',
              top: '50%',
            }}
          />
        );
      })}
    </div>
  );
}

/* ── Star Rating Component ── */
export function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'gold-star-shimmer fill-current' : 'star-empty'}`}
        />
      ))}
    </div>
  );
}

/* ── Avatar Initials ── */
export function AvatarInitials({ name }: { name: string }) {
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2);
  const colors = ['bg-emerald-500/20 text-emerald-400', 'bg-blue-500/20 text-blue-400', 'bg-amber-500/20 text-amber-400'];
  const colorIndex = name.charCodeAt(0) % colors.length;
  return (
    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${colors[colorIndex]} shrink-0`}>
      {initials}
    </div>
  );
}

/* ── Section Divider ── */
export function SectionDivider() {
  return (
    <div className="flex items-center justify-center py-6 max-w-2xl">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/10" />
      <div className="w-1.5 h-1.5 rotate-45 bg-white/20 mx-4 shrink-0" />
      <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/10" />
    </div>
  );
}
