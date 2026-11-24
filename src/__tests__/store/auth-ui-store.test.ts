import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useAuthStore, useUIStore } from '@/store';

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null, token: null, loading: false, isMocked: false, status: 'unauthenticated',
    });
  });

  it('login sets user, token, status', () => {
    const mockUser = { id: 'u1', email: 'test@test.com', role: 'admin' } as any;
    useAuthStore.getState().login(mockUser, 'test-token', 'authenticated_valid');
    const s = useAuthStore.getState();
    expect(s.user).toEqual(mockUser);
    expect(s.token).toBe('test-token');
    expect(s.status).toBe('authenticated_valid');
    expect(s.loading).toBe(false);
    expect(s.isMocked).toBe(false);
  });

  it('login with isMocked=true sets flag', () => {
    useAuthStore.getState().login({ id: 'u1' } as any, 'token', 'authenticated_valid', true);
    expect(useAuthStore.getState().isMocked).toBe(true);
  });

  it('logout clears all state', () => {
    useAuthStore.getState().login({ id: 'u1' } as any, 'token', 'authenticated_valid');
    useAuthStore.getState().logout();
    const s = useAuthStore.getState();
    expect(s.user).toBeNull();
    expect(s.token).toBeNull();
    expect(s.status).toBe('unauthenticated');
    expect(s.isMocked).toBe(false);
  });

  it('setUser updates user', () => {
    useAuthStore.getState().login({ id: 'u1', fullName: 'Old' } as any, 'token', 'authenticated_valid');
    useAuthStore.getState().setUser({ id: 'u1', fullName: 'New' } as any);
    expect(useAuthStore.getState().user?.fullName).toBe('New');
  });

  it('setToken updates token', () => {
    useAuthStore.getState().setToken('new-token');
    expect(useAuthStore.getState().token).toBe('new-token');
  });

  it('setLoading updates loading', () => {
    useAuthStore.getState().setLoading(true);
    expect(useAuthStore.getState().loading).toBe(true);
  });

  it('setStatus updates status', () => {
    useAuthStore.getState().setStatus('authenticated_no_store');
    expect(useAuthStore.getState().status).toBe('authenticated_no_store');
  });

  it('updateUser merges partial data', () => {
    useAuthStore.getState().login({ id: 'u1', fullName: 'Test', email: 't@t.com' } as any, 'token', 'authenticated_valid');
    useAuthStore.getState().updateUser({ fullName: 'Updated' });
    const s = useAuthStore.getState();
    expect(s.user?.fullName).toBe('Updated');
    expect(s.user?.email).toBe('t@t.com'); // preserved
  });

  it('updateUser does nothing when user is null', () => {
    useAuthStore.getState().updateUser({ fullName: 'Test' });
    expect(useAuthStore.getState().user).toBeNull();
  });
});

describe('useUIStore', () => {
  beforeEach(() => {
    useUIStore.setState({
      currentView: 'chat', previousView: null, sidebarState: 'expanded',
      isCalculatorOpen: false, themePreference: 'light', connectivity: '4g',
    });
  });

  it('setCurrentView updates view and sets previousView', () => {
    useUIStore.setState({ currentView: 'dashboard' });
    useUIStore.getState().setCurrentView('inventory');
    expect(useUIStore.getState().currentView).toBe('inventory');
    expect(useUIStore.getState().previousView).toBe('dashboard');
  });

  it('setSidebarState updates state', () => {
    useUIStore.getState().setSidebarState('rail');
    expect(useUIStore.getState().sidebarState).toBe('rail');
  });

  // CP-SIDEBAR-RESTORATION-001: DOS ESTADOS en desktop — toggleSidebar alterna
  // expanded ↔ rail y JAMÁS cierra el menú. En móvil mantiene el drawer.
  describe('toggleSidebar (CP-SIDEBAR-RESTORATION-001)', () => {
    const setInnerWidth = (w: number) => {
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: w });
    };

    afterEach(() => setInnerWidth(1024));

    it('desktop expanded → rail (y jamás closed)', () => {
      setInnerWidth(1366);
      useUIStore.setState({ sidebarState: 'expanded' });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarState).toBe('rail');
    });

    it('desktop rail → expanded (vuelta al ESTADO A)', () => {
      setInnerWidth(1366);
      useUIStore.setState({ sidebarState: 'rail' });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarState).toBe('expanded');
    });

    it('desktop closed heredado → expanded (nunca permanece cerrado)', () => {
      setInnerWidth(1366);
      useUIStore.setState({ sidebarState: 'closed' });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarState).toBe('rail');
    });

    it('móvil closed → expanded (abre drawer) y expanded → closed', () => {
      setInnerWidth(390);
      useUIStore.setState({ sidebarState: 'closed' });
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarState).toBe('expanded');
      useUIStore.getState().toggleSidebar();
      expect(useUIStore.getState().sidebarState).toBe('closed');
    });
  });

  it('setIsCalculatorOpen toggles calculator', () => {
    useUIStore.getState().setIsCalculatorOpen(true);
    expect(useUIStore.getState().isCalculatorOpen).toBe(true);
  });

  it('setThemePreference updates theme', () => {
    useUIStore.getState().setThemePreference('dark');
    expect(useUIStore.getState().themePreference).toBe('dark');
  });

  it('setConnectivity updates connectivity', () => {
    useUIStore.getState().setConnectivity('3g');
    expect(useUIStore.getState().connectivity).toBe('3g');
  });
});
