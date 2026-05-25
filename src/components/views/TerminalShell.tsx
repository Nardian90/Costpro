'use client';
import { logger } from '@/lib/logger';

import React, { useState, useEffect, useTransition, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore, useUIStore, ViewType } from '@/store';
import { Header } from '@/components/views/terminal/Header';
import Sidebar from '@/components/views/terminal/Sidebar';
import { ParticleBackground } from '@/components/ui/ParticleBackground';
import { useTerminalNavigation } from '@/hooks/ui/useTerminalNavigation';
import { useQueryClient } from '@tanstack/react-query';
import { prefetchProducts } from '@/hooks/api/useProducts';
import { prefetchTransactions } from '@/hooks/api/useTransactions';
import { prefetchDashboardData } from '@/hooks/api/useDashboard';
import { prefetchAuditLogs } from '@/hooks/api/useAuditLogs';
import { prefetchReceptions } from '@/hooks/api/useReceptions';
import { useStores } from '@/hooks/api/useStores';
import { userService } from '@/services/user-service';
import { toast } from 'sonner';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { BuildingIcon } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { ViewLoadingSplash } from '@/components/ui/ViewLoadingSplash';
import { getNavigationRoute } from '@/config/navigation/navigation-map';
import dynamic from 'next/dynamic';
import { useIsMobile } from '@/hooks/ui/useMobile';
import ChunkErrorBoundary from '@/components/ui/ChunkErrorBoundary';
import MobileSafeContainer from '@/components/ui/MobileSafeContainer';
import { useKeyboardShortcuts } from '@/hooks/ui/useKeyboardShortcuts';
import { KeyboardShortcutsModal } from '@/components/ui/KeyboardShortcutsModal';
import { NavigationBreadcrumb } from '@/components/ui/NavigationBreadcrumb';

// FIX: ViewErrorBoundary defined at MODULE level — prevents unmount/remount
// on every TerminalShell re-render (was defined inside renderView, causing
// React to treat it as a new component type each time, destroying child state).
import { ErrorBoundary } from '@/components/ErrorBoundary';
function ViewErrorBoundary({ children, viewName }: { children: React.ReactNode; viewName: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center space-y-3">
            <p className="text-destructive font-medium">Error al cargar {viewName}</p>
            <button onClick={() => window.location.reload()} className="text-sm text-primary hover:underline">
              Reintentar
            </button>
          </div>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}

const DashboardView = dynamic(() => import('@/components/views/terminal/views/dashboard/DashboardView'), { ssr: false });
const OCCView = dynamic(() => import('@/components/views/terminal/views/dashboard/OCCView'), { ssr: false });
const Pick3IntelligenceView = dynamic(() => import('@/components/views/terminal/views/pick3/Pick3IntelligenceView'), { ssr: false });
const WalletView = dynamic(() => import('@/components/views/terminal/views/wallet/WalletView'), { ssr: false });
const POSView = dynamic(() => import('@/components/views/terminal/views/pos/POSView'), { ssr: false });
const SalesHistoryView = dynamic(() => import('@/components/views/terminal/views/sales/SalesHistoryView'), { ssr: false });
const UsersManagementView = dynamic(() => import('@/components/views/terminal/views/users/UsersManagementView'), { ssr: false });
const RolesManagementView = dynamic(() => import('@/components/views/terminal/views/users/RolesManagementView'), { ssr: false });
const StoresManagementView = dynamic(() => import('@/components/views/terminal/views/stores/StoresManagementView'), { ssr: false });
const AuditGlobalView = dynamic(() => import('@/components/views/terminal/views/audit/AuditGlobalView'), { ssr: false });
const InventoryView = dynamic(() => import('@/components/views/terminal/views/inventory/InventoryView'), { ssr: false });
const CatalogView = dynamic(() => import('@/components/views/terminal/views/catalog/CatalogView'), { ssr: false });
const CostSheetView = dynamic(() => import('@/components/views/terminal/views/cost_sheet/CostSheetView'), { ssr: false });
const ReportsView = dynamic(() => import('@/components/views/terminal/views/reports/ReportsView'), { ssr: false });
const IPVView = dynamic(() => import('@/components/views/terminal/views/ipv/IPVView'), { ssr: false });
const AcademyView = dynamic(() => import('@/components/views/terminal/views/academy/AcademyView'), { ssr: false });
const InventoryAdjustmentsView = dynamic(() => import('@/components/views/terminal/views/inventory/InventoryAdjustmentsView'), { ssr: false });
const LegalView = dynamic(() => import('@/components/views/terminal/views/legal/LegalView'), { ssr: false });
const SettingsView = dynamic(() => import('@/components/views/terminal/views/settings/SettingsView'), { ssr: false });
const HelpView = dynamic(() => import('@/components/views/terminal/views/help/HelpView'), { ssr: false });
const ProductReceptionView = dynamic(() => import('@/components/views/terminal/views/inventory/ProductReceptionView'), { ssr: false });
const TransferenciasView = dynamic(() => import('@/components/views/terminal/views/transfers/TransferenciasView'), { ssr: false });
const InventoryCountView = dynamic(() => import('@/components/views/terminal/views/inventory_count/InventoryCountView'), { ssr: false });
const CashClosureView = dynamic(() => import('@/components/views/terminal/views/cash_closure/CashClosureView'), { ssr: false });
const StockHistoryView = dynamic(() => import('@/components/views/terminal/views/stock_history/StockHistoryView'), { ssr: false });
const NewsView = dynamic(() => import('@/components/views/terminal/views/rss/NewsView'), { ssr: false });
const RSSManagementView = dynamic(() => import('@/components/views/terminal/views/rss/RSSManagementView'), { ssr: false });
const WikiView = dynamic(() => import('@/components/views/terminal/views/wiki/WikiView'), { ssr: false });
const HealthView = dynamic(() => import('@/components/views/health/HealthView'), { ssr: false });
const ReceptionsHistoryView = dynamic(() => import('@/components/views/terminal/views/receptions/ReceptionsHistoryView'), { ssr: false });

const FloatingCalculator = dynamic(() => import('@/components/ui/FloatingCalculator').then(m => m.FloatingCalculator), { ssr: false });
const ChatBot = dynamic(() => import('@/components/ui/ChatBot').then(m => m.ChatBot), { ssr: false });
const CreateProductModal = dynamic(() => import('@/components/modals/CreateProductModal').then(m => m.CreateProductModal), { ssr: false });
const CommandPalette = dynamic(() => import('@/components/ui/CommandPalette').then(m => m.CommandPalette), { ssr: false });
const SyncConflictModal = dynamic(() => import('@/components/modals/SyncConflictModal').then(m => m.SyncConflictModal), { ssr: false });

export default function TerminalShell() {
  const { user, logout, loading, status, updateUser } = useAuthStore();
  const {
    currentView,
    setCurrentView,
    setActiveCostSection,
    setIpvActiveTab,
    sidebarState,
    setSidebarState,
    toggleSidebar: globalToggleSidebar
  } = useUIStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const nav = useTerminalNavigation(user as any, sidebarSearch);

  useKeyboardShortcuts();

  useEffect(() => {
    const handler = () => setShowKeyboardHelp(prev => !prev);
    window.addEventListener('toggle-keyboard-help', handler);
    return () => window.removeEventListener('toggle-keyboard-help', handler);
  }, []);

  const { data: allStores = [] } = useStores(
    user?.id || '',
    user?.role === 'admin',
    false
  );

  const handleLogout = async () => {
    try {
      await userService.logout();
    } catch (error: any) {
      logger.warn('DATABASE', '[TERMINALSHELL]_LOGOUT_ERROR_(SILENT):', { data: error })
    } finally {
      logout();
      window.location.reload();
    }
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.reload();
      return;
    }

    if (user?.activeStoreId && status === 'authenticated_valid') {
      prefetchProducts(queryClient, user.activeStoreId);
    }
  }, [loading, user, router, queryClient, status]);

  // Role-based view guard: restrict 'costo' users to cost-related views + resources only
  const COSTO_ALLOWED_VIEWS: ViewType[] = ['cost-sheets', 'legal', 'help', 'wiki', 'academy'];
  useEffect(() => {
    if (user?.role === 'costo' && !COSTO_ALLOWED_VIEWS.includes(currentView)) {
      setCurrentView('cost-sheets');
    }
  }, [user, currentView, setCurrentView]);

  if (loading) {
    return (
      <div className="h-screen w-full bg-background">
        <ViewLoadingSplash label="COSTPRO" showTips={false} />
      </div>
    );
  }

  if (!user) return null;

  const isBlockingRequired = user.role !== 'admin' && user.role !== 'costo' && !user.activeStoreId;

  const handleViewChange = (view: ViewType) => {
    const route = getNavigationRoute(view as string);

    if (route && route.type === 'module') {
      startTransition(() => {
        setCurrentView(route.view as ViewType);
        if (route.view === 'ipv') {
          setIpvActiveTab(route.tab);
        } else if (route.view === 'cost-sheets') {
          setActiveCostSection(route.tab);
        }
      });
    } else {
      startTransition(() => {
        setCurrentView(view);
      });
    }

    if (isMobile) {
      setSidebarState('closed');
    }
  };

  const handlePrefetchView = (view: ViewType) => {
    if (!user?.activeStoreId) return;

    switch (view) {
      case 'pos':
      case 'inventory':
        prefetchProducts(queryClient, user.activeStoreId);
        break;
      case 'sales':
        prefetchTransactions(queryClient, user.activeStoreId, user.role === 'admin');
        break;
      case 'dashboard':
        prefetchDashboardData(queryClient, user.activeStoreId, user.role === 'admin');
        break;
      case 'audit':
        prefetchAuditLogs(queryClient, { storeIds: [user.activeStoreId] });
        break;
      case 'recepcion':
        prefetchReceptions(queryClient, user.activeStoreId, user.role === 'admin');
        break;
    }
  };

  const renderView = (view: ViewType) => {
    switch (view) {
        case 'dashboard': return <ViewErrorBoundary viewName="Dashboard"><DashboardView /></ViewErrorBoundary>;
        case 'pick3-intelligence': return <ViewErrorBoundary viewName="Pick3 Intelligence"><Pick3IntelligenceView /></ViewErrorBoundary>;
        case 'wallet': return <ViewErrorBoundary viewName="Wallet"><WalletView /></ViewErrorBoundary>;
        case 'pos': return <ViewErrorBoundary viewName="POS"><POSView /></ViewErrorBoundary>;
        case 'sales': return <ViewErrorBoundary viewName="Ventas"><SalesHistoryView /></ViewErrorBoundary>;
        case 'users': return <ViewErrorBoundary viewName="Usuarios"><UsersManagementView /></ViewErrorBoundary>;
        case 'roles': return <ViewErrorBoundary viewName="Roles"><RolesManagementView /></ViewErrorBoundary>;
        case 'stores': return <ViewErrorBoundary viewName="Tiendas"><StoresManagementView /></ViewErrorBoundary>;
        case 'audit': return <ViewErrorBoundary viewName="Auditoría"><AuditGlobalView /></ViewErrorBoundary>;
        case 'inventory': return <ViewErrorBoundary viewName="Inventario"><InventoryView /></ViewErrorBoundary>;
        case 'catalog': return <ViewErrorBoundary viewName="Catálogo"><CatalogView /></ViewErrorBoundary>;
        case 'cost-sheets': return <ViewErrorBoundary viewName="Hojas de Costo"><CostSheetView /></ViewErrorBoundary>;
        case 'reports': return <ViewErrorBoundary viewName="Reportes"><ReportsView /></ViewErrorBoundary>;
        case 'ipv': return <ViewErrorBoundary viewName="IPV"><IPVView /></ViewErrorBoundary>;
        case 'academy': return <ViewErrorBoundary viewName="Academia"><AcademyView /></ViewErrorBoundary>;
        case 'inventory_adjustments': return <ViewErrorBoundary viewName="Ajustes de Inventario"><InventoryAdjustmentsView /></ViewErrorBoundary>;
        case 'legal': return <ViewErrorBoundary viewName="Legal"><LegalView /></ViewErrorBoundary>;
        case 'settings': return <ViewErrorBoundary viewName="Configuración"><SettingsView /></ViewErrorBoundary>;
        case 'help': return <ViewErrorBoundary viewName="Ayuda"><HelpView /></ViewErrorBoundary>;
        case 'recepcion': return <ViewErrorBoundary viewName="Recepción"><ProductReceptionView onCancel={() => setCurrentView('inventory')} /></ViewErrorBoundary>;
        case 'transferencias': return <ViewErrorBoundary viewName="Transferencias"><TransferenciasView /></ViewErrorBoundary>;
        case 'inventory_count': return <ViewErrorBoundary viewName="Conteo de Inventario"><InventoryCountView /></ViewErrorBoundary>;
        case 'cash': return <ViewErrorBoundary viewName="Cierre de Caja"><CashClosureView /></ViewErrorBoundary>;
        case 'history': return <ViewErrorBoundary viewName="Historial de Stock"><StockHistoryView /></ViewErrorBoundary>;
        case 'news': return <ViewErrorBoundary viewName="Noticias"><NewsView /></ViewErrorBoundary>;
        case 'rss_management': return <ViewErrorBoundary viewName="Gestión RSS"><RSSManagementView /></ViewErrorBoundary>;
        case 'wiki': return <ViewErrorBoundary viewName="Wiki"><WikiView /></ViewErrorBoundary>;
        case 'health': return <ViewErrorBoundary viewName="Salud del Sistema"><HealthView /></ViewErrorBoundary>;
        case 'reception_list': return <ViewErrorBoundary viewName="Historial de Recepciones"><ReceptionsHistoryView /></ViewErrorBoundary>;
        case 'occ': return <ViewErrorBoundary viewName="Centro de Control"><OCCView /></ViewErrorBoundary>;
        default: return (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-6">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <span className="text-2xl font-black text-muted-foreground">?</span>
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black uppercase tracking-tight">Módulo No Disponible</h3>
              <p className="text-muted-foreground text-sm max-w-md mx-auto">
                La vista <code className="px-1.5 py-0.5 bg-muted rounded text-xs font-mono">{String(view)}</code> no está implementada aún.
              </p>
            </div>
            <button
              onClick={() => setCurrentView('dashboard')}
              className="px-6 py-2.5 bg-primary text-primary-foreground font-bold rounded-xl hover:opacity-90 transition-opacity text-xs uppercase tracking-widest"
            >
              Ir al Dashboard
            </button>
          </div>
        );
    }
  };

  const renderActiveView = () => {
    if (isBlockingRequired) {
      return (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-destructive/5 rounded-3xl border-2 border-dashed border-destructive/20 gap-6">
          <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center">
             <BuildingIcon className="w-10 h-10 text-destructive" />
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-black uppercase tracking-tight text-destructive">Sin Tienda Activa</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto font-medium">
              Tu cuenta no tiene una tienda asignada o activa actualmente. Por favor, contacta al administrador para que te asigne una sucursal.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="px-8 py-3 bg-destructive text-foreground font-black rounded-xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest"
          >
            Cerrar Sesión
          </button>
        </div>
      );
    }

    return renderView(currentView);
  };

  const sidebarWidths = {
    'expanded': 'pl-64 lg:pl-72',
    'rail': 'pl-20',
    'closed': 'pl-0'
  };

  return (
    <div className="h-screen flex bg-background text-foreground max-w-full overflow-hidden">
      {/* Skip Navigation — WCAG 2.4.1 */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-6 focus:py-3 focus:bg-primary focus:text-primary-foreground focus:font-bold focus:rounded-xl focus:text-xs focus:uppercase focus:tracking-widest focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
      >
        Saltar al contenido
      </a>
      <Sidebar
        onViewChange={handleViewChange}
        onLogout={handleLogout}
        onClose={() => setSidebarState('closed')}
        onPrefetchView={handlePrefetchView}
      />

      <main id="main-content" className={cn(
        "flex-1 h-full flex flex-col z-10 min-w-0 transition-[padding-left,padding-right] duration-300 cubic-bezier(0.4,0,0.2,1) overflow-x-hidden overflow-y-hidden",
        !isMobile && sidebarWidths[sidebarState]
      )} role="main">
        <Header
          sidebarState={sidebarState}
          toggleSidebar={globalToggleSidebar}
          currentView={currentView}
          navigationItems={nav.navigationItems}
          onViewChange={handleViewChange}
          user={user as any}
          allStores={allStores}
          handleSetActiveStore={async (id) => {
            try {
              updateUser({ activeStoreId: id });
              await userService.setActiveStore(user!.id, id);
              toast.success('Sucursal actualizada correctamente');
              queryClient.invalidateQueries({ queryKey: ['products'] });
              queryClient.invalidateQueries({ queryKey: ['transactions'] });
              queryClient.invalidateQueries({ queryKey: ['dashboard'] });
              queryClient.invalidateQueries({ queryKey: ['inventory'] });
              queryClient.invalidateQueries({ queryKey: ['cash-closures'] });
              queryClient.invalidateQueries({ queryKey: ['cost-sheets'] });
            } catch (error) {
              console.error('Error al cambiar de sucursal:', error);
              toast.error('No se pudo persistir el cambio de sucursal');
            }
          }}
        />

        <NavigationBreadcrumb className="px-3 sm:px-4 pt-3 pb-0" />

        <div className={cn(
          "relative flex-1 overflow-y-auto overflow-x-hidden terminal-content scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
          currentView === 'help' ? "p-0" : "px-3 sm:px-4 pt-0 pb-24 lg:pb-28"
        )}>
          <ParticleBackground />
          <Suspense fallback={
            <ViewLoadingSplash
              label={currentView === 'cost-sheets' ? 'Tablero Principal' : String(currentView).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
              showTips={currentView === 'cost-sheets' || currentView === 'ipv'}
            />
          }>
            <AnimatePresence mode="popLayout">
              <motion.div
                key={currentView}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] as any }}
                className={cn(
                  "mx-auto w-full",
                  (currentView === 'cost-sheets' || currentView === 'ipv') ? "max-w-none" : "max-w-7xl"
                )}
              >
                <ChunkErrorBoundary chunkName={String(currentView)}>
                  <MobileSafeContainer>
                    {renderActiveView()}
                  </MobileSafeContainer>
                </ChunkErrorBoundary>
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </div>
      </main>

      <AnimatePresence>
        {sidebarState !== 'closed' && isMobile && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-30"
            aria-hidden="true" /* FIX-ACC-009 */
            onClick={() => setSidebarState('closed')}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <CreateProductModal />
      <CommandPalette />
      <KeyboardShortcutsModal open={showKeyboardHelp} onOpenChange={setShowKeyboardHelp} />
      {currentView !== 'pos' && currentView !== 'help' && <ChatBot />}
      {currentView !== "pos" && <FloatingCalculator />}
    </div>
  );
}
