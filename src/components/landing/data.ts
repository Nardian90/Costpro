import {
  Calculator, ShoppingCart, Package, BarChart3,
  Store, ShieldCheck, Users, Star, HelpCircle,
  CreditCard, RefreshCw, Wifi, UserPlus, Settings,
  Rocket, TrendingUp, Zap, Clock, Building2, Server, Award,
  Smartphone, CheckCircle, Monitor, Database, Upload, Lock, Globe,
} from 'lucide-react';

/* ── Feature data ── */
export const features = [
  { icon: Calculator, title: 'Control de Costos', desc: 'Calcula costos precisos con motor de fórmulas avanzado y auditoría por transacción.', tip: 'Soporta fórmulas personalizadas, historial de cambios y auditoría completa por cada transacción registrada.' },
  { icon: ShoppingCart, title: 'Punto de Venta', desc: 'Terminal POS rápida e intuitiva con soporte para múltiples métodos de pago.', tip: 'Compatible con tarjeta, efectivo, QR y múltiples pasarelas de pago en tiempo real.' },
  { icon: Package, title: 'Inventario Inteligente', desc: 'Gestión automatizada de stock con alertas de reorden y recepciones.', tip: 'Alertas inteligentes de stock mínimo con recepciones automatizadas y reportes de movimientos.' },
  { icon: BarChart3, title: 'Reportes en Tiempo Real', desc: 'Dashboard ejecutivo con KPIs en vivo y exportación a PDF/Excel.', tip: 'Más de 30 plantillas de reportes personalizables con exportación programada.' },
  { icon: Store, title: 'Multi-Tienda', desc: 'Administra múltiples sucursales desde una sola plataforma centralizada.', tip: 'Cambia de sucursal en 1 clic con sincronización en tiempo real.' },
  { icon: ShieldCheck, title: 'Seguridad Total', desc: 'Roles granulares, auditoría de acciones y protección de datos empresariales.', tip: 'Encriptación AES-256, autenticación 2FA y backup automático diario.' },
];

export const statsData = [
  { value: 90, suffix: '+', label: 'Usuarios activos', prefix: '' },
  { value: 20, suffix: '+', label: 'Tiendas', prefix: '' },
  { value: 2, suffix: 'M+', label: 'Transacciones', prefix: '' },
];

export const testimonials = [
  { name: 'Carlos M.', role: 'Restaurante El Sabor', text: 'CostPro redujo nuestros costos operativos en un 23%. La interfaz es intuitiva y los reportes son impecables.', rating: 5 },
  { name: 'María L.', role: 'Ferretería Industrial', text: 'El módulo de inventario nos ahorra horas semanales. Las alertas de reorden son un game changer.', rating: 5 },
  { name: 'Andrés R.', role: 'Tienda Deportiva Pro', text: 'El punto de venta es rápido y confiable. Nunca tuvimos un corte de servicio desde la implementación.', rating: 5 },
];

export const howItWorksSteps = [
  { icon: UserPlus, title: 'Regístrate', desc: 'Crea tu cuenta gratuita en menos de 2 minutos' },
  { icon: Settings, title: 'Configura', desc: 'Personaliza tu negocio con plantillas inteligentes' },
  { icon: Rocket, title: 'Opera', desc: 'Gestiona ventas, inventario y costos en tiempo real' },
  { icon: TrendingUp, title: 'Crece', desc: 'Escala con reportes avanzados y análisis predictivo' },
];

export const faqIcons = [HelpCircle, ShieldCheck, CreditCard, RefreshCw, Wifi, Users, Smartphone, CheckCircle, Monitor, Database, Upload, Lock, Settings, Globe];

export const differentiatorsData = [
  { icon: TrendingUp, stat: '23%', desc: 'Reducción promedio en costos operativos' },
  { icon: Clock, stat: '4x', desc: 'Más rápido que métodos manuales' },
  { icon: Users, stat: '99%', desc: 'Tasa de satisfacción de usuarios' },
  { icon: Zap, stat: '<2min', desc: 'Tiempo promedio de configuración' },
];

export const pricingPlans = [
  {
    name: 'Gratis',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'Gratis',
    period: '',
    desc: 'Comienza a crear tus fichas de costo desde hoy',
    features: ['Hasta 3 fichas de costo en PDF al día', 'Motor de costos básico (individual)', 'Plantillas predefinidas'],
    cta: 'Comenzar gratis',
    popular: false,
  },
  {
    name: 'Pro',
    priceMonthly: 1000,
    priceAnnual: 800,
    price: 'CUP $1,000',
    period: '/mes',
    desc: 'Fichas ilimitadas para tu negocio',
    features: ['Fichas de costo ilimitadas en PDF', 'Historial y versionado completo', 'Reportes avanzados', 'Soporte por WhatsApp y teléfono'],
    cta: 'Comenzar Pro',
    popular: true,
  },
  {
    name: 'Premium',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'Custom',
    period: '',
    desc: 'Acceso a todos los módulos de CostPro',
    features: ['Todo en Pro', 'Módulo Multi-Tienda', 'Módulo IPV Inteligente', 'Soporte WhatsApp + teléfono + presencial'],
    cta: 'Contactar ventas',
    popular: false,
  },
];

export const faqCategories = ['General', 'Precios', 'Técnico'] as const;

export const faqItems = [
  { q: '¿Necesito experiencia técnica para usar CostPro?', a: 'No. CostPro está diseñado con una interfaz intuitiva que cualquier empresario puede usar sin conocimientos técnicos. Además ofrecemos tutoriales interactivos y soporte 24/7.', category: 'General' },
  { q: '¿Mis datos están seguros?', a: 'Absolutamente. Utilizamos encriptación de extremo a extremo, servidores con certificación SOC2, y cumplimos con las normativas de protección de datos vigentes.', category: 'Técnico' },
  { q: '¿Puedo cambiar de plan en cualquier momento?', a: 'Sí, puedes escalar o reducir tu plan en cualquier momento. Los cambios se aplican de inmediato y solo pagas la diferencia proporcional.', category: 'Precios' },
  { q: '¿Ofrecen migración desde otro sistema?', a: 'Sí, nuestro equipo de soporte te ayuda a migrar tus datos desde cualquier sistema. El proceso es gratuito para planes Pro y Enterprise.', category: 'Técnico' },
  { q: '¿Funciona sin conexión a internet?', a: 'CostPro tiene modo offline que te permite continuar operando sin internet. Los datos se sincronizan automáticamente cuando recuperas la conexión.', category: 'Técnico' },
  { q: '¿Qué tipo de negocios puede usar CostPro?', a: 'CostPro es ideal para restaurantes, ferreterías, tiendas retail, farmacias, negocios de alimentos y cualquier PYME que necesite controlar costos, inventario y ventas. Nuestros usuarios abarcan más de 12 sectores diferentes.', category: 'General' },
  { q: '¿CostPro funciona en dispositivos móviles?', a: 'Sí, CostPro es completamente responsivo. Puedes acceder desde cualquier dispositivo con navegador: computadora, tablet o teléfono móvil. También ofrecemos una experiencia optimizada para tablets en el punto de venta.', category: 'General' },
  { q: '¿Puedo usar CostPro sin tarjeta de crédito?', a: 'Absolutamente. El plan Gratis no requiere tarjeta de crédito. Para el plan Pro, aceptamos transferencias bancarias y pagos vía WhatsApp. Solo necesitas una tarjeta si prefieres pagar en línea de forma recurrente.', category: 'Precios' },
  { q: '¿Existe alguna tarifa de configuración o activación?', a: 'No. La configuración es completamente gratuita y puedes empezar a usar CostPro en menos de 2 minutos. No hay tarifas ocultas ni costos de activación en ninguno de nuestros planes.', category: 'Precios' },
  { q: '¿Qué pasa si supero los límites de mi plan?', a: 'Recibirás una notificación cuando te acerques al límite de tu plan. En el plan Gratis, las fichas adicionales se bloquean hasta el día siguiente. En el plan Pro, los límites son suficientemente amplios para la mayoría de las PYMEs.', category: 'Precios' },
  { q: '¿Qué navegadores son compatibles con CostPro?', a: 'CostPro funciona correctamente en los últimas versiones de Google Chrome, Mozilla Firefox, Microsoft Edge y Safari. Recomendamos Chrome o Edge para la mejor experiencia, especialmente en el módulo de punto de venta.', category: 'Técnico' },
  { q: '¿Cómo se realizan las copias de seguridad de mis datos?', a: 'Realizamos copias de seguridad automáticas cada 6 horas con retención de 30 días. Tus datos están protegidos con encriptación AES-256 y almacenados en servidores con certificación SOC2. También puedes exportar tus datos manualmente en cualquier momento.', category: 'Técnico' },
  { q: '¿Puedo importar mis datos desde Excel u otro sistema?', a: 'Sí, CostPro soporta importación de datos desde archivos Excel y CSV. Nuestro equipo de soporte te guía en el proceso de migración, que es gratuito para planes Pro. También puedes registrar productos manualmente uno a uno.', category: 'Técnico' },
  { q: '¿Cuántos usuarios pueden usar CostPro simultáneamente?', a: 'En el plan Gratis puedes tener 1 usuario. En el plan Pro hasta 5 usuarios con roles personalizados. En el plan Premium, el límite es flexible según las necesidades de tu negocio, con roles granulares y permisos por sucursal.', category: 'Técnico' },
];

export const clientLogos = [
  'Construcción', 'Transportación', 'Alimentos y Bebidas', 'Ferretería Industrial',
  'Farmacia', 'Automotriz', 'Textil', 'Retail y Tiendas',
  'Manufactura', 'Servicios Profesionales', 'Logística', 'Salud',
];

/* ── Animated Stats Counter Data ── */
export const animatedStatsData = [
  { value: 90, prefix: '+', label: 'Usuarios activos', icon: Building2, decimals: 0 },
  { value: 2, prefix: '', label: 'Millones de transacciones', icon: BarChart3, decimals: 0 },
  { value: 99.9, prefix: '', label: 'Uptime garantizado', icon: Server, decimals: 1 },
  { value: 4.8, prefix: '★ ', label: 'Calificación promedio', icon: Award, decimals: 1 },
];

export const integrationPartners = [
  { name: 'Stripe', letter: 'S' },
  { name: 'PayPal', letter: 'P' },
  { name: 'Mercado Pago', letter: 'M' },
  { name: 'WhatsApp', letter: 'W' },
  { name: 'Google Workspace', letter: 'G' },
  { name: 'Slack', letter: 'Sl' },
];

export const liveActivities = [
  { text: 'Carlos M. de Guatemala se registró', time: 'hace 3 min', emoji: '🟢' },
  { text: 'Restaurante El Sabor completó su primer inventario', time: 'hace 7 min', emoji: '🟢' },
  { text: '+47 transacciones procesadas en la última hora', time: 'hace 12 min', emoji: '🟢' },
  { text: 'Ferretería Industrial ahorró $1,200 este mes', time: 'hace 15 min', emoji: '🟢' },
  { text: 'Tienda Pro alcanzó 500 ventas este mes', time: 'hace 5 min', emoji: '🟢' },
  { text: 'Café Buen Día migró desde Excel', time: 'hace 20 min', emoji: '🟢' },
];

export const demoSlides = [
  { title: 'Dashboard Ejecutivo', desc: 'Monitorea KPIs, ventas y costos en tiempo real', color: 'from-[#052e16] via-[#064e3b] to-[#0f172a]', accent: '#22c55e', icon: BarChart3 },
  { title: 'Hoja de Costos', desc: 'Calcula márgenes, receta y costos operativos', color: 'from-[#0f172a] via-[#1e1b4b] to-[#0f172a]', accent: '#34d399', icon: Calculator },
  { title: 'Terminal POS', desc: 'Procesa ventas rápidas con múltiples métodos de pago', color: 'from-[#064e3b] via-[#0d2137] to-[#0a0f1a]', accent: '#6ee7b7', icon: ShoppingCart },
];

export const diffProgressBars = [85, 70, 95, 60];

export const comparisonRows = [
  { feature: 'Fichas de costo en PDF', starter: '3/día', pro: 'Ilimitadas', enterprise: 'Ilimitadas' },
  { feature: 'Motor de costos (individual)', starter: true, pro: true, enterprise: true },
  { feature: 'Generación masiva de fichas PDF', starter: false, pro: true, enterprise: true },
  { feature: 'Reportes avanzados', starter: false, pro: true, enterprise: true },
  { feature: 'Módulo Multi-Tienda', starter: false, pro: false, enterprise: true },
  { feature: 'Módulo IPV Inteligente', starter: false, pro: false, enterprise: true },
  { feature: 'Soporte WhatsApp', starter: false, pro: true, enterprise: true },
  { feature: 'Soporte teléfono', starter: false, pro: true, enterprise: true },
  { feature: 'Soporte presencial', starter: false, pro: false, enterprise: true },
];

export const shortcutsList = [
  { key: '?', desc: 'Mostrar / ocultar atajos', category: 'General' },
  { key: 'T', desc: 'Cambiar tema claro / oscuro', category: 'General' },
  { key: '1', desc: 'Ir a Inicio', category: 'Navegación' },
  { key: '2', desc: 'Ir a Funciones', category: 'Navegación' },
  { key: '3', desc: 'Ir a Cómo Funciona', category: 'Navegación' },
  { key: '4', desc: 'Ir a Precios', category: 'Navegación' },
  { key: '5', desc: 'Ir a FAQ', category: 'Navegación' },
  { key: 'N', desc: 'Ir a Newsletter', category: 'Navegación' },
  { key: 'C', desc: 'Contactar ventas', category: 'Acciones' },
  { key: 'Esc', desc: 'Cerrar modal / chat', category: 'General' },
];

export const sectionIds = ['hero', 'features', 'how-it-works', 'pricing', 'faq'];
export const sectionLabels = ['Inicio', 'Funciones', 'Cómo Funciona', 'Precios', 'FAQ'];

/* ── FIX #009: Feature list for v5.8 marketing badge ── */
export const v58Features = [
  'Motor de costos mejorado con fórmulas avanzadas',
  'Integración con WhatsApp Business',
  'Reportes personalizados con drag & drop',
  'Modo offline con sincronización automática',
];

export const featureTooltips: Record<string, string> = {
  'Control de Costos': 'Motor de fórmulas con auditoría completa por transacción',
  'Punto de Venta': 'Terminal POS con soporte para NFC y múltiples métodos de pago',
  'Inventario Inteligente': 'Alertas predictivas de reorden basadas en IA',
  'Reportes en Tiempo Real': 'Exporta a PDF, Excel y Google Sheets con un clic',
  'Multi-Tienda': 'Centraliza hasta 100 sucursales en un solo panel',
  'Seguridad Total': 'Encriptación AES-256 + auditoría de acciones en tiempo real',
};
