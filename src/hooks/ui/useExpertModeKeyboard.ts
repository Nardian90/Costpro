import { useEffect } from 'react';

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
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
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
            actions.toggleAllSections();
            break;
          case 'h':
            e.preventDefault();
            actions.toggleHelp();
            break;
          case 'p':
            e.preventDefault();
            actions.toggleProblems();
            break;
          case 'c':
            e.preventDefault();
            actions.toggleComparison();
            break;
          case '?':
            e.preventDefault();
            actions.showShortcuts();
            break;
        }

        // Alt + 1...9
        const num = parseInt(e.key);
        if (!isNaN(num) && num >= 1 && num <= 9) {
          e.preventDefault();
          actions.expandSection(num);
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        actions.save();
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        actions.closePanels();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, actions]);
};
