'use client';

import { useState, useRef } from 'react';
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
  X
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PDF_URL = '/doc/COSTPRO.pdf';

const INDEX_ITEMS = [
  { id: 'intro', label: 'Introducción', icon: BookOpen, page: 1 },
  { id: 'vistas', label: 'Vistas del Sistema', icon: Layers, page: 5 },
  { id: 'costos', label: 'Gestión de Costos', icon: Calculator, page: 12 },
  { id: 'faq', label: 'Preguntas Frecuentes', icon: HelpCircle, page: 25 },
];

export default function SupportDocumentView() {
  const [activeSection, setActiveSection] = useState('intro');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = PDF_URL;
    link.download = 'COSTPRO-Manual.pdf';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleOpenNewTab = () => {
    window.open(PDF_URL, '_blank');
  };

  const goToPage = (page: number, id: string) => {
    setActiveSection(id);
    if (iframeRef.current) {
      iframeRef.current.src = `${PDF_URL}#page=${page}&toolbar=1&navpanes=0&scrollbar=1`;
    }
    setSidebarOpen(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-200px)] min-h-[600px] -mx-4 sm:-mx-8 lg:-mx-12 -mt-4 sm:-mt-8 lg:-mt-12 overflow-hidden bg-background border border-border/50 rounded-2xl shadow-2xl">
      {/* Sub-Header / Toolbar */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card/50 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
          <div className="flex flex-col">
            <h2 className="text-sm font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Documentación de Soporte
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:flex h-8 gap-2 font-black uppercase text-[9px] tracking-widest hover:text-primary"
            onClick={handleDownload}
          >
            <Download className="w-3 h-3" />
            Descargar PDF
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="flex h-8 gap-2 font-black uppercase text-[9px] tracking-widest border-primary/20 text-primary hover:bg-primary hover:text-white"
            onClick={handleOpenNewTab}
          >
            <ExternalLink className="w-3 h-3" />
            Ver Pantalla Completa
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Sidebar Index */}
        <div className={cn(
          "absolute lg:relative inset-y-0 left-0 w-64 bg-card border-r z-30 transition-transform duration-300 lg:translate-x-0 bg-card/80 backdrop-blur-xl",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          <div className="p-4 space-y-1">
            <p className="text-[9px] font-black text-muted-foreground uppercase px-3 mb-4 tracking-[0.3em] opacity-50">Contenido del Manual</p>
            {INDEX_ITEMS.map((item) => (
              <button
                key={item.id}
                onClick={() => goToPage(item.page, item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                  activeSection === item.id
                    ? "bg-primary text-white shadow-lg shadow-primary/20"
                    : "hover:bg-primary/5 text-muted-foreground hover:text-primary"
                )}
              >
                <item.icon className={cn("w-4 h-4", activeSection === item.id ? "text-white" : "text-primary/60")} />
                <span className="flex-1 text-left">{item.label}</span>
                {activeSection === item.id && <ChevronRight className="w-3 h-3" />}
              </button>
            ))}

            <div className="mt-8 pt-6 border-t border-border/50">
              <div className="p-4 rounded-2xl bg-primary/5 border border-primary/10">
                <div className="flex items-center gap-2 text-primary mb-2">
                  <Info className="w-3 h-3" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Tip de Uso</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-medium leading-relaxed italic">
                  "Utiliza la opción de pantalla completa si necesitas imprimir capítulos específicos con mayor calidad."
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

        {/* Main Content (PDF Viewer Container) */}
        <div className="flex-1 bg-black/5 relative">
          <iframe
            ref={iframeRef}
            src={`${PDF_URL}#toolbar=1&navpanes=0&scrollbar=1`}
            className="w-full h-full border-none"
            title="Manual COSTPRO"
          />

          {/* Mobile floating button to open index */}
          {!sidebarOpen && (
            <Button
              size="icon"
              className="lg:hidden absolute bottom-6 left-6 rounded-full w-12 h-12 shadow-2xl z-10 bg-primary text-white"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
