'use client';

import React from 'react';
import { Shield, Eye, Keyboard, AlertTriangle, Mail } from 'lucide-react';

export const AccessibilityStatement: React.FC = () => {
  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Declaración de Accesibilidad</h2>
          <p className="text-sm text-muted-foreground">CostPro Enterprise v5.8.0</p>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6 text-sm text-muted-foreground leading-relaxed">
        <section>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-2">Nuestro compromiso</h3>
          <p>
            CostPro Enterprise se compromete a garantizar la accesibilidad de su plataforma web 
            conforme a la Norma Europea EN 301 549 y las Pautas de Accesibilidad al Contenido Web (WCAG) 2.1 nivel AA.
          </p>
        </section>

        <section>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-2">Estado de conformidad</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20 text-center">
              <Eye className="w-5 h-5 text-green-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-green-600 uppercase">WCAG 2.1 AA</p>
              <p className="text-[10px] text-muted-foreground mt-1">Parcialmente conforme</p>
            </div>
            <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/20 text-center">
              <Shield className="w-5 h-5 text-blue-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-blue-600 uppercase">EN 301 549</p>
              <p className="text-[10px] text-muted-foreground mt-1">En proceso</p>
            </div>
            <div className="p-4 rounded-xl bg-purple-500/5 border border-purple-500/20 text-center">
              <Keyboard className="w-5 h-5 text-purple-500 mx-auto mb-2" />
              <p className="text-xs font-bold text-purple-600 uppercase">Navegación por teclado</p>
              <p className="text-[10px] text-muted-foreground mt-1">Completa</p>
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-2">Medidas implementadas</h3>
          <ul className="space-y-2">
            {[
              'Skip navigation link para saltar al contenido principal (Ctrl+Tab desde URL)',
              'ARIA labels en todos los elementos interactivos del sidebar',
              'Estado aria-current="page" en el ítem de navegación activo',
              'Landmarks semánticos: main, nav, aside correctamente identificados',
              'Enfoque visible (focus ring) en todos los elementos interactivos',
              'Navegación completa por teclado: Ctrl+1-5, Ctrl+B, Ctrl+/, Escape',
              'Command Palette global con búsqueda fuzzy (Ctrl+K)',
              'Breadcrumbs de navegación en todos los módulos principales',
              'Soporte responsive para dispositivos móviles con safe areas',
              'Contraste de colores verificado sobre fondo blanco/oscuro',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-2 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Limitaciones conocidas
          </h3>
          <ul className="space-y-2">
            {[
              'Algunos módulos (IPV, Costos) no implementan el patrón ARIA tabs completo (tablist/tab/tabpanel)',
              'Los cambios de contenido dinámico no siempre utilizan regiones live (aria-live)',
              'La validación automática de contraste no está integrada en el pipeline de CI/CD',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 mt-1.5 shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-2">Fecha de evaluación</h3>
          <p>{new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p className="mt-1 text-xs">Método: Auditoría interna automatizada con verificación manual. Herramientas: ESLint a11y, grep analysis.</p>
        </section>

        <section>
          <h3 className="text-sm font-black uppercase tracking-wider text-foreground mb-2 flex items-center gap-2">
            <Mail className="w-4 h-4" />
            Contacto
          </h3>
          <p>
            Si encuentras alguna barrera de accesibilidad o necesitas asistencia, 
            contacta con nuestro equipo de soporte.
          </p>
        </section>
      </div>
    </div>
  );
};

export default AccessibilityStatement;
