'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  Calculator, ShoppingCart, Package, BarChart3, Store,
  Users, BookOpen, Briefcase, Handshake,
  Shield, FileText, Lock, Clock,
  Zap, CheckCircle2, ArrowRight, Globe, Server, Award,
  Heart, Target, Eye, Sparkles, Mail,
  ChevronRight, Bell, ClipboardCheck, Truck, Search,
  TrendingUp, DollarSign, GraduationCap, Headphones, Phone,
} from 'lucide-react';

/* ── Types ── */
type ModalId =
  | 'costos' | 'pos' | 'inventario' | 'reportes' | 'multi-tienda'
  | 'sobre-nosotros' | 'blog' | 'carreras' | 'partners'
  | 'privacidad' | 'terminos' | 'seguridad' | 'sla';

interface FooterModalsProps {
  activeModal: ModalId | null;
  onClose: () => void;
  onNavigate?: (sectionId: string) => void;
}

/* ── Reusable feature card ── */
function FeatureCard({ icon: Icon, title, desc, accent = '#22c55e' }: {
  icon: React.ElementType; title: string; desc: string; accent?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] hover:border-white/[0.1] transition-all duration-200 group"
    >
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}15`, border: `1px solid ${accent}25` }}
      >
        <Icon className="w-4 h-4" style={{ color: accent }} />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white/90 group-hover:text-white transition-colors">{title}</p>
        <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

/* ── CTA Button ── */
function CTAButton({ label, onClick, variant = 'primary' }: {
  label: string; onClick?: () => void; variant?: 'primary' | 'secondary';
}) {
  return (
    <button
      onClick={onClick}
      className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-200 cursor-pointer ${
        variant === 'primary'
          ? 'bg-gradient-to-r from-[#22c55e] to-[#16a34a] text-white shadow-lg shadow-[#22c55e]/20 hover:shadow-[#22c55e]/30 hover:scale-[1.02]'
          : 'bg-white/[0.06] border border-white/[0.1] text-white/70 hover:bg-white/[0.1] hover:text-white'
      }`}
    >
      {label}
    </button>
  );
}

/* ── Section Badge ── */
function SectionBadge({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#22c55e]/10 border border-[#22c55e]/20 text-[10px] font-semibold text-[#22c55e] uppercase tracking-wider">
      {text}
    </span>
  );
}

/* ── List Item ── */
function LegalItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 py-3 border-b border-white/[0.04] last:border-0">
      <p className="text-sm font-semibold text-white/90">{label}</p>
      <div className="text-xs text-white/40 leading-relaxed space-y-1">{children}</div>
    </div>
  );
}

/* ── Stat pill ── */
function StatPill({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col items-center p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
      <span className="text-lg font-extrabold text-[#22c55e] font-[family-name:var(--font-space-grotesk)]">{value}</span>
      <span className="text-[10px] text-white/40 mt-0.5">{label}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODAL CONFIGS — Each with unique, developed content
   ════════════════════════════════════════════════════════════════ */

function ControlCostosContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        El motor de costos de CostPro te permite calcular, analizar y optimizar cada centavo de tus productos.
        Desde fórmulas simples hasta estructuras complejas con múltiples componentes y variables.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FeatureCard icon={Calculator} title="Fórmulas Avanzadas" desc="Crea fórmulas personalizadas con variables, condiciones y funciones matemáticas para cálculos precisos." />
        <FeatureCard icon={FileText} title="Generación Masiva de PDFs" desc="Genera hasta 1,000 hojas de costo mensuales en formato PDF profesional con tu marca." />
        <FeatureCard icon={Sparkles} title="Plantillas Personalizables" desc="Diseña plantillas reutilizables para diferentes líneas de producto con arrastrar y soltar." />
        <FeatureCard icon={BarChart3} title="Desglose por Componentes" desc="Visualiza cada componente del costo: materia prima, mano de obra, overhead, utilidad y más." />
        <FeatureCard icon={Zap} title="Cálculo en Tiempo Real" desc="Los costos se recalculan automáticamente al cambiar precios de insumos o variables." />
        <FeatureCard icon={Globe} title="Múltiples Monedas" desc="Trabaja con diferentes monedas y conversiones automáticas para importaciones." />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <SectionBadge text="Disponible en Pro" />
        <span className="text-[10px] text-white/30">3 PDFs/día en plan Gratis</span>
      </div>
    </div>
  );
}

function PuntoVentaContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Un sistema de punto de venta completo, diseñado para ser rápido e intuitivo.
        Procesa ventas en segundos con soporte para múltiples métodos de pago y facturación automática.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FeatureCard icon={ShoppingCart} title="Interfaz Rápida" desc="Pantalla táctil optimizada para procesar ventas en menos de 5 segundos por transacción." />
        <FeatureCard icon={Zap} title="Escáner de Códigos" desc="Compatible con escáneres de código de barras, QR y búsqueda por nombre de producto." />
        <FeatureCard icon={FileText} title="Facturación Automática" desc="Genera facturas, recibos y notas de crédito automáticamente con datos fiscales." />
        <FeatureCard icon={BarChart3} title="Múltiples Pagos" desc="Acepta efectivo, tarjeta, transferencia y pagos divididos en una misma venta." />
        <FeatureCard icon={Users} title="Control de Cajeros" desc="Gestiona turnos, apertura y cierre de caja con auditoría completa de movimientos." />
        <FeatureCard icon={Package} title="Descuento Automático" desc="Aplica descuentos por volumen, promociones o cupones preconfigurados." />
      </div>
    </div>
  );
}

function InventarioContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Control total de tu inventario en tiempo real. Sabrás exactamente qué tienes, cuánto vale y cuándo reponer.
        Compatible con recepciones, ajustes y transferencias entre sucursales.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FeatureCard icon={Package} title="Stock en Tiempo Real" desc="Actualización instantánea del inventario tras cada venta, recepción o ajuste." />
        <FeatureCard icon={Bell} title="Alertas de Bajo Stock" desc="Notificaciones automáticas cuando un producto alcanza el mínimo configurado." />
        <FeatureCard icon={ClipboardCheck} title="Conteo de Inventario" desc="Realiza conteos físicos con diferencias y ajustes automáticos." />
        <FeatureCard icon={Truck} title="Recepciones" desc="Registra entradas de mercancía con validación de precios y cantidades." />
        <FeatureCard icon={BarChart3} title="Valoración de Inventario" desc="Calcula el valor de tu inventario con métodos FIFO, promedio y costo específico." />
        <FeatureCard icon={Search} title="Búsqueda Avanzada" desc="Encuentra productos por nombre, código, categoría o cualquier atributo personalizado." />
      </div>
    </div>
  );
}

function ReportesContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Toma decisiones informadas con reportes detallados sobre ventas, inventario, costos y más.
        Exporta en PDF o Excel y personaliza los filtros según tus necesidades.
      </p>
      <div className="grid grid-cols-1 gap-2.5">
        {[
          { icon: TrendingUp, title: 'Reportes de Ventas', desc: 'Análisis de ventas por período, producto, categoría y vendedor. Incluye comparativas y tendencias.', accent: '#22c55e' },
          { icon: Package, title: 'Reportes de Inventario', desc: 'Estado actual del stock, rotación de productos, valor total y productos más/menos vendidos.', accent: '#3b82f6' },
          { icon: Calculator, title: 'Reportes de Costos', desc: 'Margen de ganancia por producto, variación de costos, rentabilidad y análisis de rentabilidad.', accent: '#f59e0b' },
          { icon: DollarSign, title: 'Reportes Financieros', desc: 'Flujo de caja, cuentas por cobrar, cuentas por pagar y balance general consolidado.', accent: '#8b5cf6' },
        ].map((item) => (
          <FeatureCard key={item.title} icon={item.icon} title={item.title} desc={item.desc} accent={item.accent} />
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <FileText className="w-3.5 h-3.5 text-white/30" />
        <span className="text-[10px] text-white/30">Exportación disponible en PDF y Excel</span>
      </div>
    </div>
  );
}

function MultiTiendaContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Gestiona múltiples sucursales desde una sola plataforma. Centraliza el control y obtén
        visibilidad completa de cada punto de venta con reportes consolidados.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FeatureCard icon={Store} title="Panel Centralizado" desc="Monitorea todas tus sucursales en un solo dashboard con métricas clave en tiempo real." />
        <FeatureCard icon={Package} title="Inventario Compartido" desc="Consulta y gestiona el inventario de cada tienda desde la sede principal." />
        <FeatureCard icon={Truck} title="Transferencias" desc="Realiza transferencias de productos entre sucursales con seguimiento completo." />
        <FeatureCard icon={BarChart3} title="Reportes Consolidados" desc="Genera reportes individuales por tienda y comparativos entre sucursales." />
        <FeatureCard icon={Users} title="Permisos por Sucursal" desc="Asigna roles y permisos específicos para cada punto de venta." />
        <FeatureCard icon={Globe} title="Configuración Independiente" desc="Cada tienda con su propia configuración de precios, impuestos y métodos de pago." />
      </div>
      <div className="flex items-center gap-3 pt-2">
        <SectionBadge text="Plan Premium" />
        <span className="text-[10px] text-white/30">Incluye IPV y soporte prioritario</span>
      </div>
    </div>
  );
}

function SobreNosotrosContent() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <StatPill value="2+" label="Años" />
        <StatPill value="10+" label="Empresas" />
        <StatPill value="2" label="Países" />
      </div>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-[#22c55e]" />
            <h4 className="text-sm font-bold text-white/90">Nuestra Misión</h4>
          </div>
          <p className="text-xs text-white/50 leading-relaxed pl-6">
            Democratizar la gestión empresarial en Latinoamérica y el Caribe, ofreciendo herramientas
            profesionales y accesibles que permitan a PYMEs tomar el control de sus costos, inventario
            y ventas sin necesidad de conocimientos técnicos avanzados ni grandes inversiones.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#22c55e]" />
            <h4 className="text-sm font-bold text-white/90">Nuestra Visión</h4>
          </div>
          <p className="text-xs text-white/50 leading-relaxed pl-6">
            Ser la plataforma de gestión empresarial líder en la región, reconocida por la simplicidad
            de su interfaz, la potencia de su motor de costos y el compromiso con el éxito de nuestros clientes.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-[#22c55e]" />
            <h4 className="text-sm font-bold text-white/90">Nuestros Valores</h4>
          </div>
          <div className="grid grid-cols-2 gap-2 pl-6">
            {['Simplicidad', 'Transparencia', 'Innovación constante', 'Soporte cercano', 'Seguridad de datos', 'Enfoque en PYMEs'].map((val) => (
              <div key={val} className="flex items-center gap-1.5">
                <CheckCircle2 className="w-3 h-3 text-[#22c55e]/60 shrink-0" />
                <span className="text-xs text-white/40">{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-white/40 leading-relaxed text-center">
          Hecho con dedicación en Cuba, para emprendedores y negocios de toda América Latina.
        </p>
      </div>
    </div>
  );
}

function BlogContent() {
  const articles = [
    { title: 'Cómo calcular costos reales de tus productos', category: 'Costos', date: '15 Abr 2025', color: '#22c55e', excerpt: 'Aprende a desglosar cada componente del costo de tus productos para obtener márgenes de ganancia reales y competitivos.' },
    { title: '5 errores comunes al gestionar inventario', category: 'Inventario', date: '8 Abr 2025', color: '#3b82f6', excerpt: 'Descubre los errores que más le cuestan dinero a las PYMEs y cómo evitarlos con un sistema de inventario adecuado.' },
    { title: 'Guía completa para abrir tu primer negocio', category: 'Emprendimiento', date: '1 Abr 2025', color: '#f59e0b', excerpt: 'Desde la idea hasta la apertura: licencias, costos iniciales, proveedores y herramientas digitales que necesitas.' },
    { title: 'Novedades de CostPro v5.8: lo que debes saber', category: 'Producto', date: '25 Mar 2025', color: '#8b5cf6', excerpt: 'Motor de costos mejorado, integración con WhatsApp Business y reportes personalizados con drag & drop.' },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Artículos, guías y recursos para ayudarte a gestionar mejor tu negocio.
        Contenido creado por nuestro equipo y expertos de la industria.
      </p>
      <div className="space-y-2">
        {articles.map((article, i) => (
          <motion.div
            key={article.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors cursor-pointer group"
          >
            <div className="flex items-start gap-3">
              <div
                className="w-2 h-2 rounded-full shrink-0 mt-1.5"
                style={{ backgroundColor: article.color }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">{article.title}</p>
                <p className="text-xs text-white/35 mt-1 leading-relaxed">{article.excerpt}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] text-white/25">{article.date}</span>
                  <span className="text-[10px] text-[#22c55e]/50 font-medium">{article.category}</span>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-white/20 group-hover:text-white/40 transition-colors shrink-0 mt-1" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function CarrerasContent() {
  const positions = [
    { title: 'Desarrollador Full-Stack', modality: 'Remoto', type: 'Tiempo completo' },
    { title: 'Diseñador UI/UX', modality: 'Remoto', type: 'Tiempo completo' },
    { title: 'Especialista en Marketing Digital', modality: 'Híbrido', type: 'Tiempo completo' },
  ];
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Únete a un equipo apasionado que está construyendo el futuro de la gestión empresarial
        en Latinoamérica. Buscamos personas comprometidas, creativas y que amen los retos.
      </p>
      <div className="space-y-2.5">
        <p className="text-[10px] font-semibold text-[#22c55e]/70 uppercase tracking-widest">Posiciones Abiertas</p>
        {positions.map((pos, i) => (
          <motion.div
            key={pos.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center justify-between p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors cursor-pointer group"
          >
            <div>
              <p className="text-sm font-medium text-white/70 group-hover:text-white/90 transition-colors">{pos.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] text-white/30">{pos.modality}</span>
                <span className="text-white/10">|</span>
                <span className="text-[10px] text-white/30">{pos.type}</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-[#22c55e] transition-colors" />
          </motion.div>
        ))}
      </div>
      <div className="space-y-2.5 pt-1">
        <p className="text-[10px] font-semibold text-[#22c55e]/70 uppercase tracking-widest">Beneficios</p>
        <div className="grid grid-cols-2 gap-2">
          {['Trabajo remoto', 'Horario flexible', 'Crecimiento profesional', 'Equipo multicultural'].map((b) => (
            <div key={b} className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3 h-3 text-[#22c55e]/60 shrink-0" />
              <span className="text-xs text-white/40">{b}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-white/40 text-center mb-2">Envía tu CV o consulta por posiciones</p>
        <div className="flex flex-col items-center gap-1.5">
          <a href="mailto:adrianpompasantana@gmail.com" className="text-sm font-semibold text-[#22c55e] hover:text-[#16a34a] transition-colors">adrianpompasantana@gmail.com</a>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-white/30" />
            <span className="text-xs text-white/40">+53 53183215</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartnersContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Conviértete en partner de CostPro y ayuda a PYMEs de tu región a profesionalizar su gestión.
        Recibe comisiones recurrentes y acceso a recursos exclusivos.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FeatureCard icon={DollarSign} title="Comisiones Recurrentes" desc="Gana hasta un 20% de comisión mensual por cada cliente referido que se mantenga activo." />
        <FeatureCard icon={Award} title="Programa de Niveles" desc="Silver, Gold y Platinum. Más clientes referidos, mejores comisiones y beneficios exclusivos." />
        <FeatureCard icon={GraduationCap} title="Capacitación Gratuita" desc="Accede a nuestro programa de certificación y aprende a implementar CostPro en cualquier negocio." />
        <FeatureCard icon={Headphones} title="Soporte Dedicado" desc="Canal directo con nuestro equipo técnico para resolver dudas de tus clientes de forma ágil." />
      </div>
      <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs text-white/40 text-center mb-2">Interesado en ser partner?</p>
        <div className="flex flex-col items-center gap-1.5">
          <a href="mailto:adrianpompasantana@gmail.com" className="text-sm font-semibold text-[#22c55e] hover:text-[#16a34a] transition-colors">adrianpompasantana@gmail.com</a>
          <div className="flex items-center gap-1.5">
            <Phone className="w-3 h-3 text-white/30" />
            <span className="text-xs text-white/40">+53 53183215</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacidadContent() {
  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
      <p className="text-xs text-white/30 mb-3">Última actualización: Abril 2025</p>
      <LegalItem label="1. Información que recopilamos">
        <p>Recopilamos información que nos proporcionas directamente al crear tu cuenta, como nombre, correo electrónico, nombre de empresa y datos de facturación. También recopilamos datos de uso: páginas visitadas, funciones utilizadas y datos de navegación para mejorar nuestro servicio.</p>
      </LegalItem>
      <LegalItem label="2. Cómo usamos tu información">
        <p>Utilizamos tus datos para: proveer y mantener el servicio, procesar transacciones, enviar notificaciones importantes, mejorar la experiencia del usuario, generar reportes agregados (anónimos) y comunicarnos contigo sobre actualizaciones del producto.</p>
      </LegalItem>
      <LegalItem label="3. Compartir información">
        <p>No vendemos ni alquilamos tu información personal a terceros. Solo compartimos datos con proveedores de servicios necesarios para el funcionamiento de la plataforma (alojamiento, procesamiento de pagos) bajo acuerdos de confidencialidad.</p>
      </LegalItem>
      <LegalItem label="4. Seguridad de datos">
        <p>Implementamos encriptación SSL/TLS para todas las comunicaciones, almacenamiento cifrado en bases de datos, control de acceso basado en roles y auditorías de seguridad periódicas. Cumplimos con las mejores prácticas de la industria.</p>
      </LegalItem>
      <LegalItem label="5. Retención de datos">
        <p>Mantenemos tus datos mientras tu cuenta esté activa. Si eliminas tu cuenta, todos tus datos personales serán eliminados en un plazo de 30 días, excepto los datos requeridos por obligaciones legales.</p>
      </LegalItem>
      <LegalItem label="6. Tus derechos">
        <p>Tienes derecho a: acceder a tus datos personales, solicitar correcciones, solicitar la eliminación de tus datos, exportar tus datos en formato legible y retirar tu consentimiento en cualquier momento.</p>
      </LegalItem>
      <LegalItem label="7. Contacto">
        <p>Para consultas sobre privacidad, escribe a <span className="text-[#22c55e] font-medium">adrianpompasantana@gmail.com</span> o llama al <span className="text-[#22c55e] font-medium">+53 53183215</span></p>
      </LegalItem>
    </div>
  );
}

function TerminosContent() {
  return (
    <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1">
      <p className="text-xs text-white/30 mb-3">Última actualización: Abril 2025</p>
      <LegalItem label="1. Aceptación de los términos">
        <p>Al crear una cuenta y utilizar CostPro, aceptas estar sujeto a estos Términos de Servicio. Si no estás de acuerdo con alguno de estos términos, no deberás utilizar el servicio.</p>
      </LegalItem>
      <LegalItem label="2. Descripción del servicio">
        <p>CostPro es una plataforma de gestión empresarial que incluye: control de costos, punto de venta, inventario, reportes y funciones asociadas. El servicio se proporciona &quot;tal cual&quot; y puede ser modificado o descontinuado sin previo aviso.</p>
      </LegalItem>
      <LegalItem label="3. Cuentas y responsabilidad">
        <p>Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de todas las actividades realizadas bajo tu cuenta. Debes notificarnos inmediatamente de cualquier uso no autorizado.</p>
      </LegalItem>
      <LegalItem label="4. Planes y facturación">
        <p>Los planes se facturan por período anticipado. Las cancelaciones surten efecto al final del período de facturación actual. No se otorgan reembolsos parciales por períodos no utilizados.</p>
      </LegalItem>
      <LegalItem label="5. Uso aceptable">
        <p>No deberás: utilizar el servicio para fines ilegales, intentar acceder a sistemas no autorizados, sobrecargar la infraestructura, o revender el servicio sin autorización expresa por escrito.</p>
      </LegalItem>
      <LegalItem label="6. Propiedad intelectual">
        <p>Todo el contenido, diseño y funcionalidad de CostPro es propiedad intelectual protegida. No podrás copiar, modificar ni distribuir ninguna parte del servicio sin autorización.</p>
      </LegalItem>
      <LegalItem label="7. Limitación de responsabilidad">
        <p>CostPro no será responsable por daños indirectos, incidentales o consecuenciales derivados del uso del servicio. Nuestra responsabilidad total no excederá el monto pagado por el usuario en los últimos 12 meses.</p>
      </LegalItem>
      <LegalItem label="8. Contacto">
        <p>Para consultas legales, escribe a <span className="text-[#22c55e] font-medium">adrianpompasantana@gmail.com</span> o llama al <span className="text-[#22c55e] font-medium">+53 53183215</span></p>
      </LegalItem>
    </div>
  );
}

function SeguridadContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        La seguridad de tus datos es nuestra máxima prioridad. Implementamos múltiples capas de protección
        para garantizar la integridad, confidencialidad y disponibilidad de tu información.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <FeatureCard icon={Lock} title="Encriptación SSL/TLS" desc="Toda la comunicación entre tu navegador y nuestros servidores está encriptada con certificados SSL de 256 bits." />
        <FeatureCard icon={Server} title="Servidores Seguros" desc="Infraestructura alojada en data centers con certificación SOC2, monitoreo 24/7 y copias de seguridad diarias." />
        <FeatureCard icon={Shield} title="Control de Acceso" desc="Autenticación de dos factores (2FA), sesiones seguras con expiración automática y control de acceso basado en roles (RBAC)." />
        <FeatureCard icon={Eye} title="Auditoría Continua" desc="Registro detallado de todas las acciones realizadas en la plataforma. Logs inmutables con trazabilidad completa." />
        <FeatureCard icon={Clock} title="Copias de Seguridad" desc="Backups automáticos cada 6 horas con retención de 30 días y recuperación ante desastres (RPO &lt; 1h)." />
        <FeatureCard icon={CheckCircle2} title="Cumplimiento" desc="Cumplimos con las mejores prácticas de seguridad de la industria y normativas de protección de datos aplicables." />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <Shield className="w-3.5 h-3.5 text-[#22c55e]/60" />
        <span className="text-[10px] text-white/30">Reportar vulnerabilidades: adrianpompasantana@gmail.com</span>
      </div>
    </div>
  );
}

function SLAContent() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-white/50 leading-relaxed">
        Nuestro Acuerdo de Nivel de Servicio (SLA) garantiza la disponibilidad y calidad del servicio
        para que tu negocio siempre esté operativo.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <StatPill value="99.9%" label="Uptime" />
        <StatPill value="24/7" label="Monitoreo" />
        <StatPill value="<4h" label="Respuesta Crítica" />
        <StatPill value="<24h" label="Respuesta Normal" />
      </div>
      <div className="space-y-2.5">
        <p className="text-[10px] font-semibold text-[#22c55e]/70 uppercase tracking-widest">Tiempos de Respuesta por Severidad</p>
        {[
          { level: 'Crítica', desc: 'Servicio completamente no disponible', time: '< 4 horas', color: '#ef4444' },
          { level: 'Alta', desc: 'Funcionalidad principal afectada', time: '< 8 horas', color: '#f59e0b' },
          { level: 'Media', desc: 'Funcionalidad secundaria con problemas', time: '< 24 horas', color: '#3b82f6' },
          { level: 'Baja', desc: 'Consulta general o mejora sugerida', time: '< 48 horas', color: '#22c55e' },
        ].map((item) => (
          <div key={item.level} className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <div className="flex-1">
              <p className="text-xs font-semibold text-white/70">{item.level}</p>
              <p className="text-[10px] text-white/30">{item.desc}</p>
            </div>
            <span className="text-xs font-bold text-white/50 font-mono">{item.time}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 pt-1">
        <SectionBadge text="Pro + Premium" />
        <span className="text-[10px] text-white/30">Plan Gratis: soporte por WhatsApp</span>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   MODAL CONFIG REGISTRY
   ════════════════════════════════════════════════════════════════ */

interface ModalConfig {
  title: string;
  description: string;
  icon: React.ElementType;
  maxWidth: string;
  content: React.ReactNode;
}

const modalConfigs: Record<ModalId, ModalConfig> = {
  costos: {
    title: 'Control de Costos',
    description: 'Motor de costos avanzado para calcular y optimizar tus productos.',
    icon: Calculator,
    maxWidth: 'sm:max-w-2xl',
    content: <ControlCostosContent />,
  },
  pos: {
    title: 'Punto de Venta',
    description: 'Sistema de ventas rápido e intuitivo para tu negocio.',
    icon: ShoppingCart,
    maxWidth: 'sm:max-w-2xl',
    content: <PuntoVentaContent />,
  },
  inventario: {
    title: 'Inventario',
    description: 'Control total de stock en tiempo real.',
    icon: Package,
    maxWidth: 'sm:max-w-2xl',
    content: <InventarioContent />,
  },
  reportes: {
    title: 'Reportes',
    description: 'Información detallada para tomar mejores decisiones.',
    icon: BarChart3,
    maxWidth: 'sm:max-w-lg',
    content: <ReportesContent />,
  },
  'multi-tienda': {
    title: 'Multi-Tienda',
    description: 'Gestiona múltiples sucursales desde una sola plataforma.',
    icon: Store,
    maxWidth: 'sm:max-w-2xl',
    content: <MultiTiendaContent />,
  },
  'sobre-nosotros': {
    title: 'Sobre Nosotros',
    description: 'Conoce la historia y misión detrás de CostPro.',
    icon: Users,
    maxWidth: 'sm:max-w-lg',
    content: <SobreNosotrosContent />,
  },
  blog: {
    title: 'Blog',
    description: 'Artículos y recursos para gestionar mejor tu negocio.',
    icon: BookOpen,
    maxWidth: 'sm:max-w-lg',
    content: <BlogContent />,
  },
  carreras: {
    title: 'Carreras',
    description: 'Únete a nuestro equipo y construye el futuro.',
    icon: Briefcase,
    maxWidth: 'sm:max-w-lg',
    content: <CarrerasContent />,
  },
  partners: {
    title: 'Partners',
    description: 'Programa de aliados para crecer juntos.',
    icon: Handshake,
    maxWidth: 'sm:max-w-2xl',
    content: <PartnersContent />,
  },
  privacidad: {
    title: 'Política de Privacidad',
    description: 'Cómo recopilamos, usamos y protegemos tus datos.',
    icon: Lock,
    maxWidth: 'sm:max-w-lg',
    content: <PrivacidadContent />,
  },
  terminos: {
    title: 'Términos de Servicio',
    description: 'Condiciones de uso de la plataforma CostPro.',
    icon: FileText,
    maxWidth: 'sm:max-w-lg',
    content: <TerminosContent />,
  },
  seguridad: {
    title: 'Seguridad',
    description: 'Medidas de protección para tu información.',
    icon: Shield,
    maxWidth: 'sm:max-w-2xl',
    content: <SeguridadContent />,
  },
  sla: {
    title: 'Acuerdo de Nivel de Servicio (SLA)',
    description: 'Garantías de disponibilidad y calidad del servicio.',
    icon: Clock,
    maxWidth: 'sm:max-w-lg',
    content: <SLAContent />,
  },
};

/* ════════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════════ */

export default function FooterModals({ activeModal, onClose, onNavigate }: FooterModalsProps) {
  if (!activeModal) return null;
  const config = modalConfigs[activeModal];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <Dialog open={!!activeModal} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={`${config.maxWidth} max-h-[85vh] flex flex-col`}>
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#22c55e]/15 border border-[#22c55e]/20 flex items-center justify-center">
              <Icon className="w-4 h-4 text-[#22c55e]" />
            </div>
            {config.title}
          </DialogTitle>
          <DialogDescription>{config.description}</DialogDescription>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto pr-1 -mr-1">
          {config.content}
        </div>
      </DialogContent>
    </Dialog>
  );
}


