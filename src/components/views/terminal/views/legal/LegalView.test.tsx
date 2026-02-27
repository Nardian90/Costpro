import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import LegalView from './LegalView';
import { supabase } from '@/lib/supabaseClient';

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null }))
        })),
        order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        then: vi.fn((cb) => cb({ data: [], error: null }))
      }))
    }))
  }
}));

vi.mock('@/store', () => ({
  useAuthStore: vi.fn(() => ({ user: { id: '1', role: 'admin' } })),
  useUIStore: vi.fn(() => ({ currentView: 'legal' }))
}));

describe('LegalView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(<LegalView />);
    expect(screen.getByText('Consultor Legal')).toBeInTheDocument();
  });
});
