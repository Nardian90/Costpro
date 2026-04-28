import { useEffect } from 'react';
export const useExpertModeKeyboard = (actions: any, enabled = true) => {
  useEffect(() => {
    if (!enabled) return;
    const handle = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) return;
      if (e.altKey) {
        if (e.key === 'e') actions.toggleAllSections();
        if (e.key === 'c') actions.toggleComparison();
        if (e.key === 'p') actions.toggleProblems();
        const n = parseInt(e.key);
        if (n >= 1 && n <= 9) actions.expandSection(n);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); actions.save(); }
      if (e.key === 'Escape') actions.closePanels();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [enabled, actions]);
};
