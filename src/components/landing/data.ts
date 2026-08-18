import {
  Calculator, ShoppingCart, Package, BarChart3,
  Store, ShieldCheck, HelpCircle,
  CreditCard, RefreshCw, Wifi, UserPlus, Settings,
  Rocket, TrendingUp, Zap, Clock, Building2, Server, Award,
  Smartphone, CheckCircle, Monitor, Database, Upload, Lock, Globe,
} from 'lucide-react';

/* ── Feature data — reordered for Multi-Tienda first positioning ── */
export const features = [
  { icon: Store, title: 'Administra varias tiendas sin multiplicar tus sistemas', desc: 'Gestiona cada tienda por separado y mira el negocio completo desde un solo panel. Cambia de sucursal en 1 clic con aislamiento de datos por tienda.', tip: 'Cada tienda tiene su propio catálogo, inventario, ventas y operaciones. El negocio completo se ve desde un dashboard central.' },
  { icon: Globe, title: 'Dale a cada tienda una vitrina digital propia', desc: 'Cada tienda tiene su propia web donde tus clientes pueden ver productos, precios y disponibilidad. Catálogo público, banner personalizable y canales de WhatsApp/Telegram integrados.', tip: 'Tu tienda física tiene presencia online. Los clientes ven qué hay disponible antes de ir.' },
  { icon: Package, title: 'Controla las existencias de todas tus tiendas desde un mismo lugar', desc: 'Gestión de stock con alertas de reorden y trazabilidad de movimientos por tienda. Recepciones automatizadas y control de inventario por sucursal.', tip: 'Alertas de stock mínimo, kardex completo por producto y transferencias entre tiendas.' },
  { icon: ShoppingCart, title: 'Vende rápido con un POS diseñado para cajeros', desc: 'Terminal de venta intuitiva con escáner de código de barras, pago mixto (efectivo + transferencia + Zelle) y desglose por denominaciones de billetes.', tip: 'Compatible con múltiples monedas, tasas de cambio dinámicas y ventas históricas con fecha personalizada.' },
  { icon: BarChart3, title: 'Ve cómo evoluciona tu negocio en cada tienda', desc: 'Ventas por período, movimientos de productos, márgenes por tienda. Dashboard con KPIs en tiempo real y exportación a Excel.', tip: 'Reportes personalizables, tabla dinámica tipo PivotTable y análisis ABC de productos.' },
  { icon: Calculator, title: 'Fichas de costo integradas — Res. 148/2023', desc: 'Además de gestionar tu negocio, CostPro incorpora herramientas para conocer y controlar tus costos. Distribución automática de flete, salarios, depreciaciones e impuestos.', tip: 'La ficha oficial que no tienes que calcular. Todos los conceptos se distribuyen solos según la metodología del MFP cubano.' },
];

// DEPRECATED: will be removed in LandingPage refactor
export const statsData = [
  { value: 90, suffix: '+', label: 'Usuarios activos', prefix: '' },
  { value: 20, suffix: '+', label: 'Tiendas', prefix: '' },
  { value: 2, suffix: 'M+', label: 'Transacciones', prefix: '' },
];

// DEPRECATED: will be removed in LandingPage refactor
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

export const faqIcons = [HelpCircle, HelpCircle, ShieldCheck, CreditCard, HelpCircle, Smartphone, Wifi];

// DEPRECATED: will be removed in LandingPage refactor
export const differentiatorsData = [
  { icon: TrendingUp, stat: '23%', desc: 'Reducción promedio en costos operativos' },
  { icon: Clock, stat: '4x', desc: 'Más rápido que métodos manuales' },
  { icon: Building2, stat: '99%', desc: 'Tasa de satisfacción de usuarios' },
  { icon: Zap, stat: '<2min', desc: 'Tiempo promedio de configuración' },
];

export const pricingPlans = [
  {
    name: 'Gratis',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'Gratis',
    period: '',
    desc: 'Empieza a gestionar tu primera tienda',
    features: [
      '1 tienda con inventario y ventas',
      'Punto de venta (POS) completo',
      'Fichas de costo Res. 148/2023',
      'Exportar hasta 3 PDF por día',
      'Sin tarjeta de crédito',
    ],
    cta: 'Crear mi cuenta gratis',
    ctaType: 'signup' as const,
    popular: true,
  },
  {
    name: 'Multi-Tienda',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'A convenir',
    period: '',
    desc: 'Plataforma completa con vitrina digital',
    features: [
      'Múltiples tiendas desde un solo panel',
      'Vitrina digital propia para cada tienda',
      'Catálogo público con precios y disponibilidad',
      'Gestión centralizada de inventario',
      'Panel de decisiones en tiempo real',
      'Fichas de costo sin límite de exportación',
    ],
    cta: 'Escribir por WhatsApp',
    ctaType: 'whatsapp' as const,
    popular: true,
  },
  {
    name: 'Empresarial',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'A convenir',
    period: '',
    desc: 'Para múltiples establecimientos y equipos',
    features: [
      'Todo lo del plan Multi-Tienda',
      'Generación masiva de fichas de costo',
      'Importación por lotes de productos',
      'Roles y permisos por usuario',
      'Soporte prioritario y capacitación',
    ],
    cta: 'Escribir por WhatsApp',
    ctaType: 'whatsapp' as const,
    popular: false,
  },
];

export const faqCategories = ['General', 'Precios', 'Técnico'] as const;

export const faqItems = [
  { q: '¿Puedo administrar varias tiendas desde CostPro?', a: 'Sí. CostPro está diseñado para gestionar múltiples tiendas desde un solo panel. Cada tienda tiene su propio catálogo, inventario, ventas y operaciones independientes, mientras tú ves el negocio completo desde un dashboard central. Cambias de sucursal en 1 clic.', category: 'General' },
  { q: '¿Qué es la vitrina digital de cada tienda?', a: 'Cada tienda puede tener su propia página web pública donde tus clientes ven los productos, precios y disponibilidad. No es una tienda online con checkout: es un catálogo de exhibición que da presencia digital a tu negocio. Los clientes pueden ver qué hay disponible antes de visitar la tienda o contactarte.', category: 'General' },
  { q: '¿El plan gratuito es gratis de verdad?', a: 'Sí. No pedimos tarjeta de crédito ni datos de pago. El plan gratuito incluye 1 tienda con inventario, ventas, POS completo y fichas de costo Res. 148/2023, sin fecha de expiración. Si necesitas múltiples tiendas o vitrina digital, puedes pasar a un plan de pago cuando quieras.', category: 'Precios' },
  { q: '¿Cómo funciona el pago si me interesa un plan de pago?', a: 'El precio se negocia directamente contigo por WhatsApp según lo que necesite tu negocio. No hay botón de pago automático ni suscripción forzada. Escríbenos al +53 53183215 y lo evaluamos juntos.', category: 'Precios' },
  { q: '¿Las fichas de costo cumplen con la Resolución 148/2023?', a: 'Sí. CostPro genera fichas de costo y gastos según el formato del MFP con todos los conceptos calculados automáticamente: gasto material, salarios, depreciaciones, seguros, impuestos y contribuciones. Es una herramienta integrada dentro de la plataforma, no un producto separado.', category: 'Técnico' },
  { q: '¿Puedo usar CostPro desde el teléfono?', a: 'Sí. Funciona desde cualquier navegador: computadora, tablet o teléfono. Está optimizado para conexiones lentas. No necesitas descargar nada.', category: 'Técnico' },
  { q: '¿Qué pasa con mis datos si pierdo conexión a internet?', a: 'Puedes seguir trabajando sin internet. Cuando recuperes conexión, los datos se sincronizan automáticamente. Tus datos están respaldados en la nube de forma segura.', category: 'Técnico' },
];

// DEPRECATED: will be removed in LandingPage refactor
export const clientLogos = [
  'Construcción', 'Transportación', 'Alimentos y Bebidas', 'Ferretería Industrial',
  'Farmacia', 'Automotriz', 'Textil', 'Retail y Tiendas',
  'Manufactura', 'Servicios Profesionales', 'Logística', 'Salud',
];

export const demoSlides = [
  { title: 'Dashboard Ejecutivo', desc: 'Monitorea KPIs, ventas y costos en tiempo real', color: 'from-[#052e16] via-[#064e3b] to-[#0f172a]', accent: '#22c55e', icon: BarChart3 },
  { title: 'Hoja de Costos', desc: 'Calcula márgenes, receta y costos operativos', color: 'from-[#0f172a] via-[#1e1b4b] to-[#0f172a]', accent: '#34d399', icon: Calculator },
  { title: 'Terminal POS', desc: 'Procesa ventas rápidas con múltiples métodos de pago', color: 'from-[#064e3b] via-[#0d2137] to-[#0a0f1a]', accent: '#6ee7b7', icon: ShoppingCart },
];

export const integrationPartners = [
  { name: 'WhatsApp', letter: 'W' },
  { name: 'Supabase', letter: 'S' },
  { name: 'Vercel', letter: 'V' },
];

export const comparisonRows = [
  { feature: 'Número de tiendas', starter: '1', pro: 'Múltiples', enterprise: 'Múltiples' },
  { feature: 'Vitrina digital por tienda', starter: false, pro: true, enterprise: true },
  { feature: 'Catálogo público para clientes', starter: false, pro: true, enterprise: true },
  { feature: 'Inventario y recepciones', starter: true, pro: true, enterprise: true },
  { feature: 'Punto de venta (POS)', starter: true, pro: true, enterprise: true },
  { feature: 'Panel de decisiones', starter: false, pro: true, enterprise: true },
  { feature: 'Fichas de costo (Res. 148/2023)', starter: true, pro: true, enterprise: true },
  { feature: 'Exportar PDF', starter: '3/día', pro: 'Ilimitado', enterprise: 'Ilimitado' },
  { feature: 'Generación masiva de fichas', starter: false, pro: false, enterprise: true },
  { feature: 'Importación por lotes', starter: false, pro: false, enterprise: true },
  { feature: 'Soporte WhatsApp', starter: false, pro: true, enterprise: true },
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

export const sectionIds = ['hero', 'como-funciona', 'features', 'pricing', 'faq'];
export const sectionLabels = ['Inicio', 'Cómo Funciona', 'Funciones', 'Precios', 'FAQ'];

/* ── FIX #009: Feature list for v5.8 marketing badge ── */
export const v58Features = [
  'Motor de costos mejorado con fórmulas avanzadas',
  'Integración con WhatsApp Business',
  'Reportes personalizados con drag & drop',
  'Modo offline con sincronización automática',
];
