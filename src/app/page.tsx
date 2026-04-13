'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import { toast } from 'sonner';
import {
  Calculator, ShoppingCart, Package, BarChart3,
  Store, ShieldCheck, Users, Star, ChevronDown, Check,
  CheckCircle2, Sparkles, Sun, Moon, ArrowUp,
  Zap, Lock, Headphones, Globe,
  MessageCircle, UserPlus, Settings, Rocket, TrendingUp, HelpCircle,
  CreditCard, RefreshCw, Wifi, Send, Keyboard, X, Phone, Building2,
  Percent, Clock, Play, Share2, CircleHelp, Menu, ThumbsUp, ThumbsDown, Plus,
} from 'lucide-react';
import CyberShell from '@/components/ui/CyberShell';
import TerminalShell from '@/components/views/TerminalShell';
import DataDecryption from '@/components/ui/DataDecryption';
import LoginForm from '@/components/auth/LoginForm';
import SplashScreen from '@/components/SplashScreen';
import { useAuthStore } from '@/store';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';

/* ── Feature data ── */
const features = [
  { icon: Calculator, title: 'Control de Costos', desc: 'Calcula costos precisos con motor de fórmulas avanzado y auditoría por transacción.', tip: 'Soporta fórmulas personalizadas, historial de cambios y auditoría completa por cada transacción registrada.' },
  { icon: ShoppingCart, title: 'Punto de Venta', desc: 'Terminal POS rápida e intuitiva con soporte para múltiples métodos de pago.', tip: 'Compatible con tarjeta, efectivo, QR y múltiples pasarelas de pago en tiempo real.' },
  { icon: Package, title: 'Inventario Inteligente', desc: 'Gestión automatizada de stock con alertas de reorden y recepciones.', tip: 'Alertas inteligentes de stock mínimo con recepciones automatizadas y reportes de movimientos.' },
  { icon: BarChart3, title: 'Reportes en Tiempo Real', desc: 'Dashboard ejecutivo con KPIs en vivo y exportación a PDF/Excel.', tip: 'Más de 30 plantillas de reportes personalizables con exportación programada.' },
  { icon: Store, title: 'Multi-Tienda', desc: 'Administra múltiples sucursales desde una sola plataforma centralizada.', tip: 'Cambia de sucursal en 1 clic con sincronización en tiempo real.' },
  { icon: ShieldCheck, title: 'Seguridad Total', desc: 'Roles granulares, auditoría de acciones y protección de datos empresariales.', tip: 'Encriptación AES-256, autenticación 2FA y backup automático diario.' },
];

const statsData = [
  { value: 10000, suffix: '+', label: 'Usuarios activos', prefix: '' },
  { value: 500, suffix: '+', label: 'Tiendas', prefix: '' },
  { value: 2, suffix: 'M+', label: 'Transacciones', prefix: '' },
];

const testimonials = [
  { name: 'Carlos M.', role: 'Restaurante El Sabor', text: 'CostPro redujo nuestros costos operativos en un 23%. La interfaz es intuitiva y los reportes son impecables.', rating: 5 },
  { name: 'María L.', role: 'Ferretería Industrial', text: 'El módulo de inventario nos ahorra horas semanales. Las alertas de reorden son un game changer.', rating: 5 },
  { name: 'Andrés R.', role: 'Tienda Deportiva Pro', text: 'El punto de venta es rápido y confiable. Nunca tuvimos un corte de servicio desde la implementación.', rating: 5 },
];

const howItWorksSteps = [
  { icon: UserPlus, title: 'Regístrate', desc: 'Crea tu cuenta gratuita en menos de 2 minutos' },
  { icon: Settings, title: 'Configura', desc: 'Personaliza tu negocio con plantillas inteligentes' },
  { icon: Rocket, title: 'Opera', desc: 'Gestiona ventas, inventario y costos en tiempo real' },
  { icon: TrendingUp, title: 'Crece', desc: 'Escala con reportes avanzados y análisis predictivo' },
];

const faqIcons = [HelpCircle, ShieldCheck, CreditCard, RefreshCw, Wifi];

const differentiatorsData = [
  { icon: TrendingUp, stat: '23%', desc: 'Reducción promedio en costos operativos' },
  { icon: Clock, stat: '4x', desc: 'Más rápido que métodos manuales' },
  { icon: Users, stat: '99%', desc: 'Tasa de satisfacción de usuarios' },
  { icon: Zap, stat: '<2min', desc: 'Tiempo promedio de configuración' },
];

const pricingPlans = [
  {
    name: 'Starter',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'Gratis',
    period: '',
    desc: 'Perfecto para emprendedores que inician',
    features: ['Hasta 50 productos', '1 sucursal', 'Reportes básicos', 'Soporte por email', 'Control de costos esencial'],
    cta: 'Comenzar gratis',
    popular: false,
  },
  {
    name: 'Pro',
    priceMonthly: 29,
    priceAnnual: 23,
    price: '$29',
    period: '/mes',
    desc: 'Para negocios en crecimiento',
    features: ['Productos ilimitados', 'Hasta 5 sucursales', 'Reportes avanzados + PDF/Excel', 'Soporte prioritario 24/7', 'Punto de venta completo', 'Módulo de inventario inteligente', 'Integración bancaria (IPV)'],
    cta: 'Prueba gratis 14 días',
    popular: true,
  },
  {
    name: 'Enterprise',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'Custom',
    period: '',
    desc: 'Solución a medida para grandes empresas',
    features: ['Todo en Pro', 'Sucursales ilimitadas', 'API dedicada', 'SLA garantizado', 'Capacitación personalizada', 'Migración asistida', 'Panel ejecutivo VIP'],
    cta: 'Contactar ventas',
    popular: false,
  },
];

const faqItems = [
  { q: '¿Necesito experiencia técnica para usar CostPro?', a: 'No. CostPro está diseñado con una interfaz intuitiva que cualquier empresario puede usar sin conocimientos técnicos. Además ofrecemos tutoriales interactivos y soporte 24/7.' },
  { q: '¿Mis datos están seguros?', a: 'Absolutamente. Utilizamos encriptación de extremo a extremo, servidores con certificación SOC2, y cumplimos con las normativas de protección de datos vigentes.' },
  { q: '¿Puedo cambiar de plan en cualquier momento?', a: 'Sí, puedes escalar o reducir tu plan en cualquier momento. Los cambios se aplican de inmediato y solo pagas la diferencia proporcional.' },
  { q: '¿Ofrecen migración desde otro sistema?', a: 'Sí, nuestro equipo de soporte te ayuda a migrar tus datos desde cualquier sistema. El proceso es gratuito para planes Pro y Enterprise.' },
  { q: '¿Funciona sin conexión a internet?', a: 'CostPro tiene modo offline que te permite continuar operando sin internet. Los datos se sincronizan automáticamente cuando recuperas la conexión.' },
];

const clientLogos = [
  'Restaurante El Sabor', 'Ferretería Industrial', 'Tienda Pro', 'Café Buen Día',
  'Market Express', 'Distribuidora Norte', 'Farmacia Vida', 'Automotriz GT',
];

const integrationPartners = [
  { name: 'Stripe', letter: 'S' },
  { name: 'PayPal', letter: 'P' },
  { name: 'Mercado Pago', letter: 'M' },
  { name: 'WhatsApp', letter: 'W' },
  { name: 'Google Workspace', letter: 'G' },
  { name: 'Slack', letter: 'Sl' },
];

const liveActivities = [
  '🟢 Carlos M. de Guatemala se registró hace 3 min',
  '🟢 Restaurante El Sabor completó su primer inventario',
  '🟢 +47 transacciones procesadas en la última hora',
  '🟢 Ferretería Industrial ahorró $1,200 este mes',
];

const comparisonRows = [
  { feature: 'Productos', starter: '50', pro: '∞', enterprise: '∞' },
  { feature: 'Sucursales', starter: '1', pro: '5', enterprise: '∞' },
  { feature: 'Reportes', starter: 'Básicos', pro: 'Avanzados', enterprise: 'VIP' },
  { feature: 'Soporte', starter: 'Email', pro: '24/7', enterprise: 'Dedicado' },
  { feature: 'Integración bancaria', starter: false, pro: true, enterprise: true },
];

const sectionIds = ['hero', 'features', 'how-it-works', 'pricing', 'faq'];
const sectionLabels = ['Inicio', 'Funciones', 'Cómo Funciona', 'Precios', 'FAQ'];

const v58Features = [
  'Motor de costos mejorado con fórmulas avanzadas',
  'Integración con WhatsApp Business',
  'Reportes personalizados con drag & drop',
  'Modo offline con sincronización automática',
];

const featureTooltips: Record<string, string> = {
  'Control de Costos': 'Motor de fórmulas con auditoría completa por transacción',
  'Punto de Venta': 'Terminal POS con soporte para NFC y múltiples métodos de pago',
  'Inventario Inteligente': 'Alertas predictivas de reorden basadas en IA',
  'Reportes en Tiempo Real': 'Exporta a PDF, Excel y Google Sheets con un clic',
  'Multi-Tienda': 'Centraliza hasta 100 sucursales en un solo panel',
  'Seguridad Total': 'Encriptación AES-256 + auditoría de acciones en tiempo real',
};

/* ── Animation helpers ── */
const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: 'easeOut' as any },
  }),
};

const fadeIn = (delay = 0) => ({
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { delay, duration: 0.6 } },
});

const slideRight = (delay = 0) => ({
  hidden: { opacity: 0, x: 30 },
  visible: { opacity: 1, x: 0, transition: { delay, duration: 0.5, ease: 'easeOut' as any } },
});

/* ── Animated Counter Hook ── */
function useAnimatedCounter(target: number, duration = 2000) {
  const [count, setCount] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);
  const [completed, setCompleted] = useState(false);

  const start = useCallback(() => {
    if (hasStarted) return;
    setHasStarted(true);
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(animate);
      else setCompleted(true);
    };

    requestAnimationFrame(animate);
  }, [target, duration, hasStarted]);

  return { count, hasStarted, completed, start };
}

/* ── Star Rating Component ── */
function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`w-4 h-4 ${star <= rating ? 'gold-star fill-current' : 'star-empty'}`}
        />
      ))}
    </div>
  );
}

/* ── Avatar Initials ── */
function AvatarInitials({ name }: { name: string }) {
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
function SectionDivider() {
  return (
    <div className="flex items-center justify-center py-6 max-w-2xl">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent to-white/10" />
      <div className="w-1.5 h-1.5 rotate-45 bg-white/20 mx-4 shrink-0" />
      <div className="flex-1 h-px bg-gradient-to-l from-transparent to-white/10" />
    </div>
  );
}

/* ── Auth-aware page ── */
export default function HomePage() {
  const { user, status } = useAuthStore();
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.subscribe((state) => {
      if (!state.loading) {
        setIsReady(true);
        setIsAuthenticated(!!state.user && state.status !== 'unauthenticated');
      }
    });

    const timer = setTimeout(() => {
      const state = useAuthStore.getState();
      if (state.loading) {
        console.warn('[HomePage] Auth check timeout, forcing ready state');
        useAuthStore.getState().setLoading(false);
        useAuthStore.getState().setStatus('unauthenticated');
        setIsReady(true);
        setIsAuthenticated(false);
      }
    }, 5000);

    const currentState = useAuthStore.getState();
    if (!currentState.loading) {
      queueMicrotask(() => {
        setIsReady(true);
        setIsAuthenticated(!!useAuthStore.getState().user && useAuthStore.getState().status !== 'unauthenticated');
      });
    }

    return () => { clearTimeout(timer); unsub(); };
  }, []);

  const showLogin = !isReady || !isAuthenticated;

  if (!splashDone) {
    return <SplashScreen onFinish={() => setSplashDone(true)} />;
  }

  if (showLogin) {
    return <LandingPage />;
  }

  return (
    <CyberShell>
      <Suspense fallback={<DataDecryption />}>
        <TerminalShell />
      </Suspense>
    </CyberShell>
  );
}

/* ── Landing / Login Split Screen ── */
function LandingPage() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [currentTestimonial, setCurrentTestimonial] = useState(0);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showCookieBanner, setShowCookieBanner] = useState(false);
  const [statsVisible, setStatsVisible] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeSection, setActiveSection] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isAnnual, setIsAnnual] = useState(false);
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactForm, setContactForm] = useState({ name: '', email: '', company: '', phone: '', message: '' });
  const [howItWorksInView, setHowItWorksInView] = useState(false);
  const [pricingInView, setPricingInView] = useState(false);
  const [faqInViewState, setFaqInViewState] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [mouseGlowPos, setMouseGlowPos] = useState({ x: 0, y: 0 });
  const [differentiatorsInView, setDifferentiatorsInView] = useState(false);
  const [diffStats, setDiffStats] = useState([0, 0, 0, 0]);
  const [showLiveActivity, setShowLiveActivity] = useState(false);
  const [currentActivityIndex, setCurrentActivityIndex] = useState(0);
  const [selectedLanguage, setSelectedLanguage] = useState('Español');
  const [showMobileNav, setShowMobileNav] = useState(false);
  const [showShareDropdown, setShowShareDropdown] = useState(false);
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(true);
  const [activeStep, setActiveStep] = useState(0);
  const [showFab, setShowFab] = useState(false);
  const [faqFeedback, setFaqFeedback] = useState<Record<number, 'up' | 'down' | null>>({});

  const stat1 = useAnimatedCounter(statsData[0].value, 2000);
  const stat2 = useAnimatedCounter(statsData[1].value, 1800);
  const stat3 = useAnimatedCounter(statsData[2].value, 2200);

  const heroRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const howItWorksRef = useRef<HTMLDivElement>(null);
  const pricingRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const differentiatorsRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  const sectionRefs = [heroRef, featuresRef, howItWorksRef, pricingRef, faqRef];

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  // Auto-rotate testimonials
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTestimonial((prev) => (prev + 1) % testimonials.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Promo banner - localStorage check
  useEffect(() => {
    const dismissed = typeof window !== 'undefined' && localStorage.getItem('costpro-promo-dismissed');
    if (!dismissed) {
      const timer = setTimeout(() => queueMicrotask(() => setShowPromo(true)), 600);
      return () => clearTimeout(timer);
    }
  }, []);

  // Cursor blink (after splash)
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

  // Scroll-to-top visibility + progress bar + stats
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
        ([entry]) => {
          if (entry.isIntersecting) {
            setActiveSection(idx);
          }
        },
        { threshold: 0.3 },
      );
      observer.observe(ref.current);
      observers.push(observer);
    });
    return () => observers.forEach((obs) => obs.disconnect());
  }, []);

  // IntersectionObserver for scroll-animated sections
  useEffect(() => {
    const sectionObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            if (entry.target === howItWorksRef.current && !howItWorksInView) {
              queueMicrotask(() => setHowItWorksInView(true));
            }
            if (entry.target === pricingRef.current && !pricingInView) {
              queueMicrotask(() => setPricingInView(true));
            }
            if (entry.target === faqRef.current && !faqInViewState) {
              queueMicrotask(() => setFaqInViewState(true));
            }
            if (entry.target === differentiatorsRef.current && !differentiatorsInView) {
              queueMicrotask(() => setDifferentiatorsInView(true));
            }
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
    );
    [howItWorksRef, pricingRef, faqRef, differentiatorsRef].forEach((r) => {
      if (r.current) sectionObserver.observe(r.current);
    });
    return () => sectionObserver.disconnect();
  }, [howItWorksInView, pricingInView, faqInViewState, differentiatorsInView]);

  const handleAcceptCookies = useCallback(() => {
    localStorage.setItem('costpro-cookie-consent', 'accepted');
    setShowCookieBanner(false);
  }, []);

  const handleDismissPromo = useCallback(() => {
    localStorage.setItem('costpro-promo-dismissed', 'true');
    setShowPromo(false);
  }, []);

  const handleToggleTheme = useCallback(() => {
    setRotation((prev) => prev + 180);
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const toggleFaq = useCallback((index: number) => {
    setOpenFaq(openFaq === index ? null : index);
  }, [openFaq]);

  const handleNewsletterSubmit = useCallback(() => {
    if (!newsletterEmail.trim()) {
      toast.error('Por favor, ingresa tu correo electrónico');
      return;
    }
    toast.success('¡Suscripción exitosa!', { description: 'Te enviaremos novedades y tips de gestión.' });
    setNewsletterEmail('');
  }, [newsletterEmail]);

  const handleContactSubmit = useCallback(() => {
    if (!contactForm.name.trim() || !contactForm.email.trim()) {
      toast.error('Por favor, completa los campos requeridos');
      return;
    }
    toast.success('Solicitud enviada', { description: 'Nuestro equipo de ventas se pondrá en contacto contigo pronto.' });
    setShowContactModal(false);
    setContactForm({ name: '', email: '', company: '', phone: '', message: '' });
  }, [contactForm]);

  const handleChatSend = useCallback(() => {
    if (!chatInput.trim()) return;
    toast.info('Mensaje enviado', { description: 'Un agente te responderá pronto.' });
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

  // Live activity notification
  useEffect(() => {
    const showTimer = setTimeout(() => setShowLiveActivity(true), 5000);
    return () => clearTimeout(showTimer);
  }, []);
  useEffect(() => {
    if (!showLiveActivity) return;
    const interval = setInterval(() => {
      setCurrentActivityIndex((prev) => (prev + 1) % liveActivities.length);
    }, 8000);
    return () => clearInterval(interval);
  }, [showLiveActivity]);

  // Cookie consent - show after 3s
  useEffect(() => {
    const hasConsented = typeof window !== 'undefined' && localStorage.getItem('costpro-cookie-consent');
    if (!hasConsented) {
      const timer = setTimeout(() => setShowCookieBanner(true), 3000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      if (e.key === '?') {
        e.preventDefault();
        setShowShortcutsModal((prev) => !prev);
      }
      if (e.key === 't' || e.key === 'T') {
        handleToggleTheme();
      }
      if (e.key >= '1' && e.key <= '5') {
        const idx = parseInt(e.key) - 1;
        sectionRefs[idx]?.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      if (e.key === 'Escape') {
        setShowShortcutsModal(false);
        setShowContactModal(false);
        setShowChat(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleToggleTheme]);

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-[#f8fafc] dark:bg-[#0a0f1a]">
      {/* ─── Scroll Progress Bar ─── */}
      <div
        className="fixed top-0 left-0 right-0 z-50 h-[3px] bg-gradient-to-r from-emerald-400 to-green-500 transition-none"
        style={{ width: `${scrollProgress}%` }}
        role="progressbar"
        aria-valuenow={Math.round(scrollProgress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progreso de desplazamiento"
      />
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

      {/* ─── PROMO ANNOUNCEMENT BANNER ─── */}
      <AnimatePresence>
        {showPromo && (
          <motion.div
            initial={{ y: -60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -60, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed top-[3px] left-0 right-0 z-[60] flex items-center justify-center px-4 py-2 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 shadow-lg shadow-emerald-500/20"
          >
            <p className="text-sm font-semibold text-white text-center sm:text-xs sm:px-2">
              🎉 ¡Oferta especial! 30% de descuento en plan Pro — Usa el código <span className="font-bold underline decoration-white/40">LANZAMIENTO30</span>
            </p>
            <button
              onClick={handleDismissPromo}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              aria-label="Cerrar promoción"
            >
              <X className="w-3 h-3 text-white" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Section Navigation Dots ─── */}
      <div className="fixed right-3 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-center">
        <div className="absolute top-2 bottom-2 w-px bg-gradient-to-b from-white/[0.04] to-white/[0.12]" style={{ height: `calc(100% + 8px)` }} />
        {sectionIds.map((id, idx) => (
          <div key={id} className="relative">
            <button
              onClick={() => scrollToSection(idx)}
              className={`group relative flex items-center justify-end gap-2 outline-none ${
                activeSection === idx ? 'scale-100' : 'scale-90'
              } transition-all duration-300`}
              aria-label={sectionLabels[idx]}
            >
              <span className={`text-[10px] font-medium whitespace-nowrap transition-all duration-300 delay-75 ${
                activeSection === idx ? 'opacity-100 text-[#22c55e] translate-x-0' : 'opacity-0 group-hover:opacity-70 text-white/60 translate-x-1'
              }`}>
                {sectionLabels[idx]}
              </span>
              <span className={`relative block w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                activeSection === idx
                  ? 'bg-[#22c55e] shadow-lg shadow-[#22c55e]/40 scale-125 spy-ring-anim'
                  : 'bg-white/20 hover:bg-white/40'
              }`} />
            </button>
          </div>
        ))}
      </div>

      {/* ─── LEFT PANEL (Hero) ─── */}
      <div ref={leftPanelRef} className="relative flex-1 lg:flex-[3] xl:flex-[3] overflow-hidden">
        {/* Animated gradient background */}
        <div
          className="absolute inset-0 animate-gradient-shift bg-gradient-to-br from-[#052e16] via-[#064e3b] to-[#0f172a] dark:from-[#0a0f1a] dark:via-[#0c1829] dark:to-[#020617]"
        />

        {/* Decorative dots pattern */}
        <div className="absolute inset-0 opacity-[0.04]" style={{
          backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }} />

        {/* Mouse follower glow (desktop only) */}
        <div
          className="absolute inset-0 pointer-events-none hidden lg:block z-[5]"
          style={{
            background: `radial-gradient(600px circle at ${mouseGlowPos.x}px ${mouseGlowPos.y}px, rgba(34,197,94,0.06), transparent 60%)`,
            transition: 'background 0.15s ease-out',
          }}
        />

        {/* Decorative gradient orbs */}
        <motion.div
          animate={{ y: [0, -18, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#22c55e]/10 blur-[120px] pointer-events-none"
        />
        <motion.div
          animate={{ y: [0, 14, 0] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute -bottom-60 -left-40 w-[400px] h-[400px] rounded-full bg-[#10b981]/8 blur-[100px] pointer-events-none"
        />
        {/* Third gradient orb - teal accent */}
        <motion.div
          animate={{ y: [0, -10, 0], x: [0, 8, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-teal-500/5 blur-[80px] pointer-events-none hidden xl:block"
        />

        <div className="relative z-10 flex flex-col justify-between min-h-[auto] lg:min-h-screen p-6 sm:p-10 lg:p-12 xl:p-16">
          {/* Top: Logo + nav */}
          <motion.div
            variants={fadeIn(0)}
            initial="hidden"
            animate="visible"
            className="flex items-center gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div className="flex flex-col">
                <span className="text-xl font-bold tracking-tight text-white font-[family-name:var(--font-space-grotesk)]">
                  Cost<span className="text-[#22c55e]">Pro</span>
                </span>
                <span className="text-[10px] font-medium text-[#22c55e]/60 tracking-wide -mt-0.5">
                  v5.8
                </span>
              </div>
            </div>

            {/* What's New badge */}
            <button
              onClick={() => setShowWhatsNew(true)}
              className="ml-auto hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors"
              aria-label="Novedades de la versión 5.8"
            >
              <span>🆕</span>
              <span>Novedades v5.8</span>
            </button>

            {/* Mobile hamburger */}
            <button
              onClick={() => setShowMobileNav(!showMobileNav)}
              className="ml-auto flex lg:hidden items-center justify-center w-10 h-10 rounded-lg bg-white/10 border border-white/10 hover:bg-white/15 transition-colors"
              aria-label="Abrir menú"
            >
              <div className={`hamburger-icon ${showMobileNav ? 'open' : ''}`}>
                <span />
                <span />
                <span />
              </div>
            </button>
          </motion.div>

          {/* Middle: Hero + Features + Testimonials + Video + Differentiators + How it Works + Pricing + FAQ */}
          <div className="flex-1 flex flex-col justify-center py-10 lg:py-0">

            {/* ── HERO SECTION ── */}
            <div ref={heroRef} id="hero">
              <motion.div variants={slideRight(0.1)} initial="hidden" animate="visible" className="mb-8 max-w-lg">
                <motion.div
                  animate={{ y: [0, -3, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 mb-4 animated-underline-gradient"
                >
                  <Zap className="w-3.5 h-3.5 text-[#22c55e]" />
                  <span className="text-xs font-semibold text-[#22c55e]">Plataforma #1 en gestión empresarial</span>
                </motion.div>
                <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold tracking-tight text-white leading-[1.15] font-[family-name:var(--font-space-grotesk)]">
                  Gestiona tu negocio con{' '}
                  <span className="text-shimmer-green">precisión total</span>
                </h1>
                <div className="hero-title-line mt-3 mb-1" />
                <p className="mt-4 text-base sm:text-lg text-white/60 leading-relaxed">
                  Control de costos, punto de venta, inventario y reportes — todo en una plataforma.
                  {cursorVisible && (
                    <span className="inline-block w-0.5 h-5 bg-[#22c55e] ml-1 align-middle animate-cursor-blink" />
                  )}
                </p>
                {/* Trust badges row */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1, duration: 0.5 }}
                  className="hidden sm:flex flex-wrap items-center gap-2 mt-5"
                >
                  {['✓ Gratis por siempre', '✓ Setup en 2 min', '✓ Sin tarjeta', '✓ Soporte 24/7'].map((badge) => (
                    <span key={badge} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/5 text-[10px] font-semibold text-[#22c55e]/80">
                      {badge}
                    </span>
                  ))}
                </motion.div>
              </motion.div>
            </div>

            {/* ── FEATURES SECTION ── */}
            <div ref={featuresRef} id="features">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {features.map((feature, i) => (
                  <motion.div
                    key={feature.title}
                    custom={i}
                    variants={fadeUp}
                    initial="hidden"
                    animate="visible"
                    className="group relative flex items-start gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/20 hover:shadow-[0_0_20px_rgba(34,197,94,0.08)] hover:scale-[1.02] tilt-card transition-all duration-300 feature-card-underline"
                  >
                    {/* Tooltip info - ABOVE card */}
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 pointer-events-none transition-all duration-200 delay-100">
                      <div className="w-56 px-3 py-2 rounded-lg bg-[#111827]/95 backdrop-blur-xl border border-white/15 text-[11px] text-white/80 leading-relaxed shadow-xl shadow-black/30">
                        {featureTooltips[feature.title] || ''}
                      </div>
                      {/* Arrow pointing down */}
                      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-[#111827]/95 border-r border-b border-white/15" />
                    </div>
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-all duration-300 animate-glow-pulse-subtle ${i % 2 === 0 ? 'bg-[#22c55e]/10' : 'bg-[#14b8a6]/10'} group-hover:bg-[#22c55e]/20`}>
                      <feature.icon className="w-5 h-5 text-[#22c55e]" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold text-white/90 mb-0.5 slide-in-underline">{feature.title}</h3>
                      <p className="text-xs text-white/40 leading-relaxed line-clamp-2">{feature.desc}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* ── INTERACTIVE VIDEO DEMO PLACEHOLDER ── */}
            <div className="mt-8 max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
              >
                <button
                  onClick={() => toast.info('Demo próximamente disponible')}
                  className="group relative w-full aspect-video rounded-xl overflow-hidden border border-white/[0.08] bg-gradient-to-br from-[#0a1628] via-[#0d2137] to-[#0a0f1a] cursor-pointer transition-all duration-300 hover:border-[#22c55e]/30 hover:shadow-[0_0_40px_rgba(34,197,94,0.1)]"
                  aria-label="Ver demo de CostPro"
                >
                  {/* Grid overlay */}
                  <div className="absolute inset-0 opacity-[0.03]" style={{
                    backgroundImage: 'linear-gradient(rgba(34,197,94,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.3) 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                  }} />
                  {/* Play button */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="relative">
                      <div className="absolute inset-0 rounded-full bg-[#22c55e]/30 animate-play-pulse-ring" />
                      <div className="relative w-16 h-16 rounded-full bg-[#22c55e]/20 border-2 border-[#22c55e]/40 flex items-center justify-center group-hover:bg-[#22c55e]/30 group-hover:scale-110 transition-all duration-300">
                        <Play className="w-6 h-6 text-[#22c55e] ml-0.5" fill="currentColor" />
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

            <SectionDivider />

            {/* ── TESTIMONIALS SECTION ── */}
            <motion.div variants={fadeIn(0.4)} initial="hidden" animate="visible" className="mt-6 max-w-2xl">
              <div className="testimonial-card-animated bg-gradient-to-br from-white/[0.06] via-white/[0.04] to-white/[0.02] backdrop-blur-sm border border-white/[0.08] rounded-xl p-5 border-l-[3px] border-l-[#22c55e]/60 animate-gradient-shift testimonial-card-hover" style={{ backgroundSize: '400% 400%' }}>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentTestimonial}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.35, ease: 'easeInOut' }}
                  >
                    <span className="text-5xl text-[#22c55e]/80 leading-none font-serif select-none" aria-hidden="true">&ldquo;</span>
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
                  </motion.div>
                </AnimatePresence>

                <div className="flex items-center justify-center gap-2 mt-4">
                  {testimonials.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentTestimonial(i)}
                      className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                        i === currentTestimonial ? 'bg-[#22c55e] w-4' : 'bg-white/20 hover:bg-white/40'
                      }`}
                      aria-label={`Testimonial ${i + 1}`}
                    />
                  ))}
                </div>
                <button
                  onClick={() => toast.info('Más testimonios próximamente')}
                  className="mt-3 mx-auto block text-[11px] text-[#22c55e]/60 hover:text-[#22c55e] transition-colors"
                >
                  Ver más testimonios →
                </button>
              </div>
            </motion.div>

            {/* ── WHY COSTPRO DIFFERENTIATORS ── */}
            <div ref={differentiatorsRef} className="mt-8 max-w-2xl">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={differentiatorsInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5 }}
              >
                <h2 className="text-lg sm:text-xl font-bold text-white text-center font-[family-name:var(--font-space-grotesk)] mb-5">
                  ¿Por qué CostPro?
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {differentiatorsData.map((d, i) => (
                    <motion.div
                      key={d.stat}
                      initial={{ opacity: 0, y: 16 }}
                      animate={differentiatorsInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.4, delay: i * 0.1 }}
                      className="group flex flex-col items-center text-center p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/25 transition-all duration-300"
                    >
                      <div className="w-10 h-10 rounded-lg bg-[#22c55e]/10 flex items-center justify-center mb-2 group-hover:bg-[#22c55e]/20 transition-colors">
                        <d.icon className="w-5 h-5 text-[#22c55e]" />
                      </div>
                      <span className="text-2xl font-extrabold text-white font-[family-name:var(--font-space-grotesk)]">
                        {differentiatorsData[i].stat.startsWith('<') ? d.stat : `${diffStats[i]}${d.stat.replace(/[0-9]/g, '')}`}
                      </span>
                      <span className="text-[11px] text-white/40 mt-1 leading-relaxed">{d.desc}</span>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>

            <SectionDivider />

            {/* ── HOW IT WORKS SECTION ── */}
            <div ref={howItWorksRef} id="how-it-works">
              <motion.div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5 }}
                  className="text-center mb-6"
                >
                  <h2 className="text-xl sm:text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
                    ¿Cómo funciona?
                  </h2>
                  <p className="mt-2 text-sm text-white/50">
                    Comienza en minutos, no en días
                  </p>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 relative">
                  <div className="hidden lg:block absolute top-1/2 left-[12.5%] right-[12.5%] h-px border-t-2 border-dashed border-[#22c55e]/20 -translate-y-1/2 pointer-events-none" />
                  {howItWorksSteps.map((step, i) => (
                    <motion.div
                      key={step.title}
                      initial={{ opacity: 0, y: 20 }}
                      animate={howItWorksInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.4, delay: i * 0.15 }}
                      className="relative group"
                    >
                      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/20 transition-all duration-300">
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-[#22c55e] text-[10px] font-bold text-white flex items-center justify-center shadow-lg shadow-[#22c55e]/30">
                          {i + 1}
                        </div>
                        <div className="w-12 h-12 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center mb-3 group-hover:bg-[#22c55e]/20 group-hover:scale-110 transition-all duration-300">
                          <step.icon className="w-5 h-5 text-[#22c55e]" />
                        </div>
                        <h3 className="text-sm font-bold text-white/90 mb-1">{step.title}</h3>
                        <p className="text-[11px] text-white/40 leading-relaxed">{step.desc}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>

            <SectionDivider />

            {/* ── PRICING SECTION ── */}
            <div ref={pricingRef} id="pricing">
              <motion.div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={pricingInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5 }}
                  className="text-center mb-6"
                >
                  <h2 className="text-xl sm:text-2xl font-bold text-white font-[family-name:var(--font-space-grotesk)]">
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
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {pricingPlans.map((plan, i) => (
                    <motion.div
                      key={plan.name}
                      initial={{ opacity: 0, y: 20 }}
                      animate={pricingInView ? { opacity: 1, y: 0 } : {}}
                      transition={{ duration: 0.4, delay: i * 0.1 }}
                      className={`relative p-5 rounded-xl transition-all duration-300 group ${
                        plan.popular
                          ? 'bg-[#22c55e]/10 border-2 border-[#22c55e]/30 shadow-[0_0_30px_rgba(34,197,94,0.08)] animate-border-rotate pricing-popular-hover pricing-popular-border'
                          : 'bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.06] hover:border-[#22c55e]/20'
                      } hover:-translate-y-[4px] hover:shadow-[0_12px_40px_rgba(34,197,94,0.15)]`}
                    >
                      {plan.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-[#22c55e] text-[10px] font-bold text-white uppercase tracking-widest popular-badge-glow">
                          Popular
                        </div>
                      )}
                      <h3 className="text-sm font-bold text-white">{plan.name}</h3>
                      <div className="mt-2 flex items-baseline gap-1">
                        {plan.name === 'Enterprise' ? (
                          <span className="text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] text-white">Custom</span>
                        ) : plan.priceMonthly === 0 ? (
                          <span className="text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] text-white">Gratis</span>
                        ) : (
                          <div className="flex items-baseline gap-1.5">
                            {isAnnual && (
                              <span className="text-sm text-white/30 line-through">${plan.priceMonthly}</span>
                            )}
                            <span className={`text-2xl font-extrabold font-[family-name:var(--font-space-grotesk)] ${plan.popular ? 'text-[#22c55e]' : 'text-white'}`}>
                              ${isAnnual ? plan.priceAnnual : plan.priceMonthly}
                            </span>
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
                        className={`mt-4 w-full py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
                          plan.popular
                            ? 'bg-[#22c55e] text-white hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20'
                            : 'bg-white/[0.08] text-white border border-white/10 hover:bg-white/[0.12]'
                        }`}
                      >
                        {plan.cta}
                      </button>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              {/* Pricing Comparison Table */}
              <div className="mt-6 max-w-2xl">
                <div className="overflow-x-auto rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
                  <table className="w-full text-[10px] sm:text-[11px]">
                    <thead>
                      <tr className="border-b border-white/[0.06]">
                        <th className="text-left py-2.5 px-3 text-white/50 font-medium">Función</th>
                        <th className="py-2.5 px-2 text-white/40 font-medium text-center">Starter</th>
                        <th className="py-2.5 px-2 text-[#22c55e] font-bold text-center bg-[#22c55e]/[0.06]">Pro</th>
                        <th className="py-2.5 px-2 text-white/40 font-medium text-center">Enterprise</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonRows.map((row) => (
                        <tr key={row.feature} className="border-b border-white/[0.03] last:border-b-0">
                          <td className="py-2 px-3 text-white/60 font-medium">{row.feature}</td>
                          <td className="py-2 px-2 text-center">
                            {typeof row.starter === 'boolean' ? (
                              row.starter
                                ? <Check className="w-3 h-3 text-[#22c55e] mx-auto" />
                                : <X className="w-3 h-3 text-white/20 mx-auto" />
                            ) : (
                              <span className="text-white/40">{row.starter}</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center bg-[#22c55e]/[0.06]">
                            {typeof row.pro === 'boolean' ? (
                              row.pro
                                ? <Check className="w-3 h-3 text-[#22c55e] mx-auto" />
                                : <X className="w-3 h-3 text-white/20 mx-auto" />
                            ) : (
                              <span className="text-white/70 font-medium">{row.pro}</span>
                            )}
                          </td>
                          <td className="py-2 px-2 text-center">
                            {typeof row.enterprise === 'boolean' ? (
                              row.enterprise
                                ? <Check className="w-3 h-3 text-[#22c55e] mx-auto" />
                                : <X className="w-3 h-3 text-white/20 mx-auto" />
                            ) : (
                              <span className="text-white/40">{row.enterprise}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <SectionDivider />

            {/* ── FAQ SECTION ── */}
            <div ref={faqRef} id="faq">
              <motion.div className="max-w-2xl">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={faqInViewState ? { opacity: 1, y: 0 } : {}}
                  transition={{ duration: 0.5 }}
                >
                  <h2 className="text-xl sm:text-2xl font-bold text-white text-center font-[family-name:var(--font-space-grotesk)] mb-6">
                    Preguntas frecuentes
                  </h2>
                  <div className="space-y-2">
                    {faqItems.map((item, i) => {
                      const FaqIcon = faqIcons[i] || HelpCircle;
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, y: 10 }}
                          animate={faqInViewState ? { opacity: 1, y: 0 } : {}}
                          transition={{ duration: 0.3, delay: i * 0.08 }}
                          className={`faq-item rounded-xl border border-white/[0.06] bg-white/[0.03] overflow-hidden hover:border-[#22c55e]/15 hover:bg-white/[0.04] transition-all duration-300 ${openFaq === i ? 'faq-open-glow' : ''}`}
                        >
                          <button
                            onClick={() => toggleFaq(i)}
                            className="flex items-center justify-between w-full p-4 text-left gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-8 h-8 rounded-full bg-[#22c55e]/10 flex items-center justify-center text-[11px] font-mono font-bold text-[#22c55e]/70 shrink-0 faq-number-circle ${openFaq === i ? 'faq-number-pulse' : ''}">
                                {String(i + 1).padStart(2, '0')}
                              </span>
                              <span className="text-sm font-semibold text-white/90 pr-2">{item.q}</span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <FaqIcon className="w-4 h-4 text-white/20" />
                              <ChevronDown className={`w-4 h-4 text-[#22c55e] transition-transform duration-500 ${openFaq === i ? 'rotate-180' : ''}`} />
                            </div>
                          </button>
                          <AnimatePresence>
                            {openFaq === i && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                                className="overflow-hidden"
                              >
                                <p className="px-4 pb-2 pl-14 text-xs text-white/50 leading-relaxed">
                                  {item.a}
                                </p>
                                <div className="px-4 pb-4 pl-14 flex items-center gap-3 mt-1">
                                  <span className="text-[10px] text-white/30">¿Te fue útil?</span>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setFaqFeedback(prev => ({ ...prev, [i]: prev[i] === 'up' ? null : 'up' })); if (!faqFeedback[i]) toast.success('¡Gracias por tu feedback!'); }}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 ${faqFeedback[i] === 'up' ? 'bg-[#22c55e]/15 text-[#22c55e]' : 'text-white/30 hover:text-[#22c55e]/60 hover:bg-white/[0.04]'}`}
                                    aria-label="Útil"
                                  >
                                    <ThumbsUp className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setFaqFeedback(prev => ({ ...prev, [i]: prev[i] === 'down' ? null : 'down' })); if (!faqFeedback[i]) toast.success('¡Gracias por tu feedback!'); }}
                                    className={`flex items-center gap-1 px-2 py-1 rounded-md transition-all duration-200 ${faqFeedback[i] === 'down' ? 'bg-red-500/15 text-red-400' : 'text-white/30 hover:text-white/50 hover:bg-white/[0.04]'}`}
                                    aria-label="No útil"
                                  >
                                    <ThumbsDown className="w-3 h-3" />
                                  </button>
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Bottom: Stats + tagline */}
          <motion.div variants={fadeIn(0.7)} initial="hidden" animate="visible" className="space-y-6">
            {/* ── Newsletter Section ── */}
            <div className="relative rounded-xl p-5 bg-gradient-to-r from-[#22c55e]/10 via-[#10b981]/5 to-[#22c55e]/10 border border-[#22c55e]/15 newsletter-card-glow">
              <div className="absolute -inset-px rounded-xl bg-gradient-to-r from-emerald-500/20 via-green-500/10 to-emerald-500/20 -z-10 blur-sm" />
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <h3 className="text-sm font-bold text-white">📬 ✨ Recibe novedades y tips de gestión</h3>
                  <p className="text-[11px] text-white/40 mt-0.5">Sin spam. Cancela cuando quieras.</p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-48">
                    <input
                      type="email"
                      placeholder="tu@email.com"
                      value={newsletterEmail}
                      onChange={(e) => setNewsletterEmail(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleNewsletterSubmit()}
                      className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all"
                      aria-label="Correo electrónico para newsletter"
                    />
                  </div>
                  <button
                    onClick={handleNewsletterSubmit}
                    className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 hover:shadow-[#22c55e]/40 transition-all shrink-0 newsletter-btn-glow"
                  >
                    Suscribirme
                  </button>
                </div>
              </div>
              <p className="text-[9px] text-white/25 mt-2 text-center sm:text-left">Solo enviamos contenido relevante. Sin spam.</p>
            </div>

            {/* Social Proof Bar */}
            <div className="w-full h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
            <div className="overflow-hidden py-2">
              <div className="flex animate-scroll-logos whitespace-nowrap">
                {[...clientLogos, ...clientLogos].map((logo, i) => (
                  <span key={i} className="mx-8 text-[11px] font-semibold text-white/20 uppercase tracking-widest shrink-0">
                    {logo}
                  </span>
                ))}
              </div>
            </div>

            <div className="stats-gradient-separator w-full h-px" />
            {/* Stats bar with glassmorphism */}
            <div id="stats-section" className="stats-glass-card rounded-xl p-4">
              <div className="flex items-center gap-6 sm:gap-10">
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
                    <span className="text-xs text-white/40 ml-1.5 hidden sm:inline">{statsData[0].label}</span>
                    <span className="text-[10px] text-white/40 ml-1 sm:hidden">{statsData[0].label}</span>
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
                    <span className="text-xs text-white/40 ml-1.5 hidden sm:inline">{statsData[1].label}</span>
                    <span className="text-[10px] text-white/40 ml-1 sm:hidden">{statsData[1].label}</span>
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
                    <span className="text-xs text-white/40 ml-1.5 hidden sm:inline">{statsData[2].label}</span>
                    <span className="text-[10px] text-white/40 ml-1 sm:hidden">{statsData[2].label}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Trust badges */}
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#22c55e]/60" />
                <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Encriptación SSL</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Headphones className="w-3.5 h-3.5 text-[#22c55e]/60" />
                <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">Soporte 24/7</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#22c55e]/60" />
                <span className="text-[10px] text-white/30 font-medium uppercase tracking-wider">99.9% Uptime</span>
              </div>
            </div>

            {/* Integration Partners */}
            <div className="py-3">
              <p className="text-[9px] font-semibold text-white/25 uppercase tracking-[0.2em] text-center mb-3">Integraciones compatibles</p>
              <div className="overflow-hidden">
                <div className="flex animate-scroll-integrations whitespace-nowrap">
                  {[...integrationPartners, ...integrationPartners, ...integrationPartners, ...integrationPartners].map((partner, i) => (
                    <div
                      key={i}
                      className="inline-flex items-center gap-2 mx-3 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.08] hover:border-[#22c55e]/20 hover:shadow-[0_0_12px_rgba(34,197,94,0.06)] transition-all duration-300 shrink-0"
                    >
                      <div className="w-5 h-5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 flex items-center justify-center">
                        <span className="text-[8px] font-bold text-[#22c55e]">{partner.letter}</span>
                      </div>
                      <span className="text-[10px] font-medium text-white/30">{partner.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Tagline */}
            <p className="text-xs text-white/40 font-medium tracking-wide uppercase animate-subtle-glow">
              Protege tus costos y precios
            </p>
          </motion.div>

          {/* Live Activity Notification */}
          <AnimatePresence>
            {showLiveActivity && (
              <motion.button
                initial={{ x: -200, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: -200, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                onClick={() => setShowLiveActivity(false)}
                className="absolute bottom-6 left-4 sm:left-6 lg:left-10 z-30 flex items-center gap-2 px-3 py-2 rounded-full bg-white/[0.08] border border-white/[0.1] backdrop-blur-md hover:bg-white/[0.12] transition-all duration-300 cursor-pointer max-w-[calc(100%-2rem)]"
                aria-label="Notificación de actividad en vivo"
              >
                <span className="shrink-0 w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                <span className="text-[10px] sm:text-[11px] text-white/70 truncate">
                  {liveActivities[currentActivityIndex]}
                </span>
                <X className="w-3 h-3 text-white/30 shrink-0" />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Floating Back to Top button with Progress Ring ─── */}
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="fixed bottom-6 right-6 z-50 w-11 h-11 rounded-full bg-primary/90 text-white shadow-lg shadow-primary/20 hover:bg-primary hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring group"
            aria-label="Volver arriba"
          >
            <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="2.5" />
              <circle
                cx="22" cy="22" r="19" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 19}`}
                strokeDashoffset={`${2 * Math.PI * 19 * (1 - scrollProgress / 100)}`}
                className="transition-[stroke-dashoffset] duration-150 ease-out"
              />
            </svg>
            <ArrowUp className="w-4 h-4 relative z-10" />
            <span className="absolute bottom-full right-0 mb-2 px-2 py-1 rounded-md bg-white dark:bg-[#111827] text-foreground text-[10px] font-medium shadow-lg border border-border whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
              Volver arriba
              <span className="absolute top-full right-4 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-white dark:border-t-[#111827]" />
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* ─── Floating Chat Widget ─── */}
      <div className="fixed bottom-6 right-[4.5rem] z-50 flex flex-col items-end gap-2">
        <AnimatePresence>
          {showChat && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="w-80 max-w-[calc(100vw-3rem)] rounded-xl bg-white dark:bg-[#111827] border border-gray-200 dark:border-white/[0.06] shadow-2xl shadow-black/10 overflow-hidden"
            >
              <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-[#22c55e] to-[#10b981]">
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                  <MessageCircle className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-white">CostPro Assistant</p>
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                    <span className="text-[10px] text-white/80">En línea</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowChat(false)}
                  className="w-6 h-6 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
                  aria-label="Cerrar chat"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <div className="p-4 space-y-3 max-h-60 overflow-y-auto">
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <div className="bg-[#22c55e]/5 border border-[#22c55e]/10 rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">¡Hola! 👋 ¿En qué puedo ayudarte?</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <div className="bg-[#22c55e]/5 border border-[#22c55e]/10 rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">Puedo ayudarte con configuración, reportes o cualquier duda.</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3 h-3 text-[#22c55e]" />
                  </div>
                  <div className="bg-[#22c55e]/5 border border-[#22c55e]/10 rounded-lg rounded-tl-none px-3 py-2 max-w-[85%]">
                    <p className="text-xs text-foreground leading-relaxed">Escribe tu mensaje o usa las opciones rápidas:</p>
                  </div>
                </div>
              </div>
              <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                <button onClick={() => toast.info('Demo próximamente disponible')} className="px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">Ver Demo</button>
                <button onClick={() => toast.info('Soporte técnico disponible en Pro y Enterprise')} className="px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">Soporte Técnico</button>
                <button onClick={() => scrollToSection(3)} className="px-3 py-1.5 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] hover:bg-[#22c55e]/20 transition-colors">Planes y Precios</button>
              </div>
              <div className="px-4 pb-4">
                <div className="flex items-center gap-2 p-1 rounded-lg bg-muted border border-border">
                  <input
                    type="text"
                    placeholder="Escribe tu mensaje..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleChatSend()}
                    className="flex-1 px-2 py-1.5 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    aria-label="Escribir mensaje"
                  />
                  <button
                    onClick={handleChatSend}
                    className="w-7 h-7 rounded-md bg-[#22c55e] hover:bg-[#16a34a] flex items-center justify-center transition-colors shrink-0"
                    aria-label="Enviar mensaje"
                  >
                    <Send className="w-3.5 h-3.5 text-white" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat Toggle Button */}
      <motion.button
        onClick={() => setShowChat(!showChat)}
        className="fixed bottom-[4.5rem] right-6 z-50 w-12 h-12 rounded-full bg-[#22c55e] text-white shadow-lg shadow-[#22c55e]/30 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-[#22c55e]/40 transition-all duration-300 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring group"
        aria-label="Abrir chat de asistencia"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <AnimatePresence mode="wait">
          {showChat ? (
            <motion.span key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <X className="w-5 h-5" />
            </motion.span>
          ) : (
            <motion.span key="open" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.2 }}>
              <MessageCircle className="w-5 h-5" />
            </motion.span>
          )}
        </AnimatePresence>
        {!showChat && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-red-500 border-2 border-white dark:border-[#0a0f1a] animate-pulse" />
        )}
      </motion.button>

      {/* ─── Quick Actions FAB (desktop only) ─── */}
      <div className="fixed bottom-24 left-6 z-40 hidden lg:flex flex-col items-end gap-2">
        <AnimatePresence>
          {showFab && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex flex-col items-end gap-2 mb-2"
            >
              {[
                { icon: CreditCard, label: 'Plan Free', action: () => { const el = document.querySelector('#pricing'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); setShowFab(false); } },
                { icon: Play, label: 'Ver Demo', action: () => { const el = document.querySelector('[aria-label=\"Ver demo de CostPro\"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setShowFab(false); } },
                { icon: Phone, label: 'Contactar', action: () => { setShowContactModal(true); setShowFab(false); } },
              ].map((item, idx) => (
                <motion.button
                  key={item.label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05, duration: 0.2 }}
                  onClick={item.action}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 dark:bg-[#111827]/95 border border-gray-200 dark:border-white/10 shadow-lg shadow-black/10 backdrop-blur-md text-xs font-medium text-foreground hover:bg-[#22c55e]/10 hover:text-[#22c55e] hover:border-[#22c55e]/20 transition-all duration-200"
                  aria-label={item.label}
                >
                  <span>{item.label}</span>
                  <item.icon className="w-3.5 h-3.5" />
                </motion.button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
        <motion.button
          onClick={() => setShowFab(!showFab)}
          className="w-12 h-12 rounded-full bg-[#22c55e] text-white shadow-lg shadow-[#22c55e]/30 hover:bg-[#16a34a] hover:shadow-xl hover:shadow-[#22c55e]/40 transition-all duration-300 flex items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Acciones rápidas"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.span
            animate={{ rotate: showFab ? 45 : 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            <Plus className="w-5 h-5" />
          </motion.span>
        </motion.button>
      </div>

      {/* ─── Keyboard Shortcuts Modal ─── */}
      <Dialog open={showShortcutsModal} onOpenChange={setShowShortcutsModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Keyboard className="w-5 h-5 text-[#22c55e]" />
              Atajos de teclado
            </DialogTitle>
            <DialogDescription>
              Usa estos atajos para navegar más rápido por la página.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {[
              { key: '?', desc: 'Mostrar / ocultar atajos' },
              { key: 'T', desc: 'Cambiar tema claro / oscuro' },
              { key: '1', desc: 'Ir a Inicio' },
              { key: '2', desc: 'Ir a Funciones' },
              { key: '3', desc: 'Ir a Cómo Funciona' },
              { key: '4', desc: 'Ir a Precios' },
              { key: '5', desc: 'Ir a FAQ' },
              { key: 'Esc', desc: 'Cerrar modal / chat' },
            ].map((shortcut) => (
              <div key={shortcut.key} className="flex items-center justify-between py-1.5">
                <span className="text-sm text-muted-foreground">{shortcut.desc}</span>
                <kbd className="px-2.5 py-1 rounded-md bg-muted border border-border text-xs font-mono font-semibold text-foreground shadow-sm">{shortcut.key}</kbd>
              </div>
            ))}
          </div>
          <DialogFooter>
            <button onClick={() => setShowShortcutsModal(false)} className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] transition-colors">Entendido</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Contact Sales Modal ─── */}
      <Dialog open={showContactModal} onOpenChange={setShowContactModal}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#22c55e]" />
              Contactar Ventas — Enterprise
            </DialogTitle>
            <DialogDescription>
              Completa el formulario y nuestro equipo de ventas se pondrá en contacto contigo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nombre <span className="text-red-400">*</span></label>
              <input type="text" value={contactForm.name} onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })} placeholder="Tu nombre" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Nombre" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Email <span className="text-red-400">*</span></label>
              <input type="email" value={contactForm.email} onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })} placeholder="tu@empresa.com" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Email" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Empresa</label>
              <input type="text" value={contactForm.company} onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })} placeholder="Nombre de tu empresa" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Empresa" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Teléfono</label>
              <input type="tel" value={contactForm.phone} onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+502 1234 5678" className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all" aria-label="Teléfono" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-semibold text-foreground">Mensaje</label>
              <textarea value={contactForm.message} onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })} placeholder="Cuéntanos sobre tus necesidades..." rows={3} className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#22c55e]/40 focus:ring-1 focus:ring-[#22c55e]/20 transition-all resize-none" aria-label="Mensaje" />
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowContactModal(false)} className="px-4 py-2 rounded-lg bg-muted border border-border text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors">Cancelar</button>
            <button onClick={handleContactSubmit} className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 transition-all">Enviar solicitud</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cookie Consent Banner */}
      <AnimatePresence>
        {showCookieBanner && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6"
          >
            <div className="max-w-2xl mx-auto flex flex-col sm:flex-row items-center gap-4 p-4 rounded-2xl bg-white/90 dark:bg-[#111827]/90 border border-gray-200 dark:border-white/[0.06] shadow-2xl shadow-black/10 backdrop-blur-xl">
              {/* Cookie icon */}
              <div className="shrink-0 w-10 h-10 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/15 flex items-center justify-center relative">
                <div className="w-5 h-5 rounded-full bg-[#22c55e]/20 border border-[#22c55e]/25 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#22c55e]">🍪</span>
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-background border-2 border-[#22c55e]/15" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground">Utilizamos cookies</p>
                <p className="text-xs text-muted-foreground mt-0.5">Para mejorar tu experiencia y personalizar el contenido. Al continuar, aceptas nuestra política de privacidad.</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => setShowCookieBanner(false)} className="px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground rounded-lg border border-border hover:bg-muted transition-colors">Rechazar</button>
                <button onClick={handleAcceptCookies} className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-[#22c55e] to-[#16a34a] hover:from-[#16a34a] hover:to-[#15803d] rounded-lg shadow-lg shadow-green-500/20 transition-all">Aceptar</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Keyboard Shortcut Hint ─── */}
      {mounted && (
        <button
          onClick={() => setShowShortcutsModal(true)}
          className="fixed bottom-6 left-6 z-40 hidden lg:flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/60 border border-border/50 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-all group"
          aria-label="Mostrar atajos de teclado"
        >
          <Keyboard className="w-3 h-3" />
          <kbd className="font-mono">?</kbd>
        </button>
      )}

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
              className="fixed top-0 left-0 bottom-0 z-[80] w-[280px] bg-[#0a0f1a] dark:bg-[#070c18] border-r border-white/[0.06] shadow-2xl lg:hidden flex flex-col"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
                    <Sparkles className="w-4 h-4 text-[#22c55e]" />
                  </div>
                  <span className="text-lg font-bold tracking-tight text-white font-[family-name:var(--font-space-grotesk)]">
                    Cost<span className="text-[#22c55e]">Pro</span>
                  </span>
                </div>
                <button
                  onClick={() => setShowMobileNav(false)}
                  className="w-8 h-8 rounded-lg bg-white/[0.06] border border-white/[0.08] flex items-center justify-center hover:bg-white/10 transition-colors"
                  aria-label="Cerrar menú"
                >
                  <X className="w-4 h-4 text-white/60" />
                </button>
              </div>

              {/* Drawer Nav Links */}
              <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
                {sectionLabels.map((label, idx) => (
                  <button
                    key={sectionIds[idx]}
                    onClick={() => { scrollToSection(idx); setShowMobileNav(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
                      activeSection === idx
                        ? 'bg-[#22c55e]/10 text-[#22c55e] border border-[#22c55e]/15'
                        : 'text-white/60 hover:text-white/90 hover:bg-white/[0.04] border border-transparent'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                      activeSection === idx ? 'bg-[#22c55e]' : 'bg-white/20'
                    }`} />
                    {label}
                  </button>
                ))}
              </nav>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-white/[0.06] space-y-3">
                <button
                  onClick={() => { handleToggleTheme(); setShowMobileNav(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-sm text-white/70 hover:text-white hover:bg-white/[0.08] transition-all"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  {theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                </button>
                <button className="w-full py-2.5 rounded-lg bg-[#22c55e] text-white text-sm font-bold hover:bg-[#16a34a] shadow-lg shadow-[#22c55e]/20 transition-all">
                  Iniciar Sesión
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ─── What's New Modal ─── */}
      <Dialog open={showWhatsNew} onOpenChange={setShowWhatsNew}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#22c55e]" />
              Novedades de la versión 5.8
            </DialogTitle>
            <DialogDescription>
              Descubre las últimas mejoras que hemos implementado para tu negocio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {v58Features.map((feature, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1, duration: 0.3 }}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border border-border/50 hover:bg-muted transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-[#22c55e]/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Zap className="w-4 h-4 text-[#22c55e]" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{feature}</p>
                </div>
              </motion.div>
            ))}
          </div>
          <DialogFooter>
            <button onClick={() => setShowWhatsNew(false)} className="px-4 py-2 rounded-lg bg-[#22c55e] text-white text-xs font-bold hover:bg-[#16a34a] transition-colors">Entendido</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── RIGHT PANEL (Auth Form) ─── */}
      <div className="relative flex-1 lg:flex-[2] xl:flex-[2] flex items-center justify-center p-6 sm:p-10 lg:p-12 bg-white dark:bg-[#0f1729] border-l-0 lg:border-l border-gray-200 dark:border-white/5 overflow-hidden">
        {/* Animated gradient mesh background */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-20 -left-20 w-[400px] h-[400px] rounded-full bg-[#22c55e]/[0.07] blur-[120px] animate-mesh-drift" />
          <div className="absolute -bottom-20 -right-20 w-[350px] h-[350px] rounded-full bg-[#10b981]/[0.05] blur-[100px] animate-mesh-drift-2" />
        </div>

        {/* Dot pattern overlay */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.015] dark:opacity-[0.02]" style={{
          backgroundImage: 'radial-gradient(circle, #22c55e 0.5px, transparent 0.5px)',
          backgroundSize: '24px 24px',
        }} />

        {/* Floating decorative shapes */}
        <div className="absolute top-[15%] right-[10%] w-16 h-16 rounded-2xl bg-[#22c55e]/[0.06] dark:bg-[#22c55e]/[0.04] border border-[#22c55e]/10 rotate-12 animate-float-shape-1 pointer-events-none hidden lg:block" />
        <div className="absolute bottom-[25%] left-[8%] w-12 h-12 rounded-full bg-[#22c55e]/[0.05] dark:bg-[#22c55e]/[0.03] border border-[#22c55e]/10 animate-float-shape-2 pointer-events-none hidden lg:block" />
        <div className="absolute top-[60%] right-[25%] w-8 h-8 rounded-lg bg-[#22c55e]/[0.04] border border-[#22c55e]/10 animate-float-shape-1 pointer-events-none hidden lg:block" style={{ animationDelay: '-5s' }} />

        {/* Theme toggle */}
        {mounted && (
          <motion.button
            onClick={handleToggleTheme}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-white/80 dark:bg-white/5 border border-border backdrop-blur-sm flex items-center justify-center text-muted-foreground hover:bg-white dark:hover:bg-white/10 hover:shadow-md hover:text-foreground transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Cambiar tema"
          >
            <motion.span
              animate={{ rotate: rotation }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              className="flex items-center justify-center"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </motion.span>
          </motion.button>
        )}

        <motion.div
          variants={slideRight(0.2)}
          initial="hidden"
          animate="visible"
          className="relative z-10 w-full max-w-[420px]"
        >
          {/* Mobile-only logo */}
          <div className="flex flex-col items-center gap-1 mb-6 lg:hidden">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[#22c55e]" />
              </div>
              <div className="flex flex-col items-center">
                <span className="text-xl font-bold tracking-tight text-foreground font-[family-name:var(--font-space-grotesk)]">
                  Cost<span className="text-[#22c55e]">Pro</span>
                </span>
                <span className="text-[10px] font-medium text-[#22c55e]/60 tracking-wide -mt-0.5">v5.8</span>
              </div>
            </div>
            {/* Trusted by micro-badge */}
            <div className="flex items-center gap-1.5 mt-1 mb-4">
              <span className="text-[11px] text-muted-foreground font-medium">✅ Más de 10,000+ empresas confían en nosotros</span>
            </div>
          </div>

          {/* Form card with glow and glassmorphism */}
          <div className="p-6 sm:p-8 rounded-2xl form-card-glass form-card-glow form-top-accent border border-gray-200/60 dark:border-white/[0.08] shadow-xl shadow-black/[0.06] dark:shadow-black/30 transition-all duration-300">
            <Suspense fallback={<DataDecryption />}>
              <LoginForm />
            </Suspense>
          </div>

          {/* Trust badges below form */}
          <motion.div
            variants={fadeIn(0.6)}
            initial="hidden"
            animate="visible"
            className="mt-8 flex items-center justify-center gap-6 text-[11px] text-muted-foreground"
          >
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#22c55e]" />
              <span>SSL Seguro</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[#22c55e]" />
              <span>SOPHOS Protected</span>
            </div>
          </motion.div>

          {/* Footer */}
          <motion.footer
            variants={fadeIn(0.8)}
            initial="hidden"
            animate="visible"
            className="mt-8 pt-6 text-center"
          >
            {/* Social icons row */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <a href="#" className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 border border-border flex items-center justify-center text-muted-foreground hover:text-[#22c55e] transition-all duration-200" aria-label="Twitter / X">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.248M7.5 6h.75a2.25 2.25 0 0 1 2.25 2.25v.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 border border-border flex items-center justify-center text-muted-foreground hover:text-[#22c55e] transition-all duration-200" aria-label="LinkedIn">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M16 8a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6h-4a6 6 0 0 1-6-6V8a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v10a6 6 0 0 1-6 6M2 12h20M10 16h4M12 12l-3.5-2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 border border-border flex items-center justify-center text-muted-foreground hover:text-[#22c55e] transition-all duration-200" aria-label="Instagram">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 20.63 8 4 4 0 0 1-4.63 2.37"/><path d="M17.5 6.5h.01M8 2h8M3 14h6"/></svg>
              </a>
              <a href="#" className="w-8 h-8 rounded-full bg-muted hover:bg-muted/80 border border-border flex items-center justify-center text-muted-foreground hover:text-[#22c55e] transition-all duration-200" aria-label="YouTube">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136L12 9.586l-9.376 5.536a3.016 3.016 0 0 0-2.122 2.136l5.504 3.376a3.016 3.016 0 0 0 2.686-1.455"/><path d="M19.715 8.727l-8.585-5.036a1.5 1.5 0 0 0 .425-1.542 1.5 1.5 0 0 0 .425 1.542v5.892a1.5 1.5 0 0 0 1.5 1.5V12.08a1.5 1.5 0 0 0 1.5 1.5h5.25"/><path d="M2 12h20"/></svg>
              </a>
            </div>

            {/* Divider */}
            <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />

            {/* Copyright */}
            <p className="mt-4 text-[11px] text-muted-foreground/60">
              &copy; 2025 CostPro. Todos los derechos reservados.
            </p>

            {/* Links */}
            <div className="mt-2 flex items-center justify-center gap-4 text-[10px]">
              <a href="#" className="text-muted-foreground/60 hover:text-primary transition-colors">Términos</a>
              <span className="text-muted-foreground/30">&middot;</span>
              <a href="#" className="text-muted-foreground/60 hover:text-primary transition-colors">Privacidad</a>
              <span className="text-muted-foreground/30">&middot;</span>
              <a href="#" className="text-muted-foreground/60 hover:text-primary transition-colors">Soporte</a>
            </div>

            {/* Tagline + Language */}
            <div className="mt-3 flex flex-col items-center gap-1.5">
              <p className="text-[10px] text-muted-foreground/40">
                Hecho con ❤️ para empresarios
              </p>
              <div className="relative language-selector">
                <button
                  onClick={() => {
                    const next = selectedLanguage === 'Español' ? 'English' : selectedLanguage === 'English' ? 'Português' : 'Español';
                    setSelectedLanguage(next);
                    toast.info(`Idioma cambiado a ${next}`, { description: 'El cambio de idioma se aplicará próximamente.' });
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground/40 hover:text-[#22c55e] transition-colors cursor-pointer"
                  aria-label="Cambiar idioma"
                >
                  <Globe className="w-3 h-3" />
                  <span>Idioma: {selectedLanguage}</span>
                  <ChevronDown className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
          </motion.footer>
        </motion.div>
      </div>
    </div>
  );
}