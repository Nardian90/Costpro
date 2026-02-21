import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CostSheetTemplateExplorer } from '../CostSheetTemplateExplorer';
import React from 'react';

// Mock dependencies
vi.mock('@/store', () => ({
  useCostSheetStore: vi.fn((selector) => {
    // We don't really need a full store here, just enough to not crash
    return vi.fn();
  })
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: [], error: null }))
      }))
    }))
  }
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

// Mock Framer Motion to avoid issues in test environment
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

describe('CostSheetTemplateExplorer', () => {
  it('should render all system templates', () => {
    render(<CostSheetTemplateExplorer />);

    expect(screen.getByText('Plantilla de Reinicio')).toBeDefined();
    expect(screen.getByText('Jugo Natural (1L)')).toBeDefined();
    expect(screen.getByText('Pizza Margarita')).toBeDefined();
    expect(screen.getByText('Croissant Artesanal')).toBeDefined();
    expect(screen.getByText('Mueble de Roble')).toBeDefined();
    expect(screen.getByText('Pintura Industrial')).toBeDefined();
    expect(screen.getByText('Ejemplo: Producción de Pan')).toBeDefined();
  });
});
