import {
  Calculator, ShoppingCart, Package, BarChart3,
  Store, ShieldCheck, HelpCircle,
  CreditCard, RefreshCw, Wifi, UserPlus, Settings,
  Rocket, TrendingUp, Zap, Clock, Building2, Server, Award,
  Smartphone, CheckCircle, Monitor, Database, Upload, Lock, Globe,
} from 'lucide-react';

/* ── Feature data ── */
export const features = [
  { icon: Calculator, title: 'La ficha oficial que no tienes que calcular', desc: 'Escribe el producto. CostPro distribuye automáticamente el flete, los salarios, el arrendamiento, la Seg. Social y los impuestos. Resultado: la ficha según Res. 148/2023, lista para usar.', tip: 'Todos los conceptos de la ficha se calculan solos: gasto material, salario directo, vacaciones, depreciaciones, gastos generales, contribuciones e impuestos.' },
  { icon: ShoppingCart, title: 'Punto de Venta', desc: 'Terminal POS rápida e intuitiva para procesar ventas con múltiples métodos de pago.', tip: 'Compatible con efectivo, transferencia, QR y más. Ideal para tiendas, restaurantes y servicios.' },
  { icon: Package, title: 'Inventario Inteligente', desc: 'Gestión de stock con alertas de reorden y trazabilidad de movimientos por tienda.', tip: 'Alertas de stock mínimo, recepciones automatizadas y control de inventario por sucursal.' },
  { icon: Store, title: 'Todas tus tiendas desde un panel', desc: '¿Tienes más de un punto de venta? Gestiona cada tienda por separado y mira el negocio completo desde un solo lugar.', tip: 'Cambia de sucursal en 1 clic. Catálogo público por tienda para que tus clientes vean qué hay disponible.' },
  { icon: BarChart3, title: 'Ve cómo evoluciona tu negocio', desc: 'Ventas por período, movimientos de productos, márgenes por tienda. Datos reales para tomar decisiones.', tip: 'Dashboard con KPIs en tiempo real, exportación a PDF y reportes personalizables.' },
  { icon: ShieldCheck, title: 'Control total para quien lo necesite', desc: '¿Conoces a fondo tus costos? Edita cada componente de la ficha: insumos, depreciaciones, gastos directos e indirectos. CostPro recalcula todo al instante.', tip: 'Edita manualmente cualquier fila de la ficha de costo. El sistema recalcula totales, impuestos y precio sugerido.' },
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
    desc: 'Para empezar hoy mismo',
    features: [
      'Fichas de costo ilimitadas',
      'Generación automática (Res. 148/2023)',
      'Cálculo automático de impuestos y Seg. Social',
      'Exportar hasta 3 PDF por día',
      'Sin tarjeta de crédito',
    ],
    cta: 'Crear mi cuenta gratis',
    ctaType: 'signup' as const,
    popular: true,
  },
  {
    name: 'Fichas Pro',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'A convenir',
    period: '',
    desc: 'Para producción en volumen',
    features: [
      'Todo lo del plan gratuito',
      'Exportaciones PDF sin límite diario',
      'Generación masiva de fichas',
      'Importación por lotes de productos',
      'Soporte prioritario por WhatsApp',
    ],
    cta: 'Escribir por WhatsApp',
    ctaType: 'whatsapp' as const,
    popular: false,
  },
  {
    name: 'Multitienda',
    priceMonthly: 0,
    priceAnnual: 0,
    price: 'A convenir',
    period: '',
    desc: 'Para gestionar, vender y crecer',
    features: [
      'Múltiples tiendas virtuales',
      'Catálogo público para clientes',
      'Panel de decisiones en tiempo real',
      'Gestión centralizada de inventario',
      'Combinable con Fichas Pro',
    ],
    cta: 'Escribir por WhatsApp',
    ctaType: 'whatsapp' as const,
    popular: false,
  },
];

export const faqCategories = ['General', 'Precios', 'Técnico'] as const;

export const faqItems = [
  { q: '¿Necesito saber de contabilidad o costos para usar CostPro?', a: 'No. CostPro está diseñado exactamente para quien no tiene formación contable. Introduces el costo del producto, lo que pagas de salario, flete y arrendamiento — el sistema calcula solo la Contribución a la Seguridad Social, los impuestos y el precio sugerido según la Resolución 148/2023 del MFP. Tú no necesitas saber qué fila va cada concepto ni cómo se calculan los porcentajes.', category: 'General' },
  { q: '¿El plan gratuito es gratis de verdad? ¿Sin trampa?', a: 'Sí, completamente. No pedimos tarjeta de crédito ni ningún dato de pago. El plan gratuito incluye fichas de costo ilimitadas y exportación de hasta 3 PDF por día, siempre, sin fecha de expiración. Si en algún momento necesitas más funcionalidades, tú decides si quieres un plan de pago. No hay letra chica ni sorpresas.', category: 'Precios' },
  { q: '¿La ficha que genera CostPro cumple con la Resolución 148/2023?', a: 'Sí. CostPro genera la Ficha de Costos y Gastos según el formato estándar del Ministerio de Finanzas y Precios con todos sus conceptos: gasto material (fila 1), salario directo con vacaciones (fila 2), depreciaciones (fila 3), gastos asociados al producto (fila 4), gastos generales y de administración (fila 6), contribución a la seguridad social al 14% (fila 10.1), impuesto sobre la fuerza de trabajo al 5% (fila 10.2), e impuesto sobre ventas y servicios (fila 13.3). Todos estos valores se calculan automáticamente a partir de los datos base que tú introduces.', category: 'Técnico' },
  { q: '¿Cómo funciona el pago si me interesa un plan de pago?', a: 'El precio se negocia directamente contigo por WhatsApp o teléfono según lo que necesite tu negocio. No hay botón de pago automático ni suscripción forzada — preferimos hablar contigo y asegurarnos de que el plan que eliges te conviene de verdad. Escríbenos al +53 53183215 y lo evaluamos juntos.', category: 'Precios' },
  { q: '¿El módulo de tiendas y catálogo para clientes está en el plan gratuito?', a: 'No. El módulo de tiendas virtuales, el catálogo de exhibición para clientes y el panel de decisiones con métricas en tiempo real son parte de los planes de pago (Multitienda). Si te interesa, escríbenos por WhatsApp al +53 53183215 y lo evaluamos juntos sin compromiso.', category: 'General' },
  { q: '¿Puedo usar CostPro desde el teléfono?', a: 'Sí. CostPro funciona desde cualquier navegador: computadora, tablet o teléfono. Está diseñado para funcionar incluso con conexiones lentas, que es la realidad en muchos lugares de Cuba. No necesitas descargar nada.', category: 'Técnico' },
  { q: '¿Qué pasa con mis datos si pierdo conexión a internet?', a: 'Puedes seguir trabajando sin internet. Cuando recuperes conexión, los datos se sincronizan automáticamente con el servidor. Tus datos están respaldados en la nube de forma segura.', category: 'Técnico' },
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
  { feature: 'Fichas de costo ilimitadas', starter: true, pro: true, enterprise: true },
  { feature: 'Generación automática (Res. 148/2023)', starter: true, pro: true, enterprise: true },
  { feature: 'Cálculo automático de impuestos', starter: true, pro: true, enterprise: true },
  { feature: 'Exportar PDF', starter: '3/día', pro: 'Ilimitado', enterprise: 'Ilimitado' },
  { feature: 'Generación masiva de fichas', starter: false, pro: true, enterprise: true },
  { feature: 'Importación por lotes', starter: false, pro: true, enterprise: true },
  { feature: 'Tiendas virtuales', starter: false, pro: false, enterprise: true },
  { feature: 'Catálogo público para clientes', starter: false, pro: false, enterprise: true },
  { feature: 'Panel de decisiones', starter: false, pro: false, enterprise: true },
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
