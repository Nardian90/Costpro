import { renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('useExpertModeKeyboard', () => {
  let actions: {
    toggleAllSections: ReturnType<typeof vi.fn>;
    toggleHelp: ReturnType<typeof vi.fn>;
    toggleProblems: ReturnType<typeof vi.fn>;
    toggleComparison: ReturnType<typeof vi.fn>;
    expandSection: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    closePanels: ReturnType<typeof vi.fn>;
    showShortcuts: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    actions = {
      toggleAllSections: vi.fn(),
      toggleHelp: vi.fn(),
      toggleProblems: vi.fn(),
      toggleComparison: vi.fn(),
      expandSection: vi.fn(),
      save: vi.fn(),
      closePanels: vi.fn(),
      showShortcuts: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function fireKeyEvent(key: string, options: Partial<KeyboardEventInit> = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      altKey: options.altKey ?? false,
      ctrlKey: options.ctrlKey ?? false,
      metaKey: options.metaKey ?? false,
      bubbles: true,
    });
    window.dispatchEvent(event);
  }

  it('no registra listeners cuando enabled=false', async () => {
    const { useExpertModeKeyboard } = await import('../useExpertModeKeyboard');
    const addSpy = vi.spyOn(window, 'addEventListener');

    renderHook(() => useExpertModeKeyboard(actions as any, false));

    // The addEventListener for keydown should not be called
    const keydownCalls = addSpy.mock.calls.filter(c => c[0] === 'keydown');
    expect(keydownCalls.length).toBe(0);
  });

  it('registra listeners cuando enabled=true y los remueve en cleanup', async () => {
    const { useExpertModeKeyboard } = await import('../useExpertModeKeyboard');
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount } = renderHook(() => useExpertModeKeyboard(actions as any, true));

    const keydownCalls = addSpy.mock.calls.filter(c => c[0] === 'keydown');
    expect(keydownCalls.length).toBe(1);

    unmount();

    const removeCalls = removeSpy.mock.calls.filter(c => c[0] === 'keydown');
    expect(removeCalls.length).toBe(1);
  });

  describe('atajos de teclado', () => {
    beforeEach(async () => {
      // Re-render hook before each shortcut test
      const { useExpertModeKeyboard } = await import('../useExpertModeKeyboard');
      renderHook(() => useExpertModeKeyboard(actions as any, true));
    });

    it('Alt+E llama toggleAllSections', () => {
      fireKeyEvent('e', { altKey: true });
      expect(actions.toggleAllSections).toHaveBeenCalledTimes(1);
    });

    it('Alt+H llama toggleHelp', () => {
      fireKeyEvent('h', { altKey: true });
      expect(actions.toggleHelp).toHaveBeenCalledTimes(1);
    });

    it('Alt+P llama toggleProblems', () => {
      fireKeyEvent('p', { altKey: true });
      expect(actions.toggleProblems).toHaveBeenCalledTimes(1);
    });

    it('Alt+C llama toggleComparison', () => {
      fireKeyEvent('c', { altKey: true });
      expect(actions.toggleComparison).toHaveBeenCalledTimes(1);
    });

    it('Alt+Shift+/ llama showShortcuts', () => {
      // The '?' key
      fireKeyEvent('?', { altKey: true });
      expect(actions.showShortcuts).toHaveBeenCalledTimes(1);
    });

    it('Alt+1 llama expandSection(1)', () => {
      fireKeyEvent('1', { altKey: true });
      expect(actions.expandSection).toHaveBeenCalledWith(1);
    });

    it('Alt+5 llama expandSection(5)', () => {
      fireKeyEvent('5', { altKey: true });
      expect(actions.expandSection).toHaveBeenCalledWith(5);
    });

    it('Alt+9 llama expandSection(9)', () => {
      fireKeyEvent('9', { altKey: true });
      expect(actions.expandSection).toHaveBeenCalledWith(9);
    });

    it('Cmd+S llama save (metaKey simulation)', () => {
      fireKeyEvent('s', { metaKey: true });
      expect(actions.save).toHaveBeenCalledTimes(1);
    });

    it('Ctrl+S llama save', () => {
      fireKeyEvent('s', { ctrlKey: true });
      expect(actions.save).toHaveBeenCalledTimes(1);
    });

    it('Escape cierra los paneles', () => {
      fireKeyEvent('Escape');
      expect(actions.closePanels).toHaveBeenCalledTimes(1);
    });
  });

  describe('seguridad — no dispara en inputs', () => {
    it('no dispara shortcuts cuando el foco está en un <input> (excepto Ctrl+S y Escape)', async () => {
      const { useExpertModeKeyboard } = await import('../useExpertModeKeyboard');
      renderHook(() => useExpertModeKeyboard(actions as any, true));

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();

      fireKeyEvent('e', { altKey: true });
      expect(actions.toggleAllSections).not.toHaveBeenCalled();

      // Ctrl+S and Escape SHOULD work even in inputs
      fireKeyEvent('s', { ctrlKey: true });
      expect(actions.save).toHaveBeenCalledTimes(1);

      fireKeyEvent('Escape');
      expect(actions.closePanels).toHaveBeenCalledTimes(1);

      document.body.removeChild(input);
    });

    it('no dispara shortcuts cuando el foco está en un <textarea> (excepto Ctrl+S y Escape)', async () => {
      const { useExpertModeKeyboard } = await import('../useExpertModeKeyboard');
      renderHook(() => useExpertModeKeyboard(actions as any, true));

      const textarea = document.createElement('textarea');
      document.body.appendChild(textarea);
      textarea.focus();

      fireKeyEvent('h', { altKey: true });
      expect(actions.toggleHelp).not.toHaveBeenCalled();

      document.body.removeChild(textarea);
    });

    it('no dispara shortcuts cuando el foco está en un <select>', async () => {
      const { useExpertModeKeyboard } = await import('../useExpertModeKeyboard');
      renderHook(() => useExpertModeKeyboard(actions as any, true));

      const select = document.createElement('select');
      document.body.appendChild(select);
      select.focus();

      fireKeyEvent('p', { altKey: true });
      expect(actions.toggleProblems).not.toHaveBeenCalled();

      document.body.removeChild(select);
    });
  });
});
