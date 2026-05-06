'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  CheckCircle2, Lock, Headphones, Globe, X, Cookie, Sparkles,
} from 'lucide-react';

// ── Shared data, animations, hooks ──
import { statsData, clientLogos, integrationPartners, sectionIds, sectionLabels, differentiatorsData, diffProgressBars } from '@/components/landing/data';
import SectionDivider from '@/components/landing/SectionDivider';
import { useAnimatedCounter, useCookieConsent, usePromoBanner, useTestimonialRotation } from '@/components/landing/hooks';

// ── Extracted components ──
import HeroSection from '@/components/landing/HeroSection';
import FeaturesSection from '@/components/landing/FeaturesSection';
import HowItWorksSection from '@/components/landing/HowItWorksSection';
import TestimonialsSection from '@/components/landing/TestimonialsSection';
import PricingSection from '@/components/landing/PricingSection';
import FAQSection from '@/components/landing/FAQSection';
import NewsletterSection from '@/components/landing/NewsletterSection';
import FooterSection from '@/components/landing/FooterSection';
import type { FooterLinkId } from '@/components/landing/FooterSection';
import FooterModals from '@/components/landing/FooterModals';
import FloatingElements from '@/components/landing/FloatingElements';
import {
  ShortcutsModal, DemoModal, ContactModal, WhatsNewModal, LoginModal,
} from '@/components/landing/Modals';
import CommandPalette from '@/components/landing/CommandPalette';
import InteractiveDemo from '@/components/landing/demo/InteractiveDemo';

/* ── Landing / Login Split Screen ── */
export default function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  // ── Extracted hooks (3.2) ──
  const { showCookieBanner, handleAcceptCookies, handleRejectCookies, handleReopenCookieSettings } = useCookieConsent();
  const { showPromo, handleDismissPromo } = usePromoBanner();
  const { currentTestimonial, setCurrentTestimonial, testimonialProgress, setTestimonialProgress } = useTestimonialRotation(3);

  const [statsVisible, setStatsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');

  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', phone: '', message: '' });
  const [howItWorksInView, setHowItWorksInView] = useState(false);
  const [pricingInView, setPricingInView] = useState(false);
  const [faqInViewState, setFaqInViewState] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginDefaultTab, setLoginDefaultTab] = useState<'login' | 'register'>('login');
  const [mouseGlowPos, setMouseGlowPos] = useState({ x: 0, y: 0 });
  const [differentiatorsInView, setDifferentiatorsInView] = useState(false);
  const [diffStats, setDiffStats] = useState([0, 0, 0, 0]);
  const [socialProofVisible, setSocialProofVisible] = useState(false);
  const [socialProofIndex, setSocialProofIndex] = useState(0);
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showChangelogPopover, setShowChangelogPopover] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [showFab, setShowFab] = useState(false);
  const [faqFeedback, setFaqFeedback] = useState<Record<number, 'up' | 'down' | null>>({});
  const [animatedStatsVisible, setAnimatedStatsVisible] = useState(false);

  const [testimonialTilt, setTestimonialTilt] = useState({ x: 0, y: 0 });
  const [showConfetti, setShowConfetti] = useState(false);
  const [shortcutsSearch, setShortcutsSearch] = useState('');
  const [heroInView, setHeroInView] = useState(false);
  const [featuresInView, setFeaturesInView] = useState(false);
  const [testimonialsInView, setTestimonialsInView] = useState(false);
  const [footerInView, setFooterInView] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [demoSlideIndex, setDemoSlideIndex] = useState(0);
  const [showBackToFeatures, setShowBackToFeatures] = useState(false);
  const [sectionProgress, setSectionProgress] = useState(0);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [showCommandPalette, setShowCommandPalette] = useState(false);
  const [newsletterInView, setNewsletterInView] = useState(false);
  const [activeFooterModal, setActiveFooterModal] = useState<FooterLinkId | null>(null);

  const stat1 = useAnimatedCounter(statsData[0].value, 2000);
  const stat2 = useAnimatedCounter(statsData[1].value, 1800);
  const stat3 = useAnimatedCounter(statsData[2].value, 2200);

  // Footer animated stats counters
  const footerStat1 = useAnimatedCounter(2, 1500);
  const footerStat2 = useAnimatedCounter(10, 2000);
  const footerStat3 = useAnimatedCounter(2, 1200);
  const footerStat4 = useAnimatedCounter(99.9, 2500);

  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const differentiatorsRef = useRef<HTMLDivElement>(null);
  const animatedStatsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const testimonialsRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLElement>(null);

  const sectionRefs = [heroRef, featuresRef, howItWorksRef, pricingRef, faqRef];

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // Listen for footer modal requests from LoginForm
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent;
      if (ce.detail) setActiveFooterModal(ce.detail as FooterLinkId);
    };
    window.addEventListener('open-footer-modal', handler);
    return () => window.removeEventListener('open-footer-modal', handler);
  }, []);

  // Cursor blink (after splash)
  const [cursorVisible, setCursorVisible] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => queueMicrotask(() => setCursorVisible(true)), 500);
    return () => clearTimeout(timer);
  }, []);

  // Mouse follower glow effect
  useEffect(() => {
    const panel = leftPanelRef.current;
    if (!panel) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        const rect = panel.getBoundingClientRect();
        setMouseGlowPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        rafRef.current = 0;
      });
    };
    panel.addEventListener('mousemove', handleMouseMove);
    return () => {
      panel.removeEventListener('mousemove', handleMouseMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Smooth scroll to top helper
  const smoothScrollToTop = useCallback(() => {
    const el = document.documentElement;
    const start = el.scrollTop;
    if (start === 0) return;
    const duration = 500;
    const startTime = performance.now();
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.scrollTop = start * (1 - eased);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // Scroll-to-top visibility + progress bar + stats + section reveals
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > window.innerHeight * 0.1);
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? (window.scrollY / docHeight) * 100 : 0;
      setScrollProgress(progress);

      const statsEl = document.getElementById('stats-section');
      if (statsEl) {
        const rect = statsEl.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.8 && !statsVisible) {
          setStatsVisible(true);
          stat1.start();
          stat2.start();
          stat3.start();
        }
      }

      const animStatsEl = document.getElementById('animated-stats-trigger');
      if (animStatsEl) {
        const r = animStatsEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85) setAnimatedStatsVisible(true);
      }

      const diffEl = document.getElementById('differentiators-section');
      if (diffEl) {
        const r = diffEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85) setDifferentiatorsInView(true);
      }

      const testEl = document.getElementById('testimonials-section');
      if (testEl) {
        const r = testEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85) setTestimonialsInView(true);
      }

      const faqEl = document.getElementById('faq');
      if (faqEl) {
        const r = faqEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85) setFaqInViewState(true);
      }

      const pricingEl = document.getElementById('pricing-section');
      if (pricingEl) {
        const r = pricingEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85) setPricingInView(true);
      }

      const featuresEl = document.getElementById('features');
      if (featuresEl) {
        const r = featuresEl.getBoundingClientRect();
        setShowBackToFeatures(r.bottom < 0);
      }

      const footerEl = document.getElementById('footer-section');
      if (footerEl) {
        const r = footerEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.9) setFooterInView(true);
      }

      const newsletterEl = document.getElementById('newsletter-section');
      if (newsletterEl) {
        const r = newsletterEl.getBoundingClientRect();
        if (r.top < window.innerHeight * 0.85) setNewsletterInView(true);
      }

      const numSections = sectionIds.length;
      let totalProgress = 0;
      for (let i = 0; i < numSections; i++) {
        const el = document.getElementById(sectionIds[i]);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top + rect.height <= 0) {
          totalProgress = i + 1;
        } else if (rect.top < window.innerHeight * 0.5) {
          const visibleRatio = Math.min(1, Math.max(0, (window.innerHeight * 0.5 - rect.top) / rect.height));
          totalProgress = i + visibleRatio;
          break;
        } else {
          totalProgress = i;
          break;
        }
      }
      setSectionProgress(totalProgress);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [statsVisible, stat1.start, stat2.start, stat3.start]);

  // IntersectionObserver for section navigation dots
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    sectionRefs.forEach((ref, idx) => {
      if (!ref.current) return;
      const observer = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActiveSection(idx); },
        { threshold: 0.3 },
      );
      observer.observe(ref.current);
      observers.push(observer);
    });
    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  const triggeredSections = useRef<Set<string>>(new Set());

  useEffect(() => {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const target = entry.target;
          const sectionMap: Array<[HTMLElement | null, string, () => void]> = [
            [heroRef.current, 'hero', () => setHeroInView(true)],
            [featuresRef.current, 'features', () => setFeaturesInView(true)],
            [howItWorksRef.current, 'howItWorks', () => setHowItWorksInView(true)],
            [pricingRef.current, 'pricing', () => setPricingInView(true)],
            [faqRef.current, 'faq', () => setFaqInViewState(true)],
            [differentiatorsRef.current, 'differentiators', () => setDifferentiatorsInView(true)],
            [animatedStatsRef.current, 'animatedStats', () => setAnimatedStatsVisible(true)],
            [testimonialsRef.current, 'testimonials', () => setTestimonialsInView(true)],
            [footerRef.current, 'footer', () => setFooterInView(true)],
          ];
          for (const [el, key, setter] of sectionMap) {
            if (target === el && !triggeredSections.current.has(key)) {
              triggeredSections.current.add(key);
              setter();
            }
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    );
    [howItWorksRef, pricingRef, faqRef, differentiatorsRef, animatedStatsRef, heroRef, featuresRef, testimonialsRef, footerRef].forEach((r) => {
      if (r.current) sectionObserver.observe(r.current);
    });
    return () => sectionObserver.disconnect();
  }, []);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, [setTheme]);

  const toggleFaq = useCallback((index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  }, [openFaq]);

  const handleContactSubmit = useCallback(() => {
    if (!contactForm.name.trim() || !contactForm.email.trim()) {
      toast.error('Por favor, completa los campos requeridos');
      return;
    }
    // FIX #004: Contact form no simulado — informa al usuario
    toast.info('En breve', { description: 'El formulario de contacto estará conectado pronto. Mientras tanto, escríbenos a adrianpompasantana@gmail.com o llama al +53 53183215' });
    setShowContactModal(false);
    setContactForm({ name: '', email: '', company: '', phone: '', message: '' });
  }, [contactForm]);

  const handleChatSend = useCallback(() => {
    if (!chatInput.trim()) return;
    // FIX #003: Chat no simulado — informa al usuario
    toast.info('Escríbenos directamente', { description: 'WhatsApp: +53 53183215 o adrianpompasantana@gmail.com' });
    setChatInput('');
  }, [chatInput]);

  const scrollToSection = useCallback((idx: number) => {
    sectionRefs[idx]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [sectionRefs]);

  // Counter animation for differentiators
  useEffect(() => {
    if (!differentiatorsInView) return;
    const targets = [23, 4, 99, 2];
    const duration = 1500;
    const startTime = performance.now();
    let rafId = 0;
    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDiffStats(targets.map((t) => Math.floor(eased * t)));
      if (progress < 1) rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => { if (rafId) cancelAnimationFrame(rafId); };
  }, [differentiatorsInView]);

  // FIX #017: Social proof popup — limited to once per session via sessionStorage
  useEffect(() => {
    const alreadyShown = typeof window !== 'undefined' && sessionStorage.getItem('costpro-social-proof-shown');
    if (alreadyShown) return;
    const showTimer = setTimeout(() => {
      setSocialProofIndex(Math.floor(Math.random() * 6));
      setSocialProofVisible(true);
      sessionStorage.setItem('costpro-social-proof-shown', 'true');
    }, 12000);
    return () => { clearTimeout(showTimer); };
  }, []);

  useEffect(() => {
    if (!socialProofVisible) return;
    const timer = setTimeout(() => setSocialProofVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [socialProofVisible]);

  // Demo modal auto-advance
  useEffect(() => {
    if (!showDemoModal) return;
    const interval = setInterval(() => {
      setDemoSlideIndex((prev) => (prev + 1) % 3);
    }, 3000);
    return () => clearInterval(interval);
  }, [showDemoModal]);

  // How it works step advancement on scroll
  useEffect(() => {
    if (!howItWorksInView) return;
    const interval = setInterval(() => {
      setActiveStep((prev) => (prev >= 3 ? 3 : prev + 1));
    }, 800);
    return () => clearInterval(interval);
  }, [howItWorksInView]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (e.key === '?') { e.preventDefault(); setShowShortcutsModal((prev) => !prev); }
      if (e.key === 't' || e.key === 'T') handleToggleTheme();
      if (e.key >= '1' && e.key <= '5') { const idx = parseInt(e.key) - 1; sectionRefs[idx]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      if ((e.key === 'n' || e.key === 'N') && !e.ctrlKey && !e.metaKey) document.getElementById('newsletter-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if ((e.key === 'c' || e.key === 'C') && !e.ctrlKey && !e.metaKey) { e.preventDefault(); setShowContactModal(true); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setShowCommandPalette((prev) => !prev); }
      if (e.key === 'Escape') { setShowShortcutsModal(false); setShowContactModal(false); setShowChat(false); setShowCommandPalette(false); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleTheme]);

  return (
    <div className="landing-tokens min-h-screen flex flex-col bg-[#020617] pb-[env(safe-area-inset-bottom)]">
      {/* ─── Reading Progress Bar ─── */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1 pointer-events-none">
        <div className="h-full w-full bg-white/5" />
        <div
          className={`h-full bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 transition-[width] duration-150 ease-out shadow-[0_0_8px_rgba(34,197,94,0.4)]${scrollProgress > 90 ? ' scroll-progress-near-complete' : ''}`}
          style={{ width: `${scrollProgress}%` }}
          role="progressbar"
          aria-valuenow={Math.round(scrollProgress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de lectura"
        />
      </div>

      {/* Scroll Progress Percentage Label */}
      <AnimatePresence>
        {scrollProgress > 20 && (
          <motion.div
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.2 }}
            className="fixed top-4 right-3 z-50 scroll-pct-label"
          >
            {Math.round(scrollProgress)}%
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Section Navigation Dots ─── */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center">
        <div className="relative flex flex-col items-center" style={{ minHeight: `calc(${sectionIds.length} * 28px + ${(sectionIds.length - 1)} * 16px)` }}>
          <div className="absolute top-[7px] bottom-[7px] w-px bg-white/[0.08]" style={{ height: 'auto' }} />
          <div
            className="absolute top-[7px] left-0 w-px bg-gradient-to-b from-[#22c55e] to-[#22c55e]/60 rounded-full transition-[height] duration-150 ease-out"
            style={{ height: `${Math.min(sectionProgress / (sectionIds.length - 1), 1) * 100}%` }}
          />
          <div className="relative flex flex-col items-center gap-4">
            {sectionIds.map((id, idx) => (
              <div key={id} className="relative">
                <button
                  onClick={() => scrollToSection(idx)}
                  className={`group relative flex items-center justify-end gap-2 outline-none ${activeSection === idx ? 'scale-100' : 'scale-90'} transition-all duration-300`}
                  aria-label={sectionLabels[idx]}
                >
                  <span className={`text-[10px] font-medium whitespace-nowrap transition-all duration-300 delay-75 ${activeSection === idx ? 'opacity-100 text-[#22c55e] translate-x-0' : 'opacity-0 group-hover:opacity-70 text-white/60 translate-x-1'}`}>
                    {sectionLabels[idx]}
                  </span>
                  <span className={`relative block w-2.5 h-2.5 rounded-full transition-all duration-300 ${activeSection === idx ? 'bg-[#22c55e] shadow-lg shadow-[#22c55e]/40 scale-125 spy-ring-anim scroll-dot-active' : 'bg-white/20 hover:bg-white/40'}`} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── HERO SECTION (left panel with dark background) ─── */}
      <HeroSection
        heroInView={heroInView}
        showMobileNav={showMobileNav}
        leftPanelRef={leftPanelRef}
        heroRef={heroRef}
        animatedStatsRef={animatedStatsRef}
        setShowLoginModal={setShowLoginModal}
        setShowMobileNav={setShowMobileNav}
        setShowCommandPalette={setShowCommandPalette}
        setLoginDefaultTab={setLoginDefaultTab}
        showPromo={showPromo}
        handleDismissPromo={handleDismissPromo}
      >
        {/* ── INTERACTIVE DEMO (right after Hero, before Features) ── */}
        <InteractiveDemo />

        <SectionDivider />

        {/* ── FEATURES SECTION ── */}
        <FeaturesSection
          featuresInView={featuresInView}
          featuresRef={featuresRef}
          setShowDemoModal={setShowDemoModal}
        />

        <SectionDivider />

        {/* ── TESTIMONIALS SECTION ── */}
        <TestimonialsSection
          testimonialsInView={testimonialsInView}
          currentTestimonial={currentTestimonial}
          setCurrentTestimonial={setCurrentTestimonial}
          testimonialProgress={testimonialProgress}
          setTestimonialProgress={setTestimonialProgress}
          testimonialTilt={testimonialTilt}
          setTestimonialTilt={setTestimonialTilt}
          testimonialsRef={testimonialsRef}
        />

        <SectionDivider />

        {/* ── WHY COSTPRO DIFFERENTIATORS ── */}
        <div ref={differentiatorsRef} id="differentiators-section" className="mt-12 max-w-2xl mx-auto w-full">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={differentiatorsInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <h2 className="text-lg sm:text-xl font-bold text-white text-center font-[family-name:var(--font-space-grotesk)] mb-5">
              ¿Por qué CostPro?
            </h2>
            <div className="glow-line mx-auto mb-5" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative">
              <div className="hidden lg:flex absolute top-[3.5rem] left-[12.5%] right-[12.5%] items-center pointer-events-none">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex-1 h-px border-t-2 border-dashed border-white/[0.08]" />
                ))}
              </div>
              {differentiatorsData.map((d, i) => (
                <motion.div
                  key={d.stat}
                  initial={{ opacity: 0, y: 20 }}
                  animate={differentiatorsInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.4, delay: i * 0.12 }}
                  className="group relative flex flex-col items-center text-center p-4 rounded-xl bg-white/[0.06] border border-white/[0.08] backdrop-blur-md hover:bg-white/[0.1] hover:border-[#22c55e]/30 hover:shadow-[0_0_24px_rgba(34,197,94,0.12)] transition-all duration-300 breathing-card"
                >
                  <div className="w-11 h-11 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center mb-3 group-hover:bg-[#22c55e]/25 group-hover:shadow-[0_0_12px_rgba(34,197,94,0.2)] transition-all duration-300">
                    <d.icon className="w-5 h-5 text-[#22c55e]" />
                  </div>
                  <span className="text-2xl font-extrabold text-white font-[family-name:var(--font-space-grotesk)]">
                    {differentiatorsData[i].stat.startsWith('<') ? d.stat : `${diffStats[i]}${d.stat.replace(/[0-9]/g, '')}`}
                  </span>
                  <span className="text-[11px] text-white/40 mt-1 leading-relaxed">{d.desc}</span>
                  <div className="w-full h-1 rounded-full bg-white/[0.06] mt-3 overflow-hidden">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={differentiatorsInView ? { width: `${diffProgressBars[i]}%` } : { width: '0%' }}
                      transition={{ duration: 1.2, delay: 0.3 + i * 0.15, ease: 'easeOut' }}
                      className="h-full bg-gradient-to-r from-[#22c55e] to-emerald-400 rounded-full"
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        <SectionDivider />

        {/* ── HOW IT WORKS SECTION ── */}
        <HowItWorksSection
          howItWorksInView={howItWorksInView}
          activeStep={activeStep}
          howItWorksRef={howItWorksRef}
        />

        <SectionDivider />

        {/* ── PRICING SECTION ── */}
        <PricingSection
          pricingInView={pricingInView}
          pricingRef={pricingRef}
          setShowContactModal={setShowContactModal}
        />

        <SectionDivider />

        {/* ── FAQ SECTION ── */}
        <FAQSection
          faqInViewState={faqInViewState}
          openFaq={openFaq}
          toggleFaq={toggleFaq}
          faqFeedback={faqFeedback}
          setFaqFeedback={setFaqFeedback}
          faqRef={faqRef}
        />

        <SectionDivider />

        {/* ── Newsletter ── */}
        <NewsletterSection
          newsletterInView={newsletterInView}
        />

        <div className="stats-gradient-separator w-full h-px" />

        {/* Stats + Trust badges + Tagline — centered container */}
        <div className="max-w-2xl mx-auto w-full space-y-5">
          {/* Stats bar with glassmorphism */}
          <div id="stats-section" className="stats-glass-card rounded-xl p-5">
            {/* FIX #018: Disclaimer datos estimados */}
            <p className="text-[9px] text-white/20 uppercase tracking-widest text-center mb-3">* Datos estimados</p>
            <div className="flex items-center justify-center gap-8 sm:gap-12">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                <div>
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={statsVisible ? { scale: 1, opacity: 1 } : {}}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="inline-block text-xl sm:text-2xl font-extrabold text-white font-[family-name:var(--font-space-grotesk)] tracking-tight stat-number-glow"
                  >
                    {stat1.count.toLocaleString()}{statsData[0].suffix}
                  </motion.span>
                  <span className="text-[10px] text-white/40 ml-1.5">{statsData[0].label}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                <div>
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={statsVisible ? { scale: 1, opacity: 1 } : {}}
                    transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.1 }}
                    className="inline-block text-xl sm:text-2xl font-extrabold text-white font-[family-name:var(--font-space-grotesk)] tracking-tight stat-number-glow"
                  >
                    {stat2.count.toLocaleString()}{statsData[1].suffix}
                  </motion.span>
                  <span className="text-[10px] text-white/40 ml-1.5">{statsData[1].label}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-[#22c55e] shrink-0" />
                <div>
                  <motion.span
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={statsVisible ? { scale: 1, opacity: 1 } : {}}
                    transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
                    className="inline-block text-xl sm:text-2xl font-extrabold text-white font-[family-name:var(--font-space-grotesk)] tracking-tight stat-number-glow"
                  >
                    {stat3.count}{statsData[2].prefix}{statsData[2].suffix}
                  </motion.span>
                  <span className="text-[10px] text-white/40 ml-1.5">{statsData[2].label}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Trust badges */}
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-[#22c55e]/60" />
              <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Encriptación SSL</span>
            </div>
            <div className="w-px h-3 bg-white/[0.08]" />
            <div className="flex items-center gap-1.5">
              <Headphones className="w-3.5 h-3.5 text-[#22c55e]/60" />
              <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Soporte 24/7</span>
            </div>
            <div className="w-px h-3 bg-white/[0.08]" />
            <div className="flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[#22c55e]/60" />
              <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">99.9% Uptime</span>
            </div>
          </div>
        </div>

        {/* Bottom gradient fade overlay */}
        <div className="h-10 pointer-events-none">
          <div className="h-full bg-gradient-to-b from-transparent to-[#020617]" />
        </div>

        {/* Tagline */}
        <p className="pb-8 text-xs text-white/40 font-medium tracking-wide uppercase animate-subtle-glow text-gradient-animate text-center">
          Protege tus costos y precios
        </p>
      </HeroSection>

      {/* ─── FOOTER ─── */}
      <FooterSection
        footerInView={footerInView}
        showCookieBanner={showCookieBanner}
        footerRef={footerRef}
        handleReopenCookieSettings={handleReopenCookieSettings}
        onContactClick={() => setShowContactModal(true)}
        onLinkClick={setActiveFooterModal}
        footerStats={[
          { count: footerStat1.count, suffix: '+', label: 'Años en el mercado', hasStarted: footerStat1.hasStarted, start: footerStat1.start },
          { count: footerStat2.count, suffix: '+', label: 'Empresas activas', hasStarted: footerStat2.hasStarted, start: footerStat2.start },
          { count: footerStat3.count, suffix: '', label: 'Países', hasStarted: footerStat3.hasStarted, start: footerStat3.start },
          { count: footerStat4.count, suffix: '%', label: 'Uptime garantizado', hasStarted: footerStat4.hasStarted, start: footerStat4.start },
        ]}
      />

      {/* ─── Floating Elements ─── */}
      <FloatingElements
        showScrollTop={showScrollTop}
        scrollProgress={scrollProgress}
        showChat={showChat}
        chatInput={chatInput}
        setChatInput={setChatInput}
        showBackToFeatures={showBackToFeatures}
        showFab={showFab}
        showConfetti={showConfetti}
        mounted={mounted}
        smoothScrollToTop={smoothScrollToTop}
        setShowChat={setShowChat}
        setShowShortcutsModal={setShowShortcutsModal}
        setShowContactModal={setShowContactModal}
        setShowFab={setShowFab}
        handleChatSend={handleChatSend}
        scrollToSection={scrollToSection}
        featuresRef={featuresRef}
      />

      {/* ─── MODALS ─── */}
      <ShortcutsModal
        showShortcutsModal={showShortcutsModal}
        setShowShortcutsModal={setShowShortcutsModal}
        shortcutsSearch={shortcutsSearch}
        setShortcutsSearch={setShortcutsSearch}
      />
      <DemoModal
        showDemoModal={showDemoModal}
        setShowDemoModal={setShowDemoModal}
        demoSlideIndex={demoSlideIndex}
        setDemoSlideIndex={setDemoSlideIndex}
      />
      <ContactModal
        showContactModal={showContactModal}
        setShowContactModal={setShowContactModal}
        contactForm={contactForm}
        setContactForm={setContactForm}
        handleContactSubmit={handleContactSubmit}
      />
      <WhatsNewModal showWhatsNew={showWhatsNew} setShowWhatsNew={setShowWhatsNew} />
      <LoginModal showLoginModal={showLoginModal} setShowLoginModal={setShowLoginModal} defaultTab={loginDefaultTab} />
      <FooterModals activeModal={activeFooterModal} onClose={() => setActiveFooterModal(null)} />

      {/* ─── COMMAND PALETTE (Ctrl+K) ─── */}
      <CommandPalette
        isOpen={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        onNavigate={(sectionId) => {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onLogin={() => setShowLoginModal(true)}
        onDemo={() => setShowDemoModal(true)}
        onContact={() => setShowContactModal(true)}
        onToggleTheme={handleToggleTheme}
        onShortcuts={() => setShowShortcutsModal(true)}
      />

      {/* ─── Cookie consent is now handled globally by <CookieConsent /> in layout.tsx ─── */}

      {/* ─── Mobile Navigation Drawer ─── */}
      <AnimatePresence>
        {showMobileNav && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-[70] drawer-overlay lg:hidden"
              onClick={() => setShowMobileNav(false)}
              aria-hidden="true"
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="fixed top-0 left-0 bottom-0 z-[80] w-[280px] bg-[#0a0f1a] dark:bg-[#070c18] border-r border-white/[0.06] shadow-2xl lg:hidden flex flex-col mobile-nav-slide-enter"
            >
              <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
                    <Lock className="w-4 h-4 text-[#22c55e]" />
                  </div>
                  <span className="text-lg font-bold tracking-tight text-white font-[family-name:var(--font-space-grotesk)]">
                    Cost<span className="text-[#22c55e]">Pro</span>
                  </span>
                </div>
                <button onClick={() => setShowMobileNav(false)} className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/10 transition-colors" aria-label="Cerrar menú">
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>
              <nav aria-label="Navegación principal" className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {sectionLabels.map((label, idx) => (
                  <button
                    key={sectionIds[idx]}
                    onClick={() => { scrollToSection(idx); setShowMobileNav(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-lg text-sm font-medium transition-all duration-200 min-h-[44px] ${activeSection === idx ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/15' : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04] border border-transparent'}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${activeSection === idx ? 'bg-[#22c55e]' : 'bg-white/20'}`} />
                    {label}
                  </button>
                ))}
              </nav>
              <div className="p-4 border-t border-white/[0.06] space-y-3">
                <button onClick={() => { handleToggleTheme(); setShowMobileNav(false); }} className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-all">
                  {theme === 'dark' ? <Cookie className="w-4 h-4" /> : <Cookie className="w-4 h-4" />}
                  {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                </button>
                <button onClick={() => { setShowLoginModal(true); setShowMobileNav(false); }} className="w-full py-2.5 rounded-lg bg-[#22c55e] text-white text-sm font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 transition-all">
                  Iniciar Sesión
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
