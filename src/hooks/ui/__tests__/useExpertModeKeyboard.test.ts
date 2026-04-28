import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useExpertModeKeyboard } from '../useExpertModeKeyboard';

describe('useExpertModeKeyboard', () => {
  it('should trigger actions on keydown', () => {
    const save = vi.fn();
    const actions = { toggleAllSections: vi.fn(), toggleHelp: vi.fn(), toggleProblems: vi.fn(), toggleComparison: vi.fn(), expandSection: vi.fn(), save, closePanels: vi.fn() };
    renderHook(() => useExpertModeKeyboard(actions));
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true });
    window.dispatchEvent(event);
    expect(save).toHaveBeenCalled();
  });
});
