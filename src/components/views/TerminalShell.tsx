'use client';

import React, { useState, useEffect, useTransition, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore, useUIStore, ViewType, useCostSheetStore } from '@/store';
import { Sidebar } from './terminal/Sidebar';
import { Header } from './terminal/Header';
import { useTerminalNavigation } from '@/hooks/ui/useTerminalNavigation';
import { useIsMobile } from '@/hooks/ui/useMobile';
import { Building as BuildingIcon } from 'lucide-react';
import { userService } from '@/services/user-service';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useStores } from '@/hooks/api/useStores';
import { prefetchProducts } from '@/hooks/api/useProducts';
import { prefetchTransactions } from '@/hooks/api/useTransactions';
import { prefetchDashboardData } from '@/hooks/api/useDashboard';
import { prefetchAuditLogs } from '@/hooks/api/useAuditLogs';
import { prefetchReceptions } from '@/hooks/api/useReceptions';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { FloatingCalculator } from '@/components/ui/FloatingCalculator';
import { ChatBot } from '@/components/ui/ChatBot';
import { CreateProductModal } from '@/components/modals/CreateProductModal';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { MobileSafeContainer } from '@/components/ui/MobileSafeContainer';
import { toast } from 'sonner';

// Lazy load views
const DashboardView = lazy(() => import('./terminal/views/dashboard/DashboardView'));
const OCCView = lazy(() => import('./terminal/views/dashboard/OCCView'));
const WalletView = lazy(() => import('./terminal/views/wallet/WalletView'));
const POSView = lazy(() => import('./terminal/views/pos/POSView'));
const SalesHistoryView = lazy(() => import('./terminal/views/sales/SalesHistoryView'));
const UsersManagementView = lazy(() => import('./terminal/views/users/UsersManagementView'));
const RolesManagementView = lazy(() => import('./terminal/views/users/RolesManagementView'));
const StoresManagementView = lazy(() => import('./terminal/views/stores/StoresManagementView'));
const NewsView = lazy(() => import('./terminal/views/rss/NewsView'));
const RSSManagementView = lazy(() => import('./terminal/views/rss/RSSManagementView'));
const AuditLogsView = lazy(() => import('./terminal/views/audit/AuditLogsView'));
const InventoryView = lazy(() => import('./terminal/views/inventory/InventoryView'));
const CashClosureView = lazy(() => import('./terminal/views/cash_closure/CashClosureView'));
const StockHistoryView = lazy(() => import('./terminal/views/stock_history/StockHistoryView'));
const CatalogView = lazy(() => import('./terminal/views/catalog/CatalogView'));
const InventoryCountView = lazy(() => import('./terminal/views/inventory_count/InventoryCountView'));
const CostSheetView = lazy(() => import('./terminal/views/cost_sheet/CostSheetView'));
const ReceptionsHistoryView = lazy(() => import('./terminal/views/receptions/ReceptionsHistoryView'));
const HelpView = lazy(() => import('./terminal/views/help/HelpView'));
const TransferenciasView = lazy(() => import('./terminal/views/transfers/TransferenciasView'));
const ProductReceptionView = lazy(() => import('./terminal/views/inventory/ProductReceptionView'));
const ReportsView = lazy(() => import('./terminal/views/reports/ReportsView'));
const IPVView = lazy(() => import('./terminal/views/ipv/IPVView'));
const AcademyView = lazy(() => import('./terminal/views/academy/AcademyView'));
const InventoryAdjustmentsView = lazy(() => import('./terminal/views/inventory/InventoryAdjustmentsView'));
const LegalView = lazy(() => import('./terminal/views/legal/LegalView'));
const HealthView = lazy(() => import('./health/HealthView'));
const WikiView = lazy(() => import('./terminal/views/wiki/WikiView'));
const SettingsView = lazy(() => import("./terminal/views/settings/SettingsView"));
const Pick3IntelligenceView = lazy(() => import('./terminal/views/pick3/Pick3IntelligenceView'));


export default function TerminalShell() {
  const { user, loading, status, logout, updateUser } = useAuthStore();
  const setActiveSection = useCostSheetStore(state => state.updateValue);
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const {
    currentView, setCurrentView,
    sidebarOpen, toggleSidebar, setSidebarOpen, setActiveCostSection
  } = useUIStore();

  const [sidebarSearch, setSidebarSearch] = useState('');

  // Hooks
  const nav = useTerminalNavigation(user, sidebarSearch);
  const router = useRouter();

  // Fetch all stores (mainly for admin view in header)
  const { data: allStores = [] } = useStores(
    user?.id || '',
    user?.role === 'admin',
    false
  );


  // LOGOUT HANDLER
   const handleLogout = async () => {
    try {
      await userService.logout();
    } catch (error: any) {
      console.warn('[TerminalShell] Logout error (silent):', error);
    } finally {
      logout();
      window.location.reload();
    }
  };

  // Initial check on mount & prefetching
  useEffect(() => {
    if (status === 'unauthenticated') {
      window.location.reload();
      return;
    }

    if (user?.activeStoreId && status === 'authenticated_valid') {
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

  const isBlockingRequired = user.role !== 'admin' && user.role !== 'costo' && !user.activeStoreId;

  const handleViewChange = (view: ViewType) => {
    const costSheetSubViews = ["templates", "header", "open-sections", "open-annexes", "signature", "expert-content", "view-kpis", "view-expert", "view-assisted", "view-reading", "gen-quick", "gen-expert", "tool-import", "tool-save", "tool-export-excel", "tool-export-pdf", "res-help", "res-system-help", "res-academy"];

    if (costSheetSubViews.includes(view as string)) {
      startTransition(() => {
        setCurrentView('cost-sheets' as ViewType);
        setActiveCostSection(view as string);
      });
    } else {
      startTransition(() => {
        setCurrentView(view);
      });
    }

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

  const renderView = (view: ViewType) => {
    switch (view) {
        case 'occ': return <OCCView />;
        case 'dashboard': return <DashboardView />;
        case 'pick3-intelligence': return <Pick3IntelligenceView />;
        case 'wallet': return <WalletView />;
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
        case 'legal': return <LegalView />;
        case 'settings': return <SettingsView />;
        case 'help': return <HelpView />;
        case 'wiki': return <WikiView />;
        case 'recepcion': return <ProductReceptionView onCancel={() => setCurrentView('inventory')} />;
        case 'reception_list': return <ReceptionsHistoryView />;
        case 'transferencias': return <TransferenciasView />;
        case 'health': return <HealthView />;
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
            className="px-8 py-3 bg-destructive text-foreground font-black rounded-xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest"
          >
            Cerrar Sesión
          </button>
        </div>
      );
    }

    return renderView(currentView);
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-hidden">
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
        onClose={() => setSidebarOpen(false)}
      />

      <main id="main-content" className={cn("flex-1 min-h-screen flex flex-col z-10 min-w-0 transition-[padding-left,padding-right] duration-300 cubic-bezier(0.4,0,0.2,1) overflow-x-hidden", sidebarOpen && !isMobile && "pl-64 lg:pl-72")} role="main">
        <Header
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
          currentView={currentView}
          navigationItems={nav.navigationItems}
          onViewChange={handleViewChange}
          user={user}
          allStores={allStores}
          handleSetActiveStore={async (id) => {
            try {
              // Update local state first for immediate UI response
              updateUser({ activeStoreId: id });
              // Persist to DB
              await userService.setActiveStore(user.id, id);
              toast.success('Sucursal actualizada correctamente');

              // Invalidate all store-dependent queries
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

        <div className={cn(
          "flex-1 overflow-x-hidden terminal-content scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
          currentView === 'help' ? "p-0" : "px-0 sm:px-6 lg:px-10 pt-0 pb-32 lg:pb-40"
        )}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.99 }}
              transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className={cn(
                "mx-auto w-full",
                (currentView === 'cost-sheets' || currentView === 'ipv') ? "max-w-none" : "max-w-7xl"
              )}
            >
              <Suspense fallback={
                <div className="flex flex-col gap-6 p-6 animate-pulse">
                  <div className="h-8 w-48 bg-muted rounded-lg" />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="h-24 bg-muted rounded-xl" />
                    <div className="h-24 bg-muted rounded-xl" />
                    <div className="h-24 bg-muted rounded-xl" />
                  </div>
                  <div className="h-64 bg-muted rounded-xl" />
                  <div className="h-48 bg-muted rounded-xl" />
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

      <AnimatePresence>
        {sidebarOpen && isMobile && (
          <motion.div
            className="fixed inset-0 bg-black/50 backdrop-blur-[2px] z-30"
            onClick={toggleSidebar}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
        )}
      </AnimatePresence>

      <CreateProductModal />
      <CommandPalette />
      {currentView !== 'pos' && currentView !== 'help' && <ChatBot />}
      {currentView !== "pos" && <FloatingCalculator />}
    </div>
  );
}
