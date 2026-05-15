import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import CostSheetTemplateExplorer from '../CostSheetTemplateExplorer';
import React from 'react';

// Mock dependencies
vi.mock('@/store/cost-sheet-store', () => ({
  useCostSheetStore: vi.fn(() => ({
    setSheet: vi.fn(),
    setActiveCostSection: vi.fn()
  }))
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

// Mock Framer Motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('CostSheetTemplateExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render search input', () => {
    render(<CostSheetTemplateExplorer />);
    expect(screen.getByPlaceholderText('Buscar plantillas...')).toBeDefined();
  });

  it('should render template category buttons', () => {
    render(<CostSheetTemplateExplorer />);
    expect(screen.getByText('Todas')).toBeDefined();
    expect(screen.getByText('servicios')).toBeDefined();
  });
});
