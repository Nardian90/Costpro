'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback, Suspense, useTransition } from 'react';
import { motion, AnimatePresence, useScroll, useTransform, useMotionValue } from 'framer-motion';
import { useAuthStore, useCartStore, useUIStore, useCanAccess, type ViewType } from '@/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseUrl } from '@/lib/utils';
import {
  createSaleParamsSchema
} from '@/validation/schemas';
import { toast } from 'sonner';
import {
  BarChart3, ShoppingCart, Package, Warehouse, Receipt,
  ClipboardList, FileText, History, Shield, DollarSign,
  Users, Building, Settings, LogOut, Bell, Menu, Sun,
  HelpCircle,
  TrendingUp, ArrowRight, Eye, Plus, Minus,
  Search, Target, Layers, Check
} from 'lucide-react';

import {
  useProducts,
  useDashboardData,
  useTransactions,
  useUsers,
  useStores,
  useAuditLogs,
  useStockMovements,
  useCashClosures,
  useTransactionDetails,
  useUserStoreAccess,
  useCreateSale,
  useCreateUser,
  useUpdateUser,
  useManageUserMemberships
} from '@/hooks/useQueries';

// Sub-components
import TerminalLayout from './terminal/TerminalLayout';
import CostProLogo from '@/components/CostProLogo';
import DashboardView from './terminal/DashboardView';
import POSView from './terminal/POSView';
import SalesHistoryView from './terminal/SalesHistoryView';
import StockHistoryView from './terminal/StockHistoryView';
import AuditLogsView from './terminal/AuditLogsView';
import CashClosureView from './terminal/CashClosureView';
import UsersManagementView from './terminal/UsersManagementView';
import UserForm, { UserFormData } from './terminal/UserForm';
import { UserContract, UserContractFactory, mapProfileToContract } from '@/contracts/user';
import StoresManagementView from './terminal/StoresManagementView';
import SettingsView from './terminal/SettingsView';
import HelpView from './terminal/HelpView';

// Original shared components
import InventoryView from '@/components/InventoryView';
import InventoryCountView from '@/components/InventoryCountView';
import CatalogView from '@/components/CatalogView';
import CostSheetsPage from '@/app/cost-sheets/page';

// UI components
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { X, Calendar, CreditCard, Shield as ShieldIcon, Edit, Trash2, Building as BuildingIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { logger } from '@/lib/logger';
import type {
  Product, Transaction, UserRole, Profile, Store,
  AuditLog, DashboardKPIs, SalesSummary, PaymentMethod
} from '@/types';
import type {
  GetProductsForPosResponse,
  DashboardKpiResponse,
  CreateSaleParams
} from '@/types/supabase-rpc';
import ActionMenu from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';
import ScrollToTop from '@/components/ui/ScrollToTop';
import POSTableView from '@/components/POSTableView';

export default function TerminalView() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const logout = useAuthStore((state) => state.logout);
  const [isPending, startTransition] = useTransition();

  const {
    currentView, setCurrentView,
    notifications, setNotifications,
    sidebarOpen, toggleSidebar, setSidebarOpen
  } = useUIStore();
  const { items, addItem, removeItem, updateQuantity, clearCart, setDiscount, getTotal, getSubtotal, getItemCount, discount } = useCartStore();
  const isMobile = useIsMobile();
  const canViewFinancials = useCanAccess('warehouse'); // Using warehouse as a proxy for manager/admin financial view
  const [showCart, setShowCart] = useState(false);
  const [posLayoutMode, setPosLayoutMode] = useState<'grid' | 'table'>('grid');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const navRef = useRef<HTMLElement>(null);

  // React Query Hooks
  const { data: productsData, isLoading: isLoadingProducts, refetch: refetchProducts } = useProducts(user?.storeId);
  const products = productsData || [];

  const { data: dashboardData, isLoading: isLoadingDashboard, refetch: refetchDashboard } = useDashboardData(user?.storeId, user?.role === 'admin');
  const dashboardKPIs = dashboardData?.kpis || { gross_sales: 0, cost_of_goods: 0, profit: 0 };
  const salesSummary = dashboardData?.summary || { total_billed: 0, transaction_count: 0, average_ticket: 0, total_cash: 0, total_transfer: 0 };

  const { data: transactions = [] } = useTransactions(user?.storeId, user?.role === 'admin');
  const { data: users = [] } = useUsers(user?.id || '', user?.role === 'admin', user?.role === 'encargado');
  const { data: stores = [] } = useStores(user?.id || '', user?.role === 'admin');
  const { data: auditLogs = [] } = useAuditLogs();
  const { data: movements = [] } = useStockMovements(user?.storeId, user?.role === 'admin');
  const { data: cashClosures = [] } = useCashClosures(user?.storeId, user?.role === 'admin');

  const createSaleMutation = useCreateSale();

  // State
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Modal states
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);
  const selectedTransaction = useMemo(() => transactions.find(t => t.id === selectedTransactionId) || null, [transactions, selectedTransactionId]);
  const { data: transactionItems = [], isLoading: loadingDetails } = useTransactionDetails(selectedTransactionId || undefined);

  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const { data: userStoreAccess = [] } = useUserStoreAccess(selectedUserId || undefined);

  const [isEditStoreModalOpen, setIsEditStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isCreateStoreModalOpen, setIsCreateStoreModalOpen] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', address: '' });
  const [userFormMode, setUserFormMode] = useState<'create' | 'edit' | null>(null);
  const [selectedUserContract, setSelectedUserContract] = useState<UserContract | null>(null);
  const [isDeleteStoreModalOpen, setIsDeleteStoreModalOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);

  // Handlers
  const handleAddToCart = useCallback((product: Product) => {
    addItem({
      product_id: product.id,
      variant_id: null,
      product: product,
      variant: null,
      quantity: 1,
      price: product.price,
      cost: product.cost_price || product.cost_average || 0,
      subtotal: product.price
    });
    toast.success(`${product.name} agregado`);
  }, [addItem]);

  const handleCheckout = async (paymentMethod: PaymentMethod, checkoutDiscount?: { type: string, value: number } | null) => {
    if (items.length === 0 || createSaleMutation.isPending || !user) return;

    const toastId = toast.loading('Procesando venta...');

    logger.info('POS', 'CHECKOUT_ATTEMPT', {
      userId: user?.id,
      storeId: user?.storeId,
      itemCount: items.length,
      total: getTotal(),
    });

    try {
      // Use provided discount or fallback to store discount
      const finalDiscount = checkoutDiscount || discount;

      const saleParams = {
        p_store_id: user.storeId,
        p_seller_id: user.id,
        p_payment_method: paymentMethod,
        p_total_amount: Number(getTotal().toFixed(2)),
        p_subtotal: Number(getSubtotal().toFixed(2)),
        p_discount_type: (finalDiscount?.type || 'fixed') as string,
        p_discount_value: Number(finalDiscount?.value || 0),
        p_items: items.map(i => ({
          product_id: i.product_id, variant_id: i.variant_id,
          quantity: i.quantity, price: i.price, cost: i.cost
        }))
      };

      // Validate params with Zod
      const validationResult = createSaleParamsSchema.safeParse(saleParams);
      if (!validationResult.success) {
          console.error('[Zod Validation Error] create_sale params:', validationResult.error.format());
          throw new Error('Datos de venta inválidos. Revise el carrito.');
      }

      const result = await createSaleMutation.mutateAsync(validationResult.data);

      logger.info('POS', 'CHECKOUT_SUCCESS', {
        userId: user?.id,
        storeId: user?.storeId,
        saleId: (result as any)?.[0]?.r_sale_id,
      });

      toast.success('Venta exitosa', { id: toastId });
      clearCart();
    } catch (error: any) {
      logger.error('POS', 'CHECKOUT_FAILED', {
        userId: user?.id,
        storeId: user?.storeId,
        error: error.message,
      });
      toast.error(error.message || 'Error en venta', { id: toastId });
    }
  };

  const handleLogout = async () => {
    if (user) {
      logger.info('AUTH', 'LOGOUT', { userId: user.id });
    }
    await supabase.auth.signOut();
    logout();
    router.replace('/login');
  };

  const handleSetActiveStore = async (storeId: string) => {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ active_store_id: storeId }).eq('id', user.id);
    if (!error) {
      toast.success('Tienda cambiada');
      window.location.reload(); // Hard reload for simplicity in resetting context
    }
  };

  const handleViewTransactionDetails = (txn: Transaction) => {
    setSelectedTransactionId(txn.id);
  };

  const handleEditUser = (u: Profile) => {
    setSelectedUserContract(mapProfileToContract(u));
    setUserFormMode('edit');
  };

  const handleCreateUser = () => {
    setSelectedUserContract(UserContractFactory.createEmpty());
    setUserFormMode('create');
  };

  const handleUserFormSubmit = async (data: UserFormData) => {
    if (!user) return;
    try {
      if (userFormMode === 'create') {
        await createUserMutation.mutateAsync({
          p_email: data.email,
          p_full_name: data.fullName,
          p_role: data.role,
          p_store_id: data.memberships?.[0]?.store_id || user.storeId || '',
          p_memberships: data.memberships
        });
      } else if (userFormMode === 'edit' && selectedUserContract) {
        // Update base profile
        await updateUserMutation.mutateAsync({
          id: selectedUserContract.id,
          full_name: data.fullName,
          role: data.role,
          is_active: data.isActive
        });

        // Update multi-store memberships
        await manageMembershipsMutation.mutateAsync({
          userId: selectedUserContract.id,
          memberships: data.memberships
        });
      }
      setUserFormMode(null);
    } catch (error) {
      // Error is already handled by toast in the mutation
    }
  };

  // Navigation Items logic with categories and search filtering
  const navigationItems = useMemo(() => {
    if (!user) return [];
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const all = [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['admin', 'manager', 'clerk', 'encargado'], category: 'OPERACIONES' },
      { id: 'pos', icon: ShoppingCart, label: 'TPV', roles: ['clerk', 'manager', 'admin', 'encargado'], category: 'OPERACIONES' },
      { id: 'sales', icon: Receipt, label: 'Ventas', roles: ['clerk', 'manager', 'encargado'], category: 'OPERACIONES' },
      { id: 'cash', icon: DollarSign, label: 'Caja', roles: ['manager', 'admin', 'encargado'], category: 'OPERACIONES' },

      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse', 'encargado'], category: 'INVENTARIO' },
      { id: 'recepcion', icon: Warehouse, label: 'Recepciones', roles: ['warehouse', 'manager', 'encargado'], category: 'INVENTARIO' },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo', roles: ['clerk', 'manager', 'admin', 'encargado'], category: 'INVENTARIO' },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },
      { id: 'history', icon: History, label: 'Stock', roles: ['manager', 'admin', 'encargado'], category: 'INVENTARIO' },

      { id: 'cost-sheets', icon: FileText, label: 'Costos', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado'], category: 'GESTIÓN' },
      { id: 'settings', icon: Settings, label: 'Config', roles: ['admin', 'manager', 'encargado'], category: 'GESTIÓN' },

      { id: 'help', icon: HelpCircle, label: 'Ayuda', roles: ['admin', 'manager', 'clerk', 'warehouse', 'encargado'], category: 'SOPORTE' },
    ];

    // First filter by role
    const filteredByRole = all.filter(i => i.roles.some(r => roles.includes(r as any)));

    // Then filter by search term if present
    if (!sidebarSearch) return filteredByRole;

    const searchLower = sidebarSearch.toLowerCase();
    return filteredByRole.filter(i =>
      i.label.toLowerCase().includes(searchLower) ||
      i.category.toLowerCase().includes(searchLower)
    );
  }, [user, sidebarSearch]);

  const getActiveRolesLabel = () => {
    if (!user) return 'Cargando...';
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    return roles.join(' / ').toUpperCase();
  };

  // Auth check and mandatory hooks after state definitions
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const createUserMutation = useCreateUser();
  const updateUserMutation = useUpdateUser();
  const manageMembershipsMutation = useManageUserMemberships();

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

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView onViewInventory={() => setCurrentView('inventory')} />;
      case 'pos': return <POSView products={products} isLoading={isLoadingProducts} error={null} searchTerm={searchTerm} onSearchChange={setSearchTerm} items={items} onAddItem={handleAddToCart} onRemoveItem={removeItem} onUpdateQuantity={updateQuantity} onClearCart={clearCart} getTotal={getTotal} getSubtotal={getSubtotal} getItemCount={getItemCount} isProcessing={createSaleMutation.isPending} onCheckout={handleCheckout} />;
      case 'sales': return <SalesHistoryView transactions={transactions.filter(t => t.id.includes(searchTerm) && (!selectedStatus || t.status === selectedStatus))} searchTerm={searchTerm} onSearchChange={setSearchTerm} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} onViewDetails={handleViewTransactionDetails} />;
      case 'history': return <StockHistoryView movements={movements.filter(m => m.product?.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} onRefresh={() => {}} />;
      case 'audit': return <AuditLogsView logs={auditLogs.filter(l => l.table_name.includes(searchTerm))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} />;
      case 'cash': return <CashClosureView summary={salesSummary} cashClosures={cashClosures} onProcessClosure={() => toast.info('Próximamente')} />;
      case 'users': return <UsersManagementView users={users.filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditUser={handleEditUser} onCreateUser={handleCreateUser} />;
      case 'stores': return <StoresManagementView stores={stores.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditStore={(s) => { setEditingStore(s); setIsEditStoreModalOpen(true); }} onDeleteStore={(s) => { setDeletingStore(s); setIsDeleteStoreModalOpen(true); }} onCreateStore={() => setIsCreateStoreModalOpen(true)} onSetActiveStore={handleSetActiveStore} activeStoreId={user.activeStoreId || undefined} isAdmin={user.role === 'admin'} />;
      case 'settings': return <SettingsView notifications={notifications} setNotifications={setNotifications} />;
      case 'help': return <HelpView />;
      case 'inventory': return <InventoryView key="inventory" />;
      case 'recepcion': return <InventoryView key="recepcion" />;
      case 'inventory_count': return <InventoryCountView />;
      case 'catalog': return <CatalogView />;
      case 'cost-sheets': return <CostSheetsPage />;
      default: return <DashboardView onViewInventory={() => setCurrentView('inventory')} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-x-auto">
      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:sticky top-0 h-screen z-50 transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden",
        sidebarOpen ? "w-64 lg:w-72 translate-x-0" : "w-0 -translate-x-full border-r-0"
      )}>
        <div className="bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden w-64 lg:w-72">
          {/* Logo Area - Smoothly contracts on scroll */}
          <div
            id="sidebar-logo-container"
            className="border-b border-sidebar-border/50 shrink-0 bg-sidebar/5 p-8"
          >
            <CostProLogo size={50} animated={true} />
            <div className="mt-4">
              <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Terminal Operativa</div>
            </div>
          </div>

          {/* Search Area */}
          <div className="px-6 py-4 shrink-0 border-b border-sidebar-border/30 bg-sidebar/5">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <input
                type="text"
                value={sidebarSearch}
                onChange={(e) => setSidebarSearch(e.target.value)}
                placeholder="BUSCAR..."
                className="w-full bg-background/50 border border-primary/10 rounded-xl py-2.5 pl-9 pr-4 text-[10px] font-black focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all uppercase tracking-[0.2em] placeholder:text-muted-foreground/30"
              />
            </div>
          </div>

          {/* Navigation */}
          <nav
            id="sidebar-nav"
            ref={navRef}
            className="flex-1 overflow-y-auto p-4 no-scrollbar overscroll-contain scroll-smooth"
          >
            <div className="space-y-8">
              {['OPERACIONES', 'INVENTARIO', 'GESTIÓN', 'SOPORTE'].map(category => {
                const categoryItems = navigationItems.filter(i => i.category === category);
                if (categoryItems.length === 0) return null;

                return (
                  <div key={category} className="space-y-2">
                    <div className="px-4 text-[9px] font-black text-primary/40 tracking-[0.4em] uppercase mb-4">
                      {category}
                    </div>
                    <div className="space-y-1">
                      {categoryItems.map(item => (
                        <button
                          key={item.id}
                          onClick={() => {
                            startTransition(() => {
                              setCurrentView(item.id as ViewType);
                            });
                            if (isMobile) {
                              setSidebarOpen(false);
                            }
                          }}
                          className={cn(
                            "w-full flex items-center gap-4 p-4 rounded-2xl transition-all group active:scale-95",
                            currentView === item.id
                              ? "bg-primary text-white shadow-xl shadow-primary/20 font-black"
                              : "hover:bg-primary/5 text-sidebar-foreground/70 font-bold"
                          )}
                        >
                          <item.icon className={cn("w-5 h-5", currentView === item.id ? "text-white" : "group-hover:text-primary transition-colors")} />
                          <span className="text-xs uppercase tracking-widest">{item.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </nav>

          {/* User Info & Logout */}
          <div className="p-6 border-t border-sidebar-border/50 shrink-0">
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-3 p-4 rounded-2xl transition-all group active:scale-95 hover:bg-danger/10 text-danger font-bold"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-xs uppercase tracking-widest">Salir</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-h-screen flex flex-col">
        {/* Header */}
        <header className="bg-background/80 backdrop-blur-xl p-4 sm:p-6 sticky top-0 z-30 border-b border-white/5 w-full">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 overflow-hidden">
              <button
                onClick={toggleSidebar}
                className="neu-raised-sm w-11 h-11 flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                aria-label={sidebarOpen ? "Cerrar menú" : "Abrir menú"}
              >
                {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
              <div className="flex items-center gap-3 overflow-hidden">
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tighter text-primary whitespace-nowrap truncate max-w-[150px] sm:max-w-none">
                  {navigationItems.find(i => i.id === currentView)?.label || 'Dashboard'}
                </h1>
                <div className="h-4 w-[1px] bg-white/10 hidden sm:block" />

                {/* User Info & Store Selector */}
                <div className="hidden sm:flex items-center gap-3">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] truncate">
                    {user?.fullName}
                  </p>

                  {user.memberships && user.memberships.length > 1 && (
                    <div className="flex items-center gap-2 px-3 py-1 rounded-lg border border-primary/20 bg-primary/5">
                      <BuildingIcon className="w-3 h-3 text-primary" />
                      <select
                        value={user.activeStoreId || ''}
                        onChange={(e) => handleSetActiveStore(e.target.value)}
                        className="bg-transparent text-[9px] font-black uppercase text-primary outline-none cursor-pointer border-none p-0 focus:ring-0"
                      >
                        {user.memberships.map((m) => (
                          <option key={m.store_id} value={m.store_id} className="text-foreground bg-background">
                            {m.store?.name || `Sucursal ${m.store_id.slice(0, 4)}`}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={() => startTransition(() => setCurrentView('help'))}
                className={cn(
                  "neu-raised-sm w-11 h-11 flex items-center justify-center relative active:scale-90 transition-transform",
                  currentView === 'help' && "bg-primary text-white"
                )}
                aria-label="Ayuda"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button
                className="neu-raised-sm w-11 h-11 flex items-center justify-center relative active:scale-90 transition-transform"
                aria-label="Alertas"
              >
                <Bell className="w-5 h-5" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full animate-ping" />
                <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-primary rounded-full shadow-[0_0_8px_rgba(99,102,241,0.8)]" />
              </button>
            </div>
          </div>
        </header>

        {/* Content */}
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
                {renderView()}
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Shared Modals */}
      {selectedTransaction && (
        <Dialog open={!!selectedTransaction} onOpenChange={(open) => !open && setSelectedTransactionId(null)}>
          <DialogContent className="max-w-2xl !rounded-3xl p-0 overflow-hidden bg-background">
            <div className="flex justify-between items-center p-8 border-b border-border bg-primary/5">
              <div>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Detalle de Operación</h3>
                <p className="text-[10px] text-muted-foreground font-black uppercase mt-1">ID: {selectedTransaction.id}</p>
              </div>
              <button onClick={() => setSelectedTransactionId(null)} className="p-2 hover:text-destructive transition-colors"><X /></button>
            </div>
            <div className="p-8 max-h-[70vh] overflow-y-auto">
              {loadingDetails ? <div className="py-20 flex justify-center"><Loader2 className="animate-spin" /></div> : (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Fecha</div>
                      <div className="text-xs font-bold">{new Date(selectedTransaction.created_at).toLocaleString()}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Método</div>
                      <div className="text-xs font-bold uppercase">{selectedTransaction.payment_method}</div>
                    </div>
                    <div className="p-4 rounded-xl border border-border bg-muted/20">
                      <div className="text-[9px] font-black uppercase text-muted-foreground mb-1">Estado</div>
                      <div className="text-xs font-bold uppercase text-green-600">{selectedTransaction.status}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

              <div className="space-y-4">
                <h4 className="text-xs font-black uppercase tracking-[0.3em] text-primary border-b border-primary/20 pb-2 mb-6">Artículos de la Venta</h4>
                {loadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Sincronizando datos...</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto table-to-cards rounded-2xl">
                    <table className="w-full text-sm">
                      <thead className="sticky-header">
                        <tr className="border-b border-white/5 text-muted-foreground font-black uppercase text-[9px] tracking-widest text-left">
                          <th className="pb-4">Descripción</th>
                          <th className="pb-4 text-center">Cant.</th>
                          <th className="pb-4 text-right">Precio Unit.</th>
                          <th className="pb-4 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactionItems.map((item) => (
                          <tr key={item.id} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                            <td className="py-4">
                              <div className="font-bold text-primary">{item.products?.name}</div>
                              <div className="text-[10px] text-muted-foreground font-medium">{item.products?.sku}</div>
                            </td>
                            <td className="py-4 text-center font-black">{item.quantity}</td>
                            <td className="py-4 text-right font-medium">${item.unit_price.toFixed(2)}</td>
                            <td className="py-4 text-right font-black text-primary">${(item.quantity * item.unit_price).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                  </table>
                  <div className="flex justify-end pt-4">
                    <div className="w-64 p-4 bg-primary text-white rounded-2xl shadow-xl">
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-black uppercase">Total Final</span>
                        <span className="text-2xl font-black">${selectedTransaction.total_amount.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit Store Modal */}
      <Dialog open={isEditStoreModalOpen} onOpenChange={setIsEditStoreModalOpen}>
        <DialogContent className="!rounded-3xl border-border">
          <DialogHeader><DialogTitle className="font-black uppercase">Configurar Sucursal</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <input type="text" value={editingStore?.name || ''} onChange={e => setEditingStore({ ...editingStore!, name: e.target.value })} className="w-full p-3 rounded-lg border border-border bg-background font-bold" placeholder="Nombre" />
            <input type="text" value={editingStore?.address || ''} onChange={e => setEditingStore({ ...editingStore!, address: e.target.value })} className="w-full p-3 rounded-lg border border-border bg-background text-sm" placeholder="Dirección" />
          </div>
          <DialogFooter>
            <button onClick={() => setIsEditStoreModalOpen(false)} className="px-4 py-2 font-black uppercase text-xs">Cerrar</button>
            <button onClick={async () => {
              const { error } = await supabase.from('stores').update({ name: editingStore?.name, address: editingStore?.address }).eq('id', editingStore?.id);
              if (!error) { toast.success('Actualizado'); setIsEditStoreModalOpen(false); }
            }} className="px-6 py-2 bg-primary text-white rounded-lg font-black uppercase text-xs">Guardar</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* User Management Modal */}
      <Dialog open={!!userFormMode} onOpenChange={(open) => !open && setUserFormMode(null)}>
        <DialogContent className="!rounded-3xl border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-black uppercase tracking-tighter text-2xl">
              {userFormMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
            </DialogTitle>
          </DialogHeader>
          <UserForm
            mode={userFormMode || 'create'}
            initialData={selectedUserContract}
            stores={stores}
            onSubmit={handleUserFormSubmit}
            onCancel={() => setUserFormMode(null)}
            isSubmitting={createUserMutation.isPending || updateUserMutation.isPending || manageMembershipsMutation.isPending}
          />
        </DialogContent>
      </Dialog>

    </div>
  );
}
