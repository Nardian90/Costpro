'use client';

import { useSyncExternalStore } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Share, PlusSquare, MoreVertical, Download, Chrome, Info } from "lucide-react";
import { cn } from "@/lib/utils";

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PWAInstallModal({ isOpen, onClose }: PWAInstallModalProps) {
  const platform = useSyncExternalStore<'ios' | 'android' | 'other'>(
    () => () => {},
    () => {
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (/iphone|ipad|ipod/.test(userAgent)) return 'ios';
      if (/android/.test(userAgent)) return 'android';
      return 'other';
    },
    () => 'other'
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md border-primary/20 bg-background/95 backdrop-blur-xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase tracking-tight flex items-center gap-2">
            <Download className="w-6 h-6 text-primary" />
            Instalar CostPro
          </DialogTitle>
          <DialogDescription className="font-medium text-muted-foreground">
            Siga estos pasos para instalar la aplicación en su dispositivo y disfrutar de la experiencia completa sin navegadores.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* iOS Section */}
          <div className={cn(
            "p-5 rounded-3xl border transition-all duration-500",
            platform === 'ios' ? "border-primary bg-primary/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]" : "border-border bg-muted/30 opacity-70"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-foreground text-background flex items-center justify-center">
                   <AppleIcon className="w-6 h-6" />
                </div>
                <h3 className="font-black uppercase text-xs tracking-widest">iOS / Safari</h3>
              </div>
              {platform === 'ios' && (
                <span className="text-xs font-black bg-primary text-foreground px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Tu dispositivo</span>
              )}
            </div>

            <ul className="space-y-4 text-sm font-medium">
              <li className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">1</span>
                <span>Abra <b>Safari</b> y navegue a esta dirección.</span>
              </li>
              <li className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">2</span>
                <span className="leading-relaxed">Toque el botón <b>Compartir</b> <Share className="w-4 h-4 inline mb-1 mx-1 text-primary" /> (icono de cuadrado con flecha).</span>
              </li>
              <li className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">3</span>
                <span className="leading-relaxed">Seleccione <b>Añadir a la pantalla de inicio</b> <PlusSquare className="w-4 h-4 inline mb-1 mx-1 text-primary" />.</span>
              </li>
            </ul>
          </div>

          {/* Android Section */}
          <div className={cn(
            "p-5 rounded-3xl border transition-all duration-500",
            platform === 'android' ? "border-primary bg-primary/5 shadow-[0_0_30px_rgba(16,185,129,0.1)]" : "border-border bg-muted/30 opacity-70"
          )}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
                  <Chrome className="w-6 h-6" />
                </div>
                <h3 className="font-black uppercase text-xs tracking-widest">Android / Chrome</h3>
              </div>
              {platform === 'android' && (
                <span className="text-xs font-black bg-primary text-foreground px-3 py-1 rounded-full uppercase tracking-widest animate-pulse">Tu dispositivo</span>
              )}
            </div>

            <ul className="space-y-4 text-sm font-medium">
              <li className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">1</span>
                <span>Toque el botón de <b>tres puntos</b> <MoreVertical className="w-4 h-4 inline mb-1 mx-1 text-primary" /> en la esquina superior derecha.</span>
              </li>
              <li className="flex gap-4 items-start">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-black">2</span>
                <span className="leading-relaxed">Seleccione <b>Instalar aplicación</b> o <b>Añadir a pantalla de inicio</b>.</span>
              </li>
            </ul>
          </div>

          <div className="flex items-start gap-3 p-5 rounded-2xl bg-primary/5 border border-primary/10 text-primary">
            <Info className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-xs font-black uppercase tracking-widest leading-relaxed">
              CostPro se ejecutará en modo pantalla completa, con mejor rendimiento y acceso rápido desde su escritorio.
            </p>
          </div>
        </div>

        <div className="flex justify-center pt-2">
          <button
            onClick={onClose}
            className="neu-btn neu-btn-primary w-full h-14 text-xs font-black uppercase tracking-widest shadow-[0_0_30px_rgba(16,185,129,0.2)]"
          >
            Entendido, cerrar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M17.05 20.28c-.96.95-2.04 1.72-3.3 1.72-1.2 0-1.61-.74-3.1-.74-1.5 0-1.93.72-3.08.74-1.25.02-2.34-.84-3.26-1.74-2.14-2.1-3.16-5.46-3.16-8.5 0-3.12 1.63-5.26 3.65-5.26 1.1 0 1.9.62 2.7.62s1.58-.64 2.85-.64c1.1 0 2.25.43 3.03 1.25-1.75 1.05-2.05 3.55-1.3 4.8 1.15 1.8 2.65 2.1 3.25 2.2-.1 1.4-.75 2.8-1.3 3.5zM12.03 5c-.1-1.3.65-2.6 1.4-3.4 1.05-.85 2.2-1.4 3.4-1.5.15 1.25-.55 2.5-1.35 3.3-.95 1-2.2 1.6-3.45 1.6z" />
    </svg>
  );
}
