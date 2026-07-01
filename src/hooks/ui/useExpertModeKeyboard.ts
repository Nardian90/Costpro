import { useEffect, useRef } from 'react';

interface KeyboardActions {
  toggleAllSections: () => void;
  toggleHelp: () => void;
  toggleProblems: () => void;
  toggleComparison: () => void;
  expandSection: (n: number) => void;
  save: () => void;
  closePanels: () => void;
  showShortcuts: () => void;
}

export const useExpertModeKeyboard = (actions: KeyboardActions, enabled = true) => {
  // FIX: Use ref to hold latest actions so useEffect doesn't tear down/re-attach
  // the listener on every render when the caller passes an inline object
  const actionsRef = useRef(actions);
  useEffect(() => { actionsRef.current = actions; });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const a = actionsRef.current;

      // Don't trigger if user is typing in an input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName || '')) {
        if (!(e.key === 's' && (e.ctrlKey || e.metaKey)) && e.key !== 'Escape') {
           return;
        }
      }

      if (e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'e':
            e.preventDefault();
            a.toggleAllSections();
            break;
          case 'h':
            e.preventDefault();
            a.toggleHelp();
            break;
          case 'p':
            e.preventDefault();
            a.toggleProblems();
            break;
          case 'c':
            e.preventDefault();
            a.toggleComparison();
            break;
          case '?':
            e.preventDefault();
            a.showShortcuts();
            break;
        }

        // Alt + 1...9
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          e.preventDefault();
          a.expandSection(num);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        a.save();
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        a.closePanels();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
};
