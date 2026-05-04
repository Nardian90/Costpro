import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CommandPalette } from '../CommandPalette';
import { useUIStore, useAuthStore } from '@/store';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the stores
vi.mock('@/store', () => ({
  useUIStore: vi.fn(),
  useAuthStore: vi.fn(),
}));

// Mock createPortal to render into a div instead of document.body for easier testing
vi.mock('react-dom', async () => {
  const actual = await vi.importActual<typeof import('react-dom')>('react-dom');
  return {
    ...actual,
    createPortal: (node: any) => node,
  };
});

describe('CommandPalette', () => {
  const mockSetCurrentView = vi.fn();
  const mockSetActiveCostSection = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useUIStore as any).mockReturnValue({
      setCurrentView: mockSetCurrentView,
      setActiveCostSection: mockSetActiveCostSection,
    });
    (useAuthStore as any).mockReturnValue({
      user: { role: 'admin' },
    });

    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        clear: () => { store = {}; },
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
  });

  it('renders correctly when open', async () => {
    // We need to trigger the keydown event to open it
    render(<CommandPalette />);

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(screen.getByPlaceholderText(/Buscar o ejecutar acción/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar acciones o navegar')).toBeInTheDocument();
    expect(screen.getByLabelText('Cerrar centro de comando')).toBeInTheDocument();
  });

  it('shows ARIA attributes for combobox pattern', () => {
    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(input).toHaveAttribute('aria-haspopup', 'listbox');
    expect(input).toHaveAttribute('aria-controls', 'command-palette-results');
  });

  it('shows CTRL K for non-Mac systems', () => {
    // Mock navigator.platform
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true
    });

    render(<CommandPalette />);
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    expect(screen.getByText(/CTRL K/i)).toBeInTheDocument();
  });
});
