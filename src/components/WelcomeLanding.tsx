'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Shield,
  Zap,
  BarChart3,
  Users,
  ShoppingCart,
  FileSpreadsheet,
  Clock,
  TrendingUp,
  ChevronRight,
  Play,
  HelpCircle,
  Cpu
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import CostProLogo from '@/components/CostProLogo';
import { Card, CardContent } from '@/components/ui/card';

// --- Animated SVG Components ---

const ImportFlowSVG = () => (
  <svg viewBox="0 0 400 200" className="w-full h-auto">
    <defs>
      <linearGradient id="flowGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#10b981" stopOpacity="0" />
        <stop offset="50%" stopColor="#10b981" stopOpacity="0.5" />
        <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* Excel Icon Area */}
    <rect x="20" y="70" width="60" height="60" rx="12" fill="#16a34a" fillOpacity="0.1" stroke="#16a34a" strokeWidth="2" />
    <FileSpreadsheet className="text-green-600" x="35" y="85" width="30" height="30" />
    <text x="50" y="150" textAnchor="middle" className="text-[10px] font-black fill-muted-foreground uppercase tracking-widest">Excel</text>

    {/* System Core Area */}
    <rect x="170" y="60" width="60" height="80" rx="12" fill="#10b981" fillOpacity="0.2" stroke="#10b981" strokeWidth="2" />
    <motion.g
      animate={{ rotate: 360 }}
      transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
    >
      <Cpu className="text-emerald-600" x="185" y="85" width="30" height="30" />
    </motion.g>
    <text x="200" y="160" textAnchor="middle" className="text-[10px] font-black fill-emerald-600 uppercase tracking-widest">CostPro Engine</text>

    {/* Fichas Area */}
    <rect x="320" y="70" width="60" height="60" rx="12" fill="#10b981" fillOpacity="0.1" stroke="#10b981" strokeWidth="2" />
    <CheckCircle2 className="text-emerald-600" x="335" y="85" width="30" height="30" />
    <text x="350" y="150" textAnchor="middle" className="text-[10px] font-black fill-muted-foreground uppercase tracking-widest">Fichas Listas</text>

    {/* Flowing Particles */}
    {[0, 1, 2].map((i) => (
      <motion.circle
        key={`p1-${i}`}
        r="3"
        fill="#10b981"
        initial={{ cx: 80, cy: 100, opacity: 0 }}
        animate={{
          cx: 170,
          opacity: [0, 1, 0]
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          delay: i * 0.6,
          ease: "linear"
        }}
      />
    ))}

    {[0, 1, 2].map((i) => (
      <motion.circle
        key={`p2-${i}`}
        r="3"
        fill="#10b981"
        initial={{ cx: 230, cy: 100, opacity: 0 }}
        animate={{
          cx: 320,
          opacity: [0, 1, 0]
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          delay: i * 0.5 + 0.3,
          ease: "linear"
        }}
      />
    ))}
  </svg>
);

const EfficiencyClockSVG = () => (
  <svg viewBox="0 0 200 200" className="w-full h-auto">
    <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="4" className="text-muted/20" />
    <motion.path
      d="M 100,20 A 80,80 0 1,1 99.9,20"
      fill="none"
      stroke="#10b981"
      strokeWidth="8"
      strokeLinecap="round"
      initial={{ pathLength: 0 }}
      animate={{ pathLength: 1 }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    />
    <motion.line
      x1="100" y1="100" x2="100" y2="40"
      stroke="#10b981"
      strokeWidth="4"
      strokeLinecap="round"
      animate={{ rotate: 360 }}
      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
      style={{ originX: "100px", originY: "100px" }}
    />
    <CheckCircle2 className="text-emerald-500" x="80" y="80" width="40" height="40" />
  </svg>
);

const BusinessScaleSVG = () => (
  <svg viewBox="0 0 200 200" className="w-full h-auto">
    {/* Growing Bar Chart */}
    {[0, 1, 2, 3].map((i) => (
      <motion.rect
        key={`bar-${i}`}
        x={40 + i * 35}
        y={160}
        width="25"
        rx="6"
        fill="#10b981"
        initial={{ height: 0, y: 160 }}
        animate={{ height: 30 + i * 35, y: 160 - (30 + i * 35) }}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "reverse",
          delay: i * 0.2,
          ease: "easeInOut"
        }}
      />
    ))}
    {/* Decreasing Manual Effort Indicator */}
    <motion.path
      d="M 40,50 L 160,50"
      stroke="#ef4444"
      strokeWidth="2"
      strokeDasharray="4 4"
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.1, 0.5] }}
      transition={{ duration: 4, repeat: Infinity }}
    />
    <TrendingUp className="text-emerald-500" x="140" y="20" width="30" height="30" />
  </svg>
);

// --- Sub-components for Sections ---

const FeatureCard = ({ icon: Icon, title, description }: { icon: any, title: string, description: string }) => (
  <Card className="bg-background/50 backdrop-blur-sm border-primary/10 hover:border-primary/30 transition-all group rounded-3xl overflow-hidden">
    <CardContent className="p-8 space-y-4">
      <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-lg font-black uppercase tracking-tight">{title}</h3>
      <p className="text-sm text-muted-foreground font-medium leading-relaxed">{description}</p>
    </CardContent>
  </Card>
);

interface WelcomeLandingProps {
  onStart: () => void;
  isAuthenticated?: boolean;
}

export default function WelcomeLanding({ onStart, isAuthenticated = false }: WelcomeLandingProps) {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-white overflow-x-hidden">
      {/* Header / Navbar */}
      <nav className="fixed top-0 w-full z-50 bg-background/80 backdrop-blur-md border-b border-border/50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
             <div className="scale-50 -ml-8">
                <CostProLogo size={40} animated={false} />
             </div>
             <span className="font-black text-xl tracking-tighter uppercase -ml-4">
               COST<span className="text-primary">PRO</span>
             </span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Funcionalidades</a>
            <a href="#case-study" className="text-xs font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors">Caso de Uso</a>
            <Button
              onClick={onStart}
              className="rounded-xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-[10px] px-6 h-10 shadow-lg shadow-primary/20"
            >
              {isAuthenticated ? 'Ir al Dashboard' : 'Acceso Clientes'}
            </Button>
          </div>
          <Button
            onClick={onStart}
            size="sm"
            className="md:hidden rounded-xl bg-primary text-white font-black uppercase tracking-widest text-[10px]"
          >
            {isAuthenticated ? 'Dashboard' : 'Acceso'}
          </Button>
        </div>
      </nav>

      <main>
        {/* Hero Section */}
        <section className="relative pt-40 pb-24 px-6 overflow-hidden">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-[600px] bg-primary/5 blur-[120px] rounded-full -z-10" />

          <div className="max-w-4xl mx-auto text-center space-y-8">
            <motion.g
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <Badge variant="outline" className="py-1.5 px-4 rounded-full border-primary/20 bg-primary/5 text-primary font-black uppercase tracking-[0.2em] text-[10px] mb-6">
                v5.7 Enterprise Hardened
              </Badge>
              <h1 className="text-5xl md:text-7xl font-black tracking-tighter uppercase leading-[0.9] mb-6">
                Protege tus <span className="text-primary">Costos</span>,<br />
                Escala tu Negocio.
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground font-medium max-w-2xl mx-auto leading-relaxed">
                La plataforma inteligente de ingeniería de costos y punto de venta diseñada para que las MiPyMEs operen con precisión matemática y agilidad digital.
              </p>
            </motion.g>

            <motion.g
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              <Button
                onClick={onStart}
                size="lg"
                className="w-full sm:w-auto rounded-2xl bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest px-10 h-14 text-xs shadow-xl shadow-primary/20 group"
              >
                {isAuthenticated ? 'Volver al Sistema' : 'Iniciar Sesión'}
                <ArrowRight className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" />
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto rounded-2xl border-border hover:bg-muted font-black uppercase tracking-widest px-10 h-14 text-xs"
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Conocer Más
              </Button>
            </motion.g>
          </div>
        </section>

        {/* Features Grid */}
        <section id="features" className="py-24 px-6 bg-muted/30">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16 space-y-4">
              <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight">Potencia Operativa Sin Límites</h2>
              <p className="text-muted-foreground font-medium uppercase tracking-widest text-xs">Módulos integrados para un control total</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              <FeatureCard
                icon={BarChart3}
                title="Ingeniería de Costos"
                description="Motor de cálculo avanzado con 14 secciones de gasto y 5 anexos técnicos. Precisión absoluta en el margen de utilidad."
              />
              <FeatureCard
                icon={Users}
                title="Gestión Multi-Tienda"
                description="Estructura jerárquica flexible. Aislamiento total de datos por sucursal mediante seguridad a nivel de fila (RLS)."
              />
              <FeatureCard
                icon={ShoppingCart}
                title="Punto de Venta (TPV)"
                description="Operativa Zero-Latency con búsqueda local instantánea. Optimizado para dispositivos móviles y uso a una mano."
              />
              <FeatureCard
                icon={Shield}
                title="Seguridad Hardened"
                description="Auditoría completa de operaciones, encriptación de datos y protocolos de resiliencia para entornos empresariales."
              />
              <FeatureCard
                icon={Zap}
                title="Resiliencia Offline"
                description="Vende sin conexión a internet. El sistema sincroniza automáticamente todas las transacciones cuando vuelves a estar en línea."
              />
              <FeatureCard
                icon={Cpu}
                title="Asistente Jules AI"
                description="IA integrada que analiza tus ventas, detecta stock crítico y responde consultas complejas en lenguaje natural."
              />
            </div>
          </div>
        </section>

        {/* Case Study Section */}
        <section id="case-study" className="py-24 px-6 relative overflow-hidden">
          <div className="max-w-7xl mx-auto">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div className="space-y-8">
                <div className="space-y-4">
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 font-black uppercase tracking-widest text-[10px]">Caso de Éxito MiPyME</Badge>
                  <h2 className="text-4xl md:text-5xl font-black uppercase tracking-tighter leading-none">
                    De Horas a Minutos:<br />
                    <span className="text-primary">Generación Masiva</span>
                  </h2>
                </div>

                <div className="space-y-6">
                  <div className="flex gap-4 p-6 rounded-3xl bg-muted/50 border border-border">
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-danger/10 flex items-center justify-center text-danger">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm uppercase mb-1">El Desafío Operativo</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Gestionar 100 productos semanales con costos variables de forma manual es inviable y propenso a errores críticos en los precios.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-4 p-6 rounded-3xl bg-primary/5 border border-primary/10">
                    <div className="shrink-0 w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                      <TrendingUp className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm uppercase mb-1">La Solución CostPro</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Carga un Excel y deja que nuestro motor genere todas las fichas de costo automáticamente. En menos de 5 minutos, tu catálogo está actualizado y listo para vender.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    variant="link"
                    className="p-0 h-auto font-black uppercase tracking-widest text-xs text-primary group"
                    onClick={onStart}
                  >
                    Ver esta funcionalidad en acción
                    <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                  </Button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 bg-primary/5 blur-[100px] rounded-full" />
                <div className="space-y-6">
                  <Card className="relative bg-background/40 backdrop-blur-xl border-primary/20 shadow-2xl rounded-[2.5rem] overflow-hidden">
                    <CardContent className="p-8 space-y-8">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex gap-2">
                          <div className="w-3 h-3 rounded-full bg-danger/50" />
                          <div className="w-3 h-3 rounded-full bg-amber-500/50" />
                          <div className="w-3 h-3 rounded-full bg-success/50" />
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Monitor de Automatización</div>
                      </div>

                      <ImportFlowSVG />

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-2xl bg-background/50 border border-border flex items-center gap-3">
                          <div className="text-2xl font-black text-primary">100+</div>
                          <div className="text-[9px] font-bold uppercase text-muted-foreground leading-none">Productos<br />Procesados</div>
                        </div>
                        <div className="p-4 rounded-2xl bg-background/50 border border-border flex items-center gap-3">
                          <div className="text-2xl font-black text-emerald-500">-95%</div>
                          <div className="text-[9px] font-bold uppercase text-muted-foreground leading-none">Tiempo<br />Operativo</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-2 gap-6">
                    <Card className="bg-background/40 backdrop-blur-xl border-primary/20 rounded-3xl overflow-hidden">
                      <CardContent className="p-6">
                        <EfficiencyClockSVG />
                        <p className="text-[10px] font-black uppercase text-center mt-4 tracking-widest">Velocidad Extrema</p>
                      </CardContent>
                    </Card>
                    <Card className="bg-background/40 backdrop-blur-xl border-primary/20 rounded-3xl overflow-hidden">
                      <CardContent className="p-6">
                        <BusinessScaleSVG />
                        <p className="text-[10px] font-black uppercase text-center mt-4 tracking-widest">Escalabilidad</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 px-6">
          <div className="max-w-5xl mx-auto">
            <div className="rounded-[3rem] bg-primary p-12 md:p-20 text-center text-white space-y-8 relative overflow-hidden shadow-2xl shadow-primary/20">
              <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/2 w-96 h-96 bg-white/10 blur-[80px] rounded-full" />
              <div className="relative z-10 space-y-6">
                <h2 className="text-4xl md:text-6xl font-black uppercase tracking-tighter leading-none">
                  ¿Listo para tomar el control de tu rentabilidad?
                </h2>
                <p className="text-lg md:text-xl font-medium text-white/80 max-w-2xl mx-auto">
                  Únete a las MiPyMEs que ya están optimizando sus márgenes y automatizando su operación con CostPro.
                </p>
                <div className="pt-4">
                  <Button
                    onClick={onStart}
                    size="lg"
                    className="rounded-2xl bg-white text-primary hover:bg-white/90 font-black uppercase tracking-widest px-12 h-16 text-sm shadow-xl"
                  >
                    {isAuthenticated ? 'Ir al Panel de Control' : 'Empezar Ahora'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="py-12 px-6 border-t border-border">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3 grayscale opacity-50">
             <div className="scale-50 -ml-8">
                <CostProLogo size={40} animated={false} />
             </div>
             <span className="font-black text-lg tracking-tighter uppercase -ml-4">
               COSTPRO
             </span>
          </div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">
            © 2026 CostPro Enterprise. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-6">
            <HelpCircle className="w-5 h-5 text-muted-foreground hover:text-primary cursor-pointer transition-colors" />
            <Shield className="w-5 h-5 text-muted-foreground hover:text-primary cursor-pointer transition-colors" />
          </div>
        </div>
      </footer>
    </div>
  );
}
