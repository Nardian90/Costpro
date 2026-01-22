'use client';

import { useState, useEffect, useMemo, useRef, useDeferredValue, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore, useCartStore, useUIStore, useCanAccess } from '@/store';
import { useIsMobile } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getSupabaseUrl, getProductImageUrl, getStoreLogoUrl } from '@/lib/utils';
import { toast } from 'sonner';
import {
  BarChart3, ShoppingCart, Package, Warehouse, Receipt,
  ClipboardList, FileText, History, Shield, DollarSign,
  Users, Building, Settings, LogOut, Bell, Menu, Sun,
  TrendingUp, ArrowRight, Eye, Plus, Minus,
  Search, Target, Layers, Check
} from 'lucide-react';

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
import StoresManagementView from './terminal/StoresManagementView';
import SettingsView from './terminal/SettingsView';

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

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

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
  const [showSidebarLogo, setShowSidebarLogo] = useState(true);
  const [showSidebarUser, setShowSidebarUser] = useState(true);
  const [isSidebarScrollable, setIsSidebarScrollable] = useState(false);

  // State
  const [products, setProducts] = useState<(Product & { product_variants?: any[] | null })[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [cashClosures, setCashClosures] = useState<any[]>([]);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const [dashboardKPIs, setDashboardKPIs] = useState<DashboardKPIs>({
    gross_sales: 0, cost_of_goods: 0, profit: 0,
  });

  const [salesSummary, setSalesSummary] = useState<SalesSummary>({
    total_billed: 0, transaction_count: 0, average_ticket: 0,
    total_cash: 0, total_transfer: 0,
  });

  // Modal states
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null);
  const [transactionItems, setTransactionItems] = useState<any[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isEditStoreModalOpen, setIsEditStoreModalOpen] = useState(false);
  const [editingStore, setEditingStore] = useState<Store | null>(null);
  const [isCreateStoreModalOpen, setIsCreateStoreModalOpen] = useState(false);
  const [newStore, setNewStore] = useState({ name: '', address: '' });
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [newUser, setNewUser] = useState({ full_name: '', email: '', password: '', role: 'clerk' as UserRole });
  const [isDeleteStoreModalOpen, setIsDeleteStoreModalOpen] = useState(false);
  const [deletingStore, setDeletingStore] = useState<Store | null>(null);
  const [userStoreAccess, setUserStoreAccess] = useState<{store_id: string, roles: UserRole[]}[]>([]);

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

  // Data fetching
  const fetchProducts = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_products_for_pos', {
        p_store_id: user.store_id,
        p_search_term: '',
        p_category: ''
      });
      if (error) throw error;
      const typedData = data as GetProductsForPosResponse[];
      setProducts(typedData?.map((item) => ({
        ...item,
        public_image_url: getSupabaseUrl('product-images', item.image_url),
      })) || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  }, [user]);

  const fetchDashboardData = useCallback(async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase.rpc('get_dashboard_kpis', user.role === 'admin' ? {} : { p_store_id: user.store_id });
      if (error) throw error;
      const kpisData = data as DashboardKpiResponse[];
      if (kpisData && kpisData.length > 0) {
        const kpis = kpisData[0];
        setDashboardKPIs({
          gross_sales: kpis.total_sales || 0,
          cost_of_goods: kpis.total_cost || 0,
          profit: kpis.total_profit || 0,
        });
        setSalesSummary({
          total_billed: kpis.total_sales || 0,
          transaction_count: kpis.transaction_count || 0,
          average_ticket: kpis.avg_ticket || 0,
          total_cash: kpis.total_cash || 0,
          total_transfer: kpis.total_card || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchDashboardData();
      fetchProducts();
    }
  }, [user, fetchDashboardData, fetchProducts]);

  // Lazy loading views
  useEffect(() => {
    if (!user) return;
    const fetchers: Record<string, () => void> = {
      sales: async () => {
        const { data } = await supabase.from('transactions')
          .select('*')
          .eq(user.role !== 'admin' ? 'store_id' : '', user.store_id || '')
          .order('created_at', { ascending: false });
        setTransactions(data || []);
      },
      history: async () => {
        const { data } = await supabase.from('stock_movements')
          .select('*, product:products(name, sku)')
          .eq(user.role !== 'admin' ? 'store_id' : '', user.store_id || '')
          .order('created_at', { ascending: false }).limit(100);
        setMovements(data || []);
      },
      audit: async () => {
        const { data } = await supabase.from('audit_logs')
          .select('*, profile:profiles(full_name)')
          .order('created_at', { ascending: false }).limit(100);
        setAuditLogs(data || []);
      },
      users: async () => {
        const query = supabase.from('profiles').select('*');
        if (user.role === 'encargado') query.eq('created_by', user.id);
        const { data } = await query.order('full_name');
        setUsers(data || []);
      },
      stores: async () => {
        const { data } = await (user.role === 'admin'
          ? supabase.from('stores').select('*').order('name')
          : supabase.from('stores').select('*, user_store_access!inner(user_id)').eq('user_store_access.user_id', user.id).order('name'));
        setStores(data || []);
      },
      cash: async () => {
        const { data } = await supabase.from('cash_closures').select('*, profile:profiles(full_name)')
          .eq(user.role !== 'admin' ? 'store_id' : '', user.store_id || '')
          .order('created_at', { ascending: false }).limit(50);
        setCashClosures(data || []);
      }
    };

    if (fetchers[currentView]) fetchers[currentView]();
  }, [user, currentView]);

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
    if (items.length === 0 || isProcessing || !user) return;
    setIsProcessing(true);
    const toastId = toast.loading('Procesando venta...');
    try {
      // Use provided discount or fallback to store discount
      const finalDiscount = checkoutDiscount || discount;

      const { error } = await supabase.rpc('create_sale', {
        p_store_id: user.store_id,
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
      });
      if (error) throw error;
      toast.success('Venta exitosa', { id: toastId });
      clearCart();
      fetchProducts();
      fetchDashboardData();
    } catch (error: any) {
      toast.error(error.message || 'Error en venta', { id: toastId });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
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

  const fetchTransactionDetails = async (txn: Transaction) => {
    setSelectedTransaction(txn);
    setLoadingDetails(true);
    const { data } = await supabase.from('transaction_items').select('*, products(name, sku)').eq('transaction_id', txn.id);
    setTransactionItems(data || []);
    setLoadingDetails(false);
  };

  const fetchUserStoreAccess = async (userId: string) => {
    const { data } = await supabase.from('user_store_access').select('store_id, roles').eq('user_id', userId);
    setUserStoreAccess(data?.map(d => ({
      store_id: d.store_id,
      roles: Array.isArray(d.roles) ? d.roles as UserRole[] : ['clerk']
    })) || []);
  };

  // Navigation Items logic
  const navigationItems = useMemo(() => {
    if (!user) return [];
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    const all = [
      { id: 'dashboard', icon: BarChart3, label: 'Dashboard', roles: ['admin', 'manager', 'clerk', 'encargado'] },
      { id: 'pos', icon: ShoppingCart, label: 'TPV', roles: ['clerk', 'manager', 'admin', 'encargado'] },
      { id: 'inventory', icon: Package, label: 'Inventario', roles: ['admin', 'manager', 'warehouse', 'encargado'] },
      { id: 'recepcion', icon: Warehouse, label: 'Recepciones', roles: ['warehouse', 'manager', 'encargado'] },
      { id: 'sales', icon: Receipt, label: 'Ventas', roles: ['clerk', 'manager', 'encargado'] },
      { id: 'inventory_count', icon: ClipboardList, label: 'Conteo', roles: ['clerk', 'manager', 'admin', 'encargado'] },
      { id: 'cost-sheets', icon: FileText, label: 'Costos', roles: ['admin', 'manager', 'encargado'] },
      { id: 'catalog', icon: Package, label: 'Catálogo', roles: ['manager', 'admin', 'encargado'] },
      { id: 'history', icon: History, label: 'Stock', roles: ['manager', 'admin', 'encargado'] },
      { id: 'audit', icon: Shield, label: 'Auditoría', roles: ['manager', 'admin', 'encargado'] },
      { id: 'cash', icon: DollarSign, label: 'Caja', roles: ['manager', 'admin', 'encargado'] },
      { id: 'users', icon: Users, label: 'Usuarios', roles: ['admin', 'encargado'] },
      { id: 'stores', icon: Building, label: 'Tiendas', roles: ['admin', 'encargado'] },
      { id: 'settings', icon: Settings, label: 'Config', roles: ['admin', 'manager', 'encargado'] },
    ];
    return all.filter(i => i.roles.some(r => roles.includes(r as any)));
  }, [user]);

  const getActiveRolesLabel = () => {
    if (!user) return 'Cargando...';
    const roles = user.roles && user.roles.length > 0 ? user.roles : [user.role];
    return roles.join(' / ').toUpperCase();
  };

  const handleSidebarScroll = useCallback(() => {
    if (!navRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = navRef.current;
    const scrollable = scrollHeight > clientHeight + 10;

    if (!scrollable) {
      setShowSidebarLogo(true);
      setShowSidebarUser(true);
      return;
    }

    setShowSidebarLogo(scrollTop <= 20);
    const isAtBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 10;
    setShowSidebarUser(isAtBottom);
  }, []);

  useEffect(() => {
    const nav = navRef.current;
    if (nav) {
      nav.addEventListener('scroll', handleSidebarScroll);
      handleSidebarScroll();
      window.addEventListener('resize', handleSidebarScroll);
      const observer = new MutationObserver(handleSidebarScroll);
      observer.observe(nav, { childList: true, subtree: true });
      return () => {
        nav.removeEventListener('scroll', handleSidebarScroll);
        window.removeEventListener('resize', handleSidebarScroll);
        observer.disconnect();
      };
    }
  }, [handleSidebarScroll, navigationItems]);


  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView kpis={dashboardKPIs} summary={salesSummary} criticalProducts={products.filter(p => p.stock_current <= p.min_stock)} canViewFinancials={canViewFinancials} onViewInventory={() => setCurrentView('inventory')} />;
      case 'pos': return <POSView products={products} searchTerm={searchTerm} onSearchChange={setSearchTerm} items={items} onAddItem={handleAddToCart} onRemoveItem={removeItem} onUpdateQuantity={updateQuantity} onClearCart={clearCart} getTotal={getTotal} getSubtotal={getSubtotal} getItemCount={getItemCount} isProcessing={isProcessing} onCheckout={handleCheckout} />;
      case 'sales': return <SalesHistoryView transactions={transactions.filter(t => t.id.includes(searchTerm) && (!selectedStatus || t.status === selectedStatus))} searchTerm={searchTerm} onSearchChange={setSearchTerm} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} onViewDetails={fetchTransactionDetails} />;
      case 'history': return <StockHistoryView movements={movements.filter(m => m.product?.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} onRefresh={() => {}} />;
      case 'audit': return <AuditLogsView logs={auditLogs.filter(l => l.table_name.includes(searchTerm))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} />;
      case 'cash': return <CashClosureView summary={salesSummary} cashClosures={cashClosures} onProcessClosure={() => toast.info('Próximamente')} />;
      case 'users': return <UsersManagementView users={users.filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditUser={(u) => { setEditingUser(u); fetchUserStoreAccess(u.id); setIsEditUserModalOpen(true); }} onCreateUser={() => setIsCreateUserModalOpen(true)} />;
      case 'stores': return <StoresManagementView stores={stores.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditStore={(s) => { setEditingStore(s); setIsEditStoreModalOpen(true); }} onDeleteStore={(s) => { setDeletingStore(s); setIsDeleteStoreModalOpen(true); }} onCreateStore={() => setIsCreateStoreModalOpen(true)} onSetActiveStore={handleSetActiveStore} activeStoreId={user.active_store_id || undefined} isAdmin={user.role === 'admin'} />;
      case 'settings': return <SettingsView notifications={notifications} setNotifications={setNotifications} />;
      case 'inventory': return <InventoryView key="inventory" />;
      case 'recepcion': return <InventoryView key="recepcion" />;
      case 'inventory_count': return <InventoryCountView />;
      case 'catalog': return <CatalogView />;
      case 'cost-sheets': return <CostSheetsPage />;
      default: return <DashboardView kpis={dashboardKPIs} summary={salesSummary} criticalProducts={products.filter(p => p.stock_current <= p.min_stock)} canViewFinancials={canViewFinancials} onViewInventory={() => setCurrentView('inventory')} />;
    }
  };

  return (
    <div className="min-h-screen flex bg-background text-foreground max-w-full overflow-x-auto">
      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:sticky top-0 h-screen z-40 transition-all duration-300 ease-in-out border-r border-sidebar-border shadow-2xl overflow-hidden",
        sidebarOpen ? "w-64 lg:w-72 translate-x-0" : "w-0 -translate-x-full border-r-0"
      )}>
        <div className="bg-sidebar/90 backdrop-blur-2xl h-full flex flex-col overflow-hidden w-64 lg:w-72">
          {/* Logo */}
          <AnimatePresence initial={false}>
            {showSidebarLogo && (
              <motion.div
                id="sidebar-logo-container"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className="p-8 border-b border-sidebar-border/50 shrink-0 overflow-hidden"
              >
                <CostProLogo size={50} animated={true} />
                <div className="mt-4">
                  <div className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest mt-1">Terminal Operativa</div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Navigation */}
          <nav
            id="sidebar-nav"
            ref={navRef}
            className="flex-1 overflow-y-auto p-4 no-scrollbar"
          >
            <div className="space-y-2">
              {navigationItems.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setCurrentView(item.id);
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
          </nav>

          {/* User Info & Logout */}
          <div className="p-6 border-t border-sidebar-border/50 shrink-0">
            <AnimatePresence initial={false}>
              {showSidebarUser && (
                <motion.div
                  id="sidebar-user-container"
                  initial={{ height: 0, opacity: 0, marginBottom: 0 }}
                  animate={{ height: 'auto', opacity: 1, marginBottom: 16 }}
                  exit={{ height: 0, opacity: 0, marginBottom: 0 }}
                  transition={{ duration: 0.3, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <div className="rounded-3xl border border-primary/20 bg-primary/5 p-5 shadow-inner">
                    <div className="font-black text-xs text-primary uppercase tracking-widest truncate">{user?.full_name}</div>
                    <div className="text-[9px] font-black text-muted-foreground uppercase tracking-widest mt-1">
                      {getActiveRolesLabel()}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
                <p className="hidden sm:block text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] truncate">
                  {user?.full_name}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 shrink-0">
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
              {renderView()}
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
        <Dialog open={!!selectedTransaction} onOpenChange={() => setSelectedTransaction(null)}>
          <DialogContent className="max-w-2xl !rounded-3xl p-0 overflow-hidden bg-background">
            <div className="flex justify-between items-center p-8 border-b border-border bg-primary/5">
              <div>
                <h3 className="text-2xl font-black text-primary uppercase tracking-tighter">Detalle de Operación</h3>
                <p className="text-[10px] text-muted-foreground font-black uppercase mt-1">ID: {selectedTransaction.id}</p>
              </div>
              <button onClick={() => setSelectedTransaction(null)} className="p-2 hover:text-destructive transition-colors"><X /></button>
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

    </div>
  );
}
