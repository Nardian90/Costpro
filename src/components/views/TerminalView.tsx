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
  TrendingUp, ArrowRight, Eye, Plus, Minus
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
import { X, Calendar, CreditCard, Shield as ShieldIcon, Edit, Trash2, Building as BuildingIcon, Loader2, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  Product, Transaction, UserRole, Profile, Store,
  AuditLog, DashboardKPIs, SalesSummary, PaymentMethod
} from '@/types';
import ActionMenu, { Action } from '@/components/ui/ActionMenu';
import SearchBar from '@/components/ui/SearchBar';
import ScrollToTop from '@/components/ui/ScrollToTop';
import POSTableView from '@/components/POSTableView';

export default function TerminalView() {
  const router = useRouter();
  const { user, loading } = useAuthStore();
  const logout = useAuthStore((state) => state.logout);
  const {
    currentView, setCurrentView,
    notifications, setNotifications,
    sidebarOpen, toggleSidebar
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
  const [products, setProducts] = useState<(Product & { product_variants?: any[] })[]>([]);
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

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

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
      setProducts(data?.map((item: any) => ({
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
      if (data && data.length > 0) {
        const kpis = data[0];
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

  // ==================== VIEWS ====================

  const renderDashboard = () => (
    <motion.div
      className="space-y-6"
      initial={{ opacity: 0, filter: 'blur(4px)' }}
      animate={{ opacity: 1, filter: 'blur(0px)' }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-black text-primary font-mono tracking-tighter">DASHBOARD</h2>
        <div className="neu-badge !text-primary !bg-primary/10 border border-primary/20 flex items-center gap-2 py-1.5">
          <Calendar className="w-3 h-3" />
          Hoy: {new Date().toLocaleDateString()}
        </div>
      </div>

      <motion.div
        className="grid grid-cols-1 md:grid-cols-3 gap-6"
        variants={{
          hidden: { opacity: 0 },
          show: {
            opacity: 1,
            transition: {
              staggerChildren: 0.1
            }
          }
        }}
        initial="hidden"
        animate="show"
      >
        {/* KPI Cards */}
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-white/5 bg-gradient-to-br from-background to-background/50">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Ventas Totales</span>
            <div className="p-2 bg-green-500/10 rounded-xl">
              <TrendingUp className="w-5 h-5 text-green-500" />
            </div>
          </div>
          <div className="text-4xl font-black text-foreground drop-shadow-sm">${dashboardKPIs.gross_sales.toFixed(2)}</div>
          <div className="text-[10px] font-bold text-green-500 mt-2 uppercase tracking-widest">+12% vs ayer</div>
        </motion.div>

        {canViewFinancials && (
          <>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Costo de Ventas</span>
                <div className="p-2 bg-warning/10 rounded-xl">
                  <Target className="w-5 h-5 text-warning" />
                </div>
              </div>
              <div className="text-4xl font-black text-foreground">${dashboardKPIs.cost_of_goods.toFixed(2)}</div>
              <div className="text-[10px] font-bold text-muted-foreground mt-2 uppercase tracking-widest">Margen: {((dashboardKPIs.profit / dashboardKPIs.gross_sales) * 100 || 0).toFixed(1)}%</div>
            </motion.div>

            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-primary/20 bg-primary/5">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-widest text-primary">Utilidad Neta</span>
                <div className="p-2 bg-primary/20 rounded-xl">
                  <TrendingUp className="w-5 h-5 text-primary" />
                </div>
              </div>
              <div className="text-4xl font-black text-primary">${dashboardKPIs.profit.toFixed(2)}</div>
              <div className="text-[10px] font-black text-primary/70 mt-2 uppercase tracking-widest">Utilidad Diaria</div>
            </motion.div>
          </>
        )}

        {/* Additional Stats */}
        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-2 neu-card !p-6 border border-white/5">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-black text-foreground uppercase tracking-widest flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-primary" />
              Resumen de Ventas
            </h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { label: 'Transacciones', value: salesSummary.transaction_count, sub: 'Hoy' },
              { label: 'Ticket Promedio', value: `$${salesSummary.average_ticket.toFixed(2)}`, sub: 'ARS' },
              { label: 'Efectivo', value: `$${salesSummary.total_cash.toFixed(2)}`, sub: 'Recaudado', color: 'text-green-500' },
              { label: 'Transferencia', value: `$${salesSummary.total_transfer.toFixed(2)}`, sub: 'Banco', color: 'text-primary' },
            ].map((stat, i) => (
              <div key={i} className="neu-inset-sm !p-4 bg-background/50 border border-white/5">
                <span className="text-[9px] font-black uppercase text-muted-foreground tracking-tighter block mb-1">{stat.label}</span>
                <div className={cn("text-xl font-black tracking-tight", stat.color || "text-foreground")}>{stat.value}</div>
                <span className="text-[8px] font-bold text-muted-foreground/50 uppercase">{stat.sub}</span>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }} className="md:col-span-1 neu-card !p-6 border border-danger/10">
          <h3 className="text-lg font-black text-danger uppercase tracking-widest flex items-center gap-2 mb-6">
            <Package className="w-5 h-5" />
            Alertas Críticas
          </h3>
          <div className="space-y-3">
            {products.filter(p => p.stock_current <= p.min_stock).slice(0, 4).map(product => (
              <div key={product.id} className="neu-raised-sm !p-3 bg-danger/5 border border-danger/10 group hover:bg-danger/10 transition-colors">
                <div className="flex justify-between items-center">
                  <div className="overflow-hidden">
                    <div className="font-bold text-xs text-foreground truncate">{product.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{product.sku}</div>
                  </div>
                  <div className="text-danger font-black text-sm whitespace-nowrap ml-2">{product.stock_current} uds</div>
                </div>
              </div>
            ))}
            {products.filter(p => p.stock_current <= p.min_stock).length === 0 && (
              <div className="text-center py-10">
                <Check className="w-12 h-12 mx-auto mb-2 text-success opacity-20" />
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Todo en orden</p>
              </div>
            )}
            {products.filter(p => p.stock_current <= p.min_stock).length > 4 && (
              <button onClick={() => setCurrentView('inventory')} className="w-full py-2 text-[10px] font-black uppercase text-primary hover:underline">
                Ver todas las alertas ({products.filter(p => p.stock_current <= p.min_stock).length})
              </button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );

  const renderPOS = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Punto de Venta</h2>
        <div className="flex items-center gap-2">
          <ActionMenu
            actions={[
              {
                id: 'layout',
                label: posLayoutMode === 'grid' ? 'Vista Tabla' : 'Vista Cuadrícula',
                icon: posLayoutMode === 'grid' ? Receipt : Package,
                onClick: () => setPosLayoutMode(prev => prev === 'grid' ? 'table' : 'grid'),
                variant: 'outline',
                className: 'hidden md:flex'
              },
              {
                id: 'cart',
                label: `Carrito (${getItemCount()})`,
                icon: ShoppingCart,
                onClick: () => setShowCart(!showCart),
                variant: getItemCount() > 0 ? 'primary' : 'outline',
                active: showCart
              }
            ]}
            className="sm:w-auto"
          />
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Cart Panel - First in mobile, Last in desktop */}
        <AnimatePresence>
          {showCart && (
            <motion.div
              initial={isMobile ? { y: -20, opacity: 0 } : { x: 300, opacity: 0 }}
              animate={{ x: 0, y: 0, opacity: 1 }}
              exit={isMobile ? { y: -20, opacity: 0 } : { x: 300, opacity: 0 }}
              className="w-full lg:w-[400px] shrink-0 lg:sticky top-24 z-20 lg:order-last order-first"
            >
              <div className="neu-card !p-0 overflow-hidden border border-primary/20 shadow-2xl bg-background/95 backdrop-blur-md">
                <div className="bg-primary p-6 flex items-center justify-between text-white">
                  <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3">
                    <ShoppingCart className="w-6 h-6" />
                    Caja Registradora
                  </h3>
                  <button onClick={() => setShowCart(false)} className="p-2 hover:bg-white/10 rounded-full">
                    <X className="w-6 h-6" />
                  </button>
                </div>

                <div className="p-6">
                  {items.length === 0 ? (
                    <div className="text-center py-20 text-muted-foreground">
                      <ShoppingCart className="w-20 h-20 mx-auto mb-6 opacity-5" />
                      <p className="font-black uppercase tracking-widest text-sm">Tu carrito está vacío</p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 mb-8 no-scrollbar">
                        {items.map(item => (
                          <div key={`${item.product_id}-${item.variant_id}`} className="neu-raised-sm !p-4 border border-white/5 group relative">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex-1">
                                <div className="font-black text-sm uppercase tracking-tight truncate pr-6">{item.product.name}</div>
                                <div className="text-[10px] font-bold text-muted-foreground mt-1">${item.price.toFixed(2)} / unidad</div>
                              </div>
                              <button
                                onClick={() => removeItem(item.product_id, item.variant_id)}
                                className="absolute top-2 right-2 text-muted-foreground hover:text-danger p-2 rounded-full hover:bg-danger/5 transition-all"
                                aria-label="Eliminar del carrito"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1 bg-background/50 rounded-xl p-1 border border-white/5">
                                <button
                                  onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity - 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-colors active:scale-90"
                                  aria-label="Disminuir cantidad"
                                >
                                  <Minus className="w-4 h-4" />
                                </button>
                                <span className="w-10 text-center font-black text-sm">{item.quantity}</span>
                                <button
                                  onClick={() => updateQuantity(item.product_id, item.variant_id, item.quantity + 1)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary transition-colors active:scale-90"
                                  aria-label="Aumentar cantidad"
                                >
                                  <Plus className="w-4 h-4" />
                                </button>
                              </div>
                              <span className="font-black text-lg text-primary">${item.subtotal.toFixed(2)}</span>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Discount & Payment Info */}
                      <div className="space-y-6 pt-6 border-t border-white/5">
                        <div className="flex justify-between items-center px-2">
                           <span className="text-xs font-black uppercase text-muted-foreground tracking-widest">Total a Pagar</span>
                           <span className="text-4xl font-black text-primary tracking-tighter">${getTotal().toFixed(2)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                           <button
                            onClick={() => setSelectedPayment('cash')}
                            className={cn(
                              "neu-raised-sm !p-4 flex flex-col items-center gap-2 border-2 transition-all",
                              selectedPayment === 'cash' ? "border-primary bg-primary/5 shadow-primary/20" : "border-transparent"
                            )}
                           >
                             <DollarSign className={cn("w-6 h-6", selectedPayment === 'cash' ? "text-primary" : "text-muted-foreground")} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Efectivo</span>
                           </button>
                           <button
                            onClick={() => setSelectedPayment('transfer')}
                            className={cn(
                              "neu-raised-sm !p-4 flex flex-col items-center gap-2 border-2 transition-all",
                              selectedPayment === 'transfer' ? "border-primary bg-primary/5 shadow-primary/20" : "border-transparent"
                            )}
                           >
                             <CreditCard className={cn("w-6 h-6", selectedPayment === 'transfer' ? "text-primary" : "text-muted-foreground")} />
                             <span className="text-[10px] font-black uppercase tracking-widest">Transferencia</span>
                           </button>
                        </div>

                        <button
                          onClick={handleCheckout}
                          disabled={isProcessing || items.length === 0}
                          className="neu-btn-primary !py-5 w-full flex items-center justify-center gap-3 font-black text-lg shadow-2xl disabled:opacity-50"
                        >
                          {isProcessing ? (
                            <Loader2 className="w-6 h-6 animate-spin" />
                          ) : (
                            <Check className="w-6 h-6" />
                          )}
                          {isProcessing ? 'PROCESANDO...' : 'FINALIZAR VENTA'}
                        </button>

                        <button
                          onClick={() => {
                            toast("¿Anular el carrito?", {
                              description: "Se removerán todos los productos seleccionados.",
                              action: {
                                label: "Sí, anular",
                                onClick: () => {
                                  clearCart();
                                  setShowCart(false);
                                  toast.success("Carrito anulado");
                                }
                              },
                              cancel: {
                                label: "Cancelar",
                                onClick: () => {}
                              }
                            });
                          }}
                          className="w-full py-2 text-[10px] font-black text-muted-foreground uppercase tracking-widest hover:text-danger transition-colors"
                        >
                          Anular Carrito
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Product Grid - Second in mobile, First in desktop */}
        <div className="flex-1 w-full space-y-6 lg:order-first">
          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar productos por nombre, SKU o categoría..."
            showSettings={true}
          >
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-muted-foreground uppercase mb-1 block">Categoría</label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="neu-input w-full"
                  >
                    <option value="">Todas las categorías</option>
                    {[...new Set(products.map(p => p.category))].map(category => (
                      <option key={category} value={category || ''}>{category}</option>
                    ))}
                  </select>
                </div>
             </div>
          </SearchBar>

          {posLayoutMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
              {filteredProducts.length > 0 ? (
                filteredProducts.map(product => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onClick={addToCart}
                  />
                ))
              ) : (
                <div className="col-span-full py-32 text-center neu-card border-2 border-dashed border-white/5">
                  <Search className="w-16 h-16 mx-auto mb-6 opacity-5" />
                  <p className="text-xl font-black text-muted-foreground uppercase tracking-widest">Sin resultados</p>
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="mt-6 text-primary font-black uppercase text-xs hover:underline tracking-[0.2em]"
                    >
                      Ver Todo el Catálogo
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <POSTableView
              products={filteredProducts}
              onAddToCart={addToCart}
            />
          )}
        </div>
      </div>
    </div>
  );

  const renderSales = () => (
    <div className="space-y-6">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Historial de Ventas</h2>

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Buscar por ID de transacción o monto..."
      >
         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <div>
              <label className="text-[10px] font-black text-muted-foreground uppercase mb-1 block">Estado</label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="neu-input w-full"
              >
                <option value="">Todos los estados</option>
                <option value="completed">Completada</option>
                <option value="pending">Pendiente</option>
                <option value="voided">Anulada</option>
              </select>
            </div>
         </div>
      </SearchBar>

      <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5">
        <table className="w-full grid-table-transactions">
          <thead className="sticky-header">
            <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-4 text-left">Referencia</th>
              <th className="p-4 text-left">Fecha / Hora</th>
              <th className="p-4 text-left">Método</th>
              <th className="p-4 text-right">Monto Total</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Detalle</th>
            </tr>
          </thead>
          <tbody className="bg-background/30 backdrop-blur-sm">
            {filteredTransactions.map(txn => (
              <tr key={txn.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                <td data-label="ID" className="p-4 font-black text-xs text-primary">{txn.id.split('-')[0]}</td>
                <td data-label="Fecha" className="p-4">
                  <div className="text-sm font-bold">{new Date(txn.created_at).toLocaleDateString()}</div>
                  <div className="text-[10px] text-muted-foreground font-mono">{new Date(txn.created_at).toLocaleTimeString()}</div>
                </td>
                <td data-label="Método" className="p-4">
                  <div className="flex items-center gap-2">
                    {txn.payment_method === 'cash' ? <DollarSign className="w-3 h-3 text-green-500" /> : <CreditCard className="w-3 h-3 text-primary" />}
                    <span className="text-xs font-bold uppercase tracking-widest">{txn.payment_method}</span>
                  </div>
                </td>
                <td data-label="Total" className="p-4 text-right">
                  <span className="text-lg font-black text-foreground">${txn.total_amount.toFixed(2)}</span>
                </td>
                <td data-label="Estado" className="p-4 text-center">
                  <span className={cn(
                    "neu-badge !text-[9px] px-2 py-0.5",
                    txn.status === 'completed' ? "text-success" :
                    txn.status === 'pending' ? "text-warning" : "text-danger"
                  )}>
                    {txn.status}
                  </span>
                </td>
                <td data-label="Detalle" className="p-4">
                  <div className="flex justify-center">
                    <button
                      type="button"
                      onClick={() => fetchTransactionDetails(txn)}
                      className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-all active:scale-90"
                      aria-label="Ver detalle de venta"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderHistory = () => {
    const getMovementBadge = (type: string) => {
      switch (type) {
        case 'sale': return 'text-primary bg-primary/10 border-primary/20';
        case 'purchase': return 'text-success bg-success/10 border-success/20';
        case 'adjustment': return 'text-warning bg-warning/10 border-warning/20';
        default: return 'text-muted-foreground bg-accent/20 border-white/5';
      }
    };

    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
           <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Movimientos de Stock</h2>
           <ActionMenu
            actions={[
              { id: 'refresh', label: 'Actualizar', icon: History, onClick: fetchMovements, variant: 'primary' }
            ]}
            className="sm:w-auto"
           />
        </div>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Filtrar por nombre de producto o SKU..."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Fecha Desde</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  className="neu-input w-full pl-10"
                  value={dateRange.from}
                  onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Fecha Hasta</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  className="neu-input w-full pl-10"
                  value={dateRange.to}
                  onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                />
              </div>
            </div>
          </div>
        </SearchBar>

        <div className="space-y-4">
          {filteredMovements.map(mov => (
            <div key={mov.id} className="neu-card !p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-6 border border-white/5 group hover:border-primary/20 transition-all">
              <div className="flex items-center gap-5">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center border-2 shadow-inner group-hover:scale-110 transition-transform", getMovementBadge(mov.movement_type))}>
                  {mov.movement_type === 'sale' ? <ArrowUpRight className="w-7 h-7" /> :
                   mov.movement_type === 'purchase' ? <ArrowDownRight className="w-7 h-7" /> :
                   <ArrowUpDown className="w-7 h-7" />}
                </div>
                <div>
                  <div className="font-black text-lg uppercase tracking-tight leading-tight">{mov.product?.name}</div>
                  <div className="flex items-center gap-3 mt-1.5">
                    <span className="font-mono text-[10px] font-bold text-muted-foreground bg-muted/30 px-1.5 py-0.5 rounded tracking-tighter">{mov.product?.sku}</span>
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">{mov.movement_type}</span>
                  </div>
                </div>
              </div>
              <div className="text-left sm:text-right space-y-1">
                <div className={cn("text-2xl font-black drop-shadow-sm", mov.quantity_change > 0 ? 'text-success' : 'text-danger')}>
                  {mov.quantity_change > 0 ? '+' : ''}{mov.quantity_change}
                  <span className="text-xs ml-1 font-bold">uds</span>
                </div>
                <div className="text-[10px] text-muted-foreground uppercase font-black tracking-widest">
                  {new Date(mov.created_at).toLocaleString()}
                </div>
                <div className="text-[10px] font-mono text-muted-foreground/60 italic">
                  REF: {mov.reference_doc || 'N/A'}
                </div>
              </div>
            </div>
          ))}
          {filteredMovements.length === 0 && (
            <div className="text-center py-32 text-muted-foreground neu-card border-2 border-dashed border-white/5">
              <History className="w-16 h-16 mx-auto mb-6 opacity-5" />
              <p className="font-black uppercase tracking-widest">No se encontraron movimientos</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAudit = () => (
    <div className="space-y-6">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Logs de Auditoría</h2>

        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Buscar logs por tabla o acción..."
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-muted-foreground ml-1">Rango de Fechas</label>
                    <div className="grid grid-cols-2 gap-2">
                        <input
                            type="date"
                            className="neu-input w-full text-xs"
                            value={dateRange.from}
                            onChange={e => setDateRange({ ...dateRange, from: e.target.value })}
                        />
                        <input
                            type="date"
                            className="neu-input w-full text-xs"
                            value={dateRange.to}
                            onChange={e => setDateRange({ ...dateRange, to: e.target.value })}
                        />
                    </div>
                </div>
            </div>
        </SearchBar>

        <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5">
            <table className="w-full text-sm grid-table-audit">
                <thead className="sticky-header">
                    <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
                        <th className="p-4 text-left">Fecha / Hora</th>
                        <th className="p-4 text-left">Operador</th>
                        <th className="p-4 text-left">Operación</th>
                        <th className="p-4 text-left">Recurso</th>
                        <th className="p-4 text-left">Identificador</th>
                    </tr>
                </thead>
                <tbody className="bg-background/30">
                    {filteredLogs.map((log) => (
                        <tr key={log.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                            <td data-label="Fecha" className="p-4">
                              <div className="font-bold text-sm">{new Date(log.created_at).toLocaleDateString()}</div>
                              <div className="text-[10px] text-muted-foreground font-mono">{new Date(log.created_at).toLocaleTimeString()}</div>
                            </td>
                            <td data-label="Usuario" className="p-4">
                              <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-black border border-primary/20">
                                  {((log as any).profile?.full_name || 'S')?.charAt(0)}
                                </div>
                                <div className="font-bold text-xs">{(log as any).profile?.full_name || 'Sistema'}</div>
                              </div>
                            </td>
                            <td data-label="Acción" className="p-4">
                                <span className={cn(
                                    "neu-badge !text-[9px] px-2 py-0.5 font-black",
                                    ['INSERT', 'CREATE', 'ADD'].includes(log.action) ? 'text-success bg-success/10' :
                                    ['UPDATE', 'EDIT'].includes(log.action) ? 'text-warning bg-warning/10' : 'text-danger bg-danger/10'
                                )}>
                                    {log.action}
                                </span>
                            </td>
                            <td data-label="Tabla" className="p-4">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest bg-muted/20 px-1.5 py-0.5 rounded">{log.table_name}</span>
                            </td>
                            <td data-label="Detalles" className="p-4 font-mono text-[10px] text-muted-foreground truncate max-w-[150px]">
                                {log.record_id}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    </div>
  );


  const renderCash = () => (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Cierre de Arqueo</h2>
        <ActionMenu
          actions={[
            { id: 'process', label: 'Procesar Cierre', icon: DollarSign, onClick: () => toast.info('Funcionalidad en desarrollo'), variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="neu-card !p-8 border border-white/5 space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/10 rounded-xl"><Edit className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Declaración de Fondos</h3>
          </div>

          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Efectivo Físico</label>
              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input type="number" className="neu-input w-full pl-12 text-2xl font-black font-mono" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Otros Comprobantes</label>
              <div className="relative">
                <CreditCard className="absolute left-4 top-1/2 -translate-y-1/2 text-primary w-5 h-5" />
                <input type="number" className="neu-input w-full pl-12 text-2xl font-black font-mono" placeholder="0.00" />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block ml-1">Observaciones</label>
              <textarea className="neu-input w-full h-32 text-sm font-medium resize-none" placeholder="Notas del turno..." />
            </div>
          </div>
        </div>

        <div className="neu-card !p-8 border border-primary/20 bg-primary/5 space-y-8">
          <div className="flex items-center gap-3">
             <div className="p-2 bg-primary/20 rounded-xl"><Layers className="w-5 h-5 text-primary" /></div>
             <h3 className="font-black text-lg uppercase tracking-widest">Balance del Sistema</h3>
          </div>

          <div className="space-y-4">
            {[
              { label: 'Ventas Totales Esperadas', value: salesSummary.total_billed, color: 'text-foreground' },
              { label: 'Efectivo Declarado (Sistema)', value: salesSummary.total_cash, color: 'text-green-500' },
              { label: 'Transferencias (Sistema)', value: salesSummary.total_transfer, color: 'text-primary' },
            ].map((row, i) => (
              <div key={i} className="flex justify-between items-center p-4 neu-inset-sm bg-background/50 border border-white/5">
                <span className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">{row.label}</span>
                <span className={cn("text-xl font-black font-mono", row.color)}>${row.value.toFixed(2)}</span>
              </div>
            ))}

            <div className="flex justify-between items-center p-6 neu-raised-sm bg-primary text-white mt-8 shadow-xl shadow-primary/20">
              <span className="text-xs font-black uppercase tracking-[0.2em]">Diferencia de Arqueo</span>
              <span className="text-3xl font-black font-mono">$0.00</span>
            </div>
          </div>
        </div>
      </div>

      {/* Historial de Cierres */}
      <div className="neu-card !p-8 border border-white/5">
        <h3 className="font-black text-lg uppercase tracking-widest flex items-center gap-3 mb-8">
          <History className="w-6 h-6 text-primary" />
          Registros de Cierre
        </h3>

        <div className="overflow-x-auto table-to-cards rounded-2xl">
          <table className="w-full text-sm">
            <thead className="sticky-header">
              <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
                <th className="p-4 text-left">Fecha de Cierre</th>
                <th className="p-4 text-left">Operador</th>
                <th className="p-4 text-right">Monto Sistema</th>
                <th className="p-4 text-right">Desviación</th>
                <th className="p-4 text-center">Detalles</th>
              </tr>
            </thead>
            <tbody>
              {cashClosures.map((closure) => (
                <tr key={closure.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                  <td data-label="Fecha" className="p-4">
                    <div className="font-bold">{new Date(closure.created_at).toLocaleDateString()}</div>
                    <div className="text-[10px] text-muted-foreground font-mono">{new Date(closure.created_at).toLocaleTimeString()}</div>
                  </td>
                  <td data-label="Cajero" className="p-4 font-bold text-xs uppercase tracking-tight">{closure.profile?.full_name}</td>
                  <td data-label="Total Sistema" className="p-4 text-right font-black text-lg">${closure.system_expected_total?.toFixed(2) || closure.system_total?.toFixed(2)}</td>
                  <td data-label="Diferencia" className="p-4 text-right">
                    <span className={cn(
                      "font-black text-sm px-2 py-1 rounded-lg",
                      closure.difference < 0 ? 'text-danger bg-danger/5' : 'text-success bg-success/5'
                    )}>
                      ${closure.difference?.toFixed(2)}
                    </span>
                  </td>
                  <td data-label="Acciones" className="p-4">
                    <div className="flex justify-center">
                      <button className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-all active:scale-90" aria-label="Ver detalles">
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderUsers = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Gestión de Usuarios</h2>
        <ActionMenu
          actions={[
            { id: 'new', label: 'Nuevo Usuario', icon: Plus, onClick: () => setIsCreateUserModalOpen(true), variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar usuarios por nombre, email o rol..." />

      <div className="overflow-x-auto table-to-cards rounded-2xl shadow-xl border border-white/5">
        <table className="w-full grid-table-users">
          <thead className="sticky-header">
            <tr className="bg-muted/50 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
              <th className="p-4 text-left">Perfil</th>
              <th className="p-4 text-left">Contacto</th>
              <th className="p-4 text-left">Nivel de Acceso</th>
              <th className="p-4 text-center">Estado</th>
              <th className="p-4 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-background/30">
            {filteredUsers.map((u) => (
              <tr key={u.id} className="border-b border-white/5 hover:bg-primary/5 transition-colors">
                <td data-label="Usuario" className="p-4">
                   <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-primary-dark text-white flex items-center justify-center font-black text-sm shadow-lg shadow-primary/20">
                        {u.full_name?.charAt(0)}
                      </div>
                      <div className="font-black text-sm uppercase tracking-tight">{u.full_name}</div>
                   </div>
                </td>
                <td data-label="Email" className="p-4 font-mono text-xs text-muted-foreground">{u.email}</td>
                <td data-label="Rol" className="p-4">
                  <span className={cn(
                    "neu-badge !text-[9px] font-black px-2.5 py-0.5",
                    u.role === 'admin' ? 'text-primary bg-primary/10' :
                    (u.role === 'encargado' || u.role === 'manager') ? 'text-secondary bg-secondary/10' :
                    u.role === 'usuario' ? 'text-success bg-success/10' : 'text-muted-foreground bg-muted/10'
                  )}>
                    {u.role === 'manager' ? 'encargado' : u.role}
                  </span>
                </td>
                <td data-label="Estado" className="p-4 text-center">
                  <div className="flex justify-center">
                    <span className={cn(
                      "w-2 h-2 rounded-full",
                      u.is_active ? 'bg-success shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-danger'
                    )} />
                    <span className="text-[10px] font-bold uppercase ml-2 text-muted-foreground">{u.is_active ? 'Activo' : 'Inactivo'}</span>
                  </div>
                </td>
                <td data-label="Acciones" className="p-4">
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => {
                        setEditingUser(u);
                        setIsEditUserModalOpen(true);
                        fetchUserStoreAccess(u.id);
                      }}
                      className="neu-raised-sm w-9 h-9 flex items-center justify-center hover:text-primary transition-all active:scale-90"
                      aria-label="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderStores = () => (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Red de Tiendas</h2>
        <ActionMenu
          actions={[
            { id: 'new', label: 'Nueva Sucursal', icon: Plus, onClick: () => setIsCreateStoreModalOpen(true), variant: 'primary' }
          ]}
          className="sm:w-auto"
        />
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Filtrar por nombre de sucursal o ubicación..." />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
        {filteredStores.map((store) => (
          <div key={store.id} className="neu-card !p-6 group relative overflow-hidden border border-white/5 hover:border-primary/20 transition-all">
            <div className="flex items-start justify-between mb-8">
              <div className="neu-raised-sm w-16 h-16 flex items-center justify-center bg-background/50 rounded-2xl group-hover:scale-110 transition-transform">
                {store.logo_url ? (
                  <img src={getStoreLogoUrl(store)} alt={store.name} className="w-full h-full object-cover rounded-2xl" />
                ) : (
                  <Building className="w-8 h-8 text-primary opacity-40" />
                )}
              </div>
              <span className={cn(
                "neu-badge !text-[9px] px-2 py-0.5 font-black uppercase tracking-widest",
                store.is_active ? 'text-success bg-success/10' : 'text-danger bg-danger/10'
              )}>
                {store.is_active ? 'Activa' : 'Inactiva'}
              </span>
            </div>

            <h3 className="font-black text-xl uppercase tracking-tighter leading-none mb-2">{store.name}</h3>
            <p className="text-xs font-bold text-muted-foreground leading-relaxed min-h-[40px] mb-8">{store.address || 'Ubicación no especificada'}</p>

            <div className="flex flex-col gap-3 pt-6 border-t border-white/5">
              {user?.active_store_id !== store.id ? (
                <button
                  onClick={() => handleSetActiveStore(store.id)}
                  className="neu-btn-primary !p-3 w-full flex items-center justify-center gap-2 shadow-lg shadow-primary/10"
                >
                  <Target className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Seleccionar Tienda</span>
                </button>
              ) : (
                <div className="neu-inset-sm !p-3 w-full flex items-center justify-center gap-2 bg-primary/5 border border-primary/20 rounded-xl">
                  <Check className="w-4 h-4 text-primary" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">Tienda Actual</span>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => { setEditingStore(store); setIsEditStoreModalOpen(true); }}
                  className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm group/btn transition-all"
                >
                  <Edit className="w-4 h-4 group-hover/btn:text-primary transition-colors" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em]">Info</span>
                </button>
                {user?.role === 'admin' && (
                  <button
                    onClick={() => { setDeletingStore(store); setIsDeleteStoreModalOpen(true); }}
                    className="neu-btn !p-3 flex-1 flex items-center justify-center gap-2 hover:neu-raised-sm group/del transition-all"
                  >
                    <Trash2 className="w-4 h-4 group-hover/del:text-danger transition-colors" />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Borrar</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="space-y-10 max-w-4xl">
      <h2 className="text-3xl font-black text-foreground tracking-tighter uppercase">Configuración Global</h2>

      <div className="space-y-8">
        <div className="neu-card !p-8 border border-white/5">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Sun className="w-5 h-5" />
            Interfaz y Estética
          </h3>

          <div className="neu-inset-sm bg-background/50 border border-white/5 rounded-2xl p-6">
            <div className="font-black text-sm uppercase tracking-tight mb-2">Tema de la Interfaz</div>
            <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest mb-4">Seleccione su esquema de color preferido</div>
            <div className="grid grid-cols-3 gap-4">
              <button onClick={() => setTheme('light')} className={`neu-raised-sm p-4 rounded-xl ${theme === 'light' ? 'ring-2 ring-primary' : ''}`}>Light</button>
              <button onClick={() => setTheme('dark')} className={`neu-raised-sm p-4 rounded-xl ${theme === 'dark' ? 'ring-2 ring-primary' : ''}`}>Dark</button>
              <button onClick={() => setTheme('neumo')} className={`neu-raised-sm p-4 rounded-xl ${theme === 'neumo' ? 'ring-2 ring-primary' : ''}`}>Neumo</button>
            </div>
          </div>
        </div>

        <div className="neu-card !p-8 border border-white/5">
          <h3 className="text-lg font-black uppercase tracking-widest text-primary flex items-center gap-3 mb-8">
            <Bell className="w-5 h-5" />
            Centro de Notificaciones
          </h3>

          <div className="space-y-4">
            {[
              { id: 'lowStock', label: 'Alertas de Stock Bajo', desc: 'Notificar interrupciones críticas en inventario', active: notifications.lowStock },
              { id: 'salesAlerts', label: 'Notificaciones de Venta', desc: 'Alertas en tiempo real por cada transacción', active: notifications.salesAlerts },
            ].map((notif) => (
              <div key={notif.id} className="flex items-center justify-between p-6 neu-inset-sm bg-background/50 border border-white/5 rounded-2xl">
                <div>
                  <div className="font-black text-sm uppercase tracking-tight">{notif.label}</div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase mt-1 tracking-widest">{notif.desc}</div>
                </div>
                <button
                  onClick={() => setNotifications({ [notif.id]: !notif.active } as any)}
                  className={cn(
                    "neu-badge !py-2 !px-5 font-black uppercase tracking-widest transition-all cursor-pointer",
                    notif.active ? "text-success bg-success/10 border-success/20" : "text-muted-foreground bg-muted/20"
                  )}
                >
                  {notif.active ? 'Suscrito' : 'Desactivado'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderView = () => {
    switch (currentView) {
      case 'dashboard': return <DashboardView kpis={dashboardKPIs} summary={salesSummary} criticalProducts={products.filter(p => p.stock_current <= p.min_stock)} canViewFinancials={canViewFinancials} onViewInventory={() => setCurrentView('inventory')} />;
      case 'pos': return <POSView products={products} searchTerm={searchTerm} onSearchChange={setSearchTerm} items={items} onAddItem={addItem} onRemoveItem={removeItem} onUpdateQuantity={updateQuantity} onClearCart={clearCart} getTotal={getTotal} getSubtotal={getSubtotal} getItemCount={getItemCount} isProcessing={isProcessing} onCheckout={handleCheckout} />;
      case 'sales': return <SalesHistoryView transactions={transactions.filter(t => t.id.includes(searchTerm) && (!selectedStatus || t.status === selectedStatus))} searchTerm={searchTerm} onSearchChange={setSearchTerm} selectedStatus={selectedStatus} onStatusChange={setSelectedStatus} onViewDetails={fetchTransactionDetails} />;
      case 'history': return <StockHistoryView movements={movements.filter(m => m.product?.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} onRefresh={() => {}} />;
      case 'audit': return <AuditLogsView logs={auditLogs.filter(l => l.table_name.includes(searchTerm))} searchTerm={searchTerm} onSearchChange={setSearchTerm} dateRange={dateRange} onDateRangeChange={setDateRange} />;
      case 'cash': return <CashClosureView summary={salesSummary} cashClosures={cashClosures} onProcessClosure={() => toast.info('Próximamente')} />;
      case 'users': return <UsersManagementView users={users.filter(u => u.full_name?.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditUser={(u) => { setEditingUser(u); fetchUserStoreAccess(u.id); setIsEditUserModalOpen(true); }} onCreateUser={() => setIsCreateUserModalOpen(true)} />;
      case 'stores': return <StoresManagementView stores={stores.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()))} searchTerm={searchTerm} onSearchChange={setSearchTerm} onEditStore={(s) => { setEditingStore(s); setIsEditStoreModalOpen(true); }} onDeleteStore={(s) => { setDeletingStore(s); setIsDeleteStoreModalOpen(true); }} onCreateStore={() => setIsCreateStoreModalOpen(true)} onSetActiveStore={handleSetActiveStore} activeStoreId={user.active_store_id} isAdmin={user.role === 'admin'} />;
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
