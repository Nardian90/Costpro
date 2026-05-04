'use client';

import React, { useEffect, useRef, useCallback, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * ARIA Live Region — WCAG 4.1.3 Status Messages (Level AA)
 *
 * Provides a mechanism to announce dynamic status changes to screen readers
 * without visual disruption. Supports both polite (status) and assertive (alert) modes.
 *
 * Usage:
 *   <AriaLiveRegion /> // listens to global announce events
 *   announce('Guardado exitosamente', 'polite')
 *   announce('Error de conexión', 'assertive')
 */

type AriaLiveMode = 'polite' | 'assertive';
type AriaLiveRole = 'status' | 'alert';

interface AnnounceOptions {
  mode?: AriaLiveMode;
  role?: AriaLiveRole;
  clearAfterMs?: number;
}

interface AriaMessage {
  id: string;
  text: string;
  role: AriaLiveRole;
}

// ── Global announce function (can be called from anywhere) ──────────
let announceFn: ((text: string, options?: AnnounceOptions) => void) | null = null;

export function announce(text: string, modeOrOptions?: AriaLiveMode | AnnounceOptions) {
  if (!text) return;
  const options: AnnounceOptions | undefined = typeof modeOrOptions === 'string'
    ? { mode: modeOrOptions }
    : modeOrOptions;
  announceFn?.(text, options);
}

// ── Event-based announce (for non-React code) ──────────────────────
export function announceEvent(text: string, options?: AnnounceOptions) {
  if (typeof window === 'undefined') return;
  const mode = options?.mode || 'polite';
  const role = options?.role || (mode === 'assertive' ? 'alert' : 'status');
  const event = new CustomEvent('aria-announce', {
    detail: { text, role, clearAfterMs: options?.clearAfterMs },
  });
  window.dispatchEvent(event);
}

// ── Component ──────────────────────────────────────────────────────
export function AriaLiveRegion({ className }: { className?: string }) {
  const [politeMessage, setPoliteMessage] = useState<AriaMessage | null>(null);
  const [assertiveMessage, setAssertiveMessage] = useState<AriaMessage | null>(null);
  const clearTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const clearMessage = useCallback((id: string, role: AriaLiveRole, clearAfterMs?: number) => {
    const delay = clearAfterMs ?? 3000;
    const existing = clearTimers.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      clearTimers.current.delete(id);
      if (role === 'status') {
        setPoliteMessage(prev => (prev?.id === id ? null : prev));
      } else {
        setAssertiveMessage(prev => (prev?.id === id ? null : prev));
      }
    }, delay);
    clearTimers.current.set(id, timer);
  }, []);

  // Register global announce function
  useEffect(() => {
    announceFn = (text: string, options?: AnnounceOptions) => {
      const mode = options?.mode || 'polite';
      const role = options?.role || (mode === 'assertive' ? 'alert' : 'status');
      const id = `aria-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const msg: AriaMessage = { id, text, role };

      if (role === 'alert') {
        setAssertiveMessage(msg);
      } else {
        setPoliteMessage(msg);
      }
      clearMessage(id, role, options?.clearAfterMs);
    };

    return () => {
      announceFn = null;
      clearTimers.current.forEach(t => clearTimeout(t));
      clearTimers.current.clear();
    };
  }, [clearMessage]);

  // Listen for custom events (for non-React code)
  useEffect(() => {
    const handler = (e: Event) => {
      const { text, role, clearAfterMs } = (e as CustomEvent).detail;
      const id = `aria-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const msg: AriaMessage = { id, text, role };

      if (role === 'alert') {
        setAssertiveMessage(msg);
      } else {
        setPoliteMessage(msg);
      }
      clearMessage(id, role, clearAfterMs);
    };

    window.addEventListener('aria-announce', handler);
    return () => window.removeEventListener('aria-announce', handler);
  }, [clearMessage]);

  return (
    <div className={className} aria-hidden="true">
      {/* Polite announcements (status updates, save confirmations, etc.) */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        aria-relevant="additions text"
        className="sr-only"
      >
        {politeMessage?.text && (
          <span key={politeMessage.id}>{politeMessage.text}</span>
        )}
      </div>

      {/* Assertive announcements (errors, critical alerts) */}
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="true"
        aria-relevant="additions text"
        className="sr-only"
      >
        {assertiveMessage?.text && (
          <span key={assertiveMessage.id}>{assertiveMessage.text}</span>
        )}
      </div>
    </div>
  );
}

export default AriaLiveRegion;
