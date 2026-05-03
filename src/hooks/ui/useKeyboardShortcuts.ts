'use client';

import { useEffect, useCallback } from 'react';
import { useUIStore, ViewType } from '@/store';

interface ShortcutConfig {
  key: string;
  ctrlOrCmd: boolean;
  alt?: boolean;
  shift?: boolean;
  handler: () => void;
  description: string;
  global?: boolean;
}

export const SHORTCUTS_REGISTRY: { key: string; label: string; description: string }[] = [
  { key: 'Ctrl+K', label: 'Command Palette', description: 'Abrir paleta de comandos' },
  { key: 'Ctrl+B', label: 'Toggle Sidebar', description: 'Mostrar/ocultar barra lateral' },
  { key: 'Ctrl+/', label: 'Keyboard Help', description: 'Ver atajos de teclado' },
  { key: 'Ctrl+1', label: 'Dashboard', description: 'Ir al Centro de Control' },
  { key: 'Ctrl+2', label: 'POS', description: 'Ir al Punto de Venta' },
  { key: 'Ctrl+3', label: 'Inventario', description: 'Ir al Stock Actual' },
  { key: 'Escape', label: 'Close', description: 'Cerrar panel/modal activo' },
  { key: 'Ctrl+Shift+H', label: 'Help', description: 'Ir al Centro de Ayuda' },
];

/**
 * Global keyboard shortcuts hook.
 * Registers document-level keydown listeners for navigation shortcuts.
 */
export function useKeyboardShortcuts() {
  const { 
    setCurrentView, 
    toggleSidebar, 
    setSidebarState,
    isCalculatorOpen, 
    setIsCalculatorOpen,
    isChatBotOpen,
    setIsChatBotOpen,
    currentView
  } = useUIStore();

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't capture when user is typing in an input/textarea
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target as HTMLElement).isContentEditable) {
      return;
    }

    const isMod = e.ctrlKey || e.metaKey;

    // Ctrl+K — already handled by CommandPalette internally
    // Ctrl+/ — Open keyboard help modal (dispatches custom event)
    if (isMod && e.key === '/') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('toggle-keyboard-help'));
      return;
    }

    // Ctrl+B — Toggle sidebar
    if (isMod && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
      return;
    }

    // Ctrl+1 — Dashboard
    if (isMod && e.key === '1') {
      e.preventDefault();
      setCurrentView('dashboard');
      return;
    }

    // Ctrl+2 — POS
    if (isMod && e.key === '2') {
      e.preventDefault();
      setCurrentView('pos');
      return;
    }

    // Ctrl+3 — Inventory
    if (isMod && e.key === '3') {
      e.preventDefault();
      setCurrentView('inventory');
      return;
    }

    // Ctrl+4 — IPV
    if (isMod && e.key === '4') {
      e.preventDefault();
      setCurrentView('ipv');
      return;
    }

    // Ctrl+5 — Costos
    if (isMod && e.key === '5') {
      e.preventDefault();
      setCurrentView('cost-sheets');
      return;
    }

    // Ctrl+Shift+H — Help
    if (isMod && e.shiftKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      setCurrentView('help');
      return;
    }

    // Escape — Close overlays
    if (e.key === 'Escape') {
      if (isCalculatorOpen) {
        setIsCalculatorOpen(false);
        return;
      }
      if (isChatBotOpen) {
        setIsChatBotOpen(false);
        return;
      }
    }
  }, [
    setCurrentView, toggleSidebar, setSidebarState,
    isCalculatorOpen, setIsCalculatorOpen,
    isChatBotOpen, setIsChatBotOpen, currentView
  ]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
