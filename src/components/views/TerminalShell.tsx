'use client';

import { useState, useEffect, useTransition, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore, useUIStore, type ViewType } from '@/store';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Building as BuildingIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

import { userService } from '@/services/user-service';

// Modular Hooks
import { useTerminalNavigation } from '@/hooks/ui/useTerminalNavigation';
import { prefetchProducts } from '@/hooks/api/useProducts'
import { prefetchDashboardData } from '@/hooks/api/useDashboard';
import { prefetchTransactions } from '@/hooks/api/useTransactions';
import { prefetchAuditLogs } from '@/hooks/api/useAuditLogs';
import { prefetchReceptions } from '@/hooks/api/useReceptions';

// Modular Components
import { Sidebar } from './terminal/Sidebar';
import { Header } from './terminal/Header';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { CreateProductModal } from '@/components/modals/CreateProductModal';
import { ChatBot } from '@/components/ui/ChatBot';
import { FloatingCalculator } from "@/components/ui/FloatingCalculator";

// Sub-views will be lazy loaded later
import { MobileSafeContainer } from '@/components/ui/MobileSafeContainer';

import { lazy } from 'react';

// Lazy Loaded Views
const POSView = lazy(() => import('./terminal/views/pos/POSView'));
const UsersManagementView = lazy(() => import('./terminal/views/users/UsersManagementView'));
const RolesManagementView = lazy(() => import('./terminal/views/users/RolesManagementView'));
const DashboardView = lazy(() => import('./terminal/views/dashboard/DashboardView'));
const SalesHistoryView = lazy(() => import('./terminal/views/sales/SalesHistoryView'));
const StoresManagementView = lazy(() => import('./terminal/views/stores/StoresManagementView'));
const AuditLogsView = lazy(() => import('./terminal/views/audit/AuditLogsView'));
const ReceptionsHistoryView = lazy(() => import('./terminal/views/receptions/ReceptionsHistoryView'));
const NewsView = lazy(() => import('./terminal/views/rss/NewsView'));
const RSSManagementView = lazy(() => import('./terminal/views/rss/RSSManagementView'));

const InventoryView = lazy(() => import('./terminal/views/inventory/InventoryView'));
const CashClosureView = lazy(() => import('./terminal/views/cash_closure/CashClosureView'));
const StockHistoryView = lazy(() => import('./terminal/views/stock_history/StockHistoryView'));
const CatalogView = lazy(() => import('./terminal/views/catalog/CatalogView'));
const InventoryCountView = lazy(() => import('./terminal/views/inventory_count/InventoryCountView'));
const CostSheetView = lazy(() => import('./terminal/views/cost_sheet/CostSheetView'));
const HelpView = lazy(() => import('./terminal/views/help/HelpView'));
const SettingsView = lazy(() => import('./terminal/views/settings/SettingsView'));
const TransferenciasView = lazy(() => import('./terminal/views/transfers/TransferenciasView'));
const ProductReceptionView = lazy(() => import('./terminal/views/inventory/ProductReceptionView'));
const ReportsView = lazy(() => import('./terminal/views/reports/ReportsView'));
const IPVView = lazy(() => import('./terminal/views/ipv/IPVView'));
const AcademyView = lazy(() => import('./terminal/views/academy/AcademyView'));
const InventoryAdjustmentsView = lazy(() => import('./terminal/views/inventory/InventoryAdjustmentsView'));


export default function TerminalShell() { // Renamed from TerminalView
  const { user, loading, status, logout } = useAuthStore();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  // Se instancia queryClient para permitir la invalidación de caché en el cambio de sucursal
  const queryClient = useQueryClient();

  const {
    currentView, setCurrentView,
    sidebarOpen, toggleSidebar, setSidebarOpen
  } = useUIStore();

  const { updateUser } = useAuthStore();

  const [sidebarSearch, setSidebarSearch] = useState('');

  // Hooks
  const nav = useTerminalNavigation(user, sidebarSearch);
  const router = useRouter();


  // LOGOUT HANDLER (moved from useTerminalOperations)
   const handleLogout = async () => {
    try {
      // Intentamos cerrar sesión en Supabase
      await userService.logout();
    } catch (error: any) {
      console.warn('[TerminalShell] Logout error (silent):', error);
    } finally {
      // SIEMPRE limpiamos el estado local y redirigimos,
      // incluso si la llamada a Supabase falló (ej. sesión ya expirada)
      logout();
      router.replace('/login');
    }
  };

  // Initial check on mount & prefetching
  useEffect(() => {
    // ONLY REDIRECT if status is explicitly unauthenticated
    // This prevents the redirect loop if profile is just invalid or still loading
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    if (user?.activeStoreId && status === 'authenticated_valid') {
      // Smart Prefetch: Load critical data in advance
      prefetchProducts(queryClient, user.activeStoreId);
    }
  }, [loading, user, router, queryClient]);
  useEffect(() => {
    if (user?.role === 'costo' && currentView === 'dashboard') {
      setCurrentView('cost-sheets');
    }
  }, [user, currentView, setCurrentView]);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <CostProLoader size={260} text="COSTPRO" subtext="INICIALIZANDO TERMINAL..." />
      </div>
    );
  }

  if (!user) return null;

  // BLOCKING ACCESS (Regla 3): If a non-admin user has no active store, block operations
  const isBlockingRequired = user.role !== 'admin' && user.role !== 'costo' && !user.activeStoreId;

  const handleViewChange = (view: ViewType) => {
    startTransition(() => {
      setCurrentView(view);
    });
    if (isMobile) {
      setSidebarOpen(false);
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
        prefetchAuditLogs(queryClient);
        break;
      case 'recepcion':
      case 'reception_list':
        prefetchReceptions(queryClient, user.activeStoreId, user.role === 'admin');
        break;
    }
  };

  // The renderView function is now simplified and will be replaced with lazy loading


  const renderView = (view: ViewType) => {
    switch (view) {
        case 'dashboard': return <DashboardView />;
        case 'pos': return <POSView />;
        case 'sales': return <SalesHistoryView />;
        case 'users': return <UsersManagementView />;
        case 'roles': return <RolesManagementView />;
        case 'stores': return <StoresManagementView />;
        case 'news': return <NewsView />;
        case 'rss_management': return <RSSManagementView />;
        case 'audit': return <AuditLogsView />;
        case 'inventory': return <InventoryView />;
        case 'cash': return <CashClosureView />;
        case 'history': return <StockHistoryView />;
        case 'catalog': return <CatalogView />;
        case 'inventory_count': return <InventoryCountView />;
        case 'cost-sheets': return <CostSheetView />;
        case 'reports': return <ReportsView />;
        case 'ipv': return <IPVView />;
        case 'academy': return <AcademyView />;
        case 'inventory_adjustments': return <InventoryAdjustmentsView />;
        case 'settings': return <SettingsView />;
        case 'help': return <HelpView />;
        case 'recepcion': return <ProductReceptionView onCancel={() => setCurrentView('inventory')} />;
        case 'reception_list': return <ReceptionsHistoryView />;
        case 'transferencias': return <TransferenciasView />;
        default: return <div>Default View Placeholder</div>;
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
            className="px-8 py-3 bg-destructive text-white font-black rounded-xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest"
          >
            Cerrar Sesión
          </button>
        </div>
      );
    }

    // Placeholder for where the dynamic components will be rendered.
    return renderView(currentView);
  };

  const isIntegroView = currentView === 'help' || currentView === 'cost-sheets';

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-x-hidden">
      {!isIntegroView && (
        <Sidebar
          sidebarOpen={sidebarOpen}
          sidebarSearch={sidebarSearch}
          setSidebarSearch={setSidebarSearch}
          navigationItems={nav.navigationItems}
          currentView={currentView}
          onViewChange={handleViewChange}
          onPrefetchView={handlePrefetchView}
          onLogout={handleLogout}
          logoHeight={nav.logoHeight}
          logoOpacity={nav.logoOpacity}
          logoScale={nav.logoScale}
          navRef={nav.navRef}
        />
      )}

      <main className="flex-1 min-h-screen flex flex-col z-10 min-w-0">
        {!isIntegroView && (
          <Header
            sidebarOpen={sidebarOpen}
            toggleSidebar={toggleSidebar}
            currentView={currentView}
            navigationItems={nav.navigationItems}
            onViewChange={handleViewChange}
            user={user}
            handleSetActiveStore={async (id) => {
              try {
                updateUser({ activeStoreId: id });
                await userService.setActiveStore(user.id, id);
                toast.success('Sucursal actualizada');
                // Invalida productos para forzar recarga con el nuevo storeId
                // queryClient está correctamente instanciado arriba mediante useQueryClient()
                queryClient.invalidateQueries({ queryKey: ['products'] });
              } catch (error) {
                console.error('Error al cambiar de sucursal:', error);
                toast.error('No se pudo persistir el cambio de sucursal');
              }
            }}
          />
        )}

        <div className={cn(
          "px-0 pt-0 pb-0 flex-1 overflow-x-visible terminal-content",
          isIntegroView ? "p-0" : "px-2 sm:p-8 lg:p-12 pb-32"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className={cn(
                "mx-auto w-full",
                currentView === 'cost-sheets' ? "max-w-none" : "max-w-7xl"
              )}
            >
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center py-20">
                  <CostProLoader size={180} text="CARGANDO" subtext="Preparando entorno..." />
                </div>
              }>
                <MobileSafeContainer>
                  {renderActiveView()}
                </MobileSafeContainer>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      <CreateProductModal />
      {currentView !== 'pos' && !isIntegroView && <ChatBot />}
      {currentView !== "pos" && <FloatingCalculator />}
    </div>
  );
}
