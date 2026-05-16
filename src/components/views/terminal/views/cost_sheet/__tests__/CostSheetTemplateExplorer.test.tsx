import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CostSheetTemplateExplorer } from '../CostSheetTemplateExplorer';
import React from 'react';

// Mock dependencies
vi.mock('@/store', () => ({
  useCostSheetStore: vi.fn(() => vi.fn()),
  useUIStore: vi.fn(() => ({ setActiveCostSection: vi.fn() })),
  useAuthStore: vi.fn((selector: any) => selector({
    user: {
      id: 'admin-id',
      fullName: 'Jules Admin',
      role: 'admin',
      activeStoreId: 'store-1'
    }
  }))
}));

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'admin-id' } }, error: null }))
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          or: vi.fn(() => Promise.resolve({ data: [], error: null })),
          is: vi.fn(() => Promise.resolve({ data: [], error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ error: null }))
    }))
  }
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}));

vi.mock('@/services/store-service', () => ({
  storeService: {
    getStores: vi.fn(() => Promise.resolve([
      { id: 'store-1', name: 'Tienda A' },
      { id: 'store-2', name: 'Tienda B' }
    ]))
  }
}));

// Mock Framer Motion
vi.mock('framer-motion', () => ({
  motion: {
    div: (props: any) => <div {...props}>{props.children}</div>,
  },
  AnimatePresence: (props: any) => <>{props.children}</>,
}));

describe('CostSheetTemplateExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render system templates', () => {
    render(<CostSheetTemplateExplorer />);
    expect(screen.getByText('Nueva Ficha')).toBeDefined();
  });

  it('should fetch stores for admin', async () => {
    render(<CostSheetTemplateExplorer />);
    const { storeService } = await import('@/services/store-service');
    await waitFor(() => {
      expect(storeService.getStores).toHaveBeenCalled();
    });
  });
});
