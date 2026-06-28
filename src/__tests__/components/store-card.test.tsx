import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StoreCard, type StoreCardProps } from '@/components/views/terminal/views/stores/StoreCard';
import type { Store } from '@/types';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const dict: Record<string, string> = {
      title: 'Tienda',
      active: 'Activa',
      inactive: 'Inactiva',
      address: 'Dirección',
      addressNotSpecified: 'Sin dirección',
      reeup: 'REEUP',
      currentStore: 'Tienda actual',
      selectStore: 'Seleccionar',
      publicLink: 'Link público',
      linkCopied: 'Link copiado',
      copyError: 'Error al copiar',
      copyLink: 'Copiar link',
      visitStorefront: 'Visitar tienda',
      publicStorefront: 'Tienda pública',
      phone: 'Tel',
      bankAccount: 'Cuenta',
      resetStore: 'Reiniciar',
      reset: 'Reiniciar',
      info: 'Info',
      erase: 'Eliminar',
      deleteStore: 'Eliminar tienda',
      loadingStores: 'Cargando',
      logo: 'Logo',
      noStores: 'Sin tiendas',
      noAccessOrNoRecords: 'Sin registros',
    };
    return dict[key] || key;
  },
}));

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: any) => (
    <img src={typeof src === 'string' ? src : ''} alt={alt} {...props} />
  ),
}));

// Mock sonner toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// Mock StoreHealthBadge (not relevant for unit tests)
vi.mock('@/components/views/terminal/views/stores/StoreHealthBadge', () => ({
  StoreHealthBadge: () => <div data-testid="health-badge" />,
}));

// Mock getStoreLogoUrl
vi.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
  getStoreLogoUrl: (url: string) => url || null,
}));

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 'store-001',
    name: 'Tienda Centro',
    address: 'Calle Principal 123',
    logo_url: null,
    is_active: true,
    slug: 'tienda-centro',
    reeup: 'REEUP123',
    nit: 'NIT456',
    bank_account: '1234567890',
    phone: '555-1234',
    email: 'tienda@test.com',
    cost_template: null,
    ...overrides,
  } as Store;
}

function makeProps(overrides: Partial<StoreCardProps> = {}): StoreCardProps {
  return {
    store: makeStore(),
    isSelected: false,
    isAdmin: true,
    activeStoreId: null,
    userActiveStoreId: undefined,
    userCounts: {},
    health: null,
    isTogglingStatus: false,
    archivingStoreId: null,
    onToggleSelect: vi.fn(),
    onSetActiveStore: vi.fn(),
    onEditStore: vi.fn(),
    onConfigStore: vi.fn(),
    onTeamStore: vi.fn(),
    onResetStore: vi.fn(),
    onToggleStatus: vi.fn(),
    onArchiveStore: vi.fn(),
    onRestoreStore: vi.fn(),
    onDeleteStore: vi.fn(),
    ...overrides,
  };
}

describe('StoreCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Rendering ────────────────────────────────────────────────────
  describe('rendering', () => {
    it('renders store name and address', () => {
      render(<StoreCard {...makeProps()} />);
      expect(screen.getByText('Tienda Centro')).toBeInTheDocument();
      expect(screen.getByText('Calle Principal 123')).toBeInTheDocument();
    });

    it('renders active badge when store.is_active=true', () => {
      render(<StoreCard {...makeProps()} />);
      expect(screen.getByText('Activa')).toBeInTheDocument();
    });

    it('renders inactive badge when store.is_active=false', () => {
      render(<StoreCard {...makeProps({ store: makeStore({ is_active: false }) })} />);
      expect(screen.getByText('Inactiva')).toBeInTheDocument();
    });

    it('renders store metadata (phone, email, reeup, bank_account)', () => {
      render(<StoreCard {...makeProps()} />);
      expect(screen.getByText(/Tel: 555-1234/)).toBeInTheDocument();
      expect(screen.getByText('tienda@test.com')).toBeInTheDocument();
      // REEUP appears in both sr-only desc and visible metadata — use getAllByText
      expect(screen.getAllByText(/REEUP: REEUP123/).length).toBeGreaterThan(0);
      expect(screen.getByText(/Cuenta: 1234567890/)).toBeInTheDocument();
    });

    it('renders FC indicator as "Sin plantilla FC" when no cost_template', () => {
      render(<StoreCard {...makeProps()} />);
      expect(screen.getByText(/Sin plantilla FC/)).toBeInTheDocument();
    });

    it('renders FC indicator with modalidad when cost_template.is_active=true', () => {
      const store = makeStore({
        cost_template: { is_active: true, modalidad: 'produccion', pdf_format: 'a4' } as any,
      });
      render(<StoreCard {...makeProps({ store })} />);
      expect(screen.getByText(/FC: produccion/)).toBeInTheDocument();
    });

    it('renders public storefront link with correct slug', () => {
      render(<StoreCard {...makeProps()} />);
      // The slug should appear in the URL display
      const slugElements = screen.getAllByText(/tienda-centro/);
      expect(slugElements.length).toBeGreaterThan(0);
    });

    it('does NOT render public link when store.slug is empty', () => {
      render(<StoreCard {...makeProps({ store: makeStore({ slug: '' }) })} />);
      expect(screen.queryByText(/Link público/)).not.toBeInTheDocument();
    });
  });

  // ─── Active store state ───────────────────────────────────────────
  describe('active store state', () => {
    it('shows "Seleccionar" button when store is NOT the active store', () => {
      render(<StoreCard {...makeProps({ activeStoreId: 'other-store' })} />);
      expect(screen.getByText('Seleccionar')).toBeInTheDocument();
    });

    it('shows "Tienda actual" status when store IS the active store', () => {
      render(<StoreCard {...makeProps({ activeStoreId: 'store-001' })} />);
      expect(screen.getByText('Tienda actual')).toBeInTheDocument();
      expect(screen.queryByText('Seleccionar')).not.toBeInTheDocument();
    });
  });

  // ─── Admin-only buttons ───────────────────────────────────────────
  describe('admin-only buttons', () => {
    it('shows Equipo, Reiniciar, Pausar, Archivar, Eliminar buttons when isAdmin=true', () => {
      render(<StoreCard {...makeProps({ isAdmin: true })} />);
      expect(screen.getByText('Equipo')).toBeInTheDocument();
      expect(screen.getByText('Reiniciar')).toBeInTheDocument();
      expect(screen.getByText('Pausar')).toBeInTheDocument();
      expect(screen.getByText('Archivar')).toBeInTheDocument();
      expect(screen.getByText('Eliminar')).toBeInTheDocument();
    });

    it('hides admin-only buttons when isAdmin=false', () => {
      render(<StoreCard {...makeProps({ isAdmin: false })} />);
      expect(screen.queryByText('Equipo')).not.toBeInTheDocument();
      expect(screen.queryByText('Reiniciar')).not.toBeInTheDocument();
      expect(screen.queryByText('Pausar')).not.toBeInTheDocument();
      expect(screen.queryByText('Archivar')).not.toBeInTheDocument();
      expect(screen.queryByText('Eliminar')).not.toBeInTheDocument();
    });

    it('shows "Restaurar" instead of "Archivar" when store.is_active=false', () => {
      render(<StoreCard {...makeProps({
        isAdmin: true,
        store: makeStore({ is_active: false }),
      })} />);
      expect(screen.getByText('Restaurar')).toBeInTheDocument();
      expect(screen.queryByText('Archivar')).not.toBeInTheDocument();
    });
  });

  // ─── Selection ────────────────────────────────────────────────────
  describe('selection (bulk operations)', () => {
    it('renders checkbox when isAdmin=true', () => {
      render(<StoreCard {...makeProps({ isAdmin: true })} />);
      const checkbox = screen.getByRole('checkbox');
      expect(checkbox).toBeInTheDocument();
    });

    it('does NOT render checkbox when isAdmin=false', () => {
      render(<StoreCard {...makeProps({ isAdmin: false })} />);
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('calls onToggleSelect when checkbox is clicked', () => {
      const onToggleSelect = vi.fn();
      render(<StoreCard {...makeProps({ isAdmin: true, onToggleSelect })} />);
      const checkbox = screen.getByRole('checkbox');
      fireEvent.click(checkbox);
      expect(onToggleSelect).toHaveBeenCalledWith('store-001');
    });
  });

  // ─── Callbacks ────────────────────────────────────────────────────
  describe('callbacks', () => {
    it('calls onSetActiveStore when "Seleccionar" button is clicked', () => {
      const onSetActiveStore = vi.fn();
      render(<StoreCard {...makeProps({ onSetActiveStore })} />);
      fireEvent.click(screen.getByText('Seleccionar'));
      expect(onSetActiveStore).toHaveBeenCalledWith('store-001');
    });

    it('calls onEditStore when "Info" button is clicked', () => {
      const onEditStore = vi.fn();
      render(<StoreCard {...makeProps({ onEditStore })} />);
      fireEvent.click(screen.getByText('Info'));
      expect(onEditStore).toHaveBeenCalledWith(expect.objectContaining({ id: 'store-001' }));
    });

    it('calls onConfigStore when "Configurar" is clicked', () => {
      const onConfigStore = vi.fn();
      render(<StoreCard {...makeProps({ onConfigStore })} />);
      fireEvent.click(screen.getByText('Configurar'));
      expect(onConfigStore).toHaveBeenCalledWith(expect.objectContaining({ id: 'store-001' }));
    });

    it('calls onTeamStore when "Equipo" is clicked', () => {
      const onTeamStore = vi.fn();
      render(<StoreCard {...makeProps({ onTeamStore })} />);
      fireEvent.click(screen.getByText('Equipo'));
      expect(onTeamStore).toHaveBeenCalledWith(expect.objectContaining({ id: 'store-001' }));
    });

    it('calls onArchiveStore when "Archivar" is clicked', () => {
      const onArchiveStore = vi.fn();
      render(<StoreCard {...makeProps({ onArchiveStore })} />);
      fireEvent.click(screen.getByText('Archivar'));
      expect(onArchiveStore).toHaveBeenCalledWith(expect.objectContaining({ id: 'store-001' }));
    });

    it('calls onDeleteStore when "Eliminar" is clicked', () => {
      const onDeleteStore = vi.fn();
      render(<StoreCard {...makeProps({ onDeleteStore })} />);
      fireEvent.click(screen.getByText('Eliminar'));
      expect(onDeleteStore).toHaveBeenCalledWith(expect.objectContaining({ id: 'store-001' }));
    });
  });

  // ─── Loading/disabled states ──────────────────────────────────────
  describe('loading/disabled states', () => {
    it('disables Pausar/Activar button when isTogglingStatus=true', () => {
      render(<StoreCard {...makeProps({ isAdmin: true, isTogglingStatus: true })} />);
      const pauseBtn = screen.getByText('Pausar').closest('button');
      expect(pauseBtn).toBeDisabled();
    });

    it('disables Archivar button when archivingStoreId matches store.id', () => {
      render(<StoreCard {...makeProps({
        isAdmin: true,
        archivingStoreId: 'store-001',
      })} />);
      const archiveBtn = screen.getByText('Archivar').closest('button');
      expect(archiveBtn).toBeDisabled();
    });

    it('disables Restaurar button when archivingStoreId matches store.id', () => {
      render(<StoreCard {...makeProps({
        isAdmin: true,
        store: makeStore({ is_active: false }),
        archivingStoreId: 'store-001',
      })} />);
      const restoreBtn = screen.getByText('Restaurar').closest('button');
      expect(restoreBtn).toBeDisabled();
    });
  });

  // ─── Accessibility ────────────────────────────────────────────────
  describe('accessibility', () => {
    it('has role="article" with proper aria-label', () => {
      render(<StoreCard {...makeProps()} />);
      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('aria-label', 'Tienda Tienda Centro');
    });

    it('has tabIndex=0 for keyboard navigation', () => {
      render(<StoreCard {...makeProps()} />);
      const article = screen.getByRole('article');
      expect(article).toHaveAttribute('tabindex', '0');
    });

    it('triggers onSetActiveStore on Enter key press', () => {
      const onSetActiveStore = vi.fn();
      render(<StoreCard {...makeProps({ onSetActiveStore })} />);
      const article = screen.getByRole('article');
      fireEvent.keyDown(article, { key: 'Enter' });
      expect(onSetActiveStore).toHaveBeenCalledWith('store-001');
    });

    it('triggers onSetActiveStore on Space key press', () => {
      const onSetActiveStore = vi.fn();
      render(<StoreCard {...makeProps({ onSetActiveStore })} />);
      const article = screen.getByRole('article');
      fireEvent.keyDown(article, { key: ' ' });
      expect(onSetActiveStore).toHaveBeenCalledWith('store-001');
    });

    it('has sr-only description for screen readers', () => {
      render(<StoreCard {...makeProps()} />);
      const desc = document.getElementById('store-desc-store-001');
      expect(desc).toBeInTheDocument();
      expect(desc).toHaveClass('sr-only');
      expect(desc?.textContent).toContain('Tienda Centro');
      expect(desc?.textContent).toContain('Calle Principal 123');
      expect(desc?.textContent).toContain('REEUP123');
    });

    it('renders Building icon as logo fallback when no logo_url', () => {
      const { container } = render(<StoreCard {...makeProps({ store: makeStore({ logo_url: null }) })} />);
      // lucide-react renders as <svg> — check at least one svg exists in logo area
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });
  });

  // ─── User counts badge ────────────────────────────────────────────
  describe('user counts badge', () => {
    it('shows "0 usuarios" when no count data', () => {
      render(<StoreCard {...makeProps({ userCounts: {} })} />);
      expect(screen.getByText(/0 usuarios/)).toBeInTheDocument();
    });

    it('shows "1 usuario" (singular) when total=1', () => {
      render(<StoreCard {...makeProps({
        userCounts: {
          'store-001': { total: 1, byRole: { admin: 1 } },
        },
      })} />);
      expect(screen.getByText(/1 usuario/)).toBeInTheDocument();
    });

    it('shows "3 usuarios" (plural) when total=3', () => {
      render(<StoreCard {...makeProps({
        userCounts: {
          'store-001': { total: 3, byRole: { admin: 1, encargado: 2 } },
        },
      })} />);
      expect(screen.getByText(/3 usuarios/)).toBeInTheDocument();
    });
  });
});
