'use client';

import { useState } from 'react';
import {
  FileText,
  Download,
  ExternalLink,
  BookOpen,
  ChevronRight,
  Info,
  Layers,
  Calculator,
  HelpCircle,
  Menu,
  X,
  ShieldCheck,
  Zap,
  ArrowRight
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { motion } from 'framer-motion';

const PDF_URL = '/manuals/COSTPRO.pdf';

const INDEX_ITEMS = [
  { id: 'intro', label: 'Introducción', icon: BookOpen, page: 1, description: 'Conceptos básicos y filosofía del sistema.' },
  { id: 'vistas', label: 'Vistas del Sistema', icon: Layers, page: 5, description: 'Exploración de la interfaz y módulos principales.' },
  { id: 'costos', label: 'Gestión de Costos', icon: Calculator, page: 12, description: 'Guía técnica sobre el motor de cálculo y fichas.' },
  { id: 'faq', label: 'Preguntas Frecuentes', icon: HelpCircle, page: 25, description: 'Solución a dudas comunes y soporte.' },
];

export default function SupportDocumentView() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = PDF_URL;
    link.download = 'COSTPRO-Manual.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = (page: number = 1) => {
    window.open(`${PDF_URL}#page=${page}`, '_blank');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px] -mx-4 sm:-mx-8 lg:-mx-12 -mt-4 sm:-mt-8 lg:-mt-12 overflow-hidden bg-background border border-border/50 rounded-2xl shadow-2xl relative">
      {/* Sub-Header / Toolbar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-card/50 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-11 w-11"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </Button>
          <div className="flex flex-col">
            <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Centro de Documentación
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:flex h-11 gap-2 font-black uppercase text-[10px] tracking-widest border-primary/20 text-primary hover:bg-primary hover:text-white transition-all"
            onClick={() => handleOpenNewTab(1)}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Leer Online
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex h-11 gap-2 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
            onClick={handleDownload}
          >
            <Download className="w-3.5 h-3.5" />
            Descargar PDF
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar Index */}
        <div className={cn(
          "absolute lg:relative inset-y-0 left-0 w-72 bg-card border-r z-30 transition-transform duration-300 lg:translate-x-0 bg-card/80 backdrop-blur-xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-6 space-y-1">
            <p className="text-[10px] font-black text-muted-foreground uppercase px-3 mb-6 tracking-[0.3em] opacity-50">Índice Temático</p>
            {INDEX_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => handleOpenNewTab(item.page)}
                className="w-full flex flex-col items-start gap-1 px-4 py-4 rounded-xl text-[11px] font-bold transition-all hover:bg-primary/5 group border border-transparent hover:border-primary/10 mb-2"
              >
                <div className="flex items-center gap-3 w-full">
                  <item.icon className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
                  <span className="flex-1 text-left text-foreground uppercase tracking-wider">{item.label}</span>
                  <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                </div>
                <p className="text-[9px] text-muted-foreground font-medium leading-tight pl-7 text-left group-hover:text-primary/70">
                  {item.description}
                </p>
              </button>
            ))}

            <div className="mt-8 pt-6 border-t border-border/50">
              <div className="p-5 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 text-primary mb-3">
                  <ShieldCheck className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Documento Oficial</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed">
                  Este manual contiene la especificación técnica completa de la versión 5.7.25 Enterprise.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Backdrop for mobile sidebar */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/60 z-20 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main Content (Dashboard style) */}
        <div className="flex-1 bg-muted/20 overflow-y-auto overflow-x-auto p-6 sm:p-12 no-scrollbar">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-3xl mx-auto space-y-12 min-w-0"
          >
            {/* Hero Section */}
            <div className="text-center space-y-6">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary border border-primary/20 mb-4">
                <Zap className="w-4 h-4 fill-primary" />
                <span className="text-[10px] font-black uppercase tracking-widest">Recurso de Capacitación</span>
              </div>
              <h1 className="text-[clamp(1.75rem,8vw,3rem)] font-black uppercase tracking-tighter text-foreground leading-none">
                Manual de Operaciones <br />
                <span className="text-primary">CostPro Enterprise</span>
              </h1>
              <p className="text-muted-foreground text-lg font-medium max-w-xl mx-auto">
                Accede a la guía detallada paso a paso para dominar todas las funcionalidades de tu plataforma de gestión.
              </p>
            </div>

            {/* Main Action Card */}
            <div className="grid sm:grid-cols-2 gap-6">
              <div
                onClick={() => handleOpenNewTab(1)}
                className="group p-8 rounded-[2.5rem] bg-card border border-border/50 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/5 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:opacity-10 transition-opacity">
                  <BookOpen className="w-32 h-32 text-primary" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                    <ExternalLink className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Leer Online</h3>
                    <p className="text-sm text-muted-foreground font-medium">Visualiza el manual directamente en una nueva pestaña interactiva.</p>
                  </div>
                  <div className="flex items-center gap-2 text-primary text-xs font-black uppercase tracking-widest pt-2">
                    Abrir ahora <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>

              <div
                onClick={handleDownload}
                className="group p-8 rounded-[2.5rem] bg-primary text-white hover:shadow-2xl hover:shadow-primary/20 transition-all cursor-pointer relative overflow-hidden"
              >
                <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity text-white">
                  <Download className="w-32 h-32" />
                </div>
                <div className="relative z-10 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-white group-hover:scale-110 transition-transform">
                    <Download className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black uppercase tracking-tight">Descargar PDF</h3>
                    <p className="text-sm text-white/80 font-medium">Guarda una copia física del manual para consulta offline y archivado.</p>
                  </div>
                  <div className="flex items-center gap-2 text-white text-xs font-black uppercase tracking-widest pt-2">
                    Descargar <ArrowRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </div>

            {/* Information Grid */}
            <div className="grid md:grid-cols-3 gap-6 pt-12 border-t border-border/50">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Info className="w-4 h-4" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground">Acceso Rápido</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Utiliza el índice de la izquierda para saltar directamente a capítulos específicos sin tener que buscar manualmente.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <Zap className="w-4 h-4" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground">Interactividad</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  El visor online soporta búsqueda por palabras clave, impresión selectiva y navegación por marcadores nativos.
                </p>
              </div>
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-primary">
                  <ShieldCheck className="w-4 h-4" />
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-foreground">Soporte</h4>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed font-medium">
                  Si encuentras discrepancias entre el manual y tu versión del sistema, por favor contacta con soporte técnico.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
