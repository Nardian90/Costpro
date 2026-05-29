'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Cookie, Settings, X, Shield } from 'lucide-react';
import { saveConsent, clearConsent, shouldShowConsentBanner, type ConsentPreferences } from '@/lib/consent';

/**
 * GDPR-compliant cookie consent banner.
 */

const CONSENT_REOPEN_EVENT = 'reopen-cookie-consent';
const CONSENT_UPDATED_EVENT = 'cookie-consent-updated';

export function CookieConsent() {
  // FIX-BUG-RCT-003: Initialize with false to avoid hydration mismatch,
  // then check on mount.
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [preferences, setPreferences] = useState<Omit<ConsentPreferences, 'timestamp' | 'version'>>({
    essential: true,
    analytics: false,
    functional: true,
    marketing: false,
  });

  useEffect(() => {
    setMounted(true);
    setVisible(shouldShowConsentBanner());
    setPrefersReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Respect prefers-reduced-motion
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mq.addEventListener('change', handler);

    // Listen for external requests to reopen the consent banner
    const reopenHandler = () => {
      setVisible(true);
      setShowDetails(false);
    };
    window.addEventListener(CONSENT_REOPEN_EVENT, reopenHandler);

    return () => {
      mq.removeEventListener('change', handler);
      window.removeEventListener(CONSENT_REOPEN_EVENT, reopenHandler);
    };
  }, []);

  const notifyUpdated = useCallback(() => {
    window.dispatchEvent(new Event(CONSENT_UPDATED_EVENT));
  }, []);

  const handleAcceptAll = () => {
    saveConsent({
      essential: true,
      analytics: true,
      functional: true,
      marketing: true,
    });
    setVisible(false);
    notifyUpdated();
  };

  const handleRejectOptional = () => {
    saveConsent({
      essential: true,
      analytics: false,
      functional: true,
      marketing: false,
    });
    setVisible(false);
    notifyUpdated();
  };

  const handleSavePreferences = () => {
    saveConsent(preferences);
    setVisible(false);
    setShowDetails(false);
    notifyUpdated();
  };

  if (!mounted || !visible) {
    return null;
  }

  const animationClass = prefersReducedMotion ? '' : 'animate-in slide-in-from-bottom-4 fade-in duration-300';

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6 ${animationClass}`}
      role="dialog"
      aria-modal="false"
      aria-label="Consentimiento de cookies"
    >
      <div className="max-w-4xl mx-auto bg-card border border-border rounded-xl shadow-2xl shadow-black/10 p-6 sm:p-8 backdrop-blur-xl bg-card/95">
        {!showDetails ? (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Shield className="w-6 h-6 text-green-500 mt-0.5 shrink-0" aria-hidden="true" />
              <div>
                <h3 className="font-semibold text-foreground text-sm">
                  Consentimiento de Cookies
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Utilizamos cookies esenciales para el funcionamiento de la aplicación
                  y cookies opcionales para mejorar tu experiencia. Puedes gestionar
                  tus preferencias en cualquier momento.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(true)}
                className="gap-1.5 text-xs"
                aria-label="Configurar preferencias de cookies"
              >
                <Settings className="w-3.5 h-3.5" />
                Configurar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRejectOptional}
                className="text-xs"
                aria-label="Rechazar cookies opcionales"
              >
                Solo esenciales
              </Button>
              <Button
                size="sm"
                onClick={handleAcceptAll}
                className="gap-1.5 text-xs"
                aria-label="Aceptar todas las cookies"
              >
                Aceptar todas
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <Cookie className="w-5 h-5 text-green-500" aria-hidden="true" />
                <h3 className="font-semibold text-foreground">Preferencias de Cookies</h3>
              </div>
              <button
                onClick={() => setShowDetails(false)}
                className="p-1 hover:bg-muted rounded-md transition-colors"
                aria-label="Cerrar configuración de cookies"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <CookieCategoryRow
                name="Esenciales"
                description="Necesarias para el funcionamiento básico de la aplicación (autenticación, sesiones)."
                checked={true}
                disabled={true}
              />
              <CookieCategoryRow
                name="Analíticas"
                description="Nos ayudan a entender cómo utilizas la aplicación para mejorarla."
                checked={preferences.analytics}
                onChange={(checked) => setPreferences(prev => ({ ...prev, analytics: checked }))}
              />
              <CookieCategoryRow
                name="Funcionales"
                description="Recuerdan tus preferencias como el tema oscuro/claro y el idioma."
                checked={preferences.functional}
                onChange={(checked) => setPreferences(prev => ({ ...prev, functional: checked }))}
              />
              <CookieCategoryRow
                name="Marketing"
                description="Utilizadas para mostrarte publicidad relevante. Solo con tu consentimiento."
                checked={preferences.marketing}
                onChange={(checked) => setPreferences(prev => ({ ...prev, marketing: checked }))}
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="ghost" size="sm" onClick={handleRejectOptional} className="text-xs">
                Solo esenciales
              </Button>
              <Button size="sm" onClick={handleSavePreferences} className="text-xs">
                Guardar preferencias
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CookieCategoryRow({
  name,
  description,
  checked,
  disabled = false,
  onChange,
}: {
  name: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
        disabled ? 'bg-muted/30 border-muted opacity-75' : 'hover:bg-muted/50 border-border cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border accent-green-500"
        aria-label={`${name}: ${checked ? 'activada' : 'desactivada'}`}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground">{name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
    </label>
  );
}

export default CookieConsent;
