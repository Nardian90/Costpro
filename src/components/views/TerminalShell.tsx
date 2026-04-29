'use client';

import React, { useState, useEffect, useTransition, Suspense, memo } from 'react';
import { useAuthStore, useUIStore, ViewType } from '@/store';
import { useStores } from '@/hooks/api/useStores';
import { userService } from '@/services/user-service';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { Building as BuildingIcon, X } from 'lucide-react';
import { CostProLoader } from '@/components/ui/CostProLoader';
import { Sidebar } from './terminal/Sidebar';
import { Header } from './terminal/Header';
import { useTerminalNavigation } from '@/hooks/ui/useTerminalNavigation';
import { prefetchProducts } from '@/hooks/api/useProducts';
import { prefetchTransactions } from '@/hooks/api/useTransactions';
import { prefetchDashboardData } from '@/hooks/api/useDashboard';
import { prefetchAuditLogs } from '@/hooks/api/useAuditLogs';
import { prefetchReceptions } from '@/hooks/api/useReceptions';
import { MobileSafeContainer } from '@/components/ui/MobileSafeContainer';
import { ChunkErrorBoundary } from '@/components/ui/ChunkErrorBoundary';
import { ParticleBackground } from '@/components/ui/ParticleBackground';
import { CreateProductModal } from '@/components/modals/CreateProductModal';
import { CommandPalette } from '@/components/ui/CommandPalette';
import { ChatBot } from '@/components/ui/ChatBot';
import { FloatingCalculator } from '@/components/ui/FloatingCalculator';
import { useIsMobile } from '@/hooks/ui/useMobile';

// Views
const DashboardView = React.lazy(() => import('./terminal/views/dashboard/DashboardView'));
const POSView = React.lazy(() => import('./terminal/views/pos/POSView'));
const SalesHistoryView = React.lazy(() => import('./terminal/views/sales/SalesHistoryView'));
const UsersManagementView = React.lazy(() => import('./terminal/views/users/UsersManagementView'));
const RolesManagementView = React.lazy(() => import('./terminal/views/users/RolesManagementView'));
const StoresManagementView = React.lazy(() => import('./terminal/views/stores/StoresManagementView'));
const AuditGlobalView = React.lazy(() => import('./terminal/views/audit/AuditGlobalView'));
const InventoryView = React.lazy(() => import('./terminal/views/inventory/InventoryView'));
const CatalogView = React.lazy(() => import('./terminal/views/catalog/CatalogView'));
const CostSheetView = React.lazy(() => import('./terminal/views/cost_sheet/CostSheetView'));
const ReportsView = React.lazy(() => import('./terminal/views/reports/ReportsView'));
const IPVView = React.lazy(() => import('./terminal/views/ipv/IPVView'));
const AcademyView = React.lazy(() => import('./terminal/views/academy/AcademyView'));
const InventoryAdjustmentsView = React.lazy(() => import('./terminal/views/inventory/InventoryAdjustmentsView'));
const LegalView = React.lazy(() => import('./terminal/views/legal/LegalView'));
const SettingsView = React.lazy(() => import('./terminal/views/settings/SettingsView'));
const HelpView = React.lazy(() => import('./terminal/views/help/HelpView'));
const ProductReceptionView = React.lazy(() => import('./terminal/views/inventory/ProductReceptionView'));
const TransferenciasView = React.lazy(() => import('./terminal/views/transfers/TransferenciasView'));
const WalletView = React.lazy(() => import('./terminal/views/wallet/WalletView'));
const Pick3IntelligenceView = React.lazy(() => import('./terminal/views/pick3/Pick3IntelligenceView'));

export default function TerminalShell() {
  const { user, status, loading, logout, updateUser } = useAuthStore();
  const { currentView, setCurrentView, setActiveCostSection } = useUIStore();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();
  const [sidebarSearch, setSidebarSearch] = useState('');
  const nav = useTerminalNavigation(user as any, sidebarSearch);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

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
  }, [loading, user, router, queryClient, status]);

  useEffect(() => {
    if (user?.role === 'costo' && (currentView as any) === 'dashboard') {
      setCurrentView('cost-sheets');
    }
  }, [user, currentView, setCurrentView]);

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-background">
        <CostProLoader text="COSTPRO" subtext="INICIALIZANDO TERMINAL..." showText showSubtext />
      </div>
    );
  }

  if (!user) return null;

  const isBlockingRequired = user.role !== 'admin' && user.role !== 'costo' && !user.activeStoreId;

  const handleViewChange = (view: ViewType) => {
    const costSheetSubViews = ["templates", "header", "open-sections", "open-annexes", "signature", "expert-content", "view-kpis", "view-expert", "view-assisted", "view-reading", "gen-quick", "gen-expert", "tool-import", "tool-save", "tool-export-excel", "tool-export-pdf", "res-help", "res-system-help", "res-academy"];

    if (costSheetSubViews.includes(view as string)) {
      startTransition(() => {
        setCurrentView('cost-sheets');
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
        prefetchAuditLogs(queryClient, { storeIds: [user.activeStoreId] });
        break;
      case 'recepcion':
        prefetchReceptions(queryClient, user.activeStoreId, user.role === 'admin');
        break;
    }
  };

  const renderView = (view: ViewType) => {
    switch (view) {
        case 'dashboard': return <DashboardView />;
        case 'pick3-intelligence': return <Pick3IntelligenceView />;
        case 'wallet': return <WalletView />;
        case 'pos': return <POSView />;
        case 'sales': return <SalesHistoryView />;
        case 'users': return <UsersManagementView />;
        case 'roles': return <RolesManagementView />;
        case 'stores': return <StoresManagementView />;
        case 'audit': return <AuditGlobalView />;
        case 'inventory': return <InventoryView />;
        case 'catalog': return <CatalogView />;
        case 'cost-sheets': return <CostSheetView />;
        case 'reports': return <ReportsView />;
        case 'ipv': return <IPVView />;
        case 'academy': return <AcademyView />;
        case 'inventory_adjustments': return <InventoryAdjustmentsView />;
        case 'legal': return <LegalView />;
        case 'settings': return <SettingsView />;
        case 'help': return <HelpView />;
        case 'recepcion': return <ProductReceptionView onCancel={() => setCurrentView('inventory')} />;
        case 'transferencias': return <TransferenciasView />;
        default: return <div>Default View Placeholder: {view}</div>;
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
    <div className="h-screen flex bg-background text-foreground max-w-full overflow-hidden">
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

      <main id="main-content" className={cn("flex-1 h-full flex flex-col z-10 min-w-0 transition-[padding-left,padding-right] duration-300 cubic-bezier(0.4,0,0.2,1) overflow-x-hidden overflow-y-hidden", sidebarOpen && !isMobile && "pl-64 lg:pl-72")} role="main">
        <Header
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
          currentView={currentView}
          navigationItems={nav.navigationItems}
          onViewChange={handleViewChange}
          user={user as any}
          allStores={allStores}
          handleSetActiveStore={async (id) => {
            try {
              // Update local state first for immediate UI response
              updateUser({ activeStoreId: id });
              // Persist to DB
              await userService.setActiveStore(user!.id, id);
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
          "relative flex-1 overflow-y-auto overflow-x-hidden terminal-content scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent",
          currentView === 'help' ? "p-0" : "px-3 sm:px-4 pt-0 pb-24 lg:pb-28"
        )}>
          <ParticleBackground />
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
              <Suspense fallback={
                <div className="flex items-center justify-center py-24 min-h-[50vh]">
                  <CostProLoader
                    text={String(currentView).replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    subtext="Cargando..."
                    showText
                    showSubtext
                  />
                </div>
              }>
                <ChunkErrorBoundary chunkName={String(currentView)}>
                  <MobileSafeContainer>
                    {renderActiveView()}
                  </MobileSafeContainer>
                </ChunkErrorBoundary>
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
