'use client';

import { useState, useTransition, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore, useUIStore, useCartStore, type ViewType } from '@/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { Loader2, Building as BuildingIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  useProducts,
  useDashboardData,
  useTransactions,
  useUsers,
  useStores,
  useAuditLogs,
  useStockMovements,
  useCashClosures
} from '@/hooks/useQueries';

// Modular Hooks
import { useTerminalNavigation } from '@/hooks/useTerminalNavigation';
import { useTerminalModals } from '@/hooks/useTerminalModals';
import { useTerminalOperations } from '@/hooks/useTerminalOperations';

// Modular Components
import { Sidebar } from './terminal/Sidebar';
import { Header } from './terminal/Header';
import { Modals } from './terminal/Modals';
import CostProLogo from '@/components/CostProLogo';

// Sub-views (some lazy loaded for performance)
import DashboardView from './terminal/DashboardView';
import POSView from './terminal/POSView';
import SalesHistoryView from './terminal/SalesHistoryView';
import StockHistoryView from './terminal/StockHistoryView';
import AuditLogsView from './terminal/AuditLogsView';
import CashClosureView from './terminal/CashClosureView';
import UsersManagementView from './terminal/UsersManagementView';
import StoresManagementView from './terminal/StoresManagementView';
import SettingsView from './terminal/SettingsView';
import HelpView from './terminal/HelpView';

// Legacy/Shared views
import InventoryView from '@/components/InventoryView';
import InventoryCountView from '@/components/InventoryCountView';
import CatalogView from '@/components/CatalogView';
import CostSheetsPage from '@/app/cost-sheets/page';
import { MobileSafeContainer } from '@/components/ui/MobileSafeContainer';

export default function TerminalView() {
  const { user, loading } = useAuthStore();
  const [isPending, startTransition] = useTransition();
  const isMobile = useIsMobile();

  const {
    currentView, setCurrentView,
    notifications, setNotifications,
    sidebarOpen, toggleSidebar, setSidebarOpen
  } = useUIStore();

  const { items, addItem, removeItem, updateQuantity, clearCart, getTotal, getSubtotal, getItemCount } = useCartStore();

  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [posLayoutMode, setPosLayoutMode] = useState<'grid' | 'table'>('grid');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Data Fetching
  const { data: productsData, isLoading: isLoadingProducts } = useProducts(user?.storeId);
  const { data: dashboardData } = useDashboardData(user?.storeId, user?.role === 'admin');
  const { data: transactions = [] } = useTransactions(user?.storeId, user?.role === 'admin');
  const { data: users = [] } = useUsers(user?.id || '', user?.role === 'admin', user?.role === 'encargado', user?.activeStoreId);
  const { data: stores = [] } = useStores(user?.id || '', user?.role === 'admin');
  const { data: auditLogs = [] } = useAuditLogs();
  const { data: movements = [] } = useStockMovements(user?.storeId, user?.role === 'admin');
  const { data: cashClosures = [] } = useCashClosures(user?.storeId, user?.role === 'admin');

  // Hooks
  const nav = useTerminalNavigation(user, sidebarSearch);
  const modals = useTerminalModals(transactions);
  const ops = useTerminalOperations();

  if (loading) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-background">
        <CostProLogo size={80} animated={true} />
        <div className="flex items-center gap-2 text-primary font-bold animate-pulse">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>INICIALIZANDO TERMINAL...</span>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // BLOCKING ACCESS (Regla 3): If a non-admin user has no active store, block operations
  const isBlockingRequired = user.role !== 'admin' && !user.activeStoreId;

  const handleViewChange = (view: ViewType) => {
    startTransition(() => {
      setCurrentView(view);
    });
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  const renderView = () => {
    // If access is blocked, show a clear error message instead of the requested view
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
            onClick={ops.handleLogout}
            className="px-8 py-3 bg-destructive text-white font-black rounded-xl hover:opacity-90 transition-opacity uppercase text-xs tracking-widest"
          >
            Cerrar Sesión
          </button>
        </div>
      );
    }

    const products = productsData || [];
    const salesSummary = dashboardData?.summary || { total_billed: 0, transaction_count: 0, average_ticket: 0, total_cash: 0, total_transfer: 0 };

    switch (currentView) {
      case 'dashboard': return <DashboardView onViewInventory={() => handleViewChange('inventory')} />;
      case 'pos': return (
        <POSView
          products={products}
          isLoading={isLoadingProducts}
          error={null}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          items={items}
          onAddItem={(p) => {
            if (p.stock_current <= 0) {
              toast.error(`${p.name} no tiene stock disponible.`);
              return;
            }
            addItem({
                product_id: p.id,
                variant_id: null,
                product: p,
                variant: null,
                quantity: 1,
                price: p.price,
                cost: p.cost_price || p.cost_average || 0,
                subtotal: p.price
            });
            toast.success(`${p.name} agregado`);
          }}
          onRemoveItem={removeItem}
          onUpdateQuantity={updateQuantity}
          onClearCart={clearCart}
          getTotal={getTotal}
          getSubtotal={getSubtotal}
          getItemCount={getItemCount}
          isProcessing={ops.isProcessingSale}
          onCheckout={ops.handleCheckout}
          viewMode={posLayoutMode}
          onViewModeChange={setPosLayoutMode}
        />
      );
      case 'sales': return <SalesHistoryView transactions={transactions.filter(t => t.id.includes(searchTerm) && (!selectedStatus || t.status === selectedStatus))} searchTerm={searchTerm} onSearchChange={setSearchTerm} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} onViewDetails={modals.handleViewTransactionDetails} />;
      case 'history': return <StockHistoryView movements={movements.filter(m => m.product?.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} onRefresh={() => {}} />;
      case 'audit': return <AuditLogsView logs={auditLogs.filter(l => l.table_name.includes(searchTerm))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} />;
      case 'cash': return <CashClosureView summary={salesSummary} cashClosures={cashClosures} onProcessClosure={() => {}} />;
      case 'users': return <UsersManagementView users={users.filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditUser={modals.handleEditUser} onCreateUser={modals.handleCreateUser} />;
      case 'stores': return (
        <StoresManagementView
          stores={stores.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          onEditStore={(s) => { modals.setEditingStore(s); modals.setIsEditStoreModalOpen(true); }}
          onDeleteStore={(s) => { modals.setDeletingStore(s); modals.setIsDeleteStoreModalOpen(true); }}
          onCreateStore={() => modals.setIsCreateStoreModalOpen(true)}
          onSetActiveStore={ops.handleSetActiveStore}
          activeStoreId={user.activeStoreId || undefined}
          isAdmin={user.role === 'admin'}
        />
      );
      case 'settings': return <SettingsView notifications={notifications} setNotifications={setNotifications} />;
      case 'help': return <HelpView />;
      case 'inventory': return <InventoryView key="inventory" />;
      case 'recepcion': return <InventoryView key="recepcion" />;
      case 'inventory_count': return <InventoryCountView />;
      case 'catalog': return <CatalogView />;
      case 'cost-sheets': return <CostSheetsPage />;
      default: return <DashboardView onViewInventory={() => handleViewChange('inventory')} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-x-hidden">
      <Sidebar
        sidebarOpen={sidebarOpen}
        sidebarSearch={sidebarSearch}
        setSidebarSearch={setSidebarSearch}
        navigationItems={nav.navigationItems}
        currentView={currentView}
        onViewChange={handleViewChange}
        onLogout={ops.handleLogout}
        logoHeight={nav.logoHeight}
        logoOpacity={nav.logoOpacity}
        logoScale={nav.logoScale}
        navRef={nav.navRef}
      />

      <main className="flex-1 min-h-screen flex flex-col z-10">
        <Header
          sidebarOpen={sidebarOpen}
          toggleSidebar={toggleSidebar}
          currentView={currentView}
          navigationItems={nav.navigationItems}
          onViewChange={handleViewChange}
          user={user}
          handleSetActiveStore={ops.handleSetActiveStore}
        />

        <div className="p-4 sm:p-8 lg:p-12 pb-32 flex-1 overflow-x-hidden terminal-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
              className="max-w-7xl mx-auto"
            >
              <Suspense fallback={
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                  <Loader2 className="w-10 h-10 animate-spin text-primary" />
                  <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Cargando vista...</p>
                </div>
              }>
                <MobileSafeContainer>
                  {renderView()}
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

      <Modals
        selectedTransaction={modals.selectedTransaction}
        setSelectedTransactionId={modals.setSelectedTransactionId}
        loadingDetails={modals.loadingDetails}
        transactionItems={modals.transactionItems}
        isEditStoreModalOpen={modals.isEditStoreModalOpen}
        setIsEditStoreModalOpen={modals.setIsEditStoreModalOpen}
        editingStore={modals.editingStore}
        setEditingStore={modals.setEditingStore}
        handleUpdateStore={ops.handleUpdateStore}
        userFormMode={modals.userFormMode}
        setUserFormMode={modals.setUserFormMode}
        selectedUserContract={modals.selectedUserContract}
        stores={stores}
        handleUserFormSubmit={ops.handleUserFormSubmit}
        isSubmittingUser={ops.isSubmittingUser}
      />
    </div>
  );
}
